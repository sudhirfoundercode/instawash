/**
 * Instawash Campus Ecosystem - 17 Core System Modules & Permissions
 * Directly matching the UI Sidebar Design
 */
const PERMISSIONS = {
  DASHBOARD: 'dashboard',
  CAMPUSES: 'campuses',
  OUTLETS: 'outlets',
  STUDENTS: 'students',
  SUBSCRIPTIONS: 'subscriptions',
  ORDERS: 'orders',
  MANAGERS: 'managers',
  ACCOUNTANTS: 'accountants',
  ROLES: 'roles',
  MACHINES: 'machines',
  COMPLAINTS: 'complaints',
  PAYMENTS: 'payments',
  RECONCILIATION: 'reconciliation',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  SETTINGS: 'settings',
};

const DEFAULT_ROLE_PERMISSIONS = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  OUTLET_MANAGER: ['dashboard', 'receptionists', 'orders', 'machines', 'reports', 'notifications'],
  RECEPTIONIST: ['orders', 'students', 'notifications'],
  ACCOUNTANT: ['dashboard', 'subscriptions', 'payments', 'reconciliation', 'reports', 'notifications'],
  STUDENT: ['dashboard', 'subscriptions', 'orders', 'complaints', 'notifications'],
};

module.exports = {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
};
