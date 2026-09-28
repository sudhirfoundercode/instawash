const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizePermission, enforceDiscountCeiling } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  searchStudent,
  getStudentByQr,
  registerStudentByReceptionist,
  createDropOffIntake,
  updateOrderStatus,
  getDailyActivityLog,
} = require('../controllers/receptionist.controller');
const { getMe } = require('../controllers/auth.controller');

router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'OUTLET_MANAGER', 'RECEPTIONIST'));

router.get('/profile', getMe);
router.get('/students/search', authorizePermission('students'), searchStudent);
router.get('/students/qr/:qrToken', authorizePermission('students'), getStudentByQr);
router.post('/students', authorizePermission('students'), logAuditAction('REGISTER_STUDENT'), registerStudentByReceptionist);
router.post('/orders/intake', authorizePermission('orders'), enforceDiscountCeiling, logAuditAction('DROP_OFF_INTAKE'), createDropOffIntake);
router.put('/orders/:orderId/status', authorizePermission('orders'), logAuditAction('UPDATE_ORDER_STATUS'), updateOrderStatus);
router.get('/activity-log', authorizePermission('orders'), getDailyActivityLog);

module.exports = router;
