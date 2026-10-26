const db = require('../config/db');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Super Admin Dashboard Overviews
 */
const getDashboardStats = async (req, res) => {
  try {
    const [[{ totalOutlets }]] = await db.query(`SELECT COUNT(*) as totalOutlets FROM outlets`);
    const [[{ totalSubscriptions }]] = await db.query(`SELECT COUNT(*) as totalSubscriptions FROM student_subscriptions WHERE status = 'ACTIVE'`);
    const [[{ totalOrders }]] = await db.query(`SELECT COUNT(*) as totalOrders FROM orders`);
    const [[{ totalRevenue }]] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as totalRevenue FROM daily_collections`);

    const [recentOrders] = await db.query(
      `SELECT o.*, st.full_name as student_name, ot.name as outlet_name 
       FROM orders o 
       JOIN students st ON o.student_id = st.id 
       JOIN outlets ot ON o.outlet_id = ot.id 
       ORDER BY o.created_at DESC LIMIT 5`
    );

    const [outlets] = await db.query(`SELECT * FROM outlets`);

    return successResponse(res, 'Super Admin dashboard stats fetched successfully', {
      totalOutlets,
      totalSubscriptions,
      totalOrders,
      totalRevenue,
      recentOrders,
      outlets,
    });
  } catch (error) {
    console.error('SuperAdmin Dashboard Error:', error);
    return errorResponse(res, 'Failed to fetch dashboard stats', 500);
  }
};

/**
 * Custom Roles Management (Super Admin can create any number of custom roles)
 */
const createRole = async (req, res) => {
  try {
    const { id, name, description, permissions } = req.body;
    if (!name) {
      return errorResponse(res, 'Role name is required', 400);
    }

    const roleId = (id || name.toLowerCase().replace(/\s+/g, '_')).trim();
    const rolePerms = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : JSON.stringify([]);

    await db.query(
      `INSERT INTO roles (id, name, description, permissions) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), permissions = VALUES(permissions)`,
      [roleId, name, description || null, rolePerms]
    );

    return successResponse(res, 'Custom Role created/updated successfully', {
      id: roleId,
      name,
      description,
      permissions: Array.isArray(permissions) ? permissions : [],
    }, 201);
  } catch (error) {
    console.error('Create Role Error:', error);
    return errorResponse(res, 'Failed to create role', 500);
  }
};

const listRoles = async (req, res) => {
  try {
    const [roles] = await db.query(`SELECT * FROM roles ORDER BY created_at DESC`);
    for (const r of roles) {
      try {
        r.permissions = r.permissions ? JSON.parse(r.permissions) : [];
      } catch (e) {
        r.permissions = [];
      }
    }
    return successResponse(res, 'Roles fetched successfully', roles);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch roles', 500);
  }
};

const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (permissions && Array.isArray(permissions)) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(permissions));
    }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Role updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update role', 500);
  }
};

const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM roles WHERE id = ?`, [id]);
    return successResponse(res, 'Role deleted successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to delete role', 500);
  }
};

/**
 * Roles & Permissions Master List API
 */
const getAllPermissions = async (req, res) => {
  try {
    const [roles] = await db.query(`SELECT * FROM roles`);
    const [permissions] = await db.query(`SELECT * FROM permissions`);

    for (const r of roles) {
      try {
        r.permissions = r.permissions ? JSON.parse(r.permissions) : [];
      } catch (e) {
        r.permissions = [];
      }
    }

    return successResponse(res, 'Roles & Permissions fetched successfully', {
      roles,
      permissions,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch roles & permissions', 500);
  }
};

const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const [users] = await db.query(`SELECT id, staff_id, name, role, permissions, max_discount_percent, is_active FROM users WHERE id = ?`, [userId]);

    if (users.length === 0) {
      return errorResponse(res, 'Staff account not found', 404);
    }

    const user = users[0];
    let userPerms = [];
    try {
      userPerms = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : [];
    } catch (e) {
      userPerms = [];
    }

    user.permissions = userPerms;
    return successResponse(res, 'User permissions fetched successfully', user);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch user permissions', 500);
  }
};

const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions, permissionCodes, maxDiscountPercent, isActive } = req.body;
    const selectedPerms = permissions || permissionCodes;

    const updates = [];
    const params = [];

    if (selectedPerms && Array.isArray(selectedPerms)) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(selectedPerms));
    }
    if (maxDiscountPercent !== undefined) {
      updates.push('max_discount_percent = ?');
      params.push(parseFloat(maxDiscountPercent));
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(userId);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'User permissions updated successfully in database');
  } catch (error) {
    console.error('Update User Permissions Error:', error);
    return errorResponse(res, 'Failed to update user permissions', 500);
  }
};

/**
 * Outlet Manager Account Management
 */
const createOutletManager = async (req, res) => {
  try {
    const { staffId, name, email, phone, password, outletId, permissions, permissionCodes } = req.body;
    const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');
    const selectedPerms = permissions || permissionCodes || DEFAULT_ROLE_PERMISSIONS.OUTLET_MANAGER;

    if (!staffId || !name || !password) {
      return errorResponse(res, 'Staff ID, Name, and Password are required', 400);
    }

    const [existing] = await db.query(`SELECT id FROM users WHERE staff_id = ?`, [staffId]);
    if (existing.length > 0) {
      return errorResponse(res, 'Staff ID already exists', 400);
    }

    const hashedPassword = await hashPassword(password);
    const userId = generateId('usr_om');

    await db.query(
      `INSERT INTO users (id, staff_id, name, email, phone, password, role_id, role, permissions) VALUES (?, ?, ?, ?, ?, ?, 'manager', 'OUTLET_MANAGER', ?)`,
      [userId, staffId, name, email || null, phone || null, hashedPassword, JSON.stringify(selectedPerms)]
    );

    if (outletId) {
      await db.query(`INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`, [userId, outletId]);
    }

    return successResponse(res, 'Outlet Manager created successfully', { id: userId, staffId, name, role: 'OUTLET_MANAGER', permissions: selectedPerms }, 201);
  } catch (error) {
    console.error('Create Outlet Manager Error:', error);
    return errorResponse(res, 'Failed to create Outlet Manager', 500);
  }
};

const listOutletManagers = async (req, res) => {
  try {
    const [managers] = await db.query(`SELECT id, staff_id, name, email, phone, role, permissions, is_active, created_at FROM users WHERE role = 'OUTLET_MANAGER' ORDER BY created_at DESC`);
    return successResponse(res, 'Outlet Managers fetched successfully', managers);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Outlet Managers', 500);
  }
};

const updateOutletManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, isActive, permissions, permissionCodes } = req.body;
    const selectedPerms = permissions || permissionCodes;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    if (password) { updates.push('password = ?'); params.push(await hashPassword(password)); }
    if (selectedPerms && Array.isArray(selectedPerms)) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(selectedPerms));
    }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Outlet Manager updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update Outlet Manager', 500);
  }
};

const deleteOutletManager = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM users WHERE id = ?`, [id]);
    return successResponse(res, 'Outlet Manager removed successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to remove Outlet Manager', 500);
  }
};

/**
 * Accountant Account Management
 */
const createAccountant = async (req, res) => {
  try {
    const { staffId, name, email, phone, password, outletIds, maxDiscountPercent, permissions, permissionCodes } = req.body;
    const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');
    const selectedPerms = permissions || permissionCodes || DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT;

    if (!staffId || !name || !password) {
      return errorResponse(res, 'Staff ID, Name, and Password are required', 400);
    }

    const [existing] = await db.query(`SELECT id FROM users WHERE staff_id = ?`, [staffId]);
    if (existing.length > 0) {
      return errorResponse(res, 'Staff ID already exists', 400);
    }

    const hashedPassword = await hashPassword(password);
    const userId = generateId('usr_acc');

    await db.query(
      `INSERT INTO users (id, staff_id, name, email, phone, password, role_id, role, max_discount_percent, permissions) VALUES (?, ?, ?, ?, ?, ?, 'accountant', 'ACCOUNTANT', ?, ?)`,
      [userId, staffId, name, email || null, phone || null, hashedPassword, parseFloat(maxDiscountPercent || 0), JSON.stringify(selectedPerms)]
    );

    if (outletIds && Array.isArray(outletIds)) {
      for (const outletId of outletIds) {
        await db.query(`INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`, [userId, outletId]);
      }
    }

    return successResponse(res, 'Accountant created successfully', { id: userId, staffId, name, role: 'ACCOUNTANT', permissions: selectedPerms }, 201);
  } catch (error) {
    console.error('Create Accountant Error:', error);
    return errorResponse(res, 'Failed to create Accountant', 500);
  }
};

const listAccountants = async (req, res) => {
  try {
    const [accountants] = await db.query(`SELECT * FROM users WHERE role = 'ACCOUNTANT' ORDER BY created_at DESC`);
    return successResponse(res, 'Accountants fetched successfully', accountants);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Accountants', 500);
  }
};

const updateAccountant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, maxDiscountPercent, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (maxDiscountPercent !== undefined) { updates.push('max_discount_percent = ?'); params.push(parseFloat(maxDiscountPercent)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    if (password) { updates.push('password = ?'); params.push(await hashPassword(password)); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Accountant updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update Accountant', 500);
  }
};

const deleteAccountant = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM users WHERE id = ?`, [id]);
    return successResponse(res, 'Accountant removed successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to remove Accountant', 500);
  }
};

/**
 * Campus & Outlet Management
 */
const createCampus = async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name) return errorResponse(res, 'Campus name is required', 400);

    const id = generateId('cmp');
    await db.query(`INSERT INTO campuses (id, name, address) VALUES (?, ?, ?)`, [id, name, address || null]);
    return successResponse(res, 'Campus created successfully', { id, name, address }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create Campus', 500);
  }
};

const listCampuses = async (req, res) => {
  try {
    const [campuses] = await db.query(`SELECT * FROM campuses`);
    return successResponse(res, 'Campuses fetched successfully', campuses);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Campuses', 500);
  }
};

const createOutlet = async (req, res) => {
  try {
    const { campusId, name, address, latitude, longitude, hasBoysSection, hasGirlsSection } = req.body;

    if (!campusId || !name || !address) {
      return errorResponse(res, 'Campus ID, Outlet Name, and Address are required', 400);
    }

    const id = generateId('out');
    await db.query(
      `INSERT INTO outlets (id, campus_id, name, address, latitude, longitude, has_boys_section, has_girls_section) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        campusId,
        name,
        address,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        hasBoysSection !== undefined ? (hasBoysSection ? 1 : 0) : 1,
        hasGirlsSection !== undefined ? (hasGirlsSection ? 1 : 0) : 1,
      ]
    );

    return successResponse(res, 'Outlet created successfully', { id, name, address }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create Outlet', 500);
  }
};

const updateOutlet = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, hasBoysSection, hasGirlsSection, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (address) { updates.push('address = ?'); params.push(address); }
    if (latitude !== undefined) { updates.push('latitude = ?'); params.push(parseFloat(latitude)); }
    if (longitude !== undefined) { updates.push('longitude = ?'); params.push(parseFloat(longitude)); }
    if (hasBoysSection !== undefined) { updates.push('has_boys_section = ?'); params.push(hasBoysSection ? 1 : 0); }
    if (hasGirlsSection !== undefined) { updates.push('has_girls_section = ?'); params.push(hasGirlsSection ? 1 : 0); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE outlets SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Outlet updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update Outlet', 500);
  }
};

const listOutlets = async (req, res) => {
  try {
    const [outlets] = await db.query(`SELECT o.*, c.name as campus_name FROM outlets o JOIN campuses c ON o.campus_id = c.id`);
    return successResponse(res, 'Outlets fetched successfully', outlets);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Outlets', 500);
  }
};

/**
 * Subscription Plans & Pricing
 */
const createSubscriptionPlan = async (req, res) => {
  try {
    const { name, quotaKg, cycleDays, price, paygRatePerKg, minBillingUnitKg } = req.body;

    if (!name || !quotaKg || !cycleDays || !price || !paygRatePerKg) {
      return errorResponse(res, 'Name, Quota KG, Cycle Days, Price, and PAYG rate are required', 400);
    }

    const id = generateId('plan');
    await db.query(
      `INSERT INTO subscription_plans (id, name, quota_kg, cycle_days, price, payg_rate_per_kg, min_billing_unit_kg) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, parseFloat(quotaKg), parseInt(cycleDays), parseFloat(price), parseFloat(paygRatePerKg), parseFloat(minBillingUnitKg || 5.0)]
    );

    return successResponse(res, 'Subscription Plan created successfully', { id, name }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create Subscription Plan', 500);
  }
};

const listSubscriptionPlans = async (req, res) => {
  try {
    const [plans] = await db.query(`SELECT * FROM subscription_plans ORDER BY created_at DESC`);
    return successResponse(res, 'Subscription Plans fetched successfully', plans);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Subscription Plans', 500);
  }
};

const updateSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, quotaKg, cycleDays, price, paygRatePerKg, minBillingUnitKg, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (quotaKg !== undefined) { updates.push('quota_kg = ?'); params.push(parseFloat(quotaKg)); }
    if (cycleDays !== undefined) { updates.push('cycle_days = ?'); params.push(parseInt(cycleDays)); }
    if (price !== undefined) { updates.push('price = ?'); params.push(parseFloat(price)); }
    if (paygRatePerKg !== undefined) { updates.push('payg_rate_per_kg = ?'); params.push(parseFloat(paygRatePerKg)); }
    if (minBillingUnitKg !== undefined) { updates.push('min_billing_unit_kg = ?'); params.push(parseFloat(minBillingUnitKg)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Subscription Plan updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update Subscription Plan', 500);
  }
};

/**
 * System Reports & Audit Logs
 */
const getNetworkReports = async (req, res) => {
  try {
    const [[{ totalRevenue }]] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as totalRevenue FROM daily_collections`);
    const [[breakdown]] = await db.query(
      `SELECT COALESCE(SUM(cash_amount),0) as cash, COALESCE(SUM(upi_amount),0) as upi, COALESCE(SUM(card_amount),0) as card FROM daily_collections`
    );
    const [[{ totalOrders }]] = await db.query(`SELECT COUNT(*) as totalOrders FROM orders`);
    const [ordersByStatus] = await db.query(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`);
    const [[{ totalDiscountsGiven }]] = await db.query(`SELECT COALESCE(SUM(discount_amount), 0) as totalDiscountsGiven FROM orders`);

    return successResponse(res, 'Network reports fetched successfully', {
      totalRevenue,
      paymentBreakdown: breakdown,
      totalOrders,
      ordersByStatus,
      totalDiscountsGiven,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch network reports', 500);
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const [logs] = await db.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`);
    return successResponse(res, 'Audit logs fetched successfully', logs);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch audit logs', 500);
  }
};

const createNotice = async (req, res) => {
  try {
    const { title, content, targetType, targetOutletId } = req.body;

    if (!title || !content) {
      return errorResponse(res, 'Notice title and content are required', 400);
    }

    const id = generateId('notice');
    await db.query(
      `INSERT INTO notices (id, title, content, target_type, target_outlet_id) VALUES (?, ?, ?, ?, ?)`,
      [id, title, content, targetType || 'ALL_OUTLETS', targetOutletId || null]
    );

    return successResponse(res, 'Notice published successfully', { id, title }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create Notice', 500);
  }
};

module.exports = {
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
};
