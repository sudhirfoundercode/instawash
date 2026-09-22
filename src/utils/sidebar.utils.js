/**
 * Instawash Simple Dynamic Sidebar Modules Registry
 */
const MODULE_DEFINITIONS = [
  // Super Admin Modules
  { id: 'dashboard', title: 'HQ Overview', path: '/superadmin/dashboard', icon: 'bar-chart-2', module: 'dashboard', role: 'SUPER_ADMIN' },
  { id: 'managers', title: 'Outlet Managers', path: '/superadmin/managers', icon: 'users', module: 'managers', role: 'SUPER_ADMIN' },
  { id: 'receptionists', title: 'Receptionists', path: '/superadmin/receptionists', icon: 'user-plus', module: 'receptionists', role: 'SUPER_ADMIN' },
  { id: 'accountants', title: 'Accountants', path: '/superadmin/accountants', icon: 'user-check', module: 'accountants', role: 'SUPER_ADMIN' },
  { id: 'campuses', title: 'Campuses & Outlets', path: '/superadmin/campuses', icon: 'grid', module: 'campuses', role: 'SUPER_ADMIN' },
  { id: 'plans', title: 'Plans & Pricing', path: '/superadmin/plans', icon: 'layers', module: 'plans', role: 'SUPER_ADMIN' },
  { id: 'reports', title: 'Network Reports', path: '/superadmin/reports', icon: 'pie-chart', module: 'reports', role: 'SUPER_ADMIN' },
  { id: 'notices', title: 'Broadcast Notices', path: '/superadmin/notices', icon: 'bell', module: 'notices', role: 'SUPER_ADMIN' },

  // Outlet Manager Modules
  { id: 'dashboard', title: 'Outlet Overview', path: '/manager/dashboard', icon: 'activity', module: 'dashboard', role: 'OUTLET_MANAGER' },
  { id: 'receptionists', title: 'Manage Staff', path: '/manager/receptionists', icon: 'users', module: 'receptionists', role: 'OUTLET_MANAGER' },
  { id: 'orders', title: 'Orders & Workflows', path: '/manager/orders', icon: 'alert-triangle', module: 'orders', role: 'OUTLET_MANAGER' },
  { id: 'machines', title: 'Washing Machines', path: '/manager/machines', icon: 'cpu', module: 'machines', role: 'OUTLET_MANAGER' },
  { id: 'reports', title: 'Volume & Reports', path: '/manager/reports', icon: 'trending-up', module: 'reports', role: 'OUTLET_MANAGER' },

  // Receptionist Modules
  { id: 'students', title: 'Search & Register Student', path: '/receptionist/students', icon: 'users', module: 'students', role: 'RECEPTIONIST' },
  { id: 'orders', title: 'Laundry Intake & Status', path: '/receptionist/orders', icon: 'plus-circle', module: 'orders', role: 'RECEPTIONIST' },

  // Accountant Modules
  { id: 'dashboard', title: 'Billing Overview', path: '/accountant/dashboard', icon: 'dollar-sign', module: 'dashboard', role: 'ACCOUNTANT' },
  { id: 'plans', title: 'Plan Confirmations', path: '/accountant/subscriptions', icon: 'check-square', module: 'plans', role: 'ACCOUNTANT' },
  { id: 'expenses', title: 'Outlet Expenses', path: '/accountant/expenses', icon: 'credit-card', module: 'expenses', role: 'ACCOUNTANT' },
  { id: 'collections', title: 'Daily Reconciliation', path: '/accountant/collections', icon: 'archive', module: 'collections', role: 'ACCOUNTANT' },
  { id: 'reports', title: 'Net P&L Statement', path: '/accountant/reports', icon: 'book-open', module: 'reports', role: 'ACCOUNTANT' },
];

const STUDENT_SIDEBAR = [
  { id: 'dashboard', title: 'My Dashboard', path: '/student/dashboard', icon: 'home' },
  { id: 'plans', title: 'Subscription Plans', path: '/student/plans', icon: 'package' },
  { id: 'orders', title: 'Order History & Track', path: '/student/orders', icon: 'truck' },
];

/**
 * Filter sidebar items by user role & simple allowed modules list
 */
function getSidebarModulesForUser(role, allowedModules = []) {
  if (role === 'STUDENT') return STUDENT_SIDEBAR;
  if (role === 'SUPER_ADMIN') return MODULE_DEFINITIONS.filter(m => m.role === 'SUPER_ADMIN');

  return MODULE_DEFINITIONS.filter(m => m.role === role && allowedModules.includes(m.module));
}

module.exports = {
  MODULE_DEFINITIONS,
  STUDENT_SIDEBAR,
  getSidebarModulesForUser,
};
