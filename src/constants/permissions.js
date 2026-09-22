/**
 * Instawash Campus Ecosystem - Simple Clean System Modules & Permissions
 */
const PERMISSIONS = {
  DASHBOARD: 'dashboard',
  MANAGERS: 'managers',
  RECEPTIONISTS: 'receptionists',
  ACCOUNTANTS: 'accountants',
  CAMPUSES: 'campuses',
  PLANS: 'plans',
  ORDERS: 'orders',
  STUDENTS: 'students',
  MACHINES: 'machines',
  EXPENSES: 'expenses',
  COLLECTIONS: 'collections',
  REPORTS: 'reports',
  NOTICES: 'notices',
};

const DEFAULT_ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'dashboard',
    'managers',
    'receptionists',
    'accountants',
    'campuses',
    'plans',
    'orders',
    'students',
    'machines',
    'expenses',
    'collections',
    'reports',
    'notices',
  ],
  OUTLET_MANAGER: ['dashboard', 'receptionists', 'orders', 'machines', 'reports'],
  RECEPTIONIST: ['orders', 'students'],
  ACCOUNTANT: ['dashboard', 'plans', 'expenses', 'collections', 'reports'],
  STUDENT: ['dashboard', 'plans', 'orders'],
};

module.exports = {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
};
