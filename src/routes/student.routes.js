const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  studentRegister,
  uploadIdCardPhoto,
  getProfile,
  updateProfile,
  selectPlanPayAtOutlet,
  getStudentDashboard,
  getStudentOrders,
  raiseComplaint,
  rateOutlet,
  getNotices,
} = require('../controllers/student.controller');

// Public registration endpointa
router.post('/register', studentRegister);

// Authenticated Student routes
router.use(authenticateToken, authorizeRoles('STUDENT'));

router.post('/upload-id-card', upload.single('idCardPhoto'), uploadIdCardPhoto);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/subscriptions/select', selectPlanPayAtOutlet);
router.get('/dashboard', getStudentDashboard);
router.get('/orders', getStudentOrders);
router.post('/complaints', upload.single('photo'), logAuditAction('RAISE_COMPLAINT'), raiseComplaint);
router.post('/ratings', rateOutlet);
router.get('/notices', getNotices);

module.exports = router;
