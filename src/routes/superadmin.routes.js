const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  getDashboardStats,
  
  getAllPermissions,
  getUserPermissions,
  updateUserPermissions,
 
  getNetworkReports,
  getAuditLogs,
  createNotice,
  addSubscriptionPlan,
    getSubscriptionPlanList,
    getSubscriptionPlanById,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    updateSubscriptionPlanStatus,
    addPayAsYouGoPlan,
    getPayAsYouGoPlanList,
    getPayAsYouGoPlanById,
    updatePayAsYouGoPlan,
    deletePayAsYouGoPlan,
    updatePayAsYouGoPlanStatus,
    getAllCampuses,
    getCampusById,
    createCampus,
    updateCampus,
    toggleCampusStatus,
    getAllOutlets,
  getOutletById,
  createOutlet,
  updateOutlet,
  toggleOutletStatus,
  getCampusOutlets,
  createReceptionist,
  getReceptionist,
  updateReceptionist,
  getCustomer,
  getStaff,
  getMachines,
  getAdminOrderList,
  getAdminOrderDetails,
  getOrderList,
  getOrderById,
  getSuperAdminDashboard,
  getGeneralSettings, 
    updateGeneralSettings, 
    changePassword ,
	changeAdministratorPassword,
    getAdminComplaints,
    getAdminComplaintDetails,
    updateAdminComplaintStatus,
    getNotificationHistory,
    getAdminReports,
     createFaq,
    getFaqs,
    updateFaq,
    deleteFaq,
    getAdminDailyCollectionList,
    getAdminCollectionDetails,
    approveCollection,
    updateCustomerStatus,
    createRole, 
    getRoles, 
    updateRole,
	getAllPayments
} = require('../controllers/superadmin.controller');

const {
    sendNotification,
    subscribeToTopic,
    unsubscribeFromTopic,
    createTopic
} = require('../controllers/notification.controller');

router.post('/send', sendNotification);
router.post('/subscribe-topic', subscribeToTopic);
router.post('/unsubscribe-topic', unsubscribeFromTopic);
router.post('/create-topic', createTopic);

// PUT /api/superadmin/change-administrator-password
router.put('/change_administrator_password', changeAdministratorPassword);

// Require Super Admin role for all routes
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN','Administrator'));

// ✅ Sirf ek hi route, chahe list ho ya detail
router.get('/payments', getAllPayments);
// GET: Dashboard List + Stats fetch karne ke liye
router.get('/getRoles', getRoles);

// POST: Naya Role create karne ke liye
router.post('/create_roles', createRole);

// PUT: Existing Role ko update karne ke liye
router.put('/update_roles/:id', updateRole);

// Admin Routes
router.get('/daily_collection', getAdminDailyCollectionList);
router.get('/daily_collection/:recon_id', getAdminCollectionDetails);
router.put('/daily_collection/:recon_id', approveCollection);

router.get('/reports', getAdminReports);
// GET API
router.get('/notifications', getNotificationHistory);

// Super Admin Routes
router.get('/complaints', getAdminComplaints);
router.get('/complaints/:id', getAdminComplaintDetails);
router.put('/complaints_update/:id', updateAdminComplaintStatus);

// Super Admin Routes
router.get('/dashboard', getSuperAdminDashboard);

// List API (Filters ke saath)
router.get('/orders', getOrderList);

// Details API (Timeline aur Payment ke saath)
router.get('/orders/:id', getOrderById);



// LIST — screenshot 2
router.get('/machines', getMachines);

// DETAIL — screenshot 1
router.get('/machines/:outletId', getMachines);

// ================= CAMPUS ROUTES =================
router.get('/campuses',  getAllCampuses);
router.get('/campuses/:id',  getCampusById);
router.post('/campuses',  createCampus);
router.put('/campuses/:id',  updateCampus);
router.patch('/campuses/:id',  toggleCampusStatus);

// ================= OUTLET ROUTES =================
router.get('/outlets',  getAllOutlets);
router.get('/outlets/:id',  getOutletById);
router.post('/outlets',  createOutlet);
router.put('/outlets/:id',  updateOutlet);
router.patch('/outlets/:id',  toggleOutletStatus);
//router.get('/campuses_outlets/:campus_id/:section',getCampusOutlets);
router.post('/campuses_outlets', getCampusOutlets);

///receptionist Sections///
router.post('/receptionist', createReceptionist);
router.get('/receptionists', getReceptionist);        // list
router.get('/receptionists/:id', getReceptionist);     // detail
router.put('/receptionist/:id', updateReceptionist);


// Add
router.post('/add_pay_as_you_go_plan',addPayAsYouGoPlan);
// List
router.get('/pay_as_you_go_plan_list',getPayAsYouGoPlanList);
// View by ID
router.get('/pay_as_you_go_plan/:id',getPayAsYouGoPlanById);
// Update
router.put('/pay_as_you_go_plan/:id',updatePayAsYouGoPlan);
// Active / Inactive
router.patch('/pay_as_you_go/:id',updatePayAsYouGoPlanStatus);
// Delete
router.delete('/pay_as_you_go/:id',deletePayAsYouGoPlan);


router.post('/subscription_add', addSubscriptionPlan);

router.get('/subscription_list', getSubscriptionPlanList);

router.get('/subscription_plan/:id', getSubscriptionPlanById);

router.put('/subscription_update/:id', updateSubscriptionPlan);

router.delete('/subscription_delete/:id', deleteSubscriptionPlan);

router.patch('/subscription_plan/status/:id', updateSubscriptionPlanStatus);


router.get('/dashboard', getDashboardStats);


// Permissions Master List & User Permission Toggles
router.get('/permissions', getAllPermissions);
router.get('/users/:userId/permissions', getUserPermissions);
router.put('/users/:userId/permissions', logAuditAction('UPDATE_USER_PERMISSIONS'), updateUserPermissions);



// System Reports, Audit Logs & Notices
router.get('/reports', getNetworkReports);
router.get('/audit-logs', getAuditLogs);
router.post('/notices', logAuditAction('CREATE_NOTICE'), createNotice);

router.get('/customers', getCustomer);
router.get('/customers/:id', getCustomer);
// ✅ Naya toggle route
router.put('/customers_status/:id', updateCustomerStatus);

router.get('/staff_list', getStaff);
router.get('/staff_list/:id', getStaff);

// Super Admin Routes
router.get('/orders', getAdminOrderList);
router.get('/orders/:id', getAdminOrderDetails);

// General Settings
router.get('/general_settings', getGeneralSettings);

router.put('/general_settings', updateGeneralSettings);


// Change Password
router.put('/change_password', changePassword);

router.post('/faqs', createFaq);
router.get('/faqs', getFaqs);
router.put('/faqs/:id', updateFaq);
router.delete('/faqs/:id', deleteFaq);


module.exports = router;
