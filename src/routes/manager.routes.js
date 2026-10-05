const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizePermission } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  getOutletDashboard,
  createReceptionist,
  listReceptionists,
  updateReceptionist,
  deleteReceptionist,
  getFlaggedOrders,
  resolveFlaggedOrder,
  createMachine,
  listMachines,
  updateMachineStatus,
  getOperationalReports,
} = require('../controllers/manager.controller');
const { getMe } = require('../controllers/auth.controller');

router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'OUTLET_MANAGER'));

router.get('/profile', getMe);
router.get('/dashboard', authorizePermission('dashboard'), getOutletDashboard);

// Receptionist Staff Management
router.post('/receptionists', authorizePermission('receptionists'), logAuditAction('CREATE_RECEPTIONIST'), createReceptionist);
router.get('/receptionists', authorizePermission('receptionists'), listReceptionists);
router.put('/receptionists/:id', authorizePermission('receptionists'), logAuditAction('UPDATE_RECEPTIONIST'), updateReceptionist);
router.delete('/receptionists/:id', authorizePermission('receptionists'), logAuditAction('DELETE_RECEPTIONIST'), deleteReceptionist);

// Flagged Orders
router.get('/flagged-orders', authorizePermission('orders'), getFlaggedOrders);
router.put('/flagged-orders/:flagId/resolve', authorizePermission('orders'), logAuditAction('RESOLVE_FLAGGED_ORDER'), resolveFlaggedOrder);

// Machines
router.post('/machines', authorizePermission('machines'), logAuditAction('CREATE_MACHINE'), createMachine);
router.get('/machines', authorizePermission('machines'), listMachines);
router.put('/machines/:id/status', authorizePermission('machines'), logAuditAction('UPDATE_MACHINE_STATUS'), updateMachineStatus);

// Reports
router.get('/reports', authorizePermission('reports'), getOperationalReports);

module.exports = router;
