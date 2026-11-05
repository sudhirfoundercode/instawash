const express = require('express');
const router = express.Router();
const { unifiedLogin,adminLogin, getMe, logout, sendOtp, verifyOtp,Profile } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Unified Login API for ALL roles
router.post('/login', unifiedLogin);
router.post('/admin_login', adminLogin);

// Current User & Sidebar Modules 
router.get('/sidebar_module', authenticateToken, getMe);
// Current User  Profile API
router.get('/profile', authenticateToken, Profile);


// Manual Logout API for ALL roles
router.post('/logout', authenticateToken, logout);

// Student OTP Send & Verify APIs
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

module.exports = router;
