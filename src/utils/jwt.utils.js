const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'instawash_super_secret_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h'; // 2 hours automatic inactivity session expiry

// In-memory token blacklist for manual logouts
const tokenBlacklist = new Set();

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const verifyToken = (token) => {
  try {
    if (tokenBlacklist.has(token)) {
      return null; // Token manually invalidated (logged out)
    }
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const blacklistToken = (token) => {
  if (token) {
    tokenBlacklist.add(token);
  }
};

const isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(token);
};

module.exports = {
  generateToken,
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
};
