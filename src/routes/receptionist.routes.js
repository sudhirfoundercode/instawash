const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizePermission, enforceDiscountCeiling } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');

const {
    createOrder,
    getOrderById,
    getOrderList,
    getStudentSubscriptionStatus,
    getNotificationList
} = require('../controllers/receptionist.controller');


router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'OUTLET_MANAGER', 'RECEPTIONIST','BOTH','STUDENT'));

router.post('/order', createOrder);
// router.get('/orders', getOrderList);
// router.get('/order/:id', getOrderById);
router.get('/student/:studentId', getStudentSubscriptionStatus);
router.get('/notification_list', getNotificationList);
 
module.exports = router;
