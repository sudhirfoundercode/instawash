const db = require('../config/db');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

const getManagerOutletId = (req) => {
  return req.assignedOutletIds && req.assignedOutletIds.length > 0
    ? req.assignedOutletIds[0]
    : null;
};

/**
 * Outlet Dashboard
 * GET /api/manager/dashboard
 */
const getOutletDashboard = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);
    if (!outletId && req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'No outlet assigned to this manager', 400);
    }

    const whereClause = outletId ? `WHERE outlet_id = ?` : `WHERE 1=1`;
    const params = outletId ? [outletId] : [];

    const [[{ pendingOrders }]] = await db.query(`SELECT COUNT(*) as pendingOrders FROM orders ${whereClause} AND status = 'RECEIVED'`, params);
    const [[{ inProcessOrders }]] = await db.query(`SELECT COUNT(*) as inProcessOrders FROM orders ${whereClause} AND status = 'IN_WASH'`, params);
    const [[{ readyOrders }]] = await db.query(`SELECT COUNT(*) as readyOrders FROM orders ${whereClause} AND status = 'READY'`, params);

    const [recentOrders] = await db.query(
      `SELECT o.*, s.full_name as student_name FROM orders o JOIN students s ON o.student_id = s.id ${whereClause} ORDER BY o.created_at DESC LIMIT 10`,
      params
    );

    const [[{ flaggedCount }]] = await db.query(
      `SELECT COUNT(*) as flaggedCount FROM order_flags f JOIN orders o ON f.order_id = o.id ${whereClause} AND f.status = 'OPEN'`,
      params
    );

    return successResponse(res, 'Outlet dashboard stats fetched successfully', {
      outletId,
      pendingOrders,
      inProcessOrders,
      readyOrders,
      flaggedCount,
      recentOrders,
    });
  } catch (error) {
    console.error('Outlet Dashboard Error:', error);
    return errorResponse(res, 'Failed to fetch outlet dashboard', 500);
  }
};

/**
 * Receptionist Management
 */
const createReceptionist = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);
    const { staffId, name, email, phone, password, section, shift, maxDiscountPercent, permissions, permissionCodes } = req.body;
    const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');
    const selectedPerms = permissions || permissionCodes || DEFAULT_ROLE_PERMISSIONS.RECEPTIONIST;

    if (!staffId || !name || !password) {
      return errorResponse(res, 'Staff ID, Name, and Password are required', 400);
    }

    const [existing] = await db.query(`SELECT id FROM users WHERE staff_id = ?`, [staffId]);
    if (existing.length > 0) {
      return errorResponse(res, 'Staff ID already exists', 400);
    }

    const hashedPassword = await hashPassword(password);
    const userId = generateId('usr_rec');

    await db.query(
      `INSERT INTO users (id, staff_id, name, email, phone, password, role_id, role, section, shift, max_discount_percent, permissions) VALUES (?, ?, ?, ?, ?, ?, 'receptionist', 'RECEPTIONIST', ?, ?, ?, ?)`,
      [userId, staffId, name, email || null, phone || null, hashedPassword, section || 'BOYS', shift || 'Morning', parseFloat(maxDiscountPercent || 0), JSON.stringify(selectedPerms)]
    );

    if (outletId) {
      await db.query(`INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`, [userId, outletId]);
    }

    return successResponse(res, 'Receptionist created successfully', { id: userId, staffId, name, role: 'RECEPTIONIST', permissions: selectedPerms }, 201);
  } catch (error) {
    console.error('Create Receptionist Error:', error);
    return errorResponse(res, 'Failed to create Receptionist', 500);
  }
};

const listReceptionists = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);
    const [receptionists] = await db.query(
      `SELECT u.* FROM users u JOIN user_outlets uo ON u.id = uo.user_id WHERE u.role = 'RECEPTIONIST' AND uo.outlet_id = ?`,
      [outletId]
    );

    return successResponse(res, 'Receptionists fetched successfully', receptionists);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch receptionists', 500);
  }
};

const updateReceptionist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, section, shift, maxDiscountPercent, permissions, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (section) { updates.push('section = ?'); params.push(section); }
    if (shift) { updates.push('shift = ?'); params.push(shift); }
    if (maxDiscountPercent !== undefined) { updates.push('max_discount_percent = ?'); params.push(parseFloat(maxDiscountPercent)); }
    if (permissions) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    if (password) { updates.push('password = ?'); params.push(await hashPassword(password)); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Receptionist updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update Receptionist', 500);
  }
};

const deleteReceptionist = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM users WHERE id = ?`, [id]);
    return successResponse(res, 'Receptionist removed successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to remove Receptionist', 500);
  }
};

/**
 * Flagged Orders Management
 */
const getFlaggedOrders = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);

    const [flags] = await db.query(
      `SELECT f.*, o.order_number, s.full_name as student_name, ot.name as outlet_name 
       FROM order_flags f 
       JOIN orders o ON f.order_id = o.id 
       JOIN students s ON o.student_id = s.id 
       JOIN outlets ot ON o.outlet_id = ot.id 
       ${outletId ? 'WHERE o.outlet_id = ?' : ''} 
       ORDER BY f.created_at DESC`,
      outletId ? [outletId] : []
    );

    return successResponse(res, 'Flagged orders fetched successfully', flags);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch flagged orders', 500);
  }
};

const resolveFlaggedOrder = async (req, res) => {
  try {
    const { flagId } = req.params;
    const { resolutionNotes } = req.body;

    if (!resolutionNotes) {
      return errorResponse(res, 'Resolution notes are required', 400);
    }

    await db.query(
      `UPDATE order_flags SET status = 'RESOLVED', resolved_by_id = ?, resolution_notes = ?, resolved_at = NOW() WHERE id = ?`,
      [req.user.id, resolutionNotes, flagId]
    );

    return successResponse(res, 'Flagged order resolved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to resolve flagged order', 500);
  }
};

/**
 * Machine Tracking
 */
const createMachine = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);
    const { machineCode, capacityKg, status } = req.body;

    if (!machineCode || !capacityKg) {
      return errorResponse(res, 'Machine code and capacity (KG) are required', 400);
    }

    const id = generateId('mch');
    await db.query(
      `INSERT INTO machines (id, machine_code, outlet_id, capacity_kg, status) VALUES (?, ?, ?, ?, ?)`,
      [id, machineCode, outletId, parseFloat(capacityKg), status || 'ACTIVE']
    );

    return successResponse(res, 'Machine created successfully', { id, machineCode }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create machine', 500);
  }
};

const listMachines = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);
    const [machines] = await db.query(
      `SELECT * FROM machines ${outletId ? 'WHERE outlet_id = ?' : ''}`,
      outletId ? [outletId] : []
    );
    return successResponse(res, 'Machines fetched successfully', machines);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch machines', 500);
  }
};

const updateMachineStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, capacityKg } = req.body;

    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (capacityKg !== undefined) { updates.push('capacity_kg = ?'); params.push(parseFloat(capacityKg)); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE machines SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Machine status updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update machine status', 500);
  }
};

/**
 * Operational Reports
 */
const getOperationalReports = async (req, res) => {
  try {
    const outletId = getManagerOutletId(req);

    const [[{ totalOrders }]] = await db.query(`SELECT COUNT(*) as totalOrders FROM orders WHERE outlet_id = ?`, [outletId]);
    const [[{ totalWeight }]] = await db.query(`SELECT COALESCE(SUM(weight_kg), 0) as totalWeight FROM orders WHERE outlet_id = ?`, [outletId]);
    const [statusCounts] = await db.query(`SELECT status, COUNT(*) as count FROM orders WHERE outlet_id = ? GROUP BY status`, [outletId]);

    return successResponse(res, 'Operational reports fetched successfully', {
      totalOrders,
      totalWeightKg: totalWeight,
      statusCounts,
      averageTurnaroundHours: 24,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch operational reports', 500);
  }
};

module.exports = {
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
};
