const db = require('../config/db');
const { calculatePaygBilling } = require('../utils/payg.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Confirm and Record Subscription Payment
 */
const confirmSubscriptionPayment = async (req, res) => {
  try {
    const { studentSubscriptionId, studentId, planId, amount, paymentMode, paymentReference } = req.body;

    if (!studentId || !planId || !amount || !paymentMode) {
      return errorResponse(res, 'Student ID, Plan ID, Amount, and Payment Mode are required', 400);
    }

    const [plans] = await db.query(`SELECT * FROM subscription_plans WHERE id = ?`, [planId]);
    if (plans.length === 0) {
      return errorResponse(res, 'Subscription Plan not found', 404);
    }

    const plan = plans[0];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.cycle_days);

    let subId = studentSubscriptionId;
    if (subId) {
      await db.query(
        `UPDATE student_subscriptions SET status = 'ACTIVE', start_date = ?, end_date = ?, allocated_quota_kg = ?, remaining_quota_kg = ? WHERE id = ?`,
        [startDate, endDate, plan.quota_kg, plan.quota_kg, subId]
      );
    } else {
      subId = generateId('sub');
      await db.query(
        `INSERT INTO student_subscriptions (id, student_id, plan_id, start_date, end_date, allocated_quota_kg, remaining_quota_kg, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [subId, studentId, planId, startDate, endDate, plan.quota_kg, plan.quota_kg]
      );
    }

    await db.query(`UPDATE students SET status = 'ACTIVE' WHERE id = ?`, [studentId]);

    const payId = generateId('pay');
    await db.query(
      `INSERT INTO subscription_payments (id, student_subscription_id, student_id, accountant_id, amount, payment_mode, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCESS')`,
      [payId, subId, studentId, req.user ? req.user.id : null, parseFloat(amount), paymentMode, paymentReference || `REF-${Date.now()}`]
    );

    return successResponse(res, 'Subscription payment confirmed and activated successfully', { subscriptionId: subId, paymentId: payId }, 201);
  } catch (error) {
    console.error('Confirm Subscription Payment Error:', error);
    return errorResponse(res, 'Failed to confirm subscription payment', 500);
  }
};

/**
 * Billing Dashboard
 */
const getBillingDashboard = async (req, res) => {
  try {
    const [[{ activeSubscriptions }]] = await db.query(`SELECT COUNT(*) as activeSubscriptions FROM student_subscriptions WHERE status = 'ACTIVE'`);
    const [[{ renewingSubscriptions }]] = await db.query(`SELECT COUNT(*) as renewingSubscriptions FROM student_subscriptions WHERE status = 'RENEWING'`);
    const [[{ expiredSubscriptions }]] = await db.query(`SELECT COUNT(*) as expiredSubscriptions FROM student_subscriptions WHERE status = 'EXPIRED'`);

    const [recentPayments] = await db.query(
      `SELECT p.*, s.full_name as student_name 
       FROM subscription_payments p 
       JOIN students s ON p.student_id = s.id 
       ORDER BY p.created_at DESC LIMIT 10`
    );

    return successResponse(res, 'Billing dashboard fetched successfully', {
      activeSubscriptions,
      renewingSubscriptions,
      expiredSubscriptions,
      recentPayments,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch billing dashboard', 500);
  }
};

/**
 * PAYG Billing Preview
 */
const calculatePaygInvoice = async (req, res) => {
  try {
    const { remainingQuotaKg, intakeWeightKg, paygRatePerKg, minBillingUnitKg, discountPercent } = req.body;

    const maxAllowedDiscount = req.user.role === 'SUPER_ADMIN' ? 100 : (req.user.max_discount_percent || 0);
    const reqDiscount = parseFloat(discountPercent || 0);

    if (reqDiscount > maxAllowedDiscount) {
      return errorResponse(
        res,
        `Discount (${reqDiscount}%) exceeds Accountant's max allotted discount of ${maxAllowedDiscount}%`,
        400
      );
    }

    const calc = calculatePaygBilling({
      remainingQuotaKg: parseFloat(remainingQuotaKg || 0),
      intakeWeightKg: parseFloat(intakeWeightKg || 0),
      paygRatePerKg: parseFloat(paygRatePerKg || 50),
      minBillingUnitKg: parseFloat(minBillingUnitKg || 5.0),
      discountPercent: reqDiscount,
    });

    return successResponse(res, 'PAYG billing calculated successfully', calc);
  } catch (error) {
    return errorResponse(res, 'Failed to calculate PAYG invoice', 500);
  }
};

/**
 * Daily Outlet Collections
 */
const getOutletCollections = async (req, res) => {
  try {
    const [collections] = await db.query(
      `SELECT dc.*, o.name as outlet_name, u.name as accountant_name 
       FROM daily_collections dc 
       JOIN outlets o ON dc.outlet_id = o.id 
       LEFT JOIN users u ON dc.confirmed_by_id = u.id 
       ORDER BY dc.created_at DESC`
    );

    return successResponse(res, 'Daily outlet collections fetched successfully', collections);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch outlet collections', 500);
  }
};

/**
 * Daily Outlet Collection Final Confirmation
 */
const confirmDailyCollection = async (req, res) => {
  try {
    const { outletId, date, cashAmount, upiAmount, cardAmount } = req.body;

    if (!outletId || !date) {
      return errorResponse(res, 'Outlet ID and Date (YYYY-MM-DD) are required', 400);
    }

    const cash = parseFloat(cashAmount || 0);
    const upi = parseFloat(upiAmount || 0);
    const card = parseFloat(cardAmount || 0);
    const total = cash + upi + card;

    const [existing] = await db.query(`SELECT id FROM daily_collections WHERE outlet_id = ? AND date = ?`, [outletId, date]);

    if (existing.length > 0) {
      await db.query(
        `UPDATE daily_collections SET cash_amount = ?, upi_amount = ?, card_amount = ?, total_amount = ?, is_confirmed = 1, confirmed_by_id = ?, confirmed_at = NOW() WHERE id = ?`,
        [cash, upi, card, total, req.user.id, existing[0].id]
      );
    } else {
      const id = generateId('dc');
      await db.query(
        `INSERT INTO daily_collections (id, outlet_id, date, cash_amount, upi_amount, card_amount, total_amount, is_confirmed, confirmed_by_id, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
        [id, outletId, date, cash, upi, card, total, req.user.id]
      );
    }

    return successResponse(res, "Daily collection confirmed and locked for that day's outlet collection");
  } catch (error) {
    console.error('Confirm Daily Collection Error:', error);
    return errorResponse(res, 'Failed to confirm daily collection', 500);
  }
};

/**
 * Record Financial Expense
 */
const createExpense = async (req, res) => {
  try {
    const { outletId, category, amount, description, receiptUrl } = req.body;

    if (!outletId || !category || !amount) {
      return errorResponse(res, 'Outlet ID, Category, and Amount are required', 400);
    }

    const id = generateId('exp');
    await db.query(
      `INSERT INTO expenses (id, outlet_id, accountant_id, category, amount, description, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, outletId, req.user.id, category, parseFloat(amount), description || null, receiptUrl || null]
    );

    return successResponse(res, 'Financial expense recorded successfully', { id, category, amount }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to record expense', 500);
  }
};

/**
 * Financial Statements
 */
const getFinancialStatements = async (req, res) => {
  try {
    const [[{ totalSubscriptionRevenue }]] = await db.query(`SELECT COALESCE(SUM(amount), 0) as totalSubscriptionRevenue FROM subscription_payments WHERE status = 'SUCCESS'`);
    const [[{ totalDailyCollections }]] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as totalDailyCollections FROM daily_collections WHERE is_confirmed = 1`);
    const [[{ totalExpenses }]] = await db.query(`SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM expenses`);

    const grossRevenue = totalSubscriptionRevenue + totalDailyCollections;
    const netRevenue = grossRevenue - totalExpenses;

    return successResponse(res, 'Financial statement generated successfully', {
      totalSubscriptionRevenue,
      totalDailyCollections,
      totalExpenses,
      grossRevenue,
      netRevenue,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to generate financial statement', 500);
  }
};

module.exports = {
  confirmSubscriptionPayment,
  getBillingDashboard,
  calculatePaygInvoice,
  getOutletCollections,
  confirmDailyCollection,
  createExpense,
  getFinancialStatements,
};
