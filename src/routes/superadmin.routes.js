const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  getDashboardStats,
  createRole,
  listRoles,
  updateRole,
  deleteRole,
  getAllPermissions,
  getUserPermissions,
  updateUserPermissions,
  createOutletManager,
  listOutletManagers,
  updateOutletManager,
  deleteOutletManager,
  createAccountant,
  listAccountants,
  updateAccountant,
  deleteAccountant,
  createCampus,
  listCampuses,
  createOutlet,
  updateOutlet,
  listOutlets,
  createSubscriptionPlan,
  listSubscriptionPlans,
  updateSubscriptionPlan,
  getNetworkReports,
  getAuditLogs,
  createNotice,
} = require('../controllers/superadmin.controller');
const { getMe } = require('../controllers/auth.controller');

// Require Super Admin role for all route
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN'));

router.get('/profile', getMe);
router.get('/dashboard', getDashboardStats);

// Dynamic Roles Management
router.post('/roles', logAuditAction('CREATE_ROLE'), createRole);
router.get('/roles', listRoles);
router.put('/roles/:id', logAuditAction('UPDATE_ROLE'), updateRole);
router.delete('/roles/:id', logAuditAction('DELETE_ROLE'), deleteRole);

// Permissions Master List & User Permission Toggles
router.get('/permissions', getAllPermissions);
router.get('/users/:userId/permissions', getUserPermissions);
router.put('/users/:userId/permissions', logAuditAction('UPDATE_USER_PERMISSIONS'), updateUserPermissions);

// Outlet Managers
router.post('/outlet-managers', logAuditAction('CREATE_OUTLET_MANAGER'), createOutletManager);
router.get('/outlet-managers', listOutletManagers);
router.put('/outlet-managers/:id', logAuditAction('UPDATE_OUTLET_MANAGER'), updateOutletManager);
router.delete('/outlet-managers/:id', logAuditAction('DELETE_OUTLET_MANAGER'), deleteOutletManager);

// Accountants
router.post('/accountants', logAuditAction('CREATE_ACCOUNTANT'), createAccountant);
router.get('/accountants', listAccountants);
router.put('/accountants/:id', logAuditAction('UPDATE_ACCOUNTANT'), updateAccountant);
router.delete('/accountants/:id', logAuditAction('DELETE_ACCOUNTANT'), deleteAccountant);

// Campus & Outlets
router.post('/campuses', logAuditAction('CREATE_CAMPUS'), createCampus);
router.get('/campuses', listCampuses);
router.post('/outlets', logAuditAction('CREATE_OUTLET'), createOutlet);
router.put('/outlets/:id', logAuditAction('UPDATE_OUTLET'), updateOutlet);
router.get('/outlets', listOutlets);

// Subscription Plans
router.post('/plans', logAuditAction('CREATE_SUBSCRIPTION_PLAN'), createSubscriptionPlan);
router.get('/plans', listSubscriptionPlans);
router.put('/plans/:id', logAuditAction('UPDATE_SUBSCRIPTION_PLAN'), updateSubscriptionPlan);

// System Reports, Audit Logs & Notices
router.get('/reports', getNetworkReports);
router.get('/audit-logs', getAuditLogs);
router.post('/notices', logAuditAction('CREATE_NOTICE'), createNotice);

module.exports = router;
