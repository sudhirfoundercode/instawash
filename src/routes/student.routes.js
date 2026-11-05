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
  getCampuses,
  getCampusOutlets,
  getBannerList,
  getSubscriptionPlanList,
  getSubscriptionPlanById,
  updatePaymentStatus,
  rejectSubscription,
  getPaymentDetails,
  getPendingSubscriptions,
  getStudentOrderList,
  getStudentOrderDetails,
  submitRating,
  getStudentPayAsYouGoPlans,
  getComplaints,
  getStudentByQr
  
} = require('../controllers/student.controller');

const {createWalletOrder,verifyWalletPayment,initiatePayment, verifySubscriptionPayment} = require('../controllers/paytmController');



// Public registration endpoint
//router.post('/register', studentRegister);
// Registration with profile image
router.post(
  '/register',
  upload.single('profileImage'),
  studentRegister
);


router.get('/campuses', getCampuses);
router.get('/campuses_outlets/:campus_id/:section',getCampusOutlets);

router.get('/banner_list', getBannerList);

router.get('/student_qr/:id', getStudentByQr);

// ==================================================
// PAYTM WALLET ROUTES
// ==================================================

router.post('/create_wallet_order', createWalletOrder);

router.post('/verify_wallet_payment', verifyWalletPayment);

// 1. Initiate Subscription + Paytm Gateway
router.post('/initiate', initiatePayment);

// 2. Verify Subscription Payment
router.post('/verify', verifySubscriptionPayment);



// Authenticated Student routes
router.use(authenticateToken, authorizeRoles('STUDENT')); // 👈 Middleware yahan laga hai!




router.get('/complaints', getComplaints);           // List

router.get('/payg_plans', getStudentPayAsYouGoPlans);

router.post('/ratings', submitRating);
// List API (Filters ke saath)
router.get('/orders', getStudentOrderList);

// Details API (Timeline aur Payment ke saath)
router.get('/orders/:id', getStudentOrderDetails);


// Authenticated Student routes
//router.use(authenticateToken, authorizeRoles('STUDENT'));
// ================= PAYMENT ROUTES =================
//router.post('/initiate',  initiatePayment);
router.put('/update-status/:transaction_id',  updatePaymentStatus);
router.patch('/reject/:transaction_id',  rejectSubscription);
router.get('/details/:transaction_id',  getPaymentDetails);
router.get('/pending',  getPendingSubscriptions);



// ✅ QR scan endpoint (admin / staff)

router.post('/upload-id-card', upload.single('idCardPhoto'), uploadIdCardPhoto);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/subscriptions/select', selectPlanPayAtOutlet);
router.get('/dashboard', getStudentDashboard);
//router.get('/orders', getStudentOrders);
router.post('/report_issue', upload.single('photo'), logAuditAction('RAISE_COMPLAINT'), raiseComplaint);
router.post('/ratings', rateOutlet);
router.get('/notices', getNotices);

router.get('/subscription_list', getSubscriptionPlanList);
router.get('/subscription_plan/:id', getSubscriptionPlanById);

module.exports = router;
