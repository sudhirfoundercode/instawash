const db = require('../config/db');

/**
 * Fallback MODULE_DEFINITIONS (in case DB query fails)
 */
const MODULE_DEFINITIONS = [
  { id: 'dashboard', title: 'Dashboard', path: '/api/superadmin/dashboard', icon: 'grid', module: 'dashboard' },
  { id: 'campuses', title: 'Campuses', path: '/api/superadmin/campuses', icon: 'building', module: 'campuses' },
  { id: 'outlets', title: 'Outlets', path: '/api/superadmin/outlets', icon: 'store', module: 'outlets' },
  { id: 'students', title: 'Students', path: '/api/receptionist/students', icon: 'users', module: 'students' },
  { id: 'subscriptions', title: 'Subscriptions', path: '/api/superadmin/subscriptions', icon: 'layers', module: 'subscriptions' },
  { id: 'orders', title: 'Orders', path: '/api/manager/orders', icon: 'file-text', module: 'orders' },
  { id: 'managers', title: 'Outlet Managers', path: '/api/superadmin/managers', icon: 'user-check', module: 'managers' },
  { id: 'accountants', title: 'Accountants', path: '/api/superadmin/accountants', icon: 'dollar-sign', module: 'accountants' },
  { id: 'roles', title: 'Roles & Permissions', path: '/api/superadmin/roles', icon: 'shield', module: 'roles' },
  { id: 'machines', title: 'Machines', path: '/api/manager/machines', icon: 'cpu', module: 'machines' },
  { id: 'complaints', title: 'Complaints', path: '/api/superadmin/complaints', icon: 'alert-circle', module: 'complaints' },
  { id: 'payments', title: 'Payments', path: '/api/accountant/payments', icon: 'credit-card', module: 'payments' },
  { id: 'reconciliation', title: 'Reconciliation', path: '/api/accountant/reconciliation', icon: 'archive', module: 'reconciliation' },
  { id: 'reports', title: 'Reports', path: '/api/manager/reports', icon: 'bar-chart-2', module: 'reports' },
  { id: 'notifications', title: 'Notifications', path: '/api/superadmin/notices', icon: 'bell', module: 'notifications' },
  { id: 'audit_logs', title: 'Audit Logs', path: '/api/superadmin/audit-logs', icon: 'clipboard', module: 'audit_logs' },
  { id: 'settings', title: 'Settings', path: '/api/superadmin/settings', icon: 'settings', module: 'settings' },
];

/**
 * Dynamically fetch sidebar modules from database permissions table
 * Filtered by user's assigned permission modules
 */
async function getSidebarModulesForUser(role, allowedModules = []) {
  try {
    const [rows] = await db.query(
      `SELECT id, name, title, path, icon, sort_order, description FROM permissions ORDER BY sort_order ASC`
    );

    let modulesList = [];

    if (rows && rows.length > 0) {
      modulesList = rows.map(r => ({
        id: r.id,
        title: r.title || r.name,
        path: r.path || `/${r.id}`,
        icon: r.icon || 'grid',
        module: r.id,
        description: r.description
      }));
    } else {
      modulesList = MODULE_DEFINITIONS;
    }

    if (role === 'SUPER_ADMIN' || allowedModules.includes('ALL_ACCESS')) {
      return modulesList;
    }

    return modulesList.filter(m => allowedModules.includes(m.module));
  } catch (error) {
    console.error('Error fetching sidebar modules from DB:', error);
    if (role === 'SUPER_ADMIN' || allowedModules.includes('ALL_ACCESS')) {
      return MODULE_DEFINITIONS;
    }
    return MODULE_DEFINITIONS.filter(m => allowedModules.includes(m.module));
  }
}

module.exports = {
  MODULE_DEFINITIONS,
  getSidebarModulesForUser,
};
