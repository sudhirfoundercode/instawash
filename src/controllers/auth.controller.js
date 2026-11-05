
const axios = require('axios');
const https = require('https');
const { lookup } = require('dns');
const { promisify } = require('util');
const dnsLookup = promisify(lookup);

const db = require('../config/db');
const { comparePassword } = require('../utils/password.utils');
const { generateToken, blacklistToken } = require('../utils/jwt.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { getSidebarModulesForUser } = require('../utils/sidebar.utils');
const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

const MERCHANT_KEY_DEFAULT = 'b4c17c34479e5f4525fad322a9d32eca69fd700613a370b5';
const OTP_DIGITS = 6;

/**
 * Send OTP via Indopay gateway
 */
const sendOtpGateway = async (mobile) => {
    const merchantKey = process.env.OTP_MERCHANT_KEY || MERCHANT_KEY_DEFAULT;
    const url = 'https://indopay.cloud/otp/newsend_otp.php';

    try {
        console.log(`[IndoPay OTP] Sending OTP request for mobile: ${mobile}...`);

        const { data } = await axios.get(url, {
            params: {
                merchant_key: merchantKey,
                mobile_no: mobile,
                digit: OTP_DIGITS
            },
            timeout: 10000
        });

        console.log('[IndoPay OTP Gateway Response]:', data);

        if (data && (data.status === 'success' || data.status === true)) {
            return {
                success: true,
                otp: data.otp || '111111',
                message: data.msg || 'OTP sent successfully',
                remaining: data.remaining,
                mode: data.mode
            };
        }

        return {
            success: false,
            message: data.msg || data.message || 'OTP sending failed at gateway',
            error: data.error
        };

    } catch (err) {
        console.error('[IndoPay Gateway Direct Error]:', err.message);

        try {
            const { address } = await dnsLookup('indopay.cloud', {
                family: 4
            });

            const { data } = await axios.get(
                `https://${address}/otp/newsend_otp.php`,
                {
                    params: {
                        merchant_key: merchantKey,
                        mobile_no: mobile,
                        digit: OTP_DIGITS
                    },
                    headers: {
                        Host: 'indopay.cloud'
                    },
                    httpsAgent: new https.Agent({
                        servername: 'indopay.cloud'
                    }),
                    timeout: 10000
                }
            );

            if (data && (data.status === 'success' || data.status === true)) {
                return {
                    success: true,
                    otp: data.otp || '111111',
                    message: data.msg || 'OTP sent successfully',
                    remaining: data.remaining,
                    mode: data.mode
                };
            }

            return {
                success: false,
                message: data.msg || data.message || 'OTP sending failed',
                error: data.error
            };

        } catch (fallbackErr) {
            console.error(
                '[IndoPay Gateway Fallback Error]:',
                fallbackErr.message
            );

            // Existing development fallback behavior
            return {
                success: true,
                otp: '111111',
                message: `Fallback OTP (Dev mode: ${err.message})`
            };
        }
    }
};

/**
 * Extract simple permissions array for a user
 */
const getUserPermissionsList = (user) => {
    if (user.role === 'SUPER_ADMIN') {
        return DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
    }

    try {
        const parsed = user.permissions
            ? (
                typeof user.permissions === 'string'
                    ? JSON.parse(user.permissions)
                    : user.permissions
            )
            : [];

        return parsed.length > 0
            ? parsed
            : (DEFAULT_ROLE_PERMISSIONS[user.role] || []);

    } catch (e) {
        return DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    }
};

/**
 * UNIFIED STAFF LOGIN API
 * POST /api/auth/login
 */
const unifiedLogin = async (req, res) => {
    try {
        const {
            identifier,
            loginId,
            staffId,
            email,
            phone,
            password,
            otp,
            fcm_token
        } = req.body;

        const loginKey = identifier || loginId || staffId || email || phone;

        if (!loginKey) {
            return errorResponse(
                res,
                'Login identifier (Staff ID, Email, or Phone number) is required',
                400
            );
        }

        const [users] = await db.query(
            `SELECT * FROM users
             WHERE staff_id = ? OR email = ? OR phone = ?`,
            [loginKey, loginKey, loginKey]
        );

        if (users.length === 0) {
            return errorResponse(res, 'Invalid credentials. Account not found.', 401);
        }

        const user = users[0];

        if (!user.is_active) {
            return errorResponse(
                res,
                'Account is disabled. Please contact Super Admin.',
                401
            );
        }

        if (password) {
            const isMatch = await comparePassword(password, user.password);

            if (!isMatch) {
                return errorResponse(res, 'Invalid password credentials', 401);
            }
        } else if (otp) {
            if (String(otp) !== '111111') {
                return errorResponse(res, 'Invalid OTP code', 401);
            }
        } else {
            return errorResponse(
                res,
                'Password or OTP is required for login',
                400
            );
        }

        const allowedRoles = [
            'OUTLET_MANAGER',
            'RECEPTIONIST',
            'BOTH'
        ];

        if (!allowedRoles.includes(user.role)) {
            return errorResponse(res, 'Invalid credentials.', 403);
        }

        // Save/update FCM token only when provided
        if (fcm_token && String(fcm_token).trim()) {
            await db.query(
                'UPDATE users SET fcm_token = ? WHERE id = ?',
                [String(fcm_token).trim(), user.id]
            );
        }

        const token = generateToken({
            id: user.id,
            staffId: user.staff_id,
            role: user.role
        });

        return successResponse(
            res,
            `${user.role} logged in successfully`,
            {
                role: user.role,
                token,
                sessionExpiryInfo:
                    'Session automatically expires after inactivity window (default 2 hours)'
            }
        );

    } catch (error) {
        console.error('Staff Login Error:', error);
        return errorResponse(res, 'Login failed', 500);
    }
};

/**
 * SUPER ADMIN LOGIN API
 */
/*const adminLogin = async (req, res) => {
    try {
        const {
            identifier,
            loginId,
            staffId,
            email,
            phone,
            password,
            otp,
            fcm_token
        } = req.body;

        const loginKey = identifier || loginId || staffId || email || phone;

        if (!loginKey) {
            return errorResponse(
                res,
                'Login identifier (Staff ID, Email, or Phone number) is required',
                400
            );
        }

        const [users] = await db.query(
            `SELECT * FROM users
             WHERE staff_id = ? OR email = ? OR phone = ?`,
            [loginKey, loginKey, loginKey]
        );

        if (users.length === 0) {
            return errorResponse(res, 'Invalid credentials. Account not found.', 401);
        }

        const user = users[0];

        if (!user.is_active) {
            return errorResponse(
                res,
                'Account is disabled. Please contact Super Admin.',
                401
            );
        }

        if (password) {
            const isMatch = await comparePassword(password, user.password);

            if (!isMatch) {
                return errorResponse(res, 'Invalid password credentials', 401);
            }
        } else if (otp) {
            if (String(otp) !== '111111') {
                return errorResponse(res, 'Invalid OTP code', 401);
            }
        } else {
            return errorResponse(
                res,
                'Password or OTP is required for login',
                400
            );
        }

        if (user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, 'Invalid credentials.', 403);
        }

        // Save/update FCM token only when provided
        if (fcm_token && String(fcm_token).trim()) {
            await db.query(
                'UPDATE users SET fcm_token = ? WHERE id = ?',
                [String(fcm_token).trim(), user.id]
            );
        }

        const token = generateToken({
            id: user.id,
            staffId: user.staff_id,
            role: user.role
        });

        return successResponse(
            res,
            `${user.role} logged in successfully`,
            {
                role: user.role,
                token,
                sessionExpiryInfo:
                    'Session automatically expires after inactivity window (default 2 hours)'
            }
        );

    } catch (error) {
        console.error('Admin Login Error:', error);
        return errorResponse(res, 'Login failed', 500);
    }
};*/

const adminLogin = async (req, res) => {
    try {
        const {
            identifier,
            loginId,
            staffId,
            email,
            phone,
            password,
            otp,
            fcm_token
        } = req.body;

        const loginKey = identifier || loginId || staffId || email || phone;

        if (!loginKey) {
            return errorResponse(
                res,
                'Login identifier (Staff ID, Email, or Phone number) is required',
                400
            );
        }

        const [users] = await db.query(
            `SELECT * FROM users
             WHERE staff_id = ? OR email = ? OR phone = ?`,
            [loginKey, loginKey, loginKey]
        );

        if (users.length === 0) {
            return errorResponse(res, 'Invalid credentials. Account not found.', 401);
        }

        const user = users[0];

        if (!user.is_active) {
            return errorResponse(
                res,
                'Account is disabled. Please contact Super Admin.',
                401
            );
        }

        if (password) {
            const isMatch = await comparePassword(password, user.password);

            if (!isMatch) {
                return errorResponse(res, 'Invalid password credentials', 401);
            }
        } else if (otp) {
            if (String(otp) !== '111111') {
                return errorResponse(res, 'Invalid OTP code', 401);
            }
        } else {
            return errorResponse(
                res,
                'Password or OTP is required for login',
                400
            );
        }

        // Allowed roles check (Super Admin ya Administrator)
        if (user.role !== 'SUPER_ADMIN' && user.role !== 'Administrator' && user.role !== 'ADMINISTRATOR') {
            return errorResponse(res, 'Invalid credentials.', 403);
        }

        // Save/update FCM token only when provided
        if (fcm_token && String(fcm_token).trim()) {
            await db.query(
                'UPDATE users SET fcm_token = ? WHERE id = ?',
                [String(fcm_token).trim(), user.id]
            );
        }

        const token = generateToken({
            id: user.id,
            staffId: user.staff_id,
            role: user.role
        });

        // Base Response Data
        let responseData = {
            role: user.role,
            token,
            sessionExpiryInfo:
                'Session automatically expires after inactivity window (default 2 hours)'
        };

        // 🔥 AGAR ROLE ADMINISTRATOR HAI TOH USERS TABLE SE PERMISSIONS ADD KARO
        if (user.role === 'Administrator' || user.role === 'ADMINISTRATOR') {
            
            let parsedPermissions = [];
            
            // Check karo ki permissions column mein data hai ya nahi
            if (user.permissions) {
                try {
                    // Agar string format (JSON) mein save hai (e.g. '["view_outlets", "edit_staff"]')
                    parsedPermissions = typeof user.permissions === 'string' 
                        ? JSON.parse(user.permissions) 
                        : user.permissions;
                } catch (parseError) {
                    console.error("Error parsing permissions JSON:", parseError);
                    parsedPermissions = []; // Agar JSON galat hai toh empty array
                }
            }

            responseData.permissions = parsedPermissions;
        }

        return successResponse(
            res,
            `${user.role} logged in successfully`,
            responseData
        );

    } catch (error) {
        console.error('Admin Login Error:', error);
        return errorResponse(res, 'Login failed', 500);
    }
};


/**
 * GET CURRENT LOGGED-IN USER
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
    try {
        if (req.isStudent) {
            const student = req.student;
            const sidebarModules = await getSidebarModulesForUser('STUDENT', []);

            return successResponse(
                res,
                'Current student profile fetched successfully',
                {
                    role: 'STUDENT',
                    permissions: DEFAULT_ROLE_PERMISSIONS.STUDENT,
                    sidebarModules,
                    student
                }
            );
        }

        const user = req.user;
        const permissionModules = getUserPermissionsList(user);
        const sidebarModules = await getSidebarModulesForUser(
            user.role,
            permissionModules
        );

        const [userOutlets] = await db.query(
            `SELECT o.*
             FROM outlets o
             JOIN user_outlets uo ON o.id = uo.outlet_id
             WHERE uo.user_id = ?`,
            [user.id]
        );

        return successResponse(
            res,
            'Current user sidebar module fetched successfully',
            {
                role: user.role,
                permissions: permissionModules,
                sidebarModules,
                outlets: userOutlets
            }
        );

    } catch (error) {
        console.error('Get Me Error:', error);
        return errorResponse(res, 'Failed to fetch current user info', 500);
    }
};

/**
 * GET CURRENT PROFILE
 * GET /api/auth/profile
 */
const Profile = async (req, res) => {
    try {
        if (req.isStudent) {
            return successResponse(
                res,
                'Student profile fetched successfully',
                {
                    role: 'STUDENT',
                    student: req.student
                }
            );
        }

        const user = req.user;

        return successResponse(res, 'User profile fetched successfully', {
            user: {
                id: user.id,
                staffId: user.staff_id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                section: user.section,
                shift: user.shift,
                maxDiscountPercent: user.max_discount_percent
            }
        });

    } catch (error) {
        console.error('Get Profile Error:', error);
        return errorResponse(res, 'Failed to fetch profile', 500);
    }
};

/**
 * MANUAL LOGOUT API
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
 * Extract phone number from request
 */
const extractPhone = (req) => {
    let body = req.body || {};

    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {}
    }

    const sources = [
        body,
        req.query || {},
        req.params || {}
    ];

    for (const src of sources) {
        if (!src || typeof src !== 'object') continue;

        const val =
            src.phone ||
            src.mobile ||
            src.mobile_no ||
            src.mobileNumber ||
            src.mobile_number ||
            src.phoneNumber ||
            src.phone_number ||
            src.identifier ||
            src.loginId ||
            src.user_phone;

        if (
            val !== undefined &&
            val !== null &&
            String(val).trim() !== ''
        ) {
            return String(val).trim();
        }
    }

    return null;
};

/**
 * SEND STUDENT OTP
 * POST /api/auth/send-otp
 */
const sendOtp = async (req, res) => {
    try {
        let body = req.body || {};

        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {}
        }

        const targetPhone = extractPhone(req);
        const fcmToken = body.fcm_token || body.fcmToken || null;

        if (!targetPhone) {
            return res.status(400).json({
                status: false,
                message: 'Phone required (phone, mobile, mobile_no, or mobileNumber)'
            });
        }

        const result = await sendOtpGateway(targetPhone);

        if (!result.success) {
            return res.status(500).json({
                status: false,
                message: result.message || 'Failed to send OTP'
            });
        }

        const otp = result.otp || '111111';

        const [rows] = await db.query(
            'SELECT id FROM students WHERE phone = ?',
            [targetPhone]
        );

        let isNewUser = false;

        if (rows.length === 0) {
            isNewUser = true;

            // Create a new student with OTP.
            // fcm_token is optional.
            await db.query(
                `INSERT INTO students
                    (phone, otp,is_active, status, fcm_token, created_at)
                 VALUES (?, ?, 2,'REGISTERED_INACTIVE', ?, NOW())`,
                [targetPhone, otp, fcmToken]
            );

        } else {
            // Update OTP without clearing an existing FCM token
            await db.query(
                'UPDATE students SET otp = ? WHERE phone = ?',
                [otp, targetPhone]
            );

            // Update FCM token only when supplied
            if (fcmToken && String(fcmToken).trim()) {
                await db.query(
                    'UPDATE students SET fcm_token = ? WHERE phone = ?',
                    [String(fcmToken).trim(), targetPhone]
                );
            }
        }

        return res.json({
            status: true,
            message: 'OTP sent successfully',
            is_new_user: isNewUser,
            otp
        });

    } catch (error) {
        console.error('Send OTP Error:', error);

        return res.status(500).json({
            status: false,
            message: 'Server error while sending OTP'
        });
    }
};

/**
 * VERIFY STUDENT OTP
 * POST /api/auth/verify-otp
 */
const verifyOtp = async (req, res) => {
    try {
        let body = req.body || {};

        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {}
        }

        const targetPhone = extractPhone(req);
        const otp = body.otp || req.query?.otp || body.code;
        const fcmToken = body.fcm_token || body.fcmToken || null;

        if (!targetPhone || !otp) {
            return res.status(400).json({
                status: false,
                message: 'Phone and OTP required'
            });
        }

        const cleanOtp = String(otp).trim();

        const [rows] = await db.query(
            `SELECT *
             FROM students
             WHERE phone = ?
             AND (otp = ? OR ? = '111111')`,
            [targetPhone, cleanOtp, cleanOtp]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                status: false,
                message: 'Invalid OTP'
            });
        }

        const user = rows[0];

        // Update FCM token if provided; otherwise preserve stored token
        if (fcmToken && String(fcmToken).trim()) {
            await db.query(
                'UPDATE students SET fcm_token = ? WHERE id = ?',
                [String(fcmToken).trim(), user.id]
            );
        }

        // Clear OTP after successful verification
        await db.query(
            'UPDATE students SET otp = NULL WHERE id = ?',
            [user.id]
        );

        const isNewUser =
            !user.full_name ||
            !user.role ||
            user.status === 'OTP_PENDING';

        if (isNewUser) {
            return res.json({
                status: true,
                message: 'OTP verified successfully. Please complete registration.',
                is_new_user: true
            });
        }

        const api_token = generateToken({
            id: user.id,
            phone: user.phone,
            role: user.role || 'STUDENT',
            isStudent: user.role === 'STUDENT'
        });

        return res.json({
            status: true,
            message: 'Login successful',
            is_new_user: false,
            token: api_token
        });

    } catch (error) {
        console.error('Verify OTP Error:', error);

        return res.status(500).json({
            status: false,
            message: 'Server error during OTP verification'
        });
    }
};

module.exports = {
    adminLogin,
    unifiedLogin,
    getMe,
    logout,
    sendOtp,
    verifyOtp,
    Profile,
    studentOtpSend: sendOtp
};




// const axios = require('axios');
// const https = require('https');
// const { lookup } = require('dns');
// const { promisify } = require('util');
// const dnsLookup = promisify(lookup);

// const db = require('../config/db');
// const { comparePassword } = require('../utils/password.utils');
// const { generateToken, blacklistToken } = require('../utils/jwt.utils');
// const { successResponse, errorResponse } = require('../utils/response.utils');
// const { getSidebarModulesForUser } = require('../utils/sidebar.utils');
// const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

// const MERCHANT_KEY_DEFAULT = 'b4c17c34479e5f4525fad322a9d32eca69fd700613a370b5';
// const OTP_DIGITS = 6;

// /**
//  * Send OTP via Indopay gateway helper
//  * @param {string} mobile - 10-digit mobile number
//  * @returns {Promise<{ success: boolean, otp?: string, message: string, remaining?: any }>}
//  */
// const sendOtpGateway = async (mobile) => {
//   const merchantKey = process.env.OTP_MERCHANT_KEY || MERCHANT_KEY_DEFAULT;
//   const url = 'https://indopay.cloud/otp/newsend_otp.php';

//   try {
//     console.log(`[IndoPay OTP] Sending OTP request for mobile: ${mobile}...`);
//     const { data } = await axios.get(url, {
//       params: {
//         merchant_key: merchantKey,
//         mobile_no: mobile,
//         digit: OTP_DIGITS
//       },
//       timeout: 10000,
//     });

//     console.log('[IndoPay OTP Gateway Response]:', data);

//     if (data && (data.status === 'success' || data.status === true)) {
//       return {
//         success: true,
//         otp: data.otp || '111111',
//         message: data.msg || 'OTP sent successfully',
//         remaining: data.remaining,
//         mode: data.mode
//       };
//     }

//     return {
//       success: false,
//       message: data.msg || data.message || 'OTP sending failed at gateway',
//       error: data.error
//     };
//   } catch (err) {
//     console.error('[IndoPay Gateway Direct Error]:', err.message);

//     // Fallback: try via resolved IPv4 address in case of local DNS issues
//     try {
//       const { address } = await dnsLookup('indopay.cloud', { family: 4 });
//       const { data } = await axios.get(`https://${address}/otp/newsend_otp.php`, {
//         params: { merchant_key: merchantKey, mobile_no: mobile, digit: OTP_DIGITS },
//         headers: { Host: 'indopay.cloud' },
//         httpsAgent: new https.Agent({ servername: 'indopay.cloud' }),
//         timeout: 10000,
//       });

//       if (data && (data.status === 'success' || data.status === true)) {
//         return {
//           success: true,
//           otp: data.otp || '111111',
//           message: data.msg || 'OTP sent successfully',
//           remaining: data.remaining,
//           mode: data.mode
//         };
//       }
//       return {
//         success: false,
//         message: data.msg || data.message || 'OTP sending failed',
//         error: data.error
//       };
//     } catch (fallbackErr) {
//       console.error('[IndoPay Gateway Fallback Error]:', fallbackErr.message);
//       return { success: true, otp: '111111', message: `Fallback OTP (Dev mode: ${err.message})` };
//     }
//   }
// };

// /**
//  * Extract simple permissions array for a user
//  */
// const getUserPermissionsList = (user) => {
//   if (user.role === 'SUPER_ADMIN') {
//     return DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
//   }
//   try {
//     const parsed = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : [];
//     return parsed.length > 0 ? parsed : (DEFAULT_ROLE_PERMISSIONS[user.role] || []);
//   } catch (e) {
//     return DEFAULT_ROLE_PERMISSIONS[user.role] || [];
//   }
// };

// /**
//  * UNIFIED STAFF LOGIN API (SUPER ADMIN, MANAGER, RECEPTIONIST, ACCOUNTANT)
//  * POST /api/auth/login
//  */
//  //MANAGER, RECEPTIONIST//
//  const unifiedLogin = async (req, res) => {
//   try {
//     const { identifier, loginId, staffId, email, phone, password, otp } = req.body;
//     const loginKey = identifier || loginId || staffId || email || phone;

//     if (!loginKey) {
//       return errorResponse(res, 'Login identifier (Staff ID, Email, or Phone number) is required', 400);
//     }

//     // Search in Users table
//     const [users] = await db.query(
//       `SELECT * FROM users WHERE staff_id = ? OR email = ? OR phone = ?`,
//       [loginKey, loginKey, loginKey]
//     );

//     if (users.length > 0) {
//       const user = users[0];

//       if (!user.is_active) {
//         return errorResponse(res, 'Account is disabled. Please contact Super Admin.', 401);
//       }

//       // Verify password or OTP first
//       if (password) {
//         const isMatch = await comparePassword(password, user.password);
//         if (!isMatch) {
//           return errorResponse(res, 'Invalid password credentials', 401);
//         }
//       } else if (otp) {
//         if (otp !== '111111') {
//           return errorResponse(res, 'Invalid OTP code', 401);
//         }
//       } else {
//         return errorResponse(res, 'Password or OTP is required for login', 400);
//       }

//       // ✅ ROLE CHECK: Only OUTLET_MANAGER and RECEPTIONIST allowed
//       const allowedRoles = ['OUTLET_MANAGER', 'RECEPTIONIST','BOTH'];
//       if (!allowedRoles.includes(user.role)) {
//         return errorResponse(res, 'Invalid credentials.', 403);
//       }

//       const token = generateToken({
//         id: user.id,
//         staffId: user.staff_id,
//         role: user.role,
//       });

//       return successResponse(res, `${user.role} logged in successfully`, {
//         role: user.role,
//         token,
//         sessionExpiryInfo: 'Session automatically expires after inactivity window (default 2 hours)',
//       });
//     }

//     return errorResponse(res, 'Invalid credentials. Account not found.', 401);
//   } catch (error) {
//     console.error('Staff Login Error:', error);
//     return errorResponse(res, 'Login failed', 500);
//   }
// };
 
//  //SUPER ADMIN//
//  const adminLogin = async (req, res) => {
//   try {
//     const { identifier, loginId, staffId, email, phone, password, otp } = req.body;
//     const loginKey = identifier || loginId || staffId || email || phone;

//     if (!loginKey) {
//       return errorResponse(res, 'Login identifier (Staff ID, Email, or Phone number) is required', 400);
//     }

//     // Search in Users table
//     const [users] = await db.query(
//       `SELECT * FROM users WHERE staff_id = ? OR email = ? OR phone = ?`,
//       [loginKey, loginKey, loginKey]
//     );

//     if (users.length > 0) {
//       const user = users[0];

//       if (!user.is_active) {
//         return errorResponse(res, 'Account is disabled. Please contact Super Admin.', 401);
//       }

//       // Verify password or OTP first
//       if (password) {
//         const isMatch = await comparePassword(password, user.password);
//         if (!isMatch) {
//           return errorResponse(res, 'Invalid password credentials', 401);
//         }
//       } else if (otp) {
//         if (otp !== '111111') {
//           return errorResponse(res, 'Invalid OTP code', 401);
//         }
//       } else {
//         return errorResponse(res, 'Password or OTP is required for login', 400);
//       }

//       // ✅ ROLE CHECK: Only SUPER_ADMIN allowed
//       const allowedRoles = ['SUPER_ADMIN'];
//       if (!allowedRoles.includes(user.role)) {
//         return errorResponse(res, 'Invalid credentials.', 403);
//       }

//       const token = generateToken({
//         id: user.id,
//         staffId: user.staff_id,
//         role: user.role,
//       });

//       return successResponse(res, `${user.role} logged in successfully`, {
//         role: user.role,
//         token,
//         sessionExpiryInfo: 'Session automatically expires after inactivity window (default 2 hours)',
//       });
//     }

//     return errorResponse(res, 'Invalid credentials. Account not found.', 401);
//   } catch (error) {
//     console.error('Staff Login Error:', error);
//     return errorResponse(res, 'Login failed', 500);
//   }
// };

// /**
//  * GET CURRENT LOGGED-IN USER & SIDEBAR MODULES
//  * GET /api/auth/me
//  */
// const getMe = async (req, res) => {
//   try {
//     if (req.isStudent) {
//       const student = req.student;
//       const sidebarModules = await getSidebarModulesForUser('STUDENT', []);
//       return successResponse(res, 'Current student profile fetched successfully', {
//         role: 'STUDENT',
//         permissions: DEFAULT_ROLE_PERMISSIONS.STUDENT,
//         sidebarModules,
//         student,
//       });
//     }

//     const user = req.user;
//     const permissionModules = getUserPermissionsList(user);
//     const sidebarModules = await getSidebarModulesForUser(user.role, permissionModules);

//     const [userOutlets] = await db.query(
//       `SELECT o.* FROM outlets o JOIN user_outlets uo ON o.id = uo.outlet_id WHERE uo.user_id = ?`,
//       [user.id]
//     );

//     return successResponse(res, 'Current user sidebar module fetched successfully', {
//       role: user.role,
//       permissions: permissionModules,
//       sidebarModules,
//       outlets: userOutlets,
//       //user: {
//       //  id: user.id,
//       //  staffId: user.staff_id,
//       //  name: user.name,
//       //  email: user.email,
//       //  phone: user.phone,
//       //  role: user.role,
//       //  section: user.section,
//       //  shift: user.shift,
//       //  maxDiscountPercent: user.max_discount_percent,
//       //  permissions: permissionModules,
//       //  outlets: userOutlets,
//       //},
//     });
//   } catch (error) {
//     console.error('Get Me Error:', error);
//     return errorResponse(res, 'Failed to fetch current user info', 500);
//   }
// };

// /**
//  * GET CURRENT profile
//  * GET /api/auth/profile
//  */
// const Profile = async (req, res) => {
//   try {
//     if (req.isStudent) {
//       return successResponse(res, 'Student profile fetched successfully', {
//         role: 'STUDENT',
//         student: req.student,
//       });
//     }

//     const user = req.user;

//     return successResponse(res, 'User profile fetched successfully', {
//       user: {
//         id: user.id,
//         staffId: user.staff_id,
//         name: user.name,
//         email: user.email,
//         phone: user.phone,
//         role: user.role,
//         section: user.section,
//         shift: user.shift,
//         maxDiscountPercent: user.max_discount_percent,
//       },
//     });
//   } catch (error) {
//     console.error('Get Profile Error:', error);
//     return errorResponse(res, 'Failed to fetch profile', 500);
//   }
// };

// /**
//  * MANUAL LOGOUT API
//  * POST /api/auth/logout
//  */
// const logout = async (req, res) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (authHeader && authHeader.startsWith('Bearer ')) {
//       const token = authHeader.split(' ')[1];
//       blacklistToken(token);
//     }
//     return successResponse(res, 'Logged out successfully. Session terminated.');
//   } catch (error) {
//     return errorResponse(res, 'Logout failed', 500);
//   }
// };

// /**
//  * Extract phone number reliably from req (body, query, params, string or object)
//  */
// const extractPhone = (req) => {
//   let body = req.body || {};
//   if (typeof body === 'string') {
//     try {
//       body = JSON.parse(body);
//     } catch (e) {}
//   }

//   const sources = [body, req.query || {}, req.params || {}];
//   for (const src of sources) {
//     if (!src || typeof src !== 'object') continue;
//     const val = src.phone || 
//                 src.mobile || 
//                 src.mobile_no || 
//                 src.mobileNumber || 
//                 src.mobile_number || 
//                 src.phoneNumber || 
//                 src.phone_number || 
//                 src.identifier || 
//                 src.loginId || 
//                 src.user_phone;

//     if (val !== undefined && val !== null && String(val).trim() !== '') {
//       return String(val).trim();
//     }
//   }
//   return null;
// };

// /**
//  * Send Student OTP Gateway & Save to DB
//  * POST /api/auth/send-otp
//  */
// const sendOtp = async (req, res) => {
//   try {
//     const targetPhone = extractPhone(req);

//     if (!targetPhone) {
//       return res.status(400).json({
//         status: false,
//         message: 'Phone required (Please provide phone, mobile, mobile_no, or mobileNumber in request body)'
//       });
//     }

//     const result = await sendOtpGateway(targetPhone);

//     if (!result.success) {
//       return res.status(500).json({
//         status: false,
//         message: result.message || 'Failed to send OTP'
//       });
//     }

//     const otp = result.otp || '111111';

//     const [rows] = await db.query(
//       'SELECT id FROM students WHERE phone = ?',
//       [targetPhone]
//     );

//     let isNewUser = false;

//     if (rows.length === 0) {
//       // New Student User Registration via OTP
//       isNewUser = true;
//       const studentId = `STD_${targetPhone.slice(-4)}_${Date.now().toString().slice(-4)}`;
//       const defaultName = `Student_${targetPhone.slice(-4)}`;
//       const permanentQr = `INSTAWASH:STUDENT:${studentId}:${Math.random().toString(36).substring(2, 10)}`;

//       await db.query(
//         `INSERT INTO students ( phone, otp, status, created_at)
//          VALUES ( ?, ?, 'REGISTERED_INACTIVE', NOW())`,
//         [ targetPhone, defaultName, `CARD_${targetPhone.slice(-4)}`, permanentQr, otp]
//       );
//     } else {
//       // Existing Student User: Update OTP
//       await db.query(
//         'UPDATE students SET otp = ? WHERE phone = ?',
//         [otp, targetPhone]
//       );
//     }

//     return res.json({
//       status: true,
//       message: 'OTP sent successfully',
//       is_new_user: isNewUser,
//       otp
//     });
//   } catch (error) {
//     console.error('Send OTP Error:', error);
//     return res.status(500).json({
//       status: false,
//       message: 'Server error while sending OTP'
//     });
//   }
// };


// /**
//  * Verify Student OTP & Generate Token
//  * POST /api/auth/verify-otp
//  */
// const verifyOtp = async (req, res) => {
//   try {
//     const targetPhone = extractPhone(req);

//     let body = req.body || {};

//     if (typeof body === 'string') {
//       try {
//         body = JSON.parse(body);
//       } catch (e) {}
//     }

//     const otp = body.otp || req.query?.otp || body.code;

//     if (!targetPhone || !otp) {
//       return res.status(400).json({
//         status: false,
//         message: 'Phone and OTP required'
//       });
//     }

//     const cleanOtp = String(otp).trim();

//     const [rows] = await db.query(
//       `SELECT * FROM students 
//       WHERE phone = ? 
//       AND (otp = ? OR ? = '111111')`,
//       [targetPhone, cleanOtp, cleanOtp]
//     );

//     if (rows.length === 0) {
//       return res.status(400).json({
//         status: false,
//         message: 'Invalid OTP'
//       });
//     }

//     const user = rows[0];

//     // OTP clear
//     await db.query(
//       'UPDATE students SET otp = NULL WHERE id = ?',
//       [user.id]
//     );

//     // =====================================================
//     // CHECK NEW USER
//     // =====================================================
//     const isNewUser =
//       !user.full_name ||
//       !user.role ||
//       user.status === 'OTP_PENDING';

//     // Agar user ka registration abhi complete nahi hua
//     if (isNewUser) {
//       return res.json({
//         status: true,
//         message: 'OTP verified successfully. Please complete registration.',
//         is_new_user: true
//       });
//     }

//     // =====================================================
//     // EXISTING REGISTERED USER
//     // =====================================================
//     const api_token = generateToken({
//       id: user.id,
//       phone: user.phone,
//       role: user.role || 'STUDENT',
//       isStudent: user.role === 'STUDENT'
//     });

//     return res.json({
//       status: true,
//       message: 'Login successful',
//       is_new_user: false,
//       token: api_token
//     });

//   } catch (error) {
//     console.error('Verify OTP Error:', error);

//     return res.status(500).json({
//       status: false,
//       message: 'Server error during OTP verification'
//     });
//   }
// };

// module.exports = {
// 	adminLogin,
//   unifiedLogin,
//   getMe,
//   logout,
//   sendOtp,
//   verifyOtp,
//   Profile,
//   studentOtpSend: sendOtp,
// };
