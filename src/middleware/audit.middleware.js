const db = require('../config/db');
const { v4: uuidv4 } = require('crypto');

const logAuditAction = (actionName) => {
  return async (req, res, next) => {
    res.on('finish', async () => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const userId = req.user ? req.user.id : req.student ? req.student.id : null;
          const userRole = req.user ? req.user.role : req.student ? 'STUDENT' : 'ANONYMOUS';
          const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

          await db.query(
            `INSERT INTO audit_logs (id, user_id, user_role, action, endpoint, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              userId,
              userRole,
              actionName || `${req.method} ${req.originalUrl}`,
              req.originalUrl,
              JSON.stringify({ body: req.body, params: req.params, query: req.query }),
              req.ip || req.connection.remoteAddress,
            ]
          );
        }
      } catch (err) {
        console.error('Audit Log recording failed:', err.message);
      }
    });

    next();
  };
};

module.exports = {
  logAuditAction,
};
