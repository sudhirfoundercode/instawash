const db = require('../config/db');
const { comparePassword } = require('../utils/password.utils');
const { generateToken, blacklistToken } = require('../utils/jwt.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { getSidebarModulesForUser } = require('../utils/sidebar.utils');
const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

/**
 * Extract simple permissions array for a user
 */
const getUserPermissionsList = (user) => {
  if (user.role === 'SUPER_ADMIN') {
    return DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
  }
  try {
    const parsed = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : [];
    return parsed.length > 0 ? parsed : (DEFAULT_ROLE_PERMISSIONS[user.role] || []);
  } catch (e) {
    return DEFAULT_ROLE_PERMISSIONS[user.role] || [];
  }
};

/**
 * SINGLE UNIFIED LOGIN API FOR ALL ROLES
 * POST /api/auth/login
 */
const unifiedLogin = async (req, res) => {
  try {
    const { identifier, loginId, staffId, email, phone, password, otp } = req.body;
    const loginKey = identifier || loginId || staffId || email || phone;

    if (!loginKey) {
      return errorResponse(res, 'Login identifier (Staff ID, Email, or Phone number) is required', 400);
    }

    // 1. Search in Users table (Super Admin, Outlet Manager, Receptionist, Accountant)
    const [users] = await db.query(
      `SELECT * FROM users WHERE staff_id = ? OR email = ? OR phone = ?`,
      [loginKey, loginKey, loginKey]
    );

    if (users.length > 0) {
      const user = users[0];
      if (!user.is_active) {
        return errorResponse(res, 'Account is disabled. Please contact Super Admin.', 401);
      }

      if (password) {
        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
          return errorResponse(res, 'Invalid password credentials', 401);
        }
      } else if (otp) {
        if (otp !== '123456') {
          return errorResponse(res, 'Invalid OTP code', 401);
        }
      } else {
        return errorResponse(res, 'Password or OTP is required for login', 400);
      }

      const [userOutlets] = await db.query(
        `SELECT o.* FROM outlets o JOIN user_outlets uo ON o.id = uo.outlet_id WHERE uo.user_id = ?`,
        [user.id]
      );

      const token = generateToken({
        id: user.id,
        staffId: user.staff_id,
        role: user.role,
      });

      const permissionModules = getUserPermissionsList(user);
      const sidebarModules = getSidebarModulesForUser(user.role, permissionModules);

      return successResponse(res, `${user.role} logged in successfully`, {
        role: user.role,
        token,
        sessionExpiryInfo: 'Session automatically expires after inactivity window (default 2 hours)',
        permissions: permissionModules,
        sidebarModules,
        user: {
          id: user.id,
          staffId: user.staff_id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          section: user.section,
          shift: user.shift,
          maxDiscountPercent: user.max_discount_percent,
          permissions: permissionModules,
          outlets: userOutlets,
        },
      });
    }

    // 2. Search in Students table
    const [students] = await db.query(
      `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.phone = ? OR s.email = ? OR s.student_id_card = ?`,
      [loginKey, loginKey, loginKey]
    );

    if (students.length > 0) {
      const student = students[0];

      if (password) {
        if (student.password) {
          const isMatch = await comparePassword(password, student.password);
          if (!isMatch) {
            return errorResponse(res, 'Invalid password credentials', 401);
          }
        }
      } else if (otp) {
        if (otp !== '123456') {
          return errorResponse(res, 'Invalid OTP code', 401);
        }
      } else {
        return errorResponse(res, 'Password or OTP is required for student login', 400);
      }

      const [subs] = await db.query(
        `SELECT ss.*, p.name as plan_name, p.quota_kg, p.payg_rate_per_kg 
         FROM student_subscriptions ss 
         JOIN subscription_plans p ON ss.plan_id = p.id 
         WHERE ss.student_id = ? AND ss.status = 'ACTIVE' 
         ORDER BY ss.created_at DESC LIMIT 1`,
        [student.id]
      );

      const token = generateToken({
        id: student.id,
        phone: student.phone,
        role: 'STUDENT',
        isStudent: true,
      });

      const sidebarModules = getSidebarModulesForUser('STUDENT', []);

      return successResponse(res, 'Student logged in successfully', {
        role: 'STUDENT',
        token,
        sessionExpiryInfo: 'Session automatically expires after inactivity window (default 2 hours)',
        permissions: DEFAULT_ROLE_PERMISSIONS.STUDENT,
        sidebarModules,
        student: {
          id: student.id,
          phone: student.phone,
          fullName: student.full_name,
          gender: student.gender,
          studentIdCard: student.student_id_card,
          campusName: student.campus_name,
          status: student.status,
          permanentQr: student.permanent_qr,
          activeSubscription: subs[0] || null,
        },
      });
    }

    return errorResponse(res, 'Invalid credentials. Account not found.', 401);
  } catch (error) {
    console.error('Unified Login Error:', error);
    return errorResponse(res, 'Login failed', 500);
  }
};

/**
 * GET CURRENT LOGGED-IN USER & SIDEBAR MODULES
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    if (req.isStudent) {
      const student = req.student;
      const sidebarModules = getSidebarModulesForUser('STUDENT', []);
      return successResponse(res, 'Current student profile fetched successfully', {
        role: 'STUDENT',
        permissions: DEFAULT_ROLE_PERMISSIONS.STUDENT,
        sidebarModules,
        student,
      });
    }

    const user = req.user;
    const permissionModules = getUserPermissionsList(user);
    const sidebarModules = getSidebarModulesForUser(user.role, permissionModules);

    const [userOutlets] = await db.query(
      `SELECT o.* FROM outlets o JOIN user_outlets uo ON o.id = uo.outlet_id WHERE uo.user_id = ?`,
      [user.id]
    );

    return successResponse(res, 'Current user profile fetched successfully', {
      role: user.role,
      permissions: permissionModules,
      sidebarModules,
      user: {
        id: user.id,
        staffId: user.staff_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        section: user.section,
        shift: user.shift,
        maxDiscountPercent: user.max_discount_percent,
        permissions: permissionModules,
        outlets: userOutlets,
      },
    });
  } catch (error) {
    console.error('Get Me Error:', error);
    return errorResponse(res, 'Failed to fetch current user info', 500);
  }
};

/**
 * MANUAL LOGOUT API
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      blacklistToken(token);
    }
    return successResponse(res, 'Logged out successfully. Session terminated.');
  } catch (error) {
    return errorResponse(res, 'Logout failed', 500);
  }
};

/**
 * Send Student OTP (Simulation)
 * POST /api/auth/send-otp
 */
const studentOtpSend = async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber) {
      return errorResponse(res, 'Mobile number is required', 400);
    }

    return successResponse(res, 'OTP sent successfully to mobile number', {
      mobileNumber,
      otp: '123456',
    });
  } catch (error) {
    return errorResponse(res, 'Failed to send OTP', 500);
  }
};

module.exports = {
  unifiedLogin,
  getMe,
  logout,
  studentOtpSend,
};
