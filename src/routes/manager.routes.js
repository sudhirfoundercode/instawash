const express = require('express');
const upload = require('../middleware/upload.middleware');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizePermission } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');

const {
  getOutletDashboard,
  getFlaggedOrders,
  resolveFlaggedOrder,
  getOperationalReports,
  getAssignedOutlets,
  createStaff,
  getStaffList,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
   addMachine,
  getMachineList,
  updateMachine,
  updateMachineStatus,
  deleteMachine,
  getMachineTypes,
  getCustomerList,
  getLegalPage,
  getProfile,
  getAllSubscriptionsByOutlet,
  getSubscriptionById,
  updateSubscriptionStudentDetails,
  approveOrRejectSubscription,
  getOrderList,
  getOrderById,
  	studentOrderList,
	studentOrderById,
	getDashboard,
	markOrderAsDelivered,
	getReportsData,
	getCustomerDetailsById,
	getComplaintsList,
	getComplaintDetails,
	updateComplaint,
	getSupportAndFaqs,
	getReceptionists,
	getDailyCollection,
	submitDailyCollection
	
} = require('../controllers/manager.controller');
 


router.get('/page', getLegalPage);

router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'OUTLET_MANAGER','RECEPTIONIST','BOTH','STUDENT'));

router.get('/daily_collection', getDailyCollection);
router.post('/daily_collection/submit', submitDailyCollection);

// List aur Details dono isi function se handle honge
router.get('/receptionists', getReceptionists);       // List
router.get('/receptionists/:id', getReceptionists);   // Details

// Public Route (No Auth Required)
router.get('/faqs_data', getSupportAndFaqs);
// Manager Routes
router.get('/complaints', getComplaintsList);
router.get('/complaints/:id', getComplaintDetails);
router.put('/complaints_update/:id', updateComplaint); // Note ya Status add karne ke liye

 router.get('/customer/:id', getCustomerDetailsById);

router.get('/Reports_details', getReportsData);
// Route
router.put('/deliver_orders/:order_id', markOrderAsDelivered);

router.get('/dashboard', getDashboard);
// ⭐ List API (Custom URL)
// Example: /api/payment/outlet/outlet_id=1&status=Pending
router.get('/outlet/:params', getAllSubscriptionsByOutlet);

// ⭐ NEW: Single Subscription Detail by ID
// Example: /api/payment/subscription/5
router.get('/subscription/:id', getSubscriptionById);
// Route
router.put('/subscription/:id', updateSubscriptionStudentDetails);

// ⭐ NEW: Approve / Reject API
router.patch('/approve_reject', approveOrRejectSubscription);

// List API (Filters ke saath)
router.get('/student_orders', studentOrderList);

// Details API (Timeline aur Payment ke saath) 
router.get('/student_orders/:id', studentOrderById);


// List API (Filters ke saath)
router.get('/orders', getOrderList);

// Details API (Timeline aur Payment ke saath)
router.get('/orders/:id', getOrderById);


router.get('/profile',getProfile);
// Machines
router.get('/machine_types', getMachineTypes);

router.post('/add_machine',upload.single('image'),addMachine);

router.get('/machine_list',getMachineList);

router.put('/update_machine/:id',upload.single('image'),updateMachine);

router.patch('/machine_status/:id',updateMachineStatus);

router.delete('/machine_delete/:id',deleteMachine);

// Staff
router.post('/create_staff', upload.single('image'), createStaff);

router.put('/update/:id', upload.single('image'), updateStaff);

//router.post('/create_staff', createStaff);

router.get('/staff_list', getStaffList);

//router.put('/update/:id', updateStaff);

router.patch('/status/:id', updateStaffStatus);

router.delete('/delete/:id', deleteStaff);

//router.get('/user_outlets/:user_id', getAssignedOutlets);
router.get('/assigned-outlets',getAssignedOutlets);

//Customer list
router.get('/customer_list',getCustomerList);

router.get('/dashboard', authorizePermission('dashboard'), getOutletDashboard);


// Flagged Orders
router.get('/flagged-orders', authorizePermission('orders'), getFlaggedOrders);
router.put('/flagged-orders/:flagId/resolve', authorizePermission('orders'), logAuditAction('RESOLVE_FLAGGED_ORDER'), resolveFlaggedOrder);


// Reports
router.get('/reports', authorizePermission('reports'), getOperationalReports);

module.exports = router;
