const express = require('express');
const router = express.Router();
const { unifiedLogin, getMe, logout, studentOtpSend } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Unified Login API for ALL role
router.post('/login', unifiedLogin);

// Current User & Sidebar Modules Profile API
router.get('/me', authenticateToken, getMe);
router.get('/profile', authenticateToken, getMe);

// Manual Logout API for ALL roles
router.post('/logout', authenticateToken, logout);

// Send OTP helper
router.post('/send-otp', studentOtpSend);

module.exports = router;
