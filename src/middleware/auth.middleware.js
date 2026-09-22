const { verifyToken, isTokenBlacklisted } = require('../utils/jwt.utils');
const db = require('../config/db');
const { errorResponse } = require('../utils/response.utils');
const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Authentication token missing or invalid format', 401);
  }

  const token = authHeader.split(' ')[1];

  if (isTokenBlacklisted(token)) {
    return errorResponse(res, 'Session terminated. You have manually logged out.', 401);
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return errorResponse(res, 'Session expired due to inactivity. Please login again.', 401);
  }

  try {
    if (decoded.isStudent || decoded.role === 'STUDENT') {
      const [students] = await db.query(
        'SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.id = ?',
        [decoded.id]
      );

      if (students.length === 0) {
        return errorResponse(res, 'Student account not found', 401);
      }

      req.student = students[0];
      req.isStudent = true;
      req.token = token;
    } else {
      const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);

      if (users.length === 0 || !users[0].is_active) {
        return errorResponse(res, 'Staff account disabled or not found', 401);
      }

      const user = users[0];
      const [userOutlets] = await db.query('SELECT outlet_id FROM user_outlets WHERE user_id = ?', [user.id]);

      // Parse user permissions JSON or fallback to role defaults
      let permissionCodes = [];
      try {
        permissionCodes = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : [];
      } catch (e) {
        permissionCodes = [];
      }

      if (permissionCodes.length === 0) {
        permissionCodes = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
      }

      req.user = user;
      req.userPermissions = permissionCodes;
      req.assignedOutletIds = userOutlets.map((uo) => uo.outlet_id);
      req.token = token;
    }

    next();
  } catch (error) {
    console.error('Authentication Middleware Error:', error);
    return errorResponse(res, 'Authentication failed', 500);
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (req.isStudent) {
      if (roles.includes('STUDENT')) return next();
      return errorResponse(res, 'Access denied for student role', 403);
    }

    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, `Access denied. Requires one of roles: ${roles.join(', ')}`, 403);
    }

    next();
  };
};

/**
 * Simple Dynamic Permission / Module Middleware
 */
const authorizePermission = (requiredModule) => {
  return (req, res, next) => {
    if (req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'superadmin')) {
      return next();
    }

    if (!req.userPermissions || !req.userPermissions.includes(requiredModule)) {
      return errorResponse(
        res,
        `Access Denied. Module '${requiredModule}' is not assigned to your account.`,
        403
      );
    }

    next();
  };
};

const enforceDiscountCeiling = (req, res, next) => {
  const discountPercent = parseFloat(req.body.discountPercent || req.body.discount || 0);

  if (req.user && req.user.role !== 'SUPER_ADMIN') {
    const maxAllowed = req.user.max_discount_percent || 0;
    if (discountPercent > maxAllowed) {
      return errorResponse(
        res,
        `Requested discount (${discountPercent}%) exceeds your assigned maximum limit of ${maxAllowed}%`,
        400
      );
    }
  }

  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizePermission,
  enforceDiscountCeiling,
};
