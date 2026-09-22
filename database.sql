-- ============================================================
-- INSTAWASH LAUNDRY - CAMPUS ECOSYSTEM DATABASE SCHEMA
-- Clean & Simple Database Structure
-- Compatible with MySQL 5.7+, MySQL 8.0+, XAMPP phpMyAdmin & MariaDB
-- ============================================================

CREATE DATABASE IF NOT EXISTS `instawash_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `instawash_db`;

-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT NULL,
  `default_permissions` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. PERMISSIONS (MODULES) MASTER TABLE
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `module` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. ROLE PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` VARCHAR(191) NOT NULL,
  `permission_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. CAMPUSES TABLE
CREATE TABLE IF NOT EXISTS `campuses` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `address` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. OUTLETS TABLE
CREATE TABLE IF NOT EXISTS `outlets` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `campus_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `address` TEXT NOT NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `has_boys_section` TINYINT(1) NOT NULL DEFAULT 1,
  `has_girls_section` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_outlets_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. USERS (STAFF & ADMIN) TABLE
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `staff_id` VARCHAR(191) NOT NULL UNIQUE,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL UNIQUE,
  `phone` VARCHAR(191) NULL,
  `password` VARCHAR(191) NOT NULL,
  `role_id` VARCHAR(191) NULL,
  `role` VARCHAR(100) NOT NULL, -- SUPER_ADMIN, OUTLET_MANAGER, RECEPTIONIST, ACCOUNTANT
  `max_discount_percent` DOUBLE NOT NULL DEFAULT 0.0,
  `section` VARCHAR(50) NULL,
  `shift` VARCHAR(50) NULL,
  `permissions` TEXT NULL, -- JSON Array string e.g. ["dashboard", "orders", "machines"]
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. USER PERMISSIONS TABLE (FOR OVERRIDES IF NEEDED)
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` VARCHAR(191) NOT NULL,
  `permission_id` VARCHAR(191) NOT NULL,
  `is_granted` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. USER OUTLETS MAPPING TABLE
CREATE TABLE IF NOT EXISTS `user_outlets` (
  `user_id` VARCHAR(191) NOT NULL,
  `outlet_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`user_id`, `outlet_id`),
  CONSTRAINT `fk_uo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uo_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. MACHINES TABLE
CREATE TABLE IF NOT EXISTS `machines` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `machine_code` VARCHAR(191) NOT NULL,
  `outlet_id` VARCHAR(191) NOT NULL,
  `capacity_kg` DOUBLE NOT NULL,
  `status` ENUM('ACTIVE', 'MAINTENANCE', 'IN_USE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_machines_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS `students` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `phone` VARCHAR(191) NOT NULL UNIQUE,
  `full_name` VARCHAR(191) NOT NULL,
  `gender` ENUM('MALE', 'FEMALE') NOT NULL,
  `campus_id` VARCHAR(191) NULL,
  `student_id_card` VARCHAR(191) NOT NULL UNIQUE,
  `grad_year` INT NULL,
  `course` VARCHAR(191) NULL,
  `hostel_name` VARCHAR(191) NULL,
  `room_number` VARCHAR(191) NULL,
  `id_card_photo_url` TEXT NULL,
  `email` VARCHAR(191) NULL,
  `password` VARCHAR(191) NULL,
  `permanent_qr` VARCHAR(191) NOT NULL UNIQUE,
  `status` ENUM('REGISTERED_INACTIVE', 'ACTIVE_SUBSCRIBED', 'SUSPENDED') NOT NULL DEFAULT 'REGISTERED_INACTIVE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_students_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. SUBSCRIPTION PLANS TABLE
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `validity_type` ENUM('SEMESTER', 'MONTHLY', 'ANNUAL') NOT NULL DEFAULT 'SEMESTER',
  `validity_days` INT NOT NULL,
  `quota_kg` DOUBLE NOT NULL,
  `price` DOUBLE NOT NULL,
  `payg_rate_per_kg` DOUBLE NOT NULL DEFAULT 60.0,
  `min_billing_unit_kg` DOUBLE NOT NULL DEFAULT 5.0,
  `description` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. STUDENT SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS `student_subscriptions` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `student_id` VARCHAR(191) NOT NULL,
  `plan_id` VARCHAR(191) NOT NULL,
  `start_date` DATETIME NOT NULL,
  `end_date` DATETIME NOT NULL,
  `quota_kg_total` DOUBLE NOT NULL,
  `quota_kg_used` DOUBLE NOT NULL DEFAULT 0.0,
  `status` ENUM('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ss_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. SUBSCRIPTION PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS `subscription_payments` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `subscription_id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `payment_mode` ENUM('ONLINE', 'OUTLET_CASH', 'OUTLET_UPI') NOT NULL,
  `payment_status` ENUM('PENDING', 'CONFIRMED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `confirmed_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_sp_sub` FOREIGN KEY (`subscription_id`) REFERENCES `student_subscriptions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. ORDERS TABLE
CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(191) NOT NULL UNIQUE,
  `student_id` VARCHAR(191) NOT NULL,
  `outlet_id` VARCHAR(191) NOT NULL,
  `intake_staff_id` VARCHAR(191) NOT NULL,
  `total_weight_kg` DOUBLE NOT NULL,
  `total_piece_count` INT NOT NULL,
  `wash_type` ENUM('NORMAL', 'DELICATE', 'HEAVY') NOT NULL DEFAULT 'NORMAL',
  `iron_opted` TINYINT(1) NOT NULL DEFAULT 0,
  `initial_condition` VARCHAR(191) NULL,
  `is_payg` TINYINT(1) NOT NULL DEFAULT 0,
  `payg_billable_kg` DOUBLE NOT NULL DEFAULT 0.0,
  `payg_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `discount_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `final_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `status` ENUM('RECEIVED', 'IN_WASH', 'READY', 'COLLECTED', 'FLAGGED') NOT NULL DEFAULT 'RECEIVED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_orders_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. ORDER STATUS LOGS TABLE
CREATE TABLE IF NOT EXISTS `order_status_logs` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(191) NOT NULL,
  `status` ENUM('RECEIVED', 'IN_WASH', 'READY', 'COLLECTED', 'FLAGGED') NOT NULL,
  `updated_by_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_osl_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. ORDER FLAGS TABLE
CREATE TABLE IF NOT EXISTS `order_flags` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `flagged_by_id` VARCHAR(191) NOT NULL,
  `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `resolution_notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_flags_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. COMPLAINTS TABLE
CREATE TABLE IF NOT EXISTS `complaints` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `student_id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NULL,
  `category` ENUM('DAMAGED_CLOTHES', 'MISSING_CLOTHES', 'DELAYED_DELIVERY', 'STAFF_BEHAVIOR', 'OTHER') NOT NULL,
  `description` TEXT NOT NULL,
  `photo_url` TEXT NULL,
  `status` ENUM('OPEN', 'IN_INVESTIGATION', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'OPEN',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_complaints_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. RATINGS TABLE
CREATE TABLE IF NOT EXISTS `ratings` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `student_id` VARCHAR(191) NOT NULL,
  `outlet_id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NULL,
  `stars` INT NOT NULL,
  `feedback` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ratings_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. DAILY COLLECTIONS TABLE
CREATE TABLE IF NOT EXISTS `daily_collections` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `outlet_id` VARCHAR(191) NOT NULL,
  `collection_date` DATE NOT NULL,
  `cash_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `upi_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `card_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `total_amount` DOUBLE NOT NULL DEFAULT 0.0,
  `is_reconciled` TINYINT(1) NOT NULL DEFAULT 0,
  `reconciled_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_collections_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `outlet_id` VARCHAR(191) NOT NULL,
  `accountant_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `category` ENUM('DETERGENT', 'ELECTRICITY', 'MAINTENANCE', 'SALARY', 'MISC') NOT NULL,
  `amount` DOUBLE NOT NULL,
  `receipt_url` TEXT NULL,
  `expense_date` DATE NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_expenses_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. NOTICES TABLE
CREATE TABLE IF NOT EXISTS `notices` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `title` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `target_type` ENUM('ALL_OUTLETS', 'SPECIFIC_OUTLET', 'ALL_STUDENTS') NOT NULL DEFAULT 'ALL_OUTLETS',
  `target_outlet_id` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(191) NULL,
  `user_role` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(191) NULL,
  `details` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SEED DATA FOR SYSTEM ROLES & MODULES
-- ============================================================

-- Seed Roles
INSERT INTO `roles` (`id`, `name`, `description`, `default_permissions`) VALUES
('superadmin', 'SUPER_ADMIN', 'Super Admin with full network access', '["dashboard","managers","receptionists","accountants","campuses","plans","orders","students","machines","expenses","collections","reports","notices"]'),
('manager', 'OUTLET_MANAGER', 'Outlet Manager for outlet staff & operations', '["dashboard","receptionists","orders","machines","reports"]'),
('receptionist', 'RECEPTIONIST', 'Receptionist staff for student intake and order status', '["orders","students"]'),
('accountant', 'ACCOUNTANT', 'Accountant for payments, collections and expenses', '["dashboard","plans","expenses","collections","reports"]')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `default_permissions` = VALUES(`default_permissions`);

-- Seed Permissions (Modules)
INSERT INTO `permissions` (`id`, `name`, `module`, `description`) VALUES
('dashboard', 'HQ & Outlet Overview', 'SYSTEM', 'Dashboard stats & overview'),
('managers', 'Outlet Managers', 'STAFF', 'Manage outlet managers'),
('receptionists', 'Receptionists', 'STAFF', 'Manage receptionist staff'),
('accountants', 'Accountants', 'STAFF', 'Manage accountant staff'),
('campuses', 'Campuses & Outlets', 'SYSTEM', 'Manage campus locations & outlets'),
('plans', 'Plans & Pricing', 'FINANCIAL', 'Manage subscription plans'),
('orders', 'Orders & Intake', 'OPERATIONS', 'Order intake, status workflow & dropoffs'),
('students', 'Students Search & Register', 'OPERATIONS', 'Student search and registration'),
('machines', 'Washing Machines', 'OPERATIONS', 'Manage washing machines'),
('expenses', 'Outlet Expenses', 'FINANCIAL', 'Log operational expenses'),
('collections', 'Daily Reconciliation', 'FINANCIAL', 'Reconcile daily outlet collections'),
('reports', 'Reports & Analytics', 'SYSTEM', 'View system & P&L reports'),
('notices', 'Broadcast Notices', 'SYSTEM', 'Manage broadcast notices')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Seed Default Users
INSERT INTO `users` (`id`, `staff_id`, `name`, `email`, `phone`, `password`, `role_id`, `role`, `permissions`, `max_discount_percent`)
VALUES ('usr_admin_1', 'instawash_admin', 'InstaWash HQ Super Admin', 'admin@instawash.com', '9999999999', 'Admin@123', 'superadmin', 'SUPER_ADMIN', '["dashboard","managers","receptionists","accountants","campuses","plans","orders","students","machines","expenses","collections","reports","notices"]', 100.0)
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`), `permissions` = VALUES(`permissions`);

INSERT INTO `users` (`id`, `staff_id`, `name`, `email`, `phone`, `password`, `role_id`, `role`, `permissions`, `max_discount_percent`)
VALUES ('usr_om_1', 'OM001', 'Rajesh Sharma', 'manager@instawash.com', '9811122233', 'Manager@123', 'manager', 'OUTLET_MANAGER', '["dashboard","receptionists","orders","machines","reports"]', 0.0)
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`), `permissions` = VALUES(`permissions`);

INSERT INTO `users` (`id`, `staff_id`, `name`, `email`, `phone`, `password`, `role_id`, `role`, `permissions`, `max_discount_percent`, `section`, `shift`)
VALUES ('usr_rec_1', 'REC001', 'Anita Verma', 'anita@instawash.com', '9822233344', 'Reception@123', 'receptionist', 'RECEPTIONIST', '["orders","students"]', 10.0, 'BOYS', 'Morning')
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`), `permissions` = VALUES(`permissions`);

INSERT INTO `users` (`id`, `staff_id`, `name`, `email`, `phone`, `password`, `role_id`, `role`, `permissions`, `max_discount_percent`)
VALUES ('usr_acc_1', 'ACC001', 'Suresh Gupta', 'accountant@instawash.com', '9833344455', 'Accountant@123', 'accountant', 'ACCOUNTANT', '["dashboard","plans","expenses","collections","reports"]', 20.0)
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`), `permissions` = VALUES(`permissions`);

-- Seed Campuses & Outlets
INSERT INTO `campuses` (`id`, `name`, `address`) VALUES ('cmp_main_01', 'Main University Campus', 'Knowledge Park Sector 62') ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
INSERT INTO `outlets` (`id`, `campus_id`, `name`, `address`) VALUES ('out_main_01', 'cmp_main_01', 'Central Boys & Girls Outlet', 'Hostel Complex Block A') ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `user_outlets` (`user_id`, `outlet_id`) VALUES
('usr_om_1', 'out_main_01'), ('usr_rec_1', 'out_main_01'), ('usr_acc_1', 'out_main_01')
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

-- Seed Machines
INSERT INTO `machines` (`id`, `machine_code`, `outlet_id`, `capacity_kg`, `status`) VALUES
('mac_01', 'WASHER-01', 'out_main_01', 10.0, 'ACTIVE'),
('mac_02', 'WASHER-02', 'out_main_01', 12.0, 'ACTIVE'),
('mac_03', 'DRYER-01', 'out_main_01', 10.0, 'ACTIVE')
ON DUPLICATE KEY UPDATE `machine_code` = VALUES(`machine_code`);

-- Seed Subscription Plans
INSERT INTO `subscription_plans` (`id`, `name`, `validity_type`, `validity_days`, `quota_kg`, `price`, `payg_rate_per_kg`, `min_billing_unit_kg`, `description`) VALUES
('plan_sem_80', 'Semester Lite 80KG', 'SEMESTER', 120, 80.0, 3999.0, 50.0, 5.0, 'Standard semester package for hostel students'),
('plan_sem_120', 'Semester Pro 120KG', 'SEMESTER', 120, 120.0, 5499.0, 45.0, 5.0, 'Heavy usage semester package'),
('plan_monthly_20', 'Monthly Basic 20KG', 'MONTHLY', 30, 20.0, 1199.0, 60.0, 5.0, 'Short term monthly plan')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Seed Sample Student
INSERT INTO `students` (`id`, `phone`, `full_name`, `gender`, `campus_id`, `student_id_card`, `grad_year`, `course`, `hostel_name`, `room_number`, `email`, `password`, `permanent_qr`, `status`)
VALUES ('STD001', '9876543210', 'Aman Verma', 'MALE', 'cmp_main_01', 'ROLL202601', 2026, 'B.Tech CSE', 'Hostel Block 3', '302', 'aman@student.edu', 'Student@123', 'INSTAWASH:STUDENT:STD001:1fb35493', 'ACTIVE_SUBSCRIBED')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

INSERT INTO `student_subscriptions` (`id`, `student_id`, `plan_id`, `start_date`, `end_date`, `quota_kg_total`, `quota_kg_used`, `status`)
VALUES ('sub_sample_01', 'STD001', 'plan_sem_80', NOW(), DATE_ADD(NOW(), INTERVAL 120 DAY), 80.0, 15.5, 'ACTIVE')
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);
