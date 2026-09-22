const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizePermission, enforceDiscountCeiling } = require('../middleware/auth.middleware');
const { logAuditAction } = require('../middleware/audit.middleware');
const {
  confirmSubscriptionPayment,
  getBillingDashboard,
  calculatePaygInvoice,
  getOutletCollections,
  confirmDailyCollection,
  createExpense,
  getFinancialStatements,
} = require('../controllers/accountant.controller');

router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'ACCOUNTANT'));

router.get('/billing-dashboard', authorizePermission('dashboard'), getBillingDashboard);
router.post('/subscriptions/confirm-payment', authorizePermission('plans'), logAuditAction('CONFIRM_SUBSCRIPTION_PAYMENT'), confirmSubscriptionPayment);
router.post('/payg/calculate', authorizePermission('plans'), enforceDiscountCeiling, calculatePaygInvoice);
router.get('/collections', authorizePermission('collections'), getOutletCollections);
router.post('/collections/confirm', authorizePermission('collections'), logAuditAction('CONFIRM_DAILY_COLLECTION'), confirmDailyCollection);
router.post('/expenses', authorizePermission('expenses'), logAuditAction('RECORD_EXPENSE'), createExpense);
router.get('/financial-statements', authorizePermission('reports'), getFinancialStatements);

module.exports = router;
