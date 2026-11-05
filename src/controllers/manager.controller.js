const db = require('../config/db');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

const getManagerOutletId = (req) => {
  return req.assignedOutletIds && req.assignedOutletIds.length > 0
    ? req.assignedOutletIds[0]
    : null;
};
 
 // PRIVACY_POLICY & TERMS_CONDITION
const getLegalPage = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        status: false,
        message: 'type is required'
      });
    }

    const allowedTypes = [
  'TERMS_CONDITION',
    'PRIVACY_POLICY',
    'REFUND_CANCELLATION',
    'SUBSCRIPTION_PAYG_TERMS',
    'ACCOUNT_DELETION_POLICY',
    'CUSTOMER_SUPPORT_POLICY'
];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        status: false,
        message: 'Invalid type'
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        type,
        title,
        content,
        updated_at
      FROM legal_pages
      WHERE type = ?
        AND status = 1
      LIMIT 1
      `,
      [type]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Content not found'
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Content fetched successfully',
      data: rows[0]
    });

  } catch (error) {
    console.error('Get Legal Page Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch content'
    });
  }
};


 
// outlet show

const getAssignedOutlets = async (req, res) => {
  try {
    // Bearer token se user ID
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User ID not found in token'
      });
    }

    // Login user details
    const [user] = await db.query(
      `
      SELECT
        id,
        name,
        phone,
        image,
        role
      FROM users
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
      `,
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }

    // ==========================================
    // OUTLET MANAGER OUTLETS
    // ==========================================

    const [managerOutlets] = await db.query(
      `
      SELECT
        o.id AS outlet_id,
        o.name AS outlet_name,
        o.address AS outlet_location,
        o.image AS outlet_image,

        'Outlet Manager' AS role_name,

        (
          SELECT COUNT(*)
          FROM students s
          WHERE s.outlet_id = o.id
        ) AS total_customer,

        (
          SELECT COUNT(*)
          FROM machines m
          WHERE m.outlet_id = o.id
        ) AS total_machine

      FROM user_outlets uo

      INNER JOIN outlets o
        ON o.id = uo.outlet_id

      WHERE uo.user_id = ?
        AND o.is_active = 1

      ORDER BY o.id DESC
      `,
      [userId]
    );

    // ==========================================
    // RECEPTIONIST OUTLETS
    // ==========================================

    const [receptionistOutlets] = await db.query(
      `
      SELECT
        o.id AS outlet_id,
        o.name AS outlet_name,
        o.address AS outlet_location,
        o.image AS outlet_image,

        'Receptionist' AS role_name,

        (
          SELECT COUNT(*)
          FROM students s
          WHERE s.outlet_id = o.id
        ) AS total_customer,

        (
          SELECT COUNT(*)
          FROM machines m
          WHERE m.outlet_id = o.id
        ) AS total_machine

      FROM user_outlets_receptionist uor

      INNER JOIN outlets o
        ON o.id = uor.outlet_id

      WHERE uor.user_id = ?
        AND o.is_active = 1

      ORDER BY o.id DESC
      `,
      [userId]
    );

    // ==========================================
    // IMAGE URL HELPER
    // ==========================================

    const imageUrl = (image) => {
      return image
        ? `https://instawash.siberiancrane.tech/uploads/${image}`
        : null;
    };

    return res.status(200).json({
      status: true,
      message: 'Assigned outlets fetched successfully',

      data: {
        user: {
          id: user[0].id,
          name: user[0].name,
          phone: user[0].phone,
          image: imageUrl(user[0].image),
          role: user[0].role
        },

        OutletManager: managerOutlets.map(item => ({
          outlet_id: item.outlet_id,
          outlet_name: item.outlet_name,
          outlet_location: item.outlet_location,
          outlet_image: imageUrl(item.outlet_image),
          role_name: item.role_name,
          total_customer: Number(item.total_customer),
          total_machine: Number(item.total_machine)
        })),

        Receptionist: receptionistOutlets.map(item => ({
          outlet_id: item.outlet_id,
          outlet_name: item.outlet_name,
          outlet_location: item.outlet_location,
          outlet_image: imageUrl(item.outlet_image),
          role_name: item.role_name,
          total_customer: Number(item.total_customer),
          total_machine: Number(item.total_machine)
        }))
      }
    });

  } catch (error) {
    console.error('Get Assigned Outlets Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch assigned outlets'
    });
  }
};

// Customer list
const getCustomerList_22_10_2026 = async (req, res) => {
  try {
    const {
      outlet_id,
      customer_type = 'all',
      subscription_status = 'all',
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    if (!outlet_id) {
      return res.status(400).json({
        status: false,
        message: 'outlet_id is required'
      });
    }

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.max(parseInt(limit) || 20, 1);
    const offset = (pageNumber - 1) * limitNumber;

    let where = `
      WHERE s.outlet_id = ?
    `;

    let params = [outlet_id];

    // ==========================================
    // CUSTOMER TYPE FILTER
    // ==========================================

    if (customer_type === 'student') {
      where += ` AND s.role = 'STUDENT'`;
    }

    if (customer_type === 'non_student') {
      where += ` AND s.role = 'NON_STUDENT'`;
    }

    // ==========================================
    // SEARCH
    // Name / Phone / Customer ID
    // ==========================================

    if (search.trim() !== '') {

      const searchValue = `%${search.trim()}%`;

      where += `
        AND (
          s.full_name LIKE ?
          OR s.phone LIKE ?
          OR CONCAT('IWO', LPAD(s.id, 5, '0')) LIKE ?
        )
      `;

      params.push(
        searchValue,
        searchValue,
        searchValue
      );
    }

    // ==========================================
    // SUBSCRIPTION FILTER
    // ==========================================

    // SUBSCRIBED
    if (subscription_status === 'subscribed') {

      where += `
        AND EXISTS (
          SELECT 1
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (
              ss.end_date IS NULL
              OR DATE(ss.end_date) >= CURDATE()
            )
        )
      `;
    }

    // NON-SUBSCRIBED
    if (subscription_status === 'non_subscribed') {

      where += `
        AND NOT EXISTS (
          SELECT 1
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
        )
      `;
    }

    // EXPIRED
    if (subscription_status === 'expired') {

      where += `
        AND EXISTS (
          SELECT 1
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.end_date IS NOT NULL
            AND DATE(ss.end_date) < CURDATE()
        )

        AND NOT EXISTS (
          SELECT 1
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (
              ss.end_date IS NULL
              OR DATE(ss.end_date) >= CURDATE()
            )
        )
      `;
    }

    // ==========================================
    // TOTAL COUNT
    // ==========================================

    const [countResult] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM students s
      ${where}
      `,
      params
    );

    const total = Number(countResult[0].total);

    // ==========================================
    // CUSTOMER LIST
    // ==========================================

    const [customers] = await db.query(
      `
      SELECT
        s.id,

        CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,

        s.phone,
        s.full_name,
        s.profile_image,
        s.role,
        s.gender,
        s.campus_id,
        s.roll_number,
        s.outlet_id,
        s.course,
        s.hostel_name,
        s.room_number,
        s.address,
        s.area,
        s.pin_code,
        s.permanent_qr,
        s.status,
        s.created_at,

        o.name AS outlet_name,

        (
          SELECT p.plan_name
          FROM student_subscriptions ss
          INNER JOIN subscription_plans p
            ON p.id = ss.plan_id
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (
              ss.end_date IS NULL
              OR DATE(ss.end_date) >= CURDATE()
            )
          ORDER BY ss.created_at DESC
          LIMIT 1
        ) AS plan_name,

        (
          SELECT ss.end_date
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
          ORDER BY ss.created_at DESC
          LIMIT 1
        ) AS subscription_end_date,

        CASE
          WHEN EXISTS (
            SELECT 1
            FROM student_subscriptions ss
            WHERE ss.student_id = s.id
              AND ss.status = 'ACTIVE'
              AND (
                ss.end_date IS NULL
                OR DATE(ss.end_date) >= CURDATE()
              )
          )
          THEN 'Subscribed'

          WHEN EXISTS (
            SELECT 1
            FROM student_subscriptions ss
            WHERE ss.student_id = s.id
              AND ss.end_date IS NOT NULL
              AND DATE(ss.end_date) < CURDATE()
          )
          THEN 'Expired'

          ELSE 'Non-Subscribed'
        END AS subscription_status

      FROM students s

      LEFT JOIN outlets o
        ON o.id = s.outlet_id

      ${where}

      ORDER BY s.id DESC

      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset]
    );

    // ==========================================
    // IMAGE URL
    // ==========================================

    const imageUrl = (image) => {
      return image
        ? `https://instawash.siberiancrane.tech/uploads/${image}`
        : null;
    };

    // ==========================================
    // RESPONSE
    // ==========================================

    const customerData = customers.map(item => ({
      id: item.id,

      customer_id: item.customer_id,

      full_name: item.full_name,

      phone: item.phone,

      profile_image: imageUrl(item.profile_image),

      role: item.role,

      gender: item.gender,

      campus_id: item.campus_id,

      roll_number: item.roll_number,

      outlet_id: item.outlet_id,

      outlet_name: item.outlet_name,

      course: item.course,

      hostel_name: item.hostel_name,

      room_number: item.room_number,

      address: item.address,

      area: item.area,

      pin_code: item.pin_code,

      permanent_qr: item.permanent_qr,

      status: item.status,

      subscription_status: item.subscription_status,

      plan_name: item.plan_name,

      subscription_end_date: item.subscription_end_date,

      created_at: item.created_at
    }));

    return res.status(200).json({
      status: true,
      message: 'Customer list fetched successfully',

      data: {
        total_customer: total,

        customers: customerData,

        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: total,
          total_pages: Math.ceil(total / limitNumber)
        }
      }
    });

  } catch (error) {

    console.error('Get Customer List Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch customer list'
    });
  }
};
//End Customer list

// Customer list
const getCustomerList = async (req, res) => {
  try {
    const {
      outlet_id,
      customer_type = 'all',
      subscription_status = 'all',
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    if (!outlet_id) {
      return res.status(400).json({
        status: false,
        message: 'outlet_id is required'
      });
    }

    // ---------- Pagination ----------
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100); // cap at 100
    const offset = (pageNumber - 1) * limitNumber;

    // ---------- WHERE ----------
    let where = `WHERE s.outlet_id = ?`;
    const params = [outlet_id];

    // Customer type
    if (customer_type === 'student') {
      where += ` AND s.role = 'STUDENT'`;
    } else if (customer_type === 'non_student') {
      where += ` AND s.role = 'NON_STUDENT'`;
    }

    // Search (name / phone / customer id)
    if (search && search.trim() !== '') {
      const searchValue = `%${search.trim()}%`;
      where += `
        AND (
          s.full_name LIKE ?
          OR s.phone LIKE ?
          OR CONCAT('IWO', LPAD(s.id, 5, '0')) LIKE ?
        )
      `;
      params.push(searchValue, searchValue, searchValue);
    }

    // Subscription status
    if (subscription_status === 'subscribed') {
      where += `
        AND EXISTS (
          SELECT 1 FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
        )
      `;
    }

    if (subscription_status === 'non_subscribed') {
      // no active subscription at all (covers never-subscribed + expired)
      where += `
        AND NOT EXISTS (
          SELECT 1 FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
        )
      `;
    }

    if (subscription_status === 'expired') {
      where += `
        AND EXISTS (
          SELECT 1 FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.end_date IS NOT NULL
            AND DATE(ss.end_date) < CURDATE()
        )
        AND NOT EXISTS (
          SELECT 1 FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
        )
      `;
    }

    // ---------- COUNT ----------
    const [countResult] = await db.query(
      `SELECT COUNT(*) AS total FROM students s ${where}`,
      params
    );
    const total = Number(countResult[0].total);

    // ---------- LIST ----------
    const [customers] = await db.query(
      `
      SELECT
        s.id,
        CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
        s.phone,
        s.full_name,
        s.profile_image,
        s.role,
        s.gender,
        s.campus_id,
        s.roll_number,
        s.outlet_id,
        s.course,
        s.hostel_name,
        s.room_number,
        s.address,
        s.area,
        s.pin_code,
        s.permanent_qr,
        s.status,
        s.created_at,
        o.name AS outlet_name,

        (
          SELECT p.plan_name
          FROM student_subscriptions ss
          INNER JOIN subscription_plans p ON p.id = ss.plan_id
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
          ORDER BY ss.created_at DESC
          LIMIT 1
        ) AS plan_name,

        (
          SELECT ss.end_date
          FROM student_subscriptions ss
          WHERE ss.student_id = s.id
            AND ss.status = 'ACTIVE'
            AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
          ORDER BY ss.created_at DESC
          LIMIT 1
        ) AS subscription_end_date,

        CASE
          WHEN EXISTS (
            SELECT 1 FROM student_subscriptions ss
            WHERE ss.student_id = s.id
              AND ss.status = 'ACTIVE'
              AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
          ) THEN 'Subscribed'
          WHEN EXISTS (
            SELECT 1 FROM student_subscriptions ss
            WHERE ss.student_id = s.id
              AND ss.end_date IS NOT NULL
              AND DATE(ss.end_date) < CURDATE()
          ) THEN 'Expired'
          ELSE 'Non-Subscribed'
        END AS subscription_status

      FROM students s
      LEFT JOIN outlets o ON o.id = s.outlet_id
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset]
    );

    // ---------- Image URL ----------
    const imageUrl = (image) =>
      image ? `https://instawash.siberiancrane.tech/uploads/${image}` : null;

    // ---------- Response ----------
    const customerData = customers.map((item) => ({
      id: item.id,
      customer_id: item.customer_id,
      full_name: item.full_name,
      phone: item.phone,
      profile_image: imageUrl(item.profile_image),
      role: item.role,
      gender: item.gender,
      campus_id: item.campus_id,
      roll_number: item.roll_number,
      outlet_id: item.outlet_id,
      outlet_name: item.outlet_name,
      course: item.course,
      hostel_name: item.hostel_name,
      room_number: item.room_number,
      address: item.address,
      area: item.area,
      pin_code: item.pin_code,
      permanent_qr: item.permanent_qr,
      status: item.status,
      subscription_status: item.subscription_status,
      plan_name: item.plan_name,
      subscription_end_date: item.subscription_end_date,
      created_at: item.created_at
    }));

    return res.status(200).json({
      status: true,
      message: 'Customer list fetched successfully',
      data: {
        total_customer: total,
        customers: customerData,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          total_pages: Math.ceil(total / limitNumber),
          has_next_page: pageNumber * limitNumber < total,
          has_prev_page: pageNumber > 1
        }
      }
    });

  } catch (error) {
    console.error('Get Customer List Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch customer list'
    });
  }
};


const getMachineTypes = async (req, res) => {
  try {
    const [machineTypes] = await db.query(`
      SELECT
        id,
        machine_type,
        image,
        created_at,
        updated_at
      FROM machine_types
      ORDER BY id ASC
    `);

    const data = machineTypes.map(item => ({
      id: item.id,
      machine_type: item.machine_type,
      image: item.image
        ? `https://instawash.siberiancrane.tech/uploads/${item.image}`
        : null
    }));

    return res.status(200).json({
      status: true,
      message: 'Machine type list fetched successfully',
      data: {
        machine_types: data
      }
    });

  } catch (error) {
    console.error('Get Machine Types Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch machine types'
    });
  }
};

//Create Staff 


const createStaff = async (req, res) => {
  try {
    const {
      employeeId,
      fullName,
      phone,
      dob,
      address,
      campusId,
      outletId,
      role,
      joiningDate,
      remarks
    } = req.body;

    const image = req.file ? req.file.filename : null;

    if (!employeeId || !fullName || !phone || !role || !campusId || !outletId) {
      return res.status(400).json({
        status: false,
        message: 'Employee ID, Full Name, Phone, Role, Campus ID and Outlet ID are required'
      });
    }

    // Check employee ID
    const [existingStaff] = await db.query(
      `SELECT id FROM users WHERE staff_id = ?`,
      [employeeId]
    );

    if (existingStaff.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Employee ID already exists'
      });
    }

    // Check phone
    const [existingPhone] = await db.query(
      `SELECT id FROM users WHERE phone = ?`,
      [phone]
    );

    if (existingPhone.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Phone number already exists'
      });
    }

    const [result] = await db.query(
      `INSERT INTO users
      (
        staff_id,
        name,
        phone,
        image,
        dob,
        address,
        role,
        is_active,
        joining_date,
        remarks,
        campus_id,
        outlet_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NOW(), NOW())`,
      [
        employeeId,
        fullName,
        phone,
        image,
        dob || null,
        address || null,
        role,
        joiningDate || null,
        remarks || null,
        campusId,
        outletId
      ]
    );

    return res.status(201).json({
      status: true,
      message: 'Staff created successfully',
      data: {
        id: result.insertId,
        staff_id: employeeId,
        name: fullName,
        phone,
        image: image
          ? `https://instawash.siberiancrane.tech/uploads/${image}`
          : null,
        role,
        is_active: 1,
        campus_id: Number(campusId),
        outlet_id: Number(outletId)
      }
    });
} catch (error) {
  console.error('Create Staff Error:', error);

  return res.status(500).json({
    status: false,
    message: 'Failed to create staff',
    error: error.message,
    sqlMessage: error.sqlMessage,
    code: error.code
  });
}
  
};

//Staff List 

const getStaffList = async (req, res) => {
  try {
    const { campus_id, outlet_id } = req.query;

    if (!campus_id || !outlet_id) {
      return res.status(400).json({
        status: false,
        message: 'campus_id and outlet_id are required'
      });
    }

    const [staff] = await db.query(
      `
      SELECT
        u.id,
        u.staff_id,
        u.name,
        u.email,
        u.phone,
        u.image,
        u.dob,
        u.address,
        u.role_id,
        u.role,
        u.permissions,
        u.max_discount_percent,
        u.is_active,
        u.joining_date,
        u.remarks,
        u.campus_id,
        u.outlet_id,
        o.name AS outlet_name,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN outlets o
        ON o.id = u.outlet_id
      WHERE u.campus_id = ?
        AND u.outlet_id = ?
        AND u.role = 'Laundry Staff'
      ORDER BY u.id DESC
      `,
      [campus_id, outlet_id]
    );

    const staffList = staff.map(item => ({
      ...item,
      image: item.image
        ? `https://instawash.siberiancrane.tech/uploads/${item.image}`
        : null
    }));

    const [count] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
      FROM users
      WHERE campus_id = ?
        AND outlet_id = ?
        AND role = 'Laundry Staff'
      `,
      [campus_id, outlet_id]
    );

    return res.status(200).json({
      status: true,
      message: 'Staff list fetched successfully',
      data: {
        count: {
          total: Number(count[0].total),
          active: Number(count[0].active),
          inactive: Number(count[0].inactive)
        },
        staff: staffList
      }
    });

  } catch (error) {
    console.error('Get Staff List Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch staff list'
    });
  }
};

//Update staff


const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      employeeId,
      fullName,
      phone,
      dob,
      address,
      campusId,
      outletId,
      role,
      joiningDate,
      remarks
    } = req.body;

    const image = req.file ? req.file.filename : null;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Staff ID is required'
      });
    }

    if (!employeeId || !fullName || !phone || !role || !campusId || !outletId) {
      return res.status(400).json({
        status: false,
        message: 'Employee ID, Full Name, Phone, Role, Campus ID and Outlet ID are required'
      });
    }

    // Check staff exists
    const [existingStaff] = await db.query(
      `SELECT id, image FROM users WHERE id = ? AND role = 'Laundry Staff'`,
      [id]
    );

    if (existingStaff.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Staff not found'
      });
    }

    // Check employee ID belongs to another staff
    const [employeeCheck] = await db.query(
      `SELECT id FROM users WHERE staff_id = ? AND id != ?`,
      [employeeId, id]
    );

    if (employeeCheck.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Employee ID already exists'
      });
    }

    // Check phone belongs to another staff
    const [phoneCheck] = await db.query(
      `SELECT id FROM users WHERE phone = ? AND id != ?`,
      [phone, id]
    );

    if (phoneCheck.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Phone number already exists'
      });
    }

    let updateQuery = `
      UPDATE users SET
        staff_id = ?,
        name = ?,
        phone = ?,
        dob = ?,
        address = ?,
        campus_id = ?,
        outlet_id = ?,
        role = ?,
        joining_date = ?,
        remarks = ?,
        updated_at = NOW()
    `;

    let updateValues = [
      employeeId,
      fullName,
      phone,
      dob || null,
      address || null,
      campusId,
      outletId,
      role,
      joiningDate || null,
      remarks || null
    ];

    // New image received
    if (image) {
      updateQuery += `, image = ?`;
      updateValues.push(image);
    }

    updateQuery += ` WHERE id = ?`;
    updateValues.push(id);

    await db.query(updateQuery, updateValues);

    return res.status(200).json({
      status: true,
      message: 'Staff updated successfully',
      data: {
        id: Number(id),
        image: image
          ? `https://instawash.siberiancrane.tech/uploads/${image}`
          : (
              existingStaff[0].image
                ? `https://instawash.siberiancrane.tech/uploads/${existingStaff[0].image}`
                : null
            )
      }
    });

  } catch (error) {
    console.error('Update Staff Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to update staff'
    });
  }
};

// staff Active/Inactive status
const updateStaffStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Staff ID is required'
      });
    }

    if (isActive === undefined || ![0, 1].includes(Number(isActive))) {
      return res.status(400).json({
        status: false,
        message: 'isActive must be 0 or 1'
      });
    }

    const [staff] = await db.query(
      `SELECT id FROM users WHERE id = ? AND role = 'Laundry Staff'`,
      [id]
    );

    if (staff.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Staff not found'
      });
    }

    await db.query(
      `UPDATE users
       SET is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [Number(isActive), id]
    );

    return res.status(200).json({
      status: true,
      message: Number(isActive) === 1
        ? 'Staff activated successfully'
        : 'Staff deactivated successfully'
    });

  } catch (error) {
    console.error('Update Staff Status Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to update staff status'
    });
  }
};

// delete staff
const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Staff ID is required'
      });
    }

    const [staff] = await db.query(
      `SELECT id FROM users WHERE id = ? AND role = 'Laundry Staff'`,
      [id]
    );

    if (staff.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Staff not found'
      });
    }

    await db.query(
      `DELETE FROM users
       WHERE id = ? AND role = 'Laundry Staff'`,
      [id]
    );

    return res.status(200).json({
      status: true,
      message: 'Staff deleted successfully'
    });

  } catch (error) {
    console.error('Delete Staff Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to delete staff'
    });
  }
};

/**
 * Machine Tracking
 */


// create Machine

const addMachine = async (req, res) => {
  try {
    const {
      machineCode,
      machineName,
      machineType,
      category,
      brandName,
      modelNumber,
      serialNumber,
      capacityValue,
      capacityUnit,
      outletId,
      status,
      installationDate
    } = req.body;

    const image = req.file ? req.file.filename : null;

    if (
      !machineCode ||
      !machineType ||
      !brandName ||
      !outletId ||
      !capacityValue ||
      !capacityUnit ||
      !status
    ) {
      return res.status(400).json({
        status: false,
        message: 'Machine Code, Machine Type, Brand Name, Outlet ID, Capacity, Unit and Status are required'
      });
    }

    if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: 'Status must be ACTIVE, INACTIVE or MAINTENANCE'
      });
    }

    const [existing] = await db.query(
      `SELECT id FROM machines WHERE machine_code = ?`,
      [machineCode]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Machine code already exists'
      });
    }

    const [result] = await db.query(
      `INSERT INTO machines
      (
        machine_code,
        machine_name,
        machine_type,
        category,
        brand_name,
        model_number,
        serial_number,
        capacity_value,
        capacity_unit,
        outlet_id,
        status,
        installation_date,
        image,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        machineCode,
        machineName || null,
        machineType,
        category || null,
        brandName,
        modelNumber || null,
        serialNumber || null,
        capacityValue,
        capacityUnit,
        outletId,
        status,
        installationDate || null,
        image
      ]
    );

    return res.status(201).json({
      status: true,
      message: 'Machine added successfully',
      data: {
        id: result.insertId,
        machine_code: machineCode,
        machine_name: machineName || null,
        machine_type: machineType,
        category: category || null,
        brand_name: brandName,
        model_number: modelNumber || null,
        serial_number: serialNumber || null,
        capacity_value: capacityValue,
        capacity_unit: capacityUnit,
        outlet_id: Number(outletId),
        status,
        installation_date: installationDate || null,
        image: image
          ? `https://instawash.siberiancrane.tech/uploads/${image}`
          : null
      }
    });

  } catch (error) {
    console.error('Add Machine Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to add machine'
    });
  }
};

// Machine list

const getMachineList = async (req, res) => {
  try {
    const { outlet_id } = req.query;

    if (!outlet_id) {
      return res.status(400).json({
        status: false,
        message: 'outlet_id is required'
      });
    }

    // Machine List
    const [machines] = await db.query(
      `
      SELECT
        m.id,
        m.machine_code,
        m.machine_name,
        m.machine_type,
        m.category,
        m.brand_name,
        m.model_number,
        m.serial_number,
        m.capacity_value,
        m.capacity_unit,
        m.outlet_id,
        o.name AS outlet_name,
        m.status,
        m.installation_date,
        m.image,
        m.created_at,
        m.updated_at
      FROM machines m
      LEFT JOIN outlets o
        ON o.id = m.outlet_id
      WHERE m.outlet_id = ?
      ORDER BY m.id DESC
      `,
      [outlet_id]
    );

    // Machine Count
    const [count] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive,
        SUM(CASE WHEN status = 'MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance
      FROM machines
      WHERE outlet_id = ?
      `,
      [outlet_id]
    );

    const machineList = machines.map((machine) => ({
      ...machine,
      image: machine.image
        ? `https://instawash.siberiancrane.tech/uploads/${machine.image}`
        : null
    }));

    return res.status(200).json({
      status: true,
      message: 'Machine list fetched successfully',
      data: {
        count: {
          total: Number(count[0].total),
          active: Number(count[0].active),
          inactive: Number(count[0].inactive),
          maintenance: Number(count[0].maintenance)
        },
        machines: machineList
      }
    });

  } catch (error) {
    console.error('Get Machine List Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch machine list'
    });
  }
};

// changes machine status

const updateMachineStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Machine ID is required'
      });
    }

    if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: 'Status must be ACTIVE, INACTIVE or MAINTENANCE'
      });
    }

    const [machine] = await db.query(
      `SELECT id FROM machines WHERE id = ?`,
      [id]
    );

    if (machine.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Machine not found'
      });
    }

    await db.query(
      `UPDATE machines
       SET status = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, id]
    );

    return res.status(200).json({
      status: true,
      message: `Machine status changed to ${status} successfully`
    });

  } catch (error) {
    console.error('Update Machine Status Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to update machine status'
    });
  }
};

// Update machine

const updateMachine = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      machineCode,
      machineName,
      machineType,
      category,
      brandName,
      modelNumber,
      serialNumber,
      capacityValue,
      capacityUnit,
      outletId,
      status,
      installationDate
    } = req.body;

    const newImage = req.file ? req.file.filename : null;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Machine ID is required'
      });
    }

    if (
      !machineCode ||
      !machineType ||
      !brandName ||
      !outletId ||
      !capacityValue ||
      !capacityUnit ||
      !status
    ) {
      return res.status(400).json({
        status: false,
        message: 'Machine Code, Machine Type, Brand Name, Outlet ID, Capacity, Unit and Status are required'
      });
    }

    if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: 'Status must be ACTIVE, INACTIVE or MAINTENANCE'
      });
    }

    const [machine] = await db.query(
      `SELECT id FROM machines WHERE id = ?`,
      [id]
    );

    if (machine.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Machine not found'
      });
    }

    const [existing] = await db.query(
      `SELECT id FROM machines WHERE machine_code = ? AND id != ?`,
      [machineCode, id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        status: false,
        message: 'Machine code already exists'
      });
    }

    if (newImage) {
      await db.query(
        `UPDATE machines SET
          machine_code = ?,
          machine_name = ?,
          machine_type = ?,
          category = ?,
          brand_name = ?,
          model_number = ?,
          serial_number = ?,
          capacity_value = ?,
          capacity_unit = ?,
          outlet_id = ?,
          status = ?,
          installation_date = ?,
          image = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          machineCode,
          machineName || null,
          machineType,
          category || null,
          brandName,
          modelNumber || null,
          serialNumber || null,
          capacityValue,
          capacityUnit,
          outletId,
          status,
          installationDate || null,
          newImage,
          id
        ]
      );
    } else {
      await db.query(
        `UPDATE machines SET
          machine_code = ?,
          machine_name = ?,
          machine_type = ?,
          category = ?,
          brand_name = ?,
          model_number = ?,
          serial_number = ?,
          capacity_value = ?,
          capacity_unit = ?,
          outlet_id = ?,
          status = ?,
          installation_date = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          machineCode,
          machineName || null,
          machineType,
          category || null,
          brandName,
          modelNumber || null,
          serialNumber || null,
          capacityValue,
          capacityUnit,
          outletId,
          status,
          installationDate || null,
          id
        ]
      );
    }

    return res.status(200).json({
      status: true,
      message: 'Machine updated successfully'
    });

  } catch (error) {
    console.error('Update Machine Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to update machine'
    });
  }
};

// Delete Machine

const deleteMachine = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'Machine ID is required'
      });
    }

    const [machine] = await db.query(
      `SELECT id FROM machines WHERE id = ?`,
      [id]
    );

    if (machine.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Machine not found'
      });
    }

    await db.query(
      `DELETE FROM machines WHERE id = ?`,
      [id]
    );

    return res.status(200).json({
      status: true,
      message: 'Machine deleted successfully'
    });

  } catch (error) {
    console.error('Delete Machine Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to delete machine'
    });
  }
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

//Profile 

const getProfile = async (req, res) => {
  try {

    // User ID JWT token se milegi
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User ID not found in token'
      });
    }

    const [users] = await db.query(
      `
      SELECT
        u.id,
        u.staff_id,
        u.name,
        u.email,
        u.phone,
        u.image,
        u.dob,
        u.address,
        u.role_id,
        u.role,
        u.roles,
        u.is_active,
        u.joining_date,
        u.remarks,
        u.campus_id,
        u.outlet_id,
        c.name AS campus_name,
        o.name AS outlet_name,
        o.address AS outlet_address,
        u.created_at,
        u.updated_at

      FROM users u

      LEFT JOIN campuses c
        ON c.id = u.campus_id

      LEFT JOIN outlets o
        ON o.id = u.outlet_id

      WHERE u.id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Profile not found'
      });
    }

    const user = users[0];

    const imageUrl = user.image
      ? `https://instawash.siberiancrane.tech/uploads/${user.image}`
      : null;

    return res.status(200).json({
      status: true,
      message: 'Profile fetched successfully',

      data: {
        id: user.id,

        employee_id: user.staff_id,

        name: user.name,

        email: user.email,

        phone: user.phone,

        image: imageUrl,

        dob: user.dob,

        address: user.address,

        role_id: user.role_id,

        role: user.role,
        
        roles: user.roles,

        is_active: user.is_active,

        joining_date: user.joining_date,

        remarks: user.remarks,

        campus_id: user.campus_id,

        campus_name: user.campus_name,

        outlet_id: user.outlet_id,

        outlet_name: user.outlet_name,

        outlet_address: user.outlet_address,

        created_at: user.created_at,

        updated_at: user.updated_at
      }
    });

  } catch (error) {

    console.error('Get Profile Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch profile'
    });
  }
};


// ==========================================
// ⭐ Get Subscriptions by Outlet (With Student + Campus + Outlet Details)
// @desc    URL: /api/payment/outlet/outlet_id=1&status=Pending
// @route   GET /api/payment/outlet/:params
// ==========================================
const getAllSubscriptionsByOutlet = async (req, res) => {
    try {
        const rawParams = req.params.params;

        // Manual Parsing (bina ? ke)
        const parsed = {};
        if (rawParams) {
            rawParams.split('&').forEach(pair => {
                const [key, value] = pair.split('=');
                if (key && value !== undefined) {
                    parsed[key.trim()] = decodeURIComponent(value.trim());
                }
            });
        }

        const outlet_id = parsed.outlet_id;
        const status = parsed.status;
        const search = parsed.search;

        if (!outlet_id) {
            return res.status(400).json({
                success: false,
                message: 'outlet_id is required. Example: /api/payment/outlet/outlet_id=1&status=Pending'
            });
        }

        const allowedStatuses = ['Pending', 'Success', 'Rejected', 'Failed'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
            });
        }

        // 🔥 MAIN QUERY: 4 Tables JOIN
        let query = `
            SELECT 
                -- Subscription Details
                sp.id AS subscription_id,
                sp.transaction_id,
                sp.student_id,
                sp.campus_id,
                sp.outlet_id,
                sp.plan_name,
                sp.original_price,
                sp.discount_amount,
                sp.payable_amount,
                sp.purchase_month,
                sp.validity_start,
                sp.validity_end,
                sp.payment_status,
                sp.payment_method,
                sp.rejection_reason,
                sp.created_at AS subscription_created_at,

                -- Student Details
                s.full_name AS student_name,
                s.phone AS student_mobile,
                s.profile_image AS student_image,
                s.role AS student_role,
                s.status AS student_status,

                -- Campus Details
                c.name AS campus_name,
                c.institution_name AS campus_institution,

                -- Outlet Details
                o.name AS outlet_name,
                o.section AS outlet_section

            FROM subscriptions_payments sp
            LEFT JOIN students s ON sp.student_id = s.id
            LEFT JOIN campuses c ON sp.campus_id = c.id
            LEFT JOIN outlets o ON sp.outlet_id = o.id
            WHERE sp.outlet_id = ?
        `;

        let params = [outlet_id];

        if (status) {
            query += ` AND sp.payment_status = ?`;
            params.push(status);
        }

        if (search) {
            query += ` AND (s.full_name LIKE ? OR sp.transaction_id LIKE ? OR s.phone LIKE ? OR s.roll_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY sp.created_at DESC`;

        const [rows] = await db.execute(query, params);

        // ✅ Base URL define karo
        const BASE_IMAGE_URL = 'https://root.instawashlaundry.site/uploads/';

        // ✅ Har row me subscriptionStatus aur Full Image URL add karo
        const formattedRows = rows.map(row => {
            const studentStatus = String(row.student_status || '').trim().toUpperCase();
            const subscriptionStatus = studentStatus === 'ACTIVE_SUBSCRIBED'
                ? 'SUCCESS'
                : 'PENDING';

            // 🖼️ Image URL Merge Logic
            let fullImageUrl = null;
            if (row.student_image) {
                // Agar image already http se start hoti hai, toh base URL mat lagao
                if (row.student_image.startsWith('http')) {
                    fullImageUrl = row.student_image;
                } else {
                    // Path ke starting slash (/) hata kar merge karo
                    const cleanImagePath = row.student_image.startsWith('/') 
                        ? row.student_image.slice(1) 
                        : row.student_image;
                    fullImageUrl = `${BASE_IMAGE_URL}${cleanImagePath}`;
                }
            }

            const { student_status, student_image, ...rest } = row;

            return {
                ...rest,
                student_image: fullImageUrl, // ✅ Updated full URL
                subscriptionStatus
            };
        });

        // Stats
        const [[stats]] = await db.execute(`
            SELECT 
                COUNT(*) AS total_subscriptions,
                SUM(CASE WHEN payment_status = 'Success' THEN 1 ELSE 0 END) AS success_count,
                SUM(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN payment_status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count,
                SUM(CASE WHEN payment_status = 'Failed' THEN 1 ELSE 0 END) AS failed_count,
                COALESCE(SUM(CASE WHEN payment_status = 'Success' THEN payable_amount ELSE 0 END), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN payable_amount ELSE 0 END), 0) AS pending_revenue
            FROM subscriptions_payments
            WHERE outlet_id = ?
        `, [outlet_id]);

        res.status(200).json({
            success: true,
            outlet_id: parseInt(outlet_id),
            applied_filter: status || 'ALL',
            stats: {
                total_subscriptions: stats.total_subscriptions || 0,
                success_count: stats.success_count || 0,
                pending_count: stats.pending_count || 0,
                rejected_count: stats.rejected_count || 0,
                failed_count: stats.failed_count || 0,
                total_revenue: stats.total_revenue || 0,
                pending_revenue: stats.pending_revenue || 0
            },
            count: formattedRows.length,
            data: formattedRows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// ==========================================
// ⭐ Get Single Subscription Details by ID (With Student + Campus + Outlet Details)
// @desc    Kisi bhi particular subscription ki puri detail
// @route   GET /api/payment/subscription/:id
// ==========================================
// const getSubscriptionById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         if (!id) {
//             return res.status(400).json({ success: false, message: 'Subscription ID is required' });
//         }

//         const [rows] = await db.execute(`
//             SELECT 
//                 -- Subscription Details
//                 sp.id AS subscription_id,
//                 sp.transaction_id,
//                 sp.student_id,
//                 sp.campus_id,
//                 sp.outlet_id,
//                 sp.plan_name,
//                 sp.original_price,
//                 sp.discount_amount,
//                 sp.payable_amount,
//                 sp.purchase_month,
//                 sp.validity_start,
//                 sp.validity_end,
//                 sp.payment_status,
//                 sp.payment_method,
//                 sp.rejection_reason,
//                 sp.created_at AS subscription_created_at,

//                 -- Student Details
//                 s.full_name AS student_name,
//                 s.phone AS student_mobile,
//                 s.profile_image AS student_image,
//                 s.role AS student_role,

//                 -- Campus Details
//                 c.name AS campus_name,
//                 c.institution_name AS campus_institution,

//                 -- Outlet Details
//                 o.name AS outlet_name,
//                 o.section AS outlet_section

//             FROM subscriptions_payments sp
//             LEFT JOIN students s ON sp.student_id = s.id
//             LEFT JOIN campuses c ON sp.campus_id = c.id
//             LEFT JOIN outlets o ON sp.outlet_id = o.id
//             WHERE sp.id = ?
//         `, [id]);

//         if (rows.length === 0) {
//             return res.status(404).json({ success: false, message: 'Subscription not found' });
//         }

//         res.status(200).json({
//             success: true,
//             data: rows[0]
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };

const getSubscriptionById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Subscription ID is required' });
        }

        const [rows] = await db.execute(`
            SELECT 
                -- Subscription Details
                sp.id AS subscription_id,
                sp.transaction_id,
                sp.student_id,
                sp.campus_id,
                sp.outlet_id,
                sp.plan_name,
                sp.original_price,
                sp.discount_amount,
                sp.payable_amount,
                sp.purchase_month,
                sp.validity_start,
                sp.validity_end,
                sp.payment_status,
                sp.payment_method,
                sp.rejection_reason,
                sp.created_at AS subscription_created_at,

                -- Student Details
                s.full_name AS student_name,
                s.phone AS student_mobile,
                s.profile_image AS student_image,
                s.role AS student_role,
                s.status AS student_status,          -- ✅ NEW: students.status fetch kiya
                s.roll_number,
                s.room_number,
                s.hostel_name,
                s.address,
                s.area,
                s.pin_code,

                -- Campus Details
                c.name AS campus_name,
                c.institution_name AS campus_institution,

                -- Outlet Details
                o.name AS outlet_name,
                o.section AS outlet_section

            FROM subscriptions_payments sp
            LEFT JOIN students s ON sp.student_id = s.id
            LEFT JOIN campuses c ON sp.campus_id = c.id
            LEFT JOIN outlets o ON sp.outlet_id = o.id
            WHERE sp.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        const row = rows[0];

        // Case-insensitive check — fixes "STUDENT" vs "student" mismatch
        const role = (row.student_role || '').trim().toLowerCase();
        const isStudent = role === 'student';

        // ✅ students.status ke hisaab se subscriptionStatus decide karo
        const studentStatus = String(row.student_status || '').trim().toUpperCase();
        const subscriptionStatus = studentStatus === 'ACTIVE_SUBSCRIBED'
            ? 'SUCCESS'
            : 'PENDING';

        // Build the final response object
        const responseData = {
            // Subscription Details
            subscription_id: row.subscription_id,
            transaction_id: row.transaction_id,
            student_id: row.student_id,
            campus_id: row.campus_id,
            outlet_id: row.outlet_id,
            plan_name: row.plan_name,
            original_price: row.original_price,
            discount_amount: row.discount_amount,
            payable_amount: row.payable_amount,
            purchase_month: row.purchase_month,
            validity_start: row.validity_start,
            validity_end: row.validity_end,
            payment_status: row.payment_status,
            payment_method: row.payment_method,
            rejection_reason: row.rejection_reason,
            subscription_created_at: row.subscription_created_at,

            // ✅ NEW: Subscription Status (student status based)
            subscriptionStatus,

            // Student basic details
            student_name: row.student_name,
            student_mobile: row.student_mobile,
            student_image: row.student_image,
            student_role: row.student_role,

            // Campus
            campus_name: row.campus_name,
            campus_institution: row.campus_institution,

            // Outlet
            outlet_name: row.outlet_name,
            outlet_section: row.outlet_section
        };

        if (isStudent) {
            responseData.type = 'student';
            responseData.roll_no = row.roll_number;
            responseData.room_no = row.room_number;
            responseData.hostel_name = row.hostel_name;
        } else {
            responseData.type = 'non_student';
            responseData.address = row.address;
            responseData.area_locality = row.area;
            responseData.pincode = row.pin_code;
        }

        res.status(200).json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const updateSubscriptionStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }

        // Only these 6 fields are allowed to be updated
        const allowedFields = {
            roll_no: 'roll_number',
            room_no: 'room_number',
            hostel_name: 'hostel_name',
            address: 'address',
            area_locality: 'area',
            pincode: 'pin_code'
        };

        const updates = [];
        const values = [];

        // Loop through allowed fields and pick only those present in req.body
        for (const [bodyKey, dbColumn] of Object.entries(allowedFields)) {
            if (req.body[bodyKey] !== undefined) {
                updates.push(`${dbColumn} = ?`);
                values.push(req.body[bodyKey]);
            }
        }

        // If nothing valid was sent
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields provided for update. Allowed fields: roll_no, room_no, hostel_name, address, area_locality, pincode'
            });
        }

        // Check student exists
        const [existing] = await db.execute(
            'SELECT id FROM students WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Add id at the end for WHERE clause
        values.push(id);

        const query = `UPDATE students SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(query, values);

        // Fetch updated record to return
        const [updatedRows] = await db.execute(
            `SELECT 
                id, full_name, phone, email, role,
                roll_number AS roll_no,
                room_number AS room_no,
                hostel_name,
                address,
                area AS area_locality,
                pin_code AS pincode
             FROM students WHERE id = ?`,
            [id]
        );

        return res.status(200).json({
            success: true,
            message: 'Student details updated successfully',
            data: updatedRows[0]
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// ==========================================
// ⭐ Approve or Reject Subscription
// @desc    Agar status = 'Success' → subscriptions_payments.payment_status update + students.status = 'ACTIVE_SUBSCRIBED'
//          Agar status = 'Rejected' → sirf subscriptions_payments.payment_status update
// @route   PATCH /api/payment/approve-reject
// @body    { subscription_id, status, rejection_reason (optional) }
// ==========================================

// const approveOrRejectSubscription = async (req, res) => {
//     let connection;
//     let transactionStarted = false;

//     try {
//         const {
//             subscription_id,
//             status,
//             rejection_reason
//         } = req.body;

//         // ==================== VALIDATION ====================
//         if (!subscription_id) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'subscription_id is required'
//             });
//         }

//         if (!status) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'status is required (Success or Rejected)'
//             });
//         }

//         const allowedStatuses = ['Success', 'Rejected'];

//         if (!allowedStatuses.includes(status)) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
//             });
//         }

//         if (
//             status === 'Rejected' &&
//             (!rejection_reason || !String(rejection_reason).trim())
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'rejection_reason is required when status is Rejected'
//             });
//         }

//         // ==================== DATABASE CONNECTION ====================
//         connection = await db.getConnection();

//         await connection.beginTransaction();
//         transactionStarted = true;

//         // ==================== CHECK PAYMENT ====================
//         const [existing] = await connection.execute(
//             `SELECT *
//              FROM subscriptions_payments
//              WHERE id = ?
//              FOR UPDATE`,
//             [subscription_id]
//         );

//         if (existing.length === 0) {
//             await connection.rollback();
//             transactionStarted = false;

//             return res.status(404).json({
//                 success: false,
//                 message: 'Subscription not found'
//             });
//         }

//         const subscription = existing[0];

//         // ==================== ALREADY PROCESSED CHECK ====================
//         if (
//             subscription.payment_status === 'Success' ||
//             subscription.payment_status === 'Rejected'
//         ) {
//             await connection.rollback();
//             transactionStarted = false;

//             return res.status(400).json({
//                 success: false,
//                 message: `Subscription already ${subscription.payment_status}. Cannot update again.`
//             });
//         }

//         // =====================================================
//         // CASE 1: APPROVE SUBSCRIPTION
//         // =====================================================
//         if (status === 'Success') {
//             const studentId = subscription.student_id;
//             const planId = subscription.plan_id;

//             if (!studentId || !planId) {
//                 await connection.rollback();
//                 transactionStarted = false;

//                 return res.status(400).json({
//                     success: false,
//                     message: 'student_id or plan_id is missing in subscriptions_payments'
//                 });
//             }

//             // ==================== GET SUBSCRIPTION PLAN ====================
//             const [planRows] = await connection.execute(
//                 `SELECT id, monthly_wash_limit_kg
//                  FROM subscription_plans
//                  WHERE id = ?
//                  LIMIT 1`,
//                 [planId]
//             );

//             if (planRows.length === 0) {
//                 await connection.rollback();
//                 transactionStarted = false;

//                 return res.status(404).json({
//                     success: false,
//                     message: 'Subscription plan not found'
//                 });
//             }

//             const plan = planRows[0];

//             // ==================== GET VALIDITY DATES ====================
//             // Actual columns in subscriptions_payments:
//             // validity_start and validity_end

//             const startDate = subscription.validity_start;
//             const endDate = subscription.validity_end;

//             if (!startDate || !endDate) {
//                 await connection.rollback();
//                 transactionStarted = false;

//                 return res.status(400).json({
//                     success: false,
//                     message: 'validity_start and validity_end are required in subscriptions_payments'
//                 });
//             }

//             // ==================== GET TOTAL QUOTA ====================
//             const quotaKgTotal =
//                 Number(plan.monthly_wash_limit_kg) || 0;

//             // ==================== INSERT STUDENT SUBSCRIPTION ====================
//             const [insertResult] = await connection.execute(
//                 `INSERT INTO student_subscriptions (
//                     student_id,
//                     plan_id,
//                     start_date,
//                     end_date,
//                     quota_kg_total,
//                     quota_kg_used,
//                     status,
//                     created_at
//                 ) VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', NOW())`,
//                 [
//                     studentId,
//                     planId,
//                     startDate,
//                     endDate,
//                     quotaKgTotal
//                 ]
//             );

//             // ==================== UPDATE PAYMENT STATUS ====================
//             await connection.execute(
//                 `UPDATE subscriptions_payments
//                  SET payment_status = 'Success',
//                      rejection_reason = NULL
//                  WHERE id = ?`,
//                 [subscription_id]
//             );

//             // ==================== UPDATE STUDENT STATUS ====================
//             await connection.execute(
//                 `UPDATE students
//                  SET status = 'ACTIVE_SUBSCRIBED'
//                  WHERE id = ?`,
//                 [studentId]
//             );

//             // ==================== COMMIT TRANSACTION ====================
//             await connection.commit();
//             transactionStarted = false;

//             return res.status(200).json({
//                 success: true,
//                 message: 'Subscription approved successfully',
//                 data: {
//                     subscription_id: subscription_id,
//                     payment_status: 'Success',
//                     student_id: studentId,
//                     student_status: 'ACTIVE_SUBSCRIBED',
//                     student_subscription_id: insertResult.insertId,
//                     plan_id: planId,
//                     start_date: startDate,
//                     end_date: endDate,
//                     quota_kg_total: quotaKgTotal,
//                     quota_kg_used: 0,
//                     subscription_status: 'ACTIVE'
//                 }
//             });
//         }

//         // =====================================================
//         // CASE 2: REJECT SUBSCRIPTION
//         // =====================================================
//         if (status === 'Rejected') {
//             const reason = String(rejection_reason).trim();

//             await connection.execute(
//                 `UPDATE subscriptions_payments
//                  SET payment_status = 'Rejected',
//                      rejection_reason = ?
//                  WHERE id = ?`,
//                 [reason, subscription_id]
//             );

//             await connection.commit();
//             transactionStarted = false;

//             return res.status(200).json({
//                 success: true,
//                 message: 'Subscription rejected successfully',
//                 data: {
//                     subscription_id: subscription_id,
//                     payment_status: 'Rejected',
//                     rejection_reason: reason
//                 }
//             });
//         }

//     } catch (error) {
//         if (connection && transactionStarted) {
//             try {
//                 await connection.rollback();
//             } catch (rollbackError) {
//                 console.error(
//                     'Transaction rollback error:',
//                     rollbackError
//                 );
//             }
//         }

//         console.error(
//             'approveOrRejectSubscription error:',
//             error
//         );

//         return res.status(500).json({
//             success: false,
//             message: 'Server Error'
//         });

//     } finally {
//         if (connection) {
//             connection.release();
//         }
//     }
// };

const approveOrRejectSubscription = async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        const { subscription_id, status, rejection_reason } = req.body;

        // ==================== BASIC VALIDATION ====================
        if (!subscription_id) {
            return res.status(400).json({
                success: false,
                message: 'subscription_id is required'
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'status is required (Success or Rejected)'
            });
        }

        const allowedStatuses = ['Success', 'Rejected'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
            });
        }

        if (
            status === 'Rejected' &&
            (!rejection_reason || !String(rejection_reason).trim())
        ) {
            return res.status(400).json({
                success: false,
                message: 'rejection_reason is required when status is Rejected'
            });
        }

        // ==================== DB CONNECTION ====================
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        // ==================== CHECK SUBSCRIPTION ====================
        const [existing] = await connection.execute(
            `SELECT * FROM subscriptions_payments WHERE id = ? FOR UPDATE`,
            [subscription_id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }

        const subscription = existing[0];

        // ==================== ALREADY PROCESSED ====================
        if (
            //subscription.payment_status === 'Success' ||
            subscription.payment_status === 'Rejected'
        ) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(400).json({
                success: false,
                message: `Subscription already ${subscription.payment_status}. Cannot update again.`
            });
        }

        // =====================================================
        // CASE 1: APPROVE
        // =====================================================
        if (status === 'Success') {
            const studentId = subscription.student_id;
            const planId = subscription.plan_id;

            if (!studentId || !planId) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({
                    success: false,
                    message: 'student_id or plan_id is missing in subscriptions_payments'
                });
            }

            // ==================== FETCH STUDENT ====================
            const [studentRows] = await connection.execute(
                `SELECT 
                    id,
                    role,
                    roll_number,
                    room_number,
                    hostel_name,
                    address,
                    area,
                    pin_code
                 FROM students
                 WHERE id = ?
                 LIMIT 1`,
                [studentId]
            );

            if (studentRows.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(404).json({
                    success: false,
                    message: 'Student not found'
                });
            }

            const student = studentRows[0];
            const role = String(student.role || '').trim().toLowerCase();

            // ==================== ROLE BASED VALIDATION ====================
            if (role === 'student') {
                // Student → roll no, room no, hostel name zaroori hai
                const missing = [];

                if (student.roll_number === null || student.roll_number === undefined || String(student.roll_number).trim() === '') {
                    missing.push('roll_no');
                }
                if (student.room_number === null || student.room_number === undefined || String(student.room_number).trim() === '') {
                    missing.push('room_no');
                }
                if (student.hostel_name === null || student.hostel_name === undefined || String(student.hostel_name).trim() === '') {
                    missing.push('hostel_name');
                }

                if (missing.length > 0) {
                    await connection.rollback();
                    transactionStarted = false;
                    return res.status(400).json({
                        success: false,
                        message: `Validation failed. Student ke ye fields missing hain: ${missing.join(', ')}`,
                        missing_fields: missing,
                        student_type: 'student'
                    });
                }

            } else {
                // Non Student → address, area, pincode zaroori hai
                const missing = [];

                if (student.address === null || student.address === undefined || String(student.address).trim() === '') {
                    missing.push('address');
                }
                if (student.area === null || student.area === undefined || String(student.area).trim() === '') {
                    missing.push('area_locality');
                }
                if (student.pin_code === null || student.pin_code === undefined || String(student.pin_code).trim() === '') {
                    missing.push('pincode');
                }

                if (missing.length > 0) {
                    await connection.rollback();
                    transactionStarted = false;
                    return res.status(400).json({
                        success: false,
                        message: `Validation failed. Non-student ke ye fields missing hain: ${missing.join(', ')}`,
                        missing_fields: missing,
                        student_type: 'non_student'
                    });
                }
            }

            // ==================== GET PLAN ====================
            const [planRows] = await connection.execute(
                `SELECT id, monthly_wash_limit_kg FROM subscription_plans WHERE id = ? LIMIT 1`,
                [planId]
            );

            if (planRows.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(404).json({
                    success: false,
                    message: 'Subscription plan not found'
                });
            }

            const plan = planRows[0];

            const startDate = subscription.validity_start;
            const endDate = subscription.validity_end;

            if (!startDate || !endDate) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({
                    success: false,
                    message: 'validity_start and validity_end are required in subscriptions_payments'
                });
            }

            const quotaKgTotal = Number(plan.monthly_wash_limit_kg) || 0;

            // ==================== INSERT STUDENT SUBSCRIPTION ====================
            const [insertResult] = await connection.execute(
                `INSERT INTO student_subscriptions (
                    student_id, plan_id, start_date, end_date,
                    quota_kg_total, quota_kg_used, status, created_at
                ) VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', NOW())`,
                [studentId, planId, startDate, endDate, quotaKgTotal]
            );

            // ==================== UPDATE PAYMENT ====================
            await connection.execute(
                `UPDATE subscriptions_payments
                 SET payment_status = 'Success', rejection_reason = NULL
                 WHERE id = ?`,
                [subscription_id]
            );

            // ==================== UPDATE STUDENT ====================
            await connection.execute(
                `UPDATE students SET status = 'ACTIVE_SUBSCRIBED' WHERE id = ?`,
                [studentId]
            );

            await connection.commit();
            transactionStarted = false;

            return res.status(200).json({
                success: true,
                message: 'Subscription approved successfully',
                data: {
                    subscription_id,
                    payment_status: 'Success',
                    student_id: studentId,
                    student_type: role === 'student' ? 'student' : 'non_student',
                    student_status: 'ACTIVE_SUBSCRIBED',
                    student_subscription_id: insertResult.insertId,
                    plan_id: planId,
                    start_date: startDate,
                    end_date: endDate,
                    quota_kg_total: quotaKgTotal,
                    quota_kg_used: 0,
                    subscription_status: 'ACTIVE'
                }
            });
        }

        // =====================================================
        // CASE 2: REJECT
        // =====================================================
        if (status === 'Rejected') {
            const reason = String(rejection_reason).trim();

            await connection.execute(
                `UPDATE subscriptions_payments
                 SET payment_status = 'Rejected', rejection_reason = ?
                 WHERE id = ?`,
                [reason, subscription_id]
            );

            await connection.commit();
            transactionStarted = false;

            return res.status(200).json({
                success: true,
                message: 'Subscription rejected successfully',
                data: {
                    subscription_id,
                    payment_status: 'Rejected',
                    rejection_reason: reason
                }
            });
        }

    } catch (error) {
        if (connection && transactionStarted) {
            try { await connection.rollback(); } catch (e) { console.error('Rollback error:', e); }
        }
        console.error('approveOrRejectSubscription error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    } finally {
        if (connection) connection.release();
    }
};


// ==================================================
// Helper: Format Order Status Label
// ==================================================
const formatOrderStatus = (status) => {
    switch (status) {
        case 'RECEIVED': return 'Received';
        case 'IN_WASH': return 'In Wash';
        case 'READY_FOR_COLLECTION': return 'Ready for Collection';
        case 'COLLECTED': return 'Collected';
        case 'CANCELLED': return 'Cancelled';
        default: return status;
    }
};



// ==================================================
// 1. GET ORDER LIST (Role-Based + Validation)
// ==================================================

const getOrderList = async (req, res) => {
    try {
        // 1. URL ya Token se ID aur Role nikaalo
        const userId = req.query.user_id || req.user?.id;
        const requestedRole = (req.query.role || req.user?.role || '').toUpperCase();

        if (!userId || !requestedRole) {
            return errorResponse(res, 'Please provide user_id and role', 401);
        }

        // 2. Users table se actual 'roles' array fetch karo (Validation ke liye)
        const [userRows] = await db.query(
            `SELECT role, roles FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );

        if (userRows.length === 0) {
            return errorResponse(res, 'User not found', 404);
        }

        let dbRoles = [];
        try {
            dbRoles = userRows[0].roles 
                ? (typeof userRows[0].roles === 'string' ? JSON.parse(userRows[0].roles) : userRows[0].roles) 
                : [];
        } catch (e) {
            dbRoles = [userRows[0].role];
        }

        // 3. Security Check: Kya user ke paas URL me maanga gaya role hai?
        const hasAccess = 
            dbRoles.includes(requestedRole) || 
            userRows[0].role === requestedRole || 
            userRows[0].role === 'BOTH' || 
            requestedRole === 'SUPER_ADMIN';

        if (!hasAccess) {
            return errorResponse(res, `Access denied. You do not have ${requestedRole} privileges.`, 403);
        }

        // Filters aur Pagination params
        const {
            search = '',
            status,
            date,           
            from_date,
            to_date,
            page = 1,
            limit = 10,
            targetOutletId, 
            targetCampusId  
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // --- Apply Access Control Filters ---
        let whereClauses = [];
        let params = [];

        // A. STUDENT / NON-STUDENT
        if (requestedRole === 'STUDENT' || requestedRole === 'NON-STUDENT' || requestedRole === 'NON_STUDENT') {
            whereClauses.push(`o.student_id = ?`);
            params.push(Number(userId));
        } 
        
        // B. RECEPTIONIST 
        else if (requestedRole === 'RECEPTIONIST') {
            const [recAssignments] = await db.query(
                `SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ?`,
                [userId]
            );
            if (recAssignments.length === 0) {
                return successResponse(res, 'No outlets assigned as receptionist', { stats: { all:0, received:0, inWash:0, ready:0, collected:0 }, data: [], pagination: {} });
            }
            const outletIds = recAssignments.map(r => r.outlet_id);
            const placeholders = outletIds.map(() => '?').join(',');
            whereClauses.push(`o.outlet_id IN (${placeholders})`);
            params.push(...outletIds);
        } 
        
        // C. OUTLET MANAGER 
        else if (requestedRole === 'OUTLET_MANAGER') {
            const [mgrAssignments] = await db.query(
                `SELECT outlet_id FROM user_outlets WHERE user_id = ?`,
                [userId]
            );
            if (mgrAssignments.length === 0) {
                return successResponse(res, 'No outlets assigned as manager', { stats: { all:0, received:0, inWash:0, ready:0, collected:0 }, data: [], pagination: {} });
            }
            const outletIds = mgrAssignments.map(r => r.outlet_id);
            const placeholders = outletIds.map(() => '?').join(',');
            whereClauses.push(`o.outlet_id IN (${placeholders})`);
            params.push(...outletIds);
        } 
        
        // D. SUPER ADMIN
        else if (requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN') {
            if (targetOutletId) {
                whereClauses.push(`o.outlet_id = ?`);
                params.push(Number(targetOutletId));
            }
            if (targetCampusId) {
                whereClauses.push(`o.campus_id = ?`);
                params.push(Number(targetCampusId));
            }
        } else {
            return errorResponse(res, 'Invalid role', 403);
        }

        // --- Common Filters ---
        if (search && search.trim() !== '') {
            whereClauses.push(`(
                o.order_code LIKE ?
                OR o.token_no LIKE ?
                OR o.customer_name LIKE ?
                OR o.customer_mobile LIKE ?
            )`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
        }

        if (date) {
            whereClauses.push(`DATE(o.order_date) = ?`);
            params.push(date);
        } else {
            if (from_date) {
                whereClauses.push(`DATE(o.order_date) >= ?`);
                params.push(from_date);
            }
            if (to_date) {
                whereClauses.push(`DATE(o.order_date) <= ?`);
                params.push(to_date);
            }
        }

        // --- Fetch Stats ---
        let statsWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        const [statsRows] = await db.query(
            `
            SELECT
                COUNT(*) AS total_all,
                SUM(CASE WHEN o.status = 'RECEIVED' THEN 1 ELSE 0 END) AS total_received,
                SUM(CASE WHEN o.status = 'IN_WASH' THEN 1 ELSE 0 END) AS total_in_wash,
                SUM(CASE WHEN o.status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) AS total_ready,
                SUM(CASE WHEN o.status = 'COLLECTED' THEN 1 ELSE 0 END) AS total_collected
            FROM orders o
            ${statsWhereSQL}
            `,
            params
        );

        const stats = {
            all: Number(statsRows[0].total_all) || 0,
            received: Number(statsRows[0].total_received) || 0,
            inWash: Number(statsRows[0].total_in_wash) || 0,
            ready: Number(statsRows[0].total_ready) || 0,
            collected: Number(statsRows[0].total_collected) || 0
        };

        // --- Apply Status Filter ---
        if (status && status !== 'All' && status !== 'ALL') {
            whereClauses.push(`o.status = ?`);
            params.push(status);
        }

        const finalWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Pagination Count ---
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM orders o ${finalWhereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // --- Fetch Data ---
        const [rows] = await db.query(
            `
            SELECT
                o.id, o.order_code, o.token_no, o.order_date,
                o.customer_name, o.customer_mobile, o.customer_type,
                o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
                o.final_amount, o.payment_status, o.status,
                c.name AS campus_name,
                outl.name AS outlet_name,
                outl.section AS outlet_section,
                
                -- 🆕 Customer ki profile image fetch karne ke liye students table ka join
                s.profile_image AS customer_image

            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN students s ON s.id = o.student_id  -- 🆕 Join with students table
            
            ${finalWhereSQL}
            ORDER BY o.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        const data = rows.map(r => {
            // Image ka full URL generate karo
            const imageUrl = r.customer_image 
                ? `https://instawash.siberiancrane.tech/uploads/${r.customer_image}` 
                : null;

            return {
                id: r.id,
                orderCode: r.order_code,
                tokenNo: r.token_no,
                orderDate: r.order_date,
                customer: {
                    name: r.customer_name,
                    mobile: r.customer_mobile,
                    type: r.customer_type,
                    image: imageUrl // 🆕 Image add ho gayi
                },
                campus: r.campus_name,
                outlet: r.outlet_name,
                weight: {
                    totalWeightKg: Number(r.total_weight_kg) || 0,
                    subscriptionUsageKg: Number(r.subscription_usage_kg) || 0,
                    extraPaygKg: Number(r.extra_payg_kg) || 0
                },
                amount: Number(r.final_amount) || 0,
                paymentStatus: r.payment_status,
                status: r.status,
                statusLabel: formatOrderStatus(r.status)
            };
        });

        return successResponse(res, 'Orders fetched successfully', {
            filters_applied: {
                role: requestedRole,
                user_id: userId
            },
            stats,
            data,
            pagination: {
                total: totalRecords,
                page: pageNum,
                limit: limitNum,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1
            }
        });

    } catch (error) {
        console.error('❌ Get Order List Error:', error);
        return errorResponse(res, 'Failed to fetch order list', 500);
    }
};
// ==================================================
// 2. GET ORDER DETAILS BY ID
// ==================================================
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return errorResponse(res, 'Order ID is required', 400);
        }

        // Order fetch karo with joins
        const [orders] = await db.query(
            `
            SELECT
                o.*,
                c.name AS campus_name,
                outl.name AS outlet_name,
                outl.section AS outlet_section
            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            WHERE o.id = ?
            LIMIT 1
            `,
            [id]
        );

        if (orders.length === 0) {
            return errorResponse(res, 'Order not found', 404);
        }

        const o = orders[0];

        // ==================================================
        // FETCH CUSTOMER IMAGE & DETAILS FROM 'students' TABLE
        // ==================================================
        let customerImage = null;
        let studentDetails = null;

        if (o.student_id) {
            const [studentRows] = await db.query(
                `SELECT id, full_name, profile_image, role, gender, roll_number, hostel_name FROM students WHERE id = ? LIMIT 1`,
                [o.student_id]
            );

            if (studentRows.length > 0) {
                studentDetails = studentRows[0];
                // Image ka full URL banayein (jaisa profile API me kiya tha)
                customerImage = studentDetails.profile_image 
                    ? `https://instawash.siberiancrane.tech/uploads/${studentDetails.profile_image}` 
                    : null;
            }
        }

        // ==================================================
        // FETCH STATUS LOGS + STAFF WHO CHANGED IT
        // ==================================================
        const [logs] = await db.query(
            `
            SELECT 
                osl.id, osl.status, osl.remarks, osl.created_at,
                u.name AS changed_by_name, u.role AS changed_by_role, u.image AS staff_image
            FROM order_status_logs osl
            LEFT JOIN users u ON u.id = osl.changed_by
            WHERE osl.order_id = ?
            ORDER BY osl.created_at ASC
            `,
            [id]
        );

        // Subscription Usage Logs
        const [usageLogs] = await db.query(
            `SELECT * FROM subscription_usage_logs WHERE order_id = ? LIMIT 1`,
            [id]
        );

        // Services parse
        let servicesArr = [];
        try {
            servicesArr = o.services
                ? (typeof o.services === 'string' ? JSON.parse(o.services) : o.services)
                : [];
        } catch (e) {
            servicesArr = [];
        }

        // Format Data
        const data = {
            id: o.id,
            orderCode: o.order_code,
            tokenNo: o.token_no,
            orderDate: o.order_date,
            status: o.status,
            statusLabel: formatOrderStatus(o.status),

            customer: {
                id: o.student_id,
                name: o.customer_name,
                mobile: o.customer_mobile,
                type: o.customer_type,
                
                // 🆕 Student Table se Extra Details
                image: customerImage,
                fullName: studentDetails?.full_name || o.customer_name,
                gender: studentDetails?.gender || null,
                rollNumber: studentDetails?.roll_number || null,
                hostelName: studentDetails?.hostel_name || null,
                dbRole: studentDetails?.role || null 
            },

            campus: {
                id: o.campus_id,
                name: o.campus_name
            },

            outlet: {
                id: o.outlet_id,
                name: o.outlet_name,
                section: o.outlet_section
            },

            // ==================================================
            // WEIGHT DETAILS (Screenshot 2 ke mutabiq)
            // ==================================================
            weight: {
                totalWeightKg: Number(o.total_weight_kg) || 0,
                subscriptionUsageKg: Number(o.subscription_usage_kg) || 0,
                extraPaygKg: Number(o.extra_payg_kg) || 0
            },

            // ==================================================
            // AMOUNT DETAILS (Base, Extra, Discount, Final)
            // ==================================================
            amount: {
                baseAmount: Number(o.subscription_amount) || 0,  // Base Amount (Subscription)
                extraAmount: Number(o.extra_amount) || 0,        // Extra KG Amount
                discountPercent: Number(o.discount_percent) || 0,
                discountAmount: Number(o.discount_amount) || 0,
                finalAmount: Number(o.final_amount) || 0
            },

            // ==================================================
            // PAYMENT DETAILS
            // Note: Aapke orders table me transaction_id aur paid_at nahi hain, 
            // isliye ye null ya default dikhayega. Agar hai to o.transaction_id use karein.
            // ==================================================
            payment: {
                status: o.payment_status || 'TO_BE_PAID_AT_COLLECTION',
                method: o.payment_method || 'N/A',
                paidAmount: o.payment_status === 'PAID' ? Number(o.final_amount) : 0,
                transactionId: o.transaction_id || null, 
                paidAt: o.paid_at || null
            },

            // Timeline format me logs (Staff ki details ke saath)
            timeline: logs.map(log => ({
                status: log.status,
                statusLabel: formatOrderStatus(log.status),
                remarks: log.remarks,
                timestamp: log.created_at,
                updatedBy: log.changed_by_name || 'System',
                role: log.changed_by_role || 'System',
                staffImage: log.staff_image || null
            })),

            subscriptionUsage: usageLogs.length > 0
                ? {
                    subscriptionId: usageLogs[0].subscription_id,
                    quotaUsedKg: Number(usageLogs[0].quota_used_kg),
                    extraPaidKg: Number(usageLogs[0].extra_paid_kg)
                }
                : null,

            services: servicesArr,
            
            // 🆕 Frontend me "Notes" section ke liye
            notes: o.remarks || null,
            remarks: o.remarks || null,

            createdAt: o.created_at,
            updatedAt: o.updated_at
        };

        return successResponse(res, 'Order fetched successfully', data);

    } catch (error) {
        console.error('❌ Get Order By ID Error:', error);
        return errorResponse(res, 'Failed to fetch order', 500);
    }
};


// ==================================================
// 1. GET ORDER LIST (Role-Based + Validation)
// ==================================================
const studentOrderList = async (req, res) => {
    try {
        // 1. URL ya Token se ID aur Role nikaalo
        const userId = req.query.user_id || req.user?.id;
        const requestedRole = (req.query.role || req.user?.role || '').toUpperCase();

        if (!userId || !requestedRole) {
            return errorResponse(res, 'Please provide user_id and role', 401);
        }

        // 2. Users table se actual 'roles' array fetch karo (Validation ke liye)
        const [userRows] = await db.query(
            `SELECT role, roles FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );

        if (userRows.length === 0) {
            return errorResponse(res, 'User not found', 404);
        }

        let dbRoles = [];
        try {
            dbRoles = userRows[0].roles 
                ? (typeof userRows[0].roles === 'string' ? JSON.parse(userRows[0].roles) : userRows[0].roles) 
                : [];
        } catch (e) {
            dbRoles = [userRows[0].role];
        }

        // 3. Security Check: Kya user ke paas URL me maanga gaya role hai?
        const hasAccess = 
            dbRoles.includes(requestedRole) || 
            userRows[0].role === requestedRole || 
            userRows[0].role === 'BOTH' || 
            requestedRole === 'SUPER_ADMIN';

        if (!hasAccess) {
            return errorResponse(res, `Access denied. You do not have ${requestedRole} privileges.`, 403);
        }

        // Filters aur Pagination params
        const {
            search = '',
            status,
            date,           
            from_date,
            to_date,
            page = 1,
            limit = 10,
            targetOutletId, 
            targetCampusId  
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // --- Apply Access Control Filters ---
        let whereClauses = [];
        let params = [];

        // A. STUDENT / NON-STUDENT
        if (requestedRole === 'STUDENT' || requestedRole === 'NON-STUDENT' || requestedRole === 'NON_STUDENT') {
            whereClauses.push(`o.student_id = ?`);
            params.push(Number(userId));
        } 
        
        // B. RECEPTIONIST 
        else if (requestedRole === 'RECEPTIONIST') {
            const [recAssignments] = await db.query(
                `SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ?`,
                [userId]
            );
            if (recAssignments.length === 0) {
                return successResponse(res, 'No outlets assigned as receptionist', { stats: { all:0, received:0, inWash:0, ready:0, collected:0 }, data: [], pagination: {} });
            }
            const outletIds = recAssignments.map(r => r.outlet_id);
            const placeholders = outletIds.map(() => '?').join(',');
            whereClauses.push(`o.outlet_id IN (${placeholders})`);
            params.push(...outletIds);
        } 
        
        // C. OUTLET MANAGER 
        else if (requestedRole === 'OUTLET_MANAGER') {
            const [mgrAssignments] = await db.query(
                `SELECT outlet_id FROM user_outlets WHERE user_id = ?`,
                [userId]
            );
            if (mgrAssignments.length === 0) {
                return successResponse(res, 'No outlets assigned as manager', { stats: { all:0, received:0, inWash:0, ready:0, collected:0 }, data: [], pagination: {} });
            }
            const outletIds = mgrAssignments.map(r => r.outlet_id);
            const placeholders = outletIds.map(() => '?').join(',');
            whereClauses.push(`o.outlet_id IN (${placeholders})`);
            params.push(...outletIds);
        } 
        
        // D. SUPER ADMIN
        else if (requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN') {
            if (targetOutletId) {
                whereClauses.push(`o.outlet_id = ?`);
                params.push(Number(targetOutletId));
            }
            if (targetCampusId) {
                whereClauses.push(`o.campus_id = ?`);
                params.push(Number(targetCampusId));
            }
        } else {
            return errorResponse(res, 'Invalid role', 403);
        }

        // --- Common Filters ---
        if (search && search.trim() !== '') {
            whereClauses.push(`(
                o.order_code LIKE ?
                OR o.token_no LIKE ?
                OR o.customer_name LIKE ?
                OR o.customer_mobile LIKE ?
            )`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
        }

        if (date) {
            whereClauses.push(`DATE(o.order_date) = ?`);
            params.push(date);
        } else {
            if (from_date) {
                whereClauses.push(`DATE(o.order_date) >= ?`);
                params.push(from_date);
            }
            if (to_date) {
                whereClauses.push(`DATE(o.order_date) <= ?`);
                params.push(to_date);
            }
        }

        // --- Fetch Stats (Tabs ke liye) ---
        // Note: Stats ke liye hum 'status' filter nahi laga rahe taaki tabs me sahi count dikhe
        let statsWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        const [statsRows] = await db.query(
            `
            SELECT
                COUNT(*) AS total_all,
                SUM(CASE WHEN o.status = 'RECEIVED' THEN 1 ELSE 0 END) AS total_received,
                SUM(CASE WHEN o.status = 'IN_WASH' THEN 1 ELSE 0 END) AS total_in_wash,
                SUM(CASE WHEN o.status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) AS total_ready,
                SUM(CASE WHEN o.status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) AS total_collected
            FROM orders o
            ${statsWhereSQL}
            `,
            params
        );

        const stats = {
            all: Number(statsRows[0].total_all) || 0,
            received: Number(statsRows[0].total_received) || 0,
            inWash: Number(statsRows[0].total_in_wash) || 0,
            ready: Number(statsRows[0].total_ready) || 0,
            collected: Number(statsRows[0].total_collected) || 0
        };

        // --- Apply Status Filter (ACTIVE vs COMPLETE) ---
        if (status && status.toUpperCase() !== 'ALL') {
            const reqStatus = status.toUpperCase();
            
            if (reqStatus === 'ACTIVE') {
                // Active orders (Received, In Wash, Ready)
                whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
            } 
            else if (reqStatus === 'COMPLETE' || reqStatus === 'COMPLETED') {
                // Completed orders (Collected ya Delivered)
                whereClauses.push(`o.status IN ('COLLECTED', 'DELIVERED')`);
            } 
            else {
                // Agar frontend se specific status aata hai (jaise RECEIVED)
                whereClauses.push(`o.status = ?`);
                params.push(reqStatus);
            }
        }

        const finalWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Pagination Count ---
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM orders o ${finalWhereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // --- Fetch Data ---
        const [rows] = await db.query(
            `
            SELECT
                o.id, o.order_code, o.token_no, o.order_date,
                o.customer_name, o.customer_mobile, o.customer_type,
                o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
                o.final_amount, o.payment_status, o.status,
                c.name AS campus_name,
                outl.name AS outlet_name,
                outl.section AS outlet_section,
                
                s.profile_image AS customer_image

            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN students s ON s.id = o.student_id
            
            ${finalWhereSQL}
            ORDER BY o.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        const data = rows.map(r => {
            const imageUrl = r.customer_image 
                ? `https://instawash.siberiancrane.tech/uploads/${r.customer_image}` 
                : null;

            return {
                id: r.id,
                orderCode: r.order_code,
                tokenNo: r.token_no,
                orderDate: r.order_date,
                customer: {
                    name: r.customer_name,
                    mobile: r.customer_mobile,
                    type: r.customer_type,
                    image: imageUrl
                },
                campus: r.campus_name,
                outlet: r.outlet_name,
                weight: {
                    totalWeightKg: Number(r.total_weight_kg) || 0,
                    subscriptionUsageKg: Number(r.subscription_usage_kg) || 0,
                    extraPaygKg: Number(r.extra_payg_kg) || 0
                },
                amount: Number(r.final_amount) || 0,
                paymentStatus: r.payment_status,
                status: r.status,
                statusLabel: formatOrderStatus(r.status)
            };
        });

        return successResponse(res, 'Orders fetched successfully', {
            filters_applied: {
                role: requestedRole,
                user_id: userId,
                status: status || 'ALL'
            },
            stats,
            data,
            pagination: {
                total: totalRecords,
                page: pageNum,
                limit: limitNum,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1
            }
        });

    } catch (error) {
        console.error('❌ Get Order List Error:', error);
        return errorResponse(res, 'Failed to fetch order list', 500);
    }
};

// ==================================================
// 2. GET ORDER DETAILS BY ID
// ==================================================
const studentOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return errorResponse(res, 'Order ID is required', 400);
        }

        // Order fetch karo with joins
        const [orders] = await db.query(
            `
            SELECT
                o.*,
                c.name AS campus_name,
                outl.name AS outlet_name,
                outl.section AS outlet_section
            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            WHERE o.id = ?
            LIMIT 1
            `,
            [id]
        );

        if (orders.length === 0) {
            return errorResponse(res, 'Order not found', 404);
        }

        const o = orders[0];

        // ==================================================
        // FETCH CUSTOMER IMAGE & DETAILS FROM 'students' TABLE
        // ==================================================
        let customerImage = null;
        let studentDetails = null;

        if (o.student_id) {
            const [studentRows] = await db.query(
                `SELECT id, full_name, profile_image, role, gender, roll_number, hostel_name FROM students WHERE id = ? LIMIT 1`,
                [o.student_id]
            );

            if (studentRows.length > 0) {
                studentDetails = studentRows[0];
                // Image ka full URL banayein (jaisa profile API me kiya tha)
                customerImage = studentDetails.profile_image 
                    ? `https://instawash.siberiancrane.tech/uploads/${studentDetails.profile_image}` 
                    : null;
            }
        }

        // ==================================================
        // FETCH STATUS LOGS + STAFF WHO CHANGED IT
        // ==================================================
        const [logs] = await db.query(
            `
            SELECT 
                osl.id, osl.status, osl.remarks, osl.created_at,
                u.name AS changed_by_name, u.role AS changed_by_role, u.image AS staff_image
            FROM order_status_logs osl
            LEFT JOIN users u ON u.id = osl.changed_by
            WHERE osl.order_id = ?
            ORDER BY osl.created_at ASC
            `,
            [id]
        );

        // Subscription Usage Logs
        const [usageLogs] = await db.query(
            `SELECT * FROM subscription_usage_logs WHERE order_id = ? LIMIT 1`,
            [id]
        );

        // Services parse
        let servicesArr = [];
        try {
            servicesArr = o.services
                ? (typeof o.services === 'string' ? JSON.parse(o.services) : o.services)
                : [];
        } catch (e) {
            servicesArr = [];
        }

        // Format Data
        const data = {
            id: o.id,
            orderCode: o.order_code,
            tokenNo: o.token_no,
            orderDate: o.order_date,
            status: o.status,
            statusLabel: formatOrderStatus(o.status),

            customer: {
                id: o.student_id,
                name: o.customer_name,
                mobile: o.customer_mobile,
                type: o.customer_type,
                
                // 🆕 Student Table se Extra Details
                image: customerImage,
                fullName: studentDetails?.full_name || o.customer_name,
                gender: studentDetails?.gender || null,
                rollNumber: studentDetails?.roll_number || null,
                hostelName: studentDetails?.hostel_name || null,
                dbRole: studentDetails?.role || null 
            },

            campus: {
                id: o.campus_id,
                name: o.campus_name
            },

            outlet: {
                id: o.outlet_id,
                name: o.outlet_name,
                section: o.outlet_section
            },

            // ==================================================
            // WEIGHT DETAILS (Screenshot 2 ke mutabiq)
            // ==================================================
            weight: {
                totalWeightKg: Number(o.total_weight_kg) || 0,
                subscriptionUsageKg: Number(o.subscription_usage_kg) || 0,
                extraPaygKg: Number(o.extra_payg_kg) || 0
            },

            // ==================================================
            // AMOUNT DETAILS (Base, Extra, Discount, Final)
            // ==================================================
            amount: {
                baseAmount: Number(o.subscription_amount) || 0,  // Base Amount (Subscription)
                extraAmount: Number(o.extra_amount) || 0,        // Extra KG Amount
                discountPercent: Number(o.discount_percent) || 0,
                discountAmount: Number(o.discount_amount) || 0,
                finalAmount: Number(o.final_amount) || 0
            },

            // ==================================================
            // PAYMENT DETAILS
            // Note: Aapke orders table me transaction_id aur paid_at nahi hain, 
            // isliye ye null ya default dikhayega. Agar hai to o.transaction_id use karein.
            // ==================================================
            payment: {
                status: o.payment_status || 'TO_BE_PAID_AT_COLLECTION',
                method: o.payment_method || 'N/A',
                paidAmount: o.payment_status === 'PAID' ? Number(o.final_amount) : 0,
                transactionId: o.transaction_id || null, 
                paidAt: o.paid_at || null
            },

            // Timeline format me logs (Staff ki details ke saath)
            timeline: logs.map(log => ({
                status: log.status,
                statusLabel: formatOrderStatus(log.status),
                remarks: log.remarks,
                timestamp: log.created_at,
                updatedBy: log.changed_by_name || 'System',
                role: log.changed_by_role || 'System',
                staffImage: log.staff_image || null
            })),

            subscriptionUsage: usageLogs.length > 0
                ? {
                    subscriptionId: usageLogs[0].subscription_id,
                    quotaUsedKg: Number(usageLogs[0].quota_used_kg),
                    extraPaidKg: Number(usageLogs[0].extra_paid_kg)
                }
                : null,

            services: servicesArr,
            
            // 🆕 Frontend me "Notes" section ke liye
            notes: o.remarks || null,
            remarks: o.remarks || null,

            createdAt: o.created_at,
            updatedAt: o.updated_at
        };

        return successResponse(res, 'Order fetched successfully', data);

    } catch (error) {
        console.error('❌ Get Order By ID Error:', error);
        return errorResponse(res, 'Failed to fetch order', 500);
    }
};

// ==================================================
// GET DASHBOARD (Receptionist & Outlet Manager)
// ==================================================
// const getDashboard = async (req, res) => {
//     try {
//         const userId = req.user?.id || req.query.user_id;
//         const requestedRole = (req.query.role || req.user?.role || '').toUpperCase();
        
//         if (!userId) {
//             return errorResponse(res, 'User ID required', 401);
//         }

//         // ==========================================
//         // 1. Fetch User's Campus and Outlet
//         // ==========================================
//         const [userRows] = await db.query(
//             `SELECT campus_id, outlet_id, name, role FROM users WHERE id = ? LIMIT 1`,
//             [userId]
//         );

//         if (userRows.length === 0) {
//             return errorResponse(res, 'User not found', 404);
//         }

//         const userCampusId = userRows[0].campus_id;
//         const userOutletId = userRows[0].outlet_id;
//         const userName = userRows[0].name;

//         if (!userCampusId || !userOutletId) {
//             return successResponse(res, 'User has no campus/outlet assigned', { data: null });
//         }

//         // ==========================================
//         // 2. DATE LOGIC
//         // ==========================================
//         const dateFilter = (req.query.date_filter || 'today').toLowerCase();
//         const queryStartDate = req.query.start_date;
//         const queryEndDate = req.query.end_date;
        
//         let startDate = '';
//         let endDate = '';
//         let displayDate = "";

//         const today = new Date();
        
//         const formatDateToSQL = (dateStr) => {
//             if (!dateStr) return '';
//             if (dateStr.includes('/')) {
//                 const parts = dateStr.split('/');
//                 if (parts.length === 3) {
//                     return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
//                 }
//             }
//             return dateStr; 
//         };

//         if (queryStartDate && queryEndDate) {
//             startDate = formatDateToSQL(queryStartDate);
//             endDate = formatDateToSQL(queryEndDate);
//             displayDate = `${queryStartDate} to ${queryEndDate}`;
//         } 
//         else if (dateFilter === 'today') {
//             startDate = endDate = today.toISOString().split('T')[0];
//             displayDate = "Today";
//         } 
//         else if (dateFilter === 'yesterday') {
//             const yesterday = new Date(today);
//             yesterday.setDate(today.getDate() - 1);
//             startDate = endDate = yesterday.toISOString().split('T')[0];
//             displayDate = "Yesterday";
//         } 
//         else if (dateFilter === 'this_week') {
//             const firstDay = new Date(today);
//             firstDay.setDate(today.getDate() - today.getDay());
//             const lastDay = new Date(today);
//             lastDay.setDate(today.getDate() - today.getDay() + 6);
//             startDate = firstDay.toISOString().split('T')[0];
//             endDate = lastDay.toISOString().split('T')[0];
//             displayDate = "This Week";
//         }
//         else if (dateFilter === 'this_month') {
//             const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
//             const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
//             startDate = firstDay.toISOString().split('T')[0];
//             endDate = lastDay.toISOString().split('T')[0];
//             displayDate = "This Month";
//         }
//         else {
//             const sqlFormattedDate = formatDateToSQL(dateFilter);
//             startDate = endDate = sqlFormattedDate;
//             displayDate = dateFilter; 
//         }

//         // ==========================================
//         // 3. CUSTOMERS STATS (From Orders)
//         // ==========================================
//         // Students table ke bajaye orders table use kar rahe hain taaki exact data mile
//         const [customerStats] = await db.query(`
//             SELECT 
//                 COUNT(DISTINCT o.student_id) as total_customers,
//                 SUM(CASE WHEN LOWER(s.role) = 'student' THEN 1 ELSE 0 END) as total_students,
//                 SUM(CASE WHEN LOWER(s.role) != 'student' THEN 1 ELSE 0 END) as total_non_students
//             FROM orders o
//             JOIN students s ON s.id = o.student_id
//             WHERE o.campus_id = ? AND o.outlet_id = ?
//         `, [userCampusId, userOutletId]);

//         // ==========================================
//         // 4. ACTIVE SUBSCRIPTIONS
//         // ==========================================
//         // Un students ki subscription count karo jinhone is outlet me order kiya hai
//         const [subStats] = await db.query(`
//             SELECT COUNT(DISTINCT ss.student_id) as active_subs
//             FROM student_subscriptions ss
//             WHERE ss.status = 'ACTIVE' 
//               AND ss.student_id IN (
//                   SELECT DISTINCT student_id FROM orders 
//                   WHERE campus_id = ? AND outlet_id = ?
//               )
//         `, [userCampusId, userOutletId]);

//         // ==========================================
//         // 5. TODAY'S ORDERS
//         // ==========================================
//         const [todayOrders] = await db.query(`
//             SELECT 
//                 COUNT(*) as total,
//                 SUM(CASE WHEN status = 'RECEIVED' THEN 1 ELSE 0 END) as received,
//                 SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) as in_wash,
//                 SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready,
//                 SUM(CASE WHEN status = 'COLLECTED' OR status = 'DELIVERED' THEN 1 ELSE 0 END) as collected
//             FROM orders
//             WHERE campus_id = ? 
//               AND outlet_id = ?
//               AND DATE(order_date) BETWEEN ? AND ?
//         `, [userCampusId, userOutletId, startDate, endDate]);

//         // ==========================================
//         // 6. TODAY'S COLLECTION
//         // ==========================================
//         const [orderCollection] = await db.query(`
//             SELECT 
//                 SUM(final_amount) as total,
//                 SUM(CASE WHEN payment_method = 'CASH' THEN final_amount ELSE 0 END) as cash,
//                 SUM(CASE WHEN payment_method = 'UPI' OR payment_method = 'ONLINE' THEN final_amount ELSE 0 END) as online,
//                 SUM(CASE WHEN payment_method = 'CARD' THEN final_amount ELSE 0 END) as card
//             FROM orders
//             WHERE campus_id = ? 
//               AND outlet_id = ?
//               AND DATE(order_date) BETWEEN ? AND ?
//               AND payment_status IN ('PAID', 'SUCCESS')
//         `, [userCampusId, userOutletId, startDate, endDate]);

//         const [subCollection] = await db.query(`
//             SELECT 
//                 SUM(payable_amount) as total,
//                 SUM(CASE WHEN payment_method = 'CASH' THEN payable_amount ELSE 0 END) as cash,
//                 SUM(CASE WHEN payment_method = 'UPI' OR payment_method = 'ONLINE' THEN payable_amount ELSE 0 END) as online,
//                 SUM(CASE WHEN payment_method = 'CARD' THEN payable_amount ELSE 0 END) as card
//             FROM subscriptions_payments
//             WHERE campus_id = ? 
//               AND outlet_id = ?
//               AND DATE(created_at) BETWEEN ? AND ?
//               AND payment_status = 'SUCCESS'
//         `, [userCampusId, userOutletId, startDate, endDate]);

//         const totalCollection = (Number(orderCollection[0]?.total) || 0) + (Number(subCollection[0]?.total) || 0);
//         const cashCollection = (Number(orderCollection[0]?.cash) || 0) + (Number(subCollection[0]?.cash) || 0);
//         const onlineCollection = (Number(orderCollection[0]?.online) || 0) + (Number(subCollection[0]?.online) || 0);
//         const cardCollection = (Number(orderCollection[0]?.card) || 0) + (Number(subCollection[0]?.card) || 0);

//         // ==========================================
//         // 7. EXTRA LAUNDRY / PAYG & DISCOUNTS
//         // ==========================================
//         const [paygStats] = await db.query(`
//             SELECT 
//                 SUM(extra_payg_kg) as total_extra_kg,
//                 SUM(discount_amount) as total_discount_given
//             FROM orders
//             WHERE campus_id = ? 
//               AND outlet_id = ?
//               AND DATE(order_date) BETWEEN ? AND ?
//         `, [userCampusId, userOutletId, startDate, endDate]);

//         // ==========================================
//         // 8. MANAGEMENT STATS (Only for Outlet Manager)
//         // ==========================================
//         let managementStats = null;

//         if (requestedRole === 'OUTLET_MANAGER' || requestedRole === 'BOTH') {
//             const [staffStats] = await db.query(`
//                 SELECT COUNT(DISTINCT user_id) as total_staff
//                 FROM (
//                     SELECT user_id FROM user_outlets WHERE outlet_id = ?
//                     UNION
//                     SELECT user_id FROM user_outlets_receptionist WHERE outlet_id = ?
//                 ) as all_staff
//             `, [userOutletId, userOutletId]);

//             const [machineStats] = await db.query(`
//                 SELECT COUNT(*) as total_machines 
//                 FROM machines 
//                 WHERE outlet_id = ? 
//                   AND status = 'ACTIVE'
//             `, [userOutletId]);

//             managementStats = {
//                 active_staff: Number(staffStats[0]?.total_staff) || 0,
//                 active_machines: Number(machineStats[0]?.total_machines) || 0
//             };
//         }

//         // ==========================================
//         // 9. FINAL RESPONSE
//         // ==========================================
//         const responseData = {
//             user: {
//                 name: userName || 'User',
//                 role: requestedRole,
//                 campus_id: userCampusId,
//                 outlet_id: userOutletId,
//                 current_date: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
//             },
            
//             filter_info: {
//                 start_date: startDate,
//                 end_date: endDate,
//                 display: displayDate
//             },

//             customers: {
//                 total: Number(customerStats[0]?.total_customers) || 0,
//                 students: Number(customerStats[0]?.total_students) || 0,
//                 non_students: Number(customerStats[0]?.total_non_students) || 0,
//                 active_subscriptions: Number(subStats[0]?.active_subs) || 0
//             },

//             today_orders: {
//                 total: Number(todayOrders[0]?.total) || 0,
//                 received: Number(todayOrders[0]?.received) || 0,
//                 in_wash: Number(todayOrders[0]?.in_wash) || 0,
//                 ready: Number(todayOrders[0]?.ready) || 0,
//                 collected: Number(todayOrders[0]?.collected) || 0
//             },

//             today_collection: {
//                 total: totalCollection,
//                 breakdown: {
//                     cash: cashCollection,
//                     online: onlineCollection,
//                     card: cardCollection
//                 }
//             },

//             extra_laundry: {
//                 payg_kg: Number(paygStats[0]?.total_extra_kg) || 0,
//                 discounts_given: Number(paygStats[0]?.total_discount_given) || 0
//             },

//             management: managementStats
//         };

//         return successResponse(res, 'Dashboard data fetched successfully', responseData);

//     } catch (error) {
//         console.error('❌ Dashboard Error:', error);
//         return errorResponse(res, 'Failed to fetch dashboard data', 500);
//     }
// }; 

const getDashboard = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.user_id;
        const requestedRole = (req.query.role || req.user?.role || '').toUpperCase();
        
        if (!userId) return errorResponse(res, 'User ID required', 401);

        // 1. Fetch User
        const [userRows] = await db.query(
            `SELECT campus_id, outlet_id, name, role FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );
        if (userRows.length === 0) return errorResponse(res, 'User not found', 404);

        const userCampusId = userRows[0].campus_id;
        const userOutletId = userRows[0].outlet_id;
        const userName = userRows[0].name;

        if (!userCampusId || !userOutletId) return successResponse(res, 'User has no campus/outlet assigned', { data: null });

        // ==========================================
        // 2. DATE LOGIC (Agar date hai to us date ka, warna All)
        // ==========================================
        const dateFilter = req.query.date_filter;
        const queryStartDate = req.query.start_date;
        const queryEndDate = req.query.end_date;
        
        let startDate = null;
        let endDate = null;
        let displayDate = "All Time";
        let isDateFilterApplied = false;

        const today = new Date();
        
        const formatDateToSQL = (dateStr) => {
            if (!dateStr) return '';
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            return dateStr; 
        };

        // Agar custom range ya single date aayi hai
        if (queryStartDate && queryEndDate) {
            startDate = formatDateToSQL(queryStartDate);
            endDate = formatDateToSQL(queryEndDate);
            displayDate = `${queryStartDate} to ${queryEndDate}`;
            isDateFilterApplied = true;
        } 
        else if (dateFilter && dateFilter.trim() !== '') {
            const df = dateFilter.toLowerCase();
            if (df === 'today') { startDate = endDate = today.toISOString().split('T')[0]; displayDate = "Today"; }
            else if (df === 'yesterday') {
                const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                startDate = endDate = yesterday.toISOString().split('T')[0]; displayDate = "Yesterday";
            } 
            else if (df === 'this_week') {
                const firstDay = new Date(today); firstDay.setDate(today.getDate() - today.getDay());
                const lastDay = new Date(today); lastDay.setDate(today.getDate() - today.getDay() + 6);
                startDate = firstDay.toISOString().split('T')[0]; endDate = lastDay.toISOString().split('T')[0]; displayDate = "This Week";
            }
            else if (df === 'this_month') {
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                startDate = firstDay.toISOString().split('T')[0]; endDate = lastDay.toISOString().split('T')[0]; displayDate = "This Month";
            }
            else {
                const sqlFormattedDate = formatDateToSQL(dateFilter);
                startDate = endDate = sqlFormattedDate;
                displayDate = dateFilter;
            }
            isDateFilterApplied = true;
        }

        // Date condition string banate hain
        const dateCondition = isDateFilterApplied ? `AND DATE(order_date) BETWEEN '${startDate}' AND '${endDate}'` : '';

        // ==========================================
        // 3. CUSTOMERS STATS (Date Filter Applied)
        // ==========================================
        const [customerStats] = await db.query(`
            SELECT 
                COUNT(DISTINCT o.student_id) as total_customers,
                COUNT(DISTINCT CASE WHEN LOWER(s.role) = 'student' THEN o.student_id END) as total_students,
                COUNT(DISTINCT CASE WHEN LOWER(s.role) != 'student' THEN o.student_id END) as total_non_students
            FROM orders o
            JOIN students s ON s.id = o.student_id
            WHERE o.campus_id = ? AND o.outlet_id = ?
            ${dateCondition}
        `, [userCampusId, userOutletId]);

        // ==========================================
        // 4. ACTIVE SUBSCRIPTIONS (Date Filter Applied)
        // ==========================================
        // Note: Yahan hum unhi subscriptions ko count kar rahe hain jinka order us date range me aaya hai
        const [subStats] = await db.query(`
            SELECT COUNT(DISTINCT ss.student_id) as active_subs
            FROM student_subscriptions ss
            WHERE ss.status = 'ACTIVE' 
              AND ss.student_id IN (
                  SELECT DISTINCT student_id FROM orders 
                  WHERE campus_id = ? AND outlet_id = ?
                  ${dateCondition}
              )
        `, [userCampusId, userOutletId]);

        // ==========================================
        // 5. TODAY'S ORDERS (Date Filter Applied)
        // ==========================================
        const [todayOrders] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'RECEIVED' THEN 1 ELSE 0 END) as received,
                SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) as in_wash,
                SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready,
                SUM(CASE WHEN status = 'COLLECTED' OR status = 'DELIVERED' THEN 1 ELSE 0 END) as collected
            FROM orders
            WHERE campus_id = ? AND outlet_id = ?
            ${dateCondition}
        `, [userCampusId, userOutletId]);

        // ==========================================
        // 6. COLLECTION (Date Filter Applied)
        // ==========================================
        // Orders collection
        const [orderCollection] = await db.query(`
            SELECT 
                SUM(final_amount) as total,
                SUM(CASE WHEN payment_method = 'CASH' THEN final_amount ELSE 0 END) as cash,
                SUM(CASE WHEN payment_method = 'UPI' OR payment_method = 'ONLINE' THEN final_amount ELSE 0 END) as online,
                SUM(CASE WHEN payment_method = 'CARD' THEN final_amount ELSE 0 END) as card
            FROM orders
            WHERE campus_id = ? AND outlet_id = ?
              ${isDateFilterApplied ? `AND DATE(order_date) BETWEEN ? AND ?` : ''}
              AND payment_status IN ('PAID', 'SUCCESS')
        `, isDateFilterApplied ? [userCampusId, userOutletId, startDate, endDate] : [userCampusId, userOutletId]);

        // Subscriptions collection
        const [subCollection] = await db.query(`
            SELECT 
                SUM(payable_amount) as total,
                SUM(CASE WHEN payment_method = 'CASH' THEN payable_amount ELSE 0 END) as cash,
                SUM(CASE WHEN payment_method = 'UPI' OR payment_method = 'ONLINE' THEN payable_amount ELSE 0 END) as online,
                SUM(CASE WHEN payment_method = 'CARD' THEN payable_amount ELSE 0 END) as card
            FROM subscriptions_payments
            WHERE campus_id = ? AND outlet_id = ?
              ${isDateFilterApplied ? `AND DATE(created_at) BETWEEN ? AND ?` : ''}
              AND payment_status = 'SUCCESS'
        `, isDateFilterApplied ? [userCampusId, userOutletId, startDate, endDate] : [userCampusId, userOutletId]);

        const totalCollection = (Number(orderCollection[0]?.total) || 0) + (Number(subCollection[0]?.total) || 0);
        const cashCollection = (Number(orderCollection[0]?.cash) || 0) + (Number(subCollection[0]?.cash) || 0);
        const onlineCollection = (Number(orderCollection[0]?.online) || 0) + (Number(subCollection[0]?.online) || 0);
        const cardCollection = (Number(orderCollection[0]?.card) || 0) + (Number(subCollection[0]?.card) || 0);

        // ==========================================
        // 7. EXTRA LAUNDRY & DISCOUNTS (Date Filter Applied)
        // ==========================================
        const [paygStats] = await db.query(`
            SELECT 
                SUM(extra_payg_kg) as total_extra_kg,
                SUM(discount_amount) as total_discount_given
            FROM orders
            WHERE campus_id = ? AND outlet_id = ?
            ${dateCondition}
        `, [userCampusId, userOutletId]);

        // ==========================================
        // 8. MANAGEMENT STATS (Only for Outlet Manager)
        // ==========================================
        let managementStats = null;
        if (requestedRole === 'OUTLET_MANAGER' || requestedRole === 'BOTH') {
            const [staffStats] = await db.query(`
                SELECT COUNT(DISTINCT user_id) as total_staff
                FROM (
                    SELECT user_id FROM user_outlets WHERE outlet_id = ?
                    UNION
                    SELECT user_id FROM user_outlets_receptionist WHERE outlet_id = ?
                ) as all_staff
            `, [userOutletId, userOutletId]);

            const [machineStats] = await db.query(`
                SELECT COUNT(*) as total_machines 
                FROM machines 
                WHERE outlet_id = ? AND status = 'ACTIVE'
            `, [userOutletId]);

            managementStats = {
                active_staff: Number(staffStats[0]?.total_staff) || 0,
                active_machines: Number(machineStats[0]?.total_machines) || 0
            };
        }

        // ==========================================
        // 9. FINAL RESPONSE
        // ==========================================
        const responseData = {
            user: {
                name: userName || 'User',
                role: requestedRole,
                campus_id: userCampusId,
                outlet_id: userOutletId,
                current_date: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
            },
            filter_info: {
                start_date: startDate,
                end_date: endDate,
                display: displayDate,
                is_filtered: isDateFilterApplied
            },
            customers: {
                total: Number(customerStats[0]?.total_customers) || 0,
                students: Number(customerStats[0]?.total_students) || 0,
                non_students: Number(customerStats[0]?.total_non_students) || 0,
                active_subscriptions: Number(subStats[0]?.active_subs) || 0
            },
            today_orders: {
                total: Number(todayOrders[0]?.total) || 0,
                received: Number(todayOrders[0]?.received) || 0,
                in_wash: Number(todayOrders[0]?.in_wash) || 0,
                ready: Number(todayOrders[0]?.ready) || 0,
                collected: Number(todayOrders[0]?.collected) || 0
            },
            today_collection: {
                total: totalCollection,
                breakdown: {
                    cash: cashCollection,
                    online: onlineCollection,
                    card: cardCollection
                }
            },
            extra_laundry: {
                payg_kg: Number(paygStats[0]?.total_extra_kg) || 0,
                discounts_given: Number(paygStats[0]?.total_discount_given) || 0
            },
            management: managementStats
        };

        return successResponse(res, 'Dashboard data fetched successfully', responseData);

    } catch (error) {
        console.error('❌ Dashboard Error:', error);
        return errorResponse(res, 'Failed to fetch dashboard data', 500);
    }
};

// ==================================================
// RECEPTIONIST: MARK ORDER AS DELIVERED (Collect)
// ==================================================
const markOrderAsDelivered = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const { order_id } = req.params;
        
        // 🆕 Body se status aur payment_method dono nikalenge
        const { 
            status = 'DELIVERED', // Default DELIVERED agar frontend se nahi aaya
            payment_method 
        } = req.body; 

        const userId = req.user?.id || req.user_id; 
        const userRole = (req.user?.role || req.role || '').toUpperCase();

        if (!order_id) {
            await connection.rollback();
            return errorResponse(res, 'Order ID is required', 400);
        }

        // 1. Order details fetch karo
        const [orders] = await connection.query(
            `SELECT id, status, outlet_id, final_amount, payment_status, payment_method FROM orders WHERE id = ? LIMIT 1`,
            [order_id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return errorResponse(res, 'Order not found', 404);
        }

        const order = orders[0];

        // 2. Validation: Status check
        if (order.status === 'COLLECTED' || order.status === 'DELIVERED') {
            await connection.rollback();
            return errorResponse(res, 'Order is already collected/delivered', 400);
        }

        if (order.status !== 'READY_FOR_COLLECTION') {
            await connection.rollback();
            return errorResponse(res, 'Order is not ready for collection yet', 400);
        }

        // 3. Validate the requested status (sirf DELIVERED ya COLLECTED allowed hain collect karte waqt)
        const requestedStatus = status.toUpperCase();
        if (requestedStatus !== 'DELIVERED' && requestedStatus !== 'COLLECTED') {
            await connection.rollback();
            return errorResponse(res, 'Invalid status. Only DELIVERED or COLLECTED allowed here.', 400);
        }

        // 4. Validation: Outlet check (Security)
        // if (userRole !== 'SUPER_ADMIN') {
        //     const [assigned] = await connection.query(
        //         `
        //         SELECT outlet_id FROM user_outlets WHERE user_id = ? AND outlet_id = ?
        //         UNION
        //         SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ? AND outlet_id = ?
        //         `,
        //         [userId, order.outlet_id, userId, order.outlet_id]
        //     );

        //     if (assigned.length === 0) {
        //         await connection.rollback();
        //         return errorResponse(res, 'You are not authorized to collect orders from this outlet', 403);
        //     }
        // }

        // 5. 🆕 Payment Logic
        let finalPaymentMethod = order.payment_method;
        let finalPaymentStatus = order.payment_status;

        if (payment_method) {
            finalPaymentMethod = payment_method.toUpperCase();
            
            // Agar pending tha to PAID ho jayega
            if (order.payment_status === 'PENDING' || order.payment_status === 'TO_BE_PAID_AT_COLLECTION') {
                finalPaymentStatus = 'PAID'; 
            }
        }

        // 6. Update Order Status, Payment Status & Payment Method
        await connection.query(
            `UPDATE orders 
             SET status = ?, 
                 payment_method = ?, 
                 payment_status = ?, 
                 updated_at = NOW() 
             WHERE id = ?`,
            [requestedStatus, finalPaymentMethod, finalPaymentStatus, order_id]
        );

        // 7. Insert into Status Logs (for timeline)
        const logMessage = payment_method 
            ? `Order marked as ${requestedStatus}. Payment collected via ${finalPaymentMethod}.`
            : `Order marked as ${requestedStatus}.`;

        await connection.query(
            `INSERT INTO order_status_logs (order_id, status, remarks, changed_by) VALUES (?, ?, ?, ?)`,
            [order_id, requestedStatus, logMessage, userId]
        );

        await connection.commit();

        return successResponse(res, 'Order updated successfully', {
            order_id: Number(order_id),
            status: requestedStatus,
            status_label: requestedStatus === 'DELIVERED' ? 'Delivered' : 'Collected',
            payment_method: finalPaymentMethod,
            payment_status: finalPaymentStatus,
            message: 'Clothes have been handed over to the customer.'
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Mark Order Delivered Error:', error);
        return errorResponse(res, 'Failed to deliver order', 500);
    } finally {
        connection.release();
    }
};

// ==================================================
// GET REPORTS (Strictly by Token & Outlet)
// ==================================================
// const getReportsData = async (req, res) => {
//     try {
//         // 🆕 Sirf Token se ID lega, query param se nahi
//         const userId = req.user?.id || req.student?.id; 
//         if (!userId) {
//             return errorResponse(res, 'Unauthorized: User ID not found in token', 401);
//         }

//         // 1. User ka outlet fetch karo (users table se)
//         const [userRows] = await db.query(
//             `SELECT outlet_id FROM users WHERE id = ? LIMIT 1`, 
//             [userId]
//         );

//         if (userRows.length === 0 || !userRows[0].outlet_id) {
//             return errorResponse(res, 'User not found or no outlet assigned', 404);
//         }

//         const userOutletId = userRows[0].outlet_id;

//         // ==========================================
//         // FILTER 1: Global Date Range (start_date & end_date)
//         // ==========================================
//         const today = new Date();
//         const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
//         const startDate = req.query.start_date || firstDayOfMonth.toISOString().split('T')[0];
//         const endDate = req.query.end_date || today.toISOString().split('T')[0];

//         // ==========================================
//         // FILTER 2: Order Summary Timeframe (daily/weekly/monthly)
//         // ==========================================
//         const orderFilter = (req.query.order_filter || 'daily').toLowerCase();
        
//         let orderSummaryDateCondition = '';
//         if (orderFilter === 'daily') {
//             orderSummaryDateCondition = `DATE(order_date) = CURDATE()`;
//         } else if (orderFilter === 'weekly') {
//             orderSummaryDateCondition = `YEARWEEK(order_date, 1) = YEARWEEK(CURDATE(), 1)`;
//         } else if (orderFilter === 'monthly') {
//             orderSummaryDateCondition = `YEAR(order_date) = YEAR(CURDATE()) AND MONTH(order_date) = MONTH(CURDATE())`;
//         } else {
//             // Agar kuch aur aaye to default global date range lagao
//             orderSummaryDateCondition = `DATE(order_date) BETWEEN '${startDate}' AND '${endDate}'`;
//         }

//         // ==========================================
//         // 1. REVENUE SUMMARY
//         // ==========================================
//         // Orders se collection
//         const [orderRev] = await db.query(`
//             SELECT 
//                 SUM(final_amount) as order_collection,
//                 SUM(subscription_amount) as order_sub_rev,
//                 SUM(extra_amount) as order_payg_rev,
//                 SUM(discount_amount) as order_discount
//             FROM orders 
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
//         `, [userOutletId, startDate, endDate]);

//         // Subscriptions se collection
//         const [subRev] = await db.query(`
//             SELECT 
//                 SUM(payable_amount) as sub_collection,
//                 SUM(discount_amount) as sub_discount
//             FROM subscriptions_payments 
//             WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND payment_status = 'SUCCESS'
//         `, [userOutletId, startDate, endDate]);

//         const orderColl = Number(orderRev[0]?.order_collection) || 0;
//         const subColl = Number(subRev[0]?.sub_collection) || 0;
        
//         const totalCollection = orderColl + subColl; 
//         const subRevenue = (Number(orderRev[0]?.order_sub_rev) || 0) + subColl;
//         const paygRevenue = Number(orderRev[0]?.order_payg_rev) || 0;
//         const discountGiven = (Number(orderRev[0]?.order_discount) || 0) + (Number(subRev[0]?.sub_discount) || 0);
//         const grossCollection = totalCollection + discountGiven;

//         // ==========================================
//         // 2. ORDER SUMMARY (Filter 2 applied)
//         // ==========================================
//         const [currentOrders] = await db.query(`
//             SELECT 
//                 COUNT(*) as total_orders,
//                 SUM(CASE WHEN status = 'RECEIVED' THEN 1 ELSE 0 END) as received,
//                 SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) as in_wash,
//                 SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready,
//                 SUM(CASE WHEN status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) as collected,
//                 SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
//             FROM orders 
//             WHERE outlet_id = ? AND ${orderSummaryDateCondition}
//         `, [userOutletId]);

//         // ==========================================
//         // 3. ORDERS TREND (Global Date Range)
//         // ==========================================
//         const [ordersTrend] = await db.query(`
//             SELECT 
//                 DATE_FORMAT(order_date, '%Y-%m-%d') as date_label,
//                 COUNT(*) as orders_count
//             FROM orders
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
//             GROUP BY DATE_FORMAT(order_date, '%Y-%m-%d')
//             ORDER BY date_label ASC
//         `, [userOutletId, startDate, endDate]);

//         // ==========================================
//         // 4. CUSTOMER SUMMARY
//         // ==========================================
//         const [customerStats] = await db.query(`
//             SELECT 
//                 COUNT(DISTINCT o.student_id) as total_customers,
//                 SUM(CASE WHEN LOWER(s.role) = 'student' THEN 1 ELSE 0 END) as students,
//                 SUM(CASE WHEN LOWER(s.role) != 'student' THEN 1 ELSE 0 END) as non_students
//             FROM orders o
//             JOIN students s ON s.id = o.student_id
//             WHERE o.outlet_id = ? AND DATE(o.order_date) BETWEEN ? AND ?
//         `, [userOutletId, startDate, endDate]);

//         const [subscribedStats] = await db.query(`
//             SELECT COUNT(DISTINCT ss.student_id) as subscribed_customers
//             FROM student_subscriptions ss
//             JOIN orders o ON o.student_id = ss.student_id
//             WHERE o.outlet_id = ? AND DATE(o.order_date) BETWEEN ? AND ? AND ss.status = 'ACTIVE'
//         `, [userOutletId, startDate, endDate]);
        
//         const subscribedCustomers = Number(subscribedStats[0]?.subscribed_customers) || 0;
//         const totalCust = Number(customerStats[0]?.total_customers) || 0;
//         const nonSubscribedCustomers = Math.max(0, totalCust - subscribedCustomers);

//         // ==========================================
//         // 5. LAUNDRY USAGE
//         // ==========================================
//         const [usageStats] = await db.query(`
//             SELECT 
//                 SUM(total_weight_kg) as total_kg_washed,
//                 SUM(subscription_usage_kg) as subscription_kg,
//                 SUM(extra_payg_kg) as extra_payg_kg
//             FROM orders
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
//         `, [userOutletId, startDate, endDate]);

//         const [quotaCrossed] = await db.query(`
//             SELECT 
//                 COUNT(DISTINCT student_id) as customers_crossed,
//                 SUM(extra_payg_kg) as total_extra_kg,
//                 SUM(extra_amount) as total_payg_revenue
//             FROM orders
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND extra_payg_kg > 0
//         `, [userOutletId, startDate, endDate]);

//         // ==========================================
//         // 6. COLLECTION BREAKDOWN
//         // ==========================================
//         const [collections] = await db.query(`
//             SELECT 
//                 SUM(final_amount) as actual_collection,
//                 SUM(CASE WHEN payment_method = 'CASH' THEN final_amount ELSE 0 END) as cash,
//                 SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN final_amount ELSE 0 END) as upi_online,
//                 SUM(CASE WHEN payment_method = 'CARD' THEN final_amount ELSE 0 END) as card
//             FROM orders
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
//         `, [userOutletId, startDate, endDate]);

//         // ==========================================
//         // 7. STAFF ACTIVITY
//         // ==========================================
//         const [staffStats] = await db.query(`
//             SELECT COUNT(DISTINCT user_id) as total_staff
//             FROM (
//                 SELECT user_id FROM user_outlets WHERE outlet_id = ?
//                 UNION
//                 SELECT user_id FROM user_outlets_receptionist WHERE outlet_id = ?
//             ) as all_staff
//         `, [userOutletId, userOutletId]);

//         const [orderHandled] = await db.query(`
//             SELECT COUNT(DISTINCT created_by) as active_staff
//             FROM orders 
//             WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
//         `, [userOutletId, startDate, endDate]);

//         // ==========================================
//         // FINAL RESPONSE
//         // ==========================================
//         return successResponse(res, 'Reports fetched successfully', {
//             filters_applied: {
//                 date_range: { start_date: startDate, end_date: endDate },
//                 order_filter: orderFilter
//             },
//             revenue_summary: {
//                 total_collection: totalCollection,
//                 subscription_revenue: subRevenue,
//                 payg_extra_revenue: paygRevenue,
//                 discount_given: discountGiven,
//                 gross_collection: grossCollection,
//                 net_collection: totalCollection 
//             },
//             order_summary: {
//                 total_orders: Number(currentOrders[0]?.total_orders) || 0,
//                 received: Number(currentOrders[0]?.received) || 0,
//                 in_wash: Number(currentOrders[0]?.in_wash) || 0,
//                 ready: Number(currentOrders[0]?.ready) || 0,
//                 collected: Number(currentOrders[0]?.collected) || 0,
//                 cancelled: Number(currentOrders[0]?.cancelled) || 0
//             },
//             orders_trend: {
//                 data: ordersTrend.map(t => ({
//                     label: t.date_label,
//                     count: Number(t.orders_count)
//                 }))
//             },
//             customer_summary: {
//                 total_customers: totalCust,
//                 students: Number(customerStats[0]?.students) || 0,
//                 non_students: Number(customerStats[0]?.non_students) || 0,
//                 subscribed_customers: subscribedCustomers,
//                 non_subscribed_customers: nonSubscribedCustomers
//             },
//             laundry_usage: {
//                 total_kg_washed: Number(usageStats[0]?.total_kg_washed) || 0,
//                 subscription_kg: Number(usageStats[0]?.subscription_kg) || 0,
//                 extra_payg_kg: Number(usageStats[0]?.extra_payg_kg) || 0,
//                 quota_crossed_warning: {
//                     customers_crossed: Number(quotaCrossed[0]?.customers_crossed) || 0,
//                     extra_kg: Number(quotaCrossed[0]?.total_extra_kg) || 0,
//                     payg_revenue: Number(quotaCrossed[0]?.total_payg_revenue) || 0
//                 }
//             },
//             collection_breakdown: {
//                 actual_collection: Number(collections[0]?.actual_collection) || 0,
//                 cash: Number(collections[0]?.cash) || 0,
//                 upi_online: Number(collections[0]?.upi_online) || 0,
//                 card: Number(collections[0]?.card) || 0,
//                 difference: 0, 
//                 reconciliation_status: 'Balanced'
//             },
//             staff_activity: {
//                 total_staff: Number(staffStats[0]?.total_staff) || 0,
//                 active_staff: Number(orderHandled[0]?.active_staff) || 0,
//                 orders_received: Number(currentOrders[0]?.received) || 0,
//                 orders_collected: Number(currentOrders[0]?.collected) || 0,
//                 discounts_given: discountGiven
//             }
//         });

//     } catch (error) {
//         console.error('❌ Reports Error:', error);
//         return errorResponse(res, 'Failed to fetch reports', 500);
//     }
// };


const getReportsData = async (req, res) => {
    try {
        const userId = req.user?.id || req.student?.id; 
        if (!userId) return errorResponse(res, 'Unauthorized: User ID not found in token', 401);

        // 1. Get Manager Outlet
        const [userRows] = await db.query(`SELECT outlet_id FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (userRows.length === 0 || !userRows[0].outlet_id) return errorResponse(res, 'User not found or no outlet assigned', 404);
        const userOutletId = userRows[0].outlet_id;

        // ==========================================
        // 2. DATE LOGIC (CURRENT & PREVIOUS PERIOD)
        // ==========================================
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const startDateStr = req.query.start_date || firstDayOfMonth.toISOString().split('T')[0];
        const endDateStr = req.query.end_date || today.toISOString().split('T')[0];

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        const timeDiff = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - diffDays + 1);

        const prevStartStr = prevStartDate.toISOString().split('T')[0];
        const prevEndStr = prevEndDate.toISOString().split('T')[0];

        // Helper: % Calculate
        const calcChange = (curr, prev) => {
            if (prev === 0) return curr > 0 ? '+100%' : '0%';
            const change = ((curr - prev) / prev) * 100;
            return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
        };

        // ==========================================
        // 3. ORDER SUMMARY FILTER LOGIC
        // ==========================================
        const orderFilter = (req.query.order_filter || 'daily').toLowerCase();
        let orderDateCondition = '';
        
        if (orderFilter === 'daily') orderDateCondition = `DATE(order_date) = CURDATE()`;
        else if (orderFilter === 'weekly') orderDateCondition = `YEARWEEK(order_date, 1) = YEARWEEK(CURDATE(), 1)`;
        else if (orderFilter === 'monthly') orderDateCondition = `YEAR(order_date) = YEAR(CURDATE()) AND MONTH(order_date) = MONTH(CURDATE())`;
        else orderDateCondition = `DATE(order_date) BETWEEN '${startDateStr}' AND '${endDateStr}'`;

        // ==========================================
        // 4. FETCH REVENUE
        // ==========================================
        const [currRev] = await db.query(`
            SELECT SUM(final_amount) as coll, SUM(subscription_amount) as sub, SUM(extra_amount) as payg, SUM(discount_amount) as disc
            FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
        `, [userOutletId, startDateStr, endDateStr]);

        const [prevRev] = await db.query(`
            SELECT SUM(final_amount) as coll FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
        `, [userOutletId, prevStartStr, prevEndStr]);

        const [currSubRev] = await db.query(`
            SELECT SUM(payable_amount) as coll, SUM(discount_amount) as disc FROM subscriptions_payments 
            WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND payment_status = 'SUCCESS'
        `, [userOutletId, startDateStr, endDateStr]);

        const [prevSubRev] = await db.query(`
            SELECT SUM(payable_amount) as coll FROM subscriptions_payments 
            WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND payment_status = 'SUCCESS'
        `, [userOutletId, prevStartStr, prevEndStr]);

        const c_totalColl = (Number(currRev[0]?.coll) || 0) + (Number(currSubRev[0]?.coll) || 0);
        const p_totalColl = (Number(prevRev[0]?.coll) || 0) + (Number(prevSubRev[0]?.coll) || 0);
        
        const c_subRev = (Number(currRev[0]?.sub) || 0) + (Number(currSubRev[0]?.coll) || 0);
        const p_subRev = (Number(prevRev[0]?.sub) || 0) + (Number(prevSubRev[0]?.coll) || 0);
        
        const c_paygRev = Number(currRev[0]?.payg) || 0;
        const p_paygRev = Number(prevRev[0]?.payg) || 0;
        
        const c_discount = (Number(currRev[0]?.disc) || 0) + (Number(currSubRev[0]?.disc) || 0);
        const p_discount = (Number(prevRev[0]?.disc) || 0) + (Number(prevSubRev[0]?.disc) || 0);

        // ==========================================
        // 5. FETCH ORDERS
        // ==========================================
        const [currOrders] = await db.query(`
            SELECT COUNT(*) as tot, SUM(CASE WHEN status='RECEIVED' THEN 1 ELSE 0 END) as rec, SUM(CASE WHEN status='IN_WASH' THEN 1 ELSE 0 END) as wash, 
                   SUM(CASE WHEN status='READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready, SUM(CASE WHEN status IN ('COLLECTED','DELIVERED') THEN 1 ELSE 0 END) as coll,
                   SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) as canc
            FROM orders WHERE outlet_id = ? AND ${orderDateCondition}
        `, [userOutletId]);

        const [prevOrders] = await db.query(`
            SELECT COUNT(*) as tot FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
        `, [userOutletId, prevStartStr, prevEndStr]);

        // ==========================================
        // 6. FETCH CUSTOMERS & SUBSCRIPTIONS
        // ==========================================
        const [currCust] = await db.query(`
            SELECT COUNT(DISTINCT o.student_id) as tot, 
                   SUM(CASE WHEN LOWER(s.role)='student' THEN 1 ELSE 0 END) as std, SUM(CASE WHEN LOWER(s.role)!='student' THEN 1 ELSE 0 END) as non_std
            FROM orders o JOIN students s ON s.id = o.student_id
            WHERE o.outlet_id = ? AND DATE(o.order_date) BETWEEN ? AND ?
        `, [userOutletId, startDateStr, endDateStr]);

        const [subCust] = await db.query(`
            SELECT COUNT(DISTINCT ss.student_id) as subs
            FROM student_subscriptions ss JOIN orders o ON o.student_id = ss.student_id
            WHERE o.outlet_id = ? AND DATE(o.order_date) BETWEEN ? AND ? AND ss.status = 'ACTIVE'
        `, [userOutletId, startDateStr, endDateStr]);

        const [prevCust] = await db.query(`
            SELECT COUNT(DISTINCT student_id) as tot FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
        `, [userOutletId, prevStartStr, prevEndStr]);

        // ==========================================
        // 7. FETCH USAGE
        // ==========================================
        const [usage] = await db.query(`
            SELECT SUM(total_weight_kg) as total, SUM(subscription_usage_kg) as sub, SUM(extra_payg_kg) as payg
            FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
        `, [userOutletId, startDateStr, endDateStr]);

        const [quota] = await db.query(`
            SELECT COUNT(DISTINCT student_id) as cust, SUM(extra_payg_kg) as kg, SUM(extra_amount) as rev
            FROM orders WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ? AND extra_payg_kg > 0
        `, [userOutletId, startDateStr, endDateStr]);

        // ==========================================
        // 8. STAFF ACTIVITY (Date Filter Applied)
        // ==========================================
        // A. Total Staff (Sirf wahi jo date filter me count honge)
        const [staffTotal] = await db.query(`
            SELECT COUNT(DISTINCT created_by) as tot 
            FROM orders 
            WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
              AND created_by IS NOT NULL
        `, [userOutletId, startDateStr, endDateStr]);

        // B. Active Staff (Same logic)
        const [staffActive] = await db.query(`
            SELECT COUNT(DISTINCT created_by) as act 
            FROM orders 
            WHERE outlet_id = ? AND DATE(order_date) BETWEEN ? AND ?
              AND created_by IS NOT NULL
        `, [userOutletId, startDateStr, endDateStr]);

        // ==========================================
        // FINAL RESPONSE
        // ==========================================
        return successResponse(res, 'Reports fetched successfully', {
            filters_applied: {
                date_range: { start: startDateStr, end: endDateStr },
                prev_period: { start: prevStartStr, end: prevEndStr },
                order_filter: orderFilter
            },
            revenue_summary: {
                total_collection: c_totalColl,
                total_collection_change: calcChange(c_totalColl, p_totalColl),
                subscription_revenue: c_subRev,
                subscription_change: calcChange(c_subRev, p_subRev),
                payg_revenue: c_paygRev,
                payg_change: calcChange(c_paygRev, p_paygRev),
                discount_given: c_discount,
                discount_change: calcChange(c_discount, p_discount),
                gross_collection: c_totalColl + c_discount,
                net_collection: c_totalColl
            },
            order_summary: {
                total_orders: Number(currOrders[0]?.tot) || 0,
                total_orders_change: calcChange(Number(currOrders[0]?.tot) || 0, Number(prevOrders[0]?.tot) || 0),
                received: Number(currOrders[0]?.rec) || 0,
                in_wash: Number(currOrders[0]?.wash) || 0,
                ready: Number(currOrders[0]?.ready) || 0,
                collected: Number(currOrders[0]?.coll) || 0,
                cancelled: Number(currOrders[0]?.canc) || 0
            },
            customer_summary: {
                total_customers: Number(currCust[0]?.tot) || 0,
                total_customers_change: calcChange(Number(currCust[0]?.tot) || 0, Number(prevCust[0]?.tot) || 0),
                students: Number(currCust[0]?.std) || 0,
                non_students: Number(currCust[0]?.non_std) || 0,
                subscribed_customers: Number(subCust[0]?.subs) || 0,
                non_subscribed_customers: Math.max(0, (Number(currCust[0]?.tot) || 0) - (Number(subCust[0]?.subs) || 0))
            },
            laundry_usage: {
                total_kg_washed: Number(usage[0]?.total) || 0,
                subscription_kg: Number(usage[0]?.sub) || 0,
                extra_payg_kg: Number(usage[0]?.payg) || 0,
                quota_crossed: {
                    customers: Number(quota[0]?.cust) || 0,
                    extra_kg: Number(quota[0]?.kg) || 0,
                    revenue: Number(quota[0]?.rev) || 0
                }
            },
            collection_breakdown: {
                actual_collection: c_totalColl,
                cash: Number(currRev[0]?.coll) || 0,
                upi_online: Number(currSubRev[0]?.coll) || 0,
                card: 0,
                difference: 0,
                reconciliation_status: 'Balanced'
            },
            staff_activity: {
                total_staff: Number(staffTotal[0]?.tot) || 0,
                active_staff: Number(staffActive[0]?.act) || 0,
                discounts_given: c_discount
            }
        });

    } catch (error) {
        console.error('❌ Reports Error:', error);
        return errorResponse(res, 'Failed to fetch reports', 500);
    }
};

// ==================================================
// GET CUSTOMER DETAILS BY ID (Real Data Only)
// ==================================================
const getCustomerDetailsById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 'Customer ID is required', 400);
    }

    // ==========================================
    // 1. Fetch Student Basic Details
    // ==========================================
    const [students] = await db.query(
      `
      SELECT 
        s.id,
        CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
        s.full_name,
        s.profile_image,
        s.phone,
        s.role,
        s.campus_id,
        s.outlet_id,
        c.name AS campus_name,
        o.name AS outlet_name
      FROM students s
      LEFT JOIN campuses c ON c.id = s.campus_id
      LEFT JOIN outlets o ON o.id = s.outlet_id
      WHERE s.id = ? LIMIT 1
      `,
      [id]
    );

    if (students.length === 0) {
      return errorResponse(res, 'Customer not found', 404);
    }

    const student = students[0];
    const imageUrl = student.profile_image
      ? `https://instawash.siberiancrane.tech/uploads/${student.profile_image}`
      : null;

    // ==========================================
    // 2. Subscription Details (Active)
    // ==========================================
    let subscriptionDetails = null;
    
    const [subs] = await db.query(
      `
      SELECT 
        ss.*, 
        p.plan_name 
      FROM student_subscriptions ss
      JOIN subscription_plans p ON p.id = ss.plan_id
      WHERE ss.student_id = ? AND ss.status = 'ACTIVE' 
      ORDER BY ss.created_at DESC LIMIT 1
      `,
      [id]
    );

    if (subs.length > 0) {
      const sub = subs[0];
      const endDate = new Date(sub.end_date);
      const today = new Date();
      const daysLeft = Math.ceil((endDate - today) / (1000 * 3600 * 24));
      const quotaTotal = Number(sub.quota_kg_total) || 0;
      const quotaUsed = Number(sub.quota_kg_used) || 0;

      subscriptionDetails = {
        plan_name: sub.plan_name,
        validity: `${new Date(sub.start_date).toLocaleDateString('en-GB')} - ${endDate.toLocaleDateString('en-GB')}`,
        days_left: daysLeft > 0 ? daysLeft : 0,
        quota_total_kg: quotaTotal,
        used_kg: quotaUsed,
        remaining_kg: Math.max(0, quotaTotal - quotaUsed),
        status: 'Active'
      };
    }

    // ==========================================
    // 3. Extra Usage / PAYG (Real Data from Orders)
    // ==========================================
    const [paygStats] = await db.query(
      `
      SELECT 
        SUM(extra_payg_kg) as extra_kg,
        SUM(extra_amount) as payg_amount,
        SUM(discount_amount) as discount,
        SUM(final_amount) as final_amount,
        MAX(created_at) as last_used_date
      FROM orders 
      WHERE student_id = ? AND extra_payg_kg > 0 
      AND DATE(order_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `,
      [id]
    );

    let extraUsage = null;
    if (paygStats[0] && paygStats[0].extra_kg > 0) {
       extraUsage = {
         extra_kg: Number(paygStats[0].extra_kg),
         payg_amount: Number(paygStats[0].payg_amount),
         discount: Number(paygStats[0].discount),
         final_amount: Number(paygStats[0].final_amount),
         last_used_date: paygStats[0].last_used_date
       };
    }

    // ==========================================
    // 4. Current Order (Real Data)
    // ==========================================
    const [currentOrderRows] = await db.query(
      `
      SELECT id, order_code, order_date, total_weight_kg, services, status
      FROM orders 
      WHERE student_id = ? AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')
      ORDER BY id DESC LIMIT 1
      `,
      [id]
    );

    let currentOrder = null;
    if (currentOrderRows.length > 0) {
      const co = currentOrderRows[0];
      
      let servicesArr = [];
      try {
        servicesArr = co.services ? (typeof co.services === 'string' ? JSON.parse(co.services) : co.services) : [];
      } catch (e) { servicesArr = []; }

      currentOrder = {
        order_id: co.order_code,
        order_date: co.order_date,
        weight_kg: Number(co.total_weight_kg),
        wash_type: servicesArr.length > 0 ? servicesArr.join(', ') : 'Regular Wash',
        status: co.status
      };
    }

    // ==========================================
    // 5. Order History (Real Data - Last 5)
    // ==========================================
    const [orderHistory] = await db.query(
      `
      SELECT id, order_code, order_date, total_weight_kg, status
      FROM orders 
      WHERE student_id = ?
      ORDER BY id DESC LIMIT 5
      `,
      [id]
    );

    const formattedOrderHistory = orderHistory.map(o => ({
      order_id: o.order_code,
      order_date: o.order_date,
      weight_kg: Number(o.total_weight_kg),
      status: o.status
    }));

    // ==========================================
    // 6. Usage History (This Month - Real Data)
    // ==========================================
    // Is mahine ke orders ka total calculation
    const [usageHistory] = await db.query(
      `
      SELECT 
        COUNT(id) as total_orders,
        SUM(total_weight_kg) as total_kg_used,
        SUM(extra_payg_kg) as extra_kg,
        SUM(discount_amount) as discount_given
      FROM orders 
      WHERE student_id = ? 
      AND MONTH(order_date) = MONTH(CURDATE()) 
      AND YEAR(order_date) = YEAR(CURDATE())
      `,
      [id]
    );

    const usageSummary = {
      total_orders: Number(usageHistory[0]?.total_orders) || 0,
      total_kg_used: Number(usageHistory[0]?.total_kg_used) || 0,
      extra_kg: Number(usageHistory[0]?.extra_kg) || 0,
      discount_given: Number(usageHistory[0]?.discount_given) || 0
    };

    // ==========================================
    // 7. Payment History (Real Data)
    // ==========================================
    const [orderPayments] = await db.query(
      `
      SELECT 
        order_code, 
        payment_method, 
        final_amount, 
        payment_status, 
        created_at
      FROM orders 
      WHERE student_id = ? AND payment_status IN ('PAID', 'SUCCESS')
      ORDER BY id DESC LIMIT 5
      `,
      [id]
    );

    const [subPayments] = await db.query(
      `
      SELECT 
        transaction_id, 
        payment_method, 
        payable_amount as final_amount, 
        payment_status, 
        created_at
      FROM subscriptions_payments 
      WHERE student_id = ? AND payment_status = 'SUCCESS'
      ORDER BY id DESC LIMIT 5
      `,
      [id]
    );

    const allPayments = [...orderPayments, ...subPayments].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const formattedPayments = allPayments.slice(0, 5).map(p => ({
      transaction_id: p.order_code || p.transaction_id || 'TXN',
      amount: Number(p.final_amount),
      method: p.payment_method,
      status: p.payment_status,
      date: p.created_at
    }));

    // ==========================================
    // FINAL RESPONSE
    // ==========================================
    return successResponse(res, 'Customer details fetched successfully', {
      customer_info: {
        id: student.id,
        customer_id: student.customer_id,
        name: student.full_name,
        image: imageUrl,
        phone: student.phone,
        type: student.role === 'STUDENT' ? 'Student' : 'Non-Student',
        campus: student.campus_name,
        outlet: student.outlet_name
      },
      subscription_details: subscriptionDetails,
      extra_usage_payg: extraUsage,
      current_order: currentOrder,
      order_history: formattedOrderHistory,
      usage_history_this_month: usageSummary,
      payment_history: formattedPayments
    });

  } catch (error) {
    console.error('❌ Customer Details Error:', error);
    return errorResponse(res, 'Failed to fetch customer details', 500);
  }
};


// ==================================================
// 1. GET COMPLAINTS LIST
// ==================================================
// const getComplaintsList = async (req, res) => {
//     try {
//         const userId = req.user?.id;
//         if (!userId) return errorResponse(res, 'User ID required', 401);

//         const [userRows] = await db.query(`SELECT outlet_id FROM users WHERE id = ?`, [userId]);
//         if (userRows.length === 0 || !userRows[0].outlet_id) return errorResponse(res, 'No outlet assigned', 404);
//         const outletId = userRows[0].outlet_id;

//         const { search = '', status } = req.query;
//         let whereClause = `o.outlet_id = ?`;
//         let params = [outletId];

//         if (search) {
//             whereClause += ` AND (c.id LIKE ? OR s.full_name LIKE ? OR o.order_code LIKE ?)`;
//             params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//         }

//         if (status && status !== 'ALL') {
//             whereClause += ` AND c.status = ?`;
//             params.push(status);
//         }

//         const [stats] = await db.query(`
//             SELECT 
//                 COUNT(*) as total,
//                 SUM(CASE WHEN c.status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
//                 SUM(CASE WHEN c.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
//                 SUM(CASE WHEN c.status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
//                 SUM(CASE WHEN c.status = 'CLOSED' THEN 1 ELSE 0 END) as closed
//             FROM complaints c
//             JOIN orders o ON o.id = c.order_id
//             WHERE o.outlet_id = ?
//         `, [outletId]);

//         const [complaints] = await db.query(`
//             SELECT 
//                 c.id, c.category, c.description, c.status, c.priority, c.created_at,
//                 s.full_name as customer_name, 
//                 o.order_code
//             FROM complaints c
//             JOIN orders o ON o.id = c.order_id
//             JOIN students s ON s.id = c.student_id
//             WHERE ${whereClause}
//             ORDER BY c.created_at DESC
//         `, params);

//         const formattedData = complaints.map(c => ({
//             id: c.id, // 🆕 Actual DB ID for API calls
//             display_id: `#C${String(c.id).padStart(8, '0')}`, // Jo UI me dikhega
//             category: c.category,
//             customer_name: c.customer_name,
//             order_id: `#${c.order_code}`,
//             description: c.description,
//             status: c.status,
//             priority: c.priority || 'MEDIUM',
//             created_at: c.created_at
//         }));

//         return successResponse(res, 'Complaints fetched successfully', {
//             stats: {
//                 total: Number(stats[0]?.total) || 0,
//                 open: Number(stats[0]?.open_count) || 0,
//                 in_progress: Number(stats[0]?.in_progress) || 0,
//                 resolved: Number(stats[0]?.resolved) || 0,
//                 closed: Number(stats[0]?.closed) || 0
//             },
//             data: formattedData
//         });

//     } catch (error) {
//         console.error('❌ Get Complaints Error:', error);
//         return errorResponse(res, 'Failed to fetch complaints', 500);
//     }
// };

const getComplaintsList = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return errorResponse(res, 'User ID required', 401);

        const [userRows] = await db.query(`SELECT outlet_id FROM users WHERE id = ?`, [userId]);
        if (userRows.length === 0 || !userRows[0].outlet_id) return errorResponse(res, 'No outlet assigned', 404);
        const outletId = userRows[0].outlet_id;

        // 🆕 Pagination params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10)); // max 100 per page
        const offset = (page - 1) * limit;

        const { search = '', status } = req.query;
        let whereClause = `o.outlet_id = ?`;
        let params = [outletId];

        if (search) {
            whereClause += ` AND (c.id LIKE ? OR s.full_name LIKE ? OR o.order_code LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status && status !== 'ALL') {
            whereClause += ` AND c.status = ?`;
            params.push(status);
        }

        // Stats (global, ignore pagination)
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN c.status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN c.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN c.status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN c.status = 'CLOSED' THEN 1 ELSE 0 END) as closed
            FROM complaints c
            JOIN orders o ON o.id = c.order_id
            WHERE o.outlet_id = ?
        `, [outletId]);

        // 🆕 Total count for current filter (for pagination meta)
        const [countRows] = await db.query(`
            SELECT COUNT(*) as total
            FROM complaints c
            JOIN orders o ON o.id = c.order_id
            JOIN students s ON s.id = c.student_id
            WHERE ${whereClause}
        `, params);

        const filteredTotal = Number(countRows[0]?.total) || 0;
        const totalPages = Math.ceil(filteredTotal / limit) || 1;

        // Paginated data — note: LIMIT ? OFFSET ? uses params, so push AFTER where params
        const [complaints] = await db.query(`
            SELECT 
                c.id, c.category, c.description, c.status, c.priority, c.created_at,
                s.full_name as customer_name, 
                o.order_code
            FROM complaints c
            JOIN orders o ON o.id = c.order_id
            JOIN students s ON s.id = c.student_id
            WHERE ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const formattedData = complaints.map(c => ({
            id: c.id,
            display_id: `#C${String(c.id).padStart(8, '0')}`,
            category: c.category,
            customer_name: c.customer_name,
            order_id: `#${c.order_code}`,
            description: c.description,
            status: c.status,
            priority: c.priority || 'MEDIUM',
            created_at: c.created_at
        }));

        return successResponse(res, 'Complaints fetched successfully', {
            stats: {
                total: Number(stats[0]?.total) || 0,
                open: Number(stats[0]?.open_count) || 0,
                in_progress: Number(stats[0]?.in_progress) || 0,
                resolved: Number(stats[0]?.resolved) || 0,
                closed: Number(stats[0]?.closed) || 0
            },
            pagination: {
                page,
                limit,
                total: filteredTotal,
                total_pages: totalPages,
                has_next: page < totalPages,
                has_prev: page > 1
            },
            data: formattedData
        });

    } catch (error) {
        console.error('❌ Get Complaints Error:', error);
        return errorResponse(res, 'Failed to fetch complaints', 500);
    }
};


// ==================================================
// 2. GET COMPLAINT DETAILS BY ID
// ==================================================
const getComplaintDetails = async (req, res) => {
    try {
        const { id } = req.params; 

        const [rows] = await db.query(`
            SELECT 
                c.*, 
                s.full_name, s.phone, s.room_number, s.hostel_name, s.profile_image,
                o.order_code, o.order_date, o.total_weight_kg, o.services
            FROM complaints c
            JOIN students s ON s.id = c.student_id
            JOIN orders o ON o.id = c.order_id
            WHERE c.id = ?
        `, [id]);

        if (rows.length === 0) return errorResponse(res, 'Complaint not found', 404);
        const data = rows[0];

        const timeline = [
            { status: 'COMPLAINT_RAISED', label: 'Complaint Raised', date: data.created_at, remarks: 'Customer raised the complaint' },
            { status: 'UNDER_REVIEW', label: 'Under Review', date: data.status !== 'OPEN' ? data.updated_at : null, remarks: 'Outlet manager is reviewing' },
            { status: 'IN_PROGRESS', label: 'In Progress', date: data.status === 'IN_PROGRESS' || data.status === 'RESOLVED' ? data.updated_at : null, remarks: '' },
            { status: 'RESOLVED', label: 'Resolved', date: data.resolved_at || null, remarks: '' }
        ];

        const [notes] = await db.query(`
            SELECT n.*, u.name as staff_name, u.role as staff_role
            FROM complaint_notes n
            JOIN users u ON u.id = n.staff_id
            WHERE n.complaint_id = ?
            ORDER BY n.created_at ASC
        `, [id]);

        // 🆕 SAFE PARSING LOGIC
        let serviceType = 'Wash & Fold'; // Default
        
        if (data.services) {
            // Case 1: Agar data already Array hai
            if (Array.isArray(data.services)) {
                serviceType = data.services.join(', ');
            } 
            // Case 2: Agar String hai
            else if (typeof data.services === 'string') {
                try {
                    const parsed = JSON.parse(data.services);
                    serviceType = Array.isArray(parsed) ? parsed.join(', ') : parsed;
                } catch (e) {
                    // Agar JSON parse fail ho jaye, to string hi use karo
                    serviceType = data.services.replace(/_/g, ' ');
                }
            } 
            // Case 3: Koi aur type (Object etc)
            else {
                serviceType = String(data.services);
            }
        }

        return successResponse(res, 'Complaint details fetched successfully', {
            id: data.id,
            display_id: `#C${String(data.id).padStart(8, '0')}`,
            complaint_info: {
                raised_on: data.created_at,
                status: data.status,
                priority: data.priority || 'HIGH'
            },
            customer_info: {
                name: data.full_name,
                type: 'Student',
                phone: data.phone,
                email: 'N/A', 
                customer_id: `CUS${String(data.student_id).padStart(5, '0')}`,
                hostel: data.hostel_name,
                room: data.room_number,
                image: data.profile_image ? `https://instawash.siberiancrane.tech/uploads/${data.profile_image}` : null
            },
            order_info: {
                order_id: `#${data.order_code}`,
                order_date: data.order_date,
                service_type: serviceType, // 🆕
                total_kg: Number(data.total_weight_kg)
            },
            complaint_details: {
                category: data.category,
                description: data.description,
                images: data.photo_url ? [data.photo_url] : []
            },
            timeline: timeline.filter(t => t.date !== null),
            staff_notes: notes.map(n => ({
                id: n.id,
                staff_name: n.staff_name,
                staff_role: n.staff_role,
                note: n.note,
                created_at: n.created_at
            }))
        });

    } catch (error) {
        console.error('❌ Get Complaint Details Error:', error);
        return errorResponse(res, 'Failed to fetch details', 500);
    }
};

// ==================================================
// 3. ADD STAFF NOTE / UPDATE STATUS
// ==================================================
const updateComplaint = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params; // complaint_id
        const staffId = req.user?.id;
        const { note, status, priority } = req.body;

        // 1. Check Complaint
        const [complaints] = await connection.query(`SELECT id FROM complaints WHERE id = ?`, [id]);
        if (complaints.length === 0) return errorResponse(res, 'Complaint not found', 404);

        // 2. Add Note (Agar aaya hai)
        if (note && note.trim() !== '') {
            await connection.query(`
                INSERT INTO complaint_notes (complaint_id, staff_id, note) 
                VALUES (?, ?, ?)
            `, [id, staffId, note]);
        }

        // 3. Update Status & Priority
        let updateQuery = `UPDATE complaints SET updated_at = NOW()`;
        let params = [];

        if (status) {
            updateQuery += `, status = ?`;
            params.push(status);
            
            if (status === 'RESOLVED') {
                updateQuery += `, resolved_at = NOW()`;
            }
        }

        if (priority) {
            updateQuery += `, priority = ?`;
            params.push(priority);
        }

        updateQuery += ` WHERE id = ?`;
        params.push(id);

        await connection.query(updateQuery, params);

        await connection.commit();

        return successResponse(res, 'Complaint updated successfully', {
            complaint_id: id,
            status_updated: status || 'N/A',
            note_added: note ? true : false
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Update Complaint Error:', error);
        return errorResponse(res, 'Failed to update complaint', 500);
    } finally {
        connection.release();
    }
};

// ==================================================
// GET FAQS + SUPPORT CONTACT (Public API)
// ==================================================
const getSupportAndFaqs = async (req, res) => {
    try {
        // 1. Fetch Active FAQs (status = 1)
        // Agar aapko saare FAQs chahiye (active + inactive), to WHERE clause hata dena.
        const [faqs] = await db.query(`
            SELECT 
                id, 
                question, 
                answer, 
                status, 
                created_at, 
                updated_at 
            FROM faqs 
            WHERE status = 1 
            ORDER BY id DESC
        `);

        // 2. Fetch Support Contact from General Settings
        // Assuming settings table me sirf ek hi row hai (id = 1)
        const [settings] = await db.query(`
            SELECT 
                support_email, 
                support_phone 
            FROM general_settings 
            WHERE id = 1 
            LIMIT 1
        `);

        const supportContact = settings.length > 0 
            ? { 
                email: settings[0].support_email, 
                phone: settings[0].support_phone 
              } 
            : { 
                email: null, 
                phone: null 
              };

        // 3. Final Response
        return successResponse(res, 'Support data fetched successfully', {
            support_contact: supportContact,
            faqs: faqs
        });

    } catch (error) {
        console.error('❌ Get Support & FAQs Error:', error);
        return errorResponse(res, 'Failed to fetch support data', 500);
    }
};




// ==================================================
// GET RECEPTIONISTS (List + Details) - For Outlet Manager
// GET /api/manager/receptionists
// GET /api/manager/receptionists/:id
// ==================================================
// ==================================================
// GET RECEPTIONISTS (List + Details) - For Outlet Manager
// GET /api/manager/receptionists
// GET /api/manager/receptionists/:id
// ==================================================
const getReceptionists = async (req, res) => {
    try {
        // ✅ Token se Manager ID
        const managerId = req.user?.id; 
        if (!managerId) {
            return errorResponse(res, 'Unauthorized: Manager ID not found in token', 401);
        }

        // 1. Manager ke assigned outlets nikaalo
        const [managerOutlets] = await db.query(
            `SELECT outlet_id FROM user_outlets WHERE user_id = ?`,
            [managerId]
        );
        const outletIds = managerOutlets.map(o => o.outlet_id);

        if (outletIds.length === 0) {
            return successResponse(res, 'No outlets assigned to this manager', { data: [] });
        }

        const placeholders = outletIds.map(() => '?').join(',');
        const { id } = req.params; // Agar details maangi hai

        // ==========================================
        // DETAILS MODE (Agar id hai URL me)
        // ==========================================
        if (id) {
            const [receptionists] = await db.query(`
                SELECT 
                    u.id, u.staff_id, u.name, u.email, u.phone, u.image, 
                    u.dob, u.gender, u.address, u.emergency_contact, u.emergency_email,
                    u.role, u.permissions, u.max_discount_percent, u.is_active, 
                    u.joining_date, u.last_login, u.created_at,
                    o.id as outlet_id, o.name as outlet_name, o.section as outlet_section, o.address as outlet_address,
                    c.name as campus_name
                FROM users u
                JOIN user_outlets_receptionist uor ON uor.user_id = u.id
                JOIN outlets o ON o.id = uor.outlet_id
                LEFT JOIN campuses c ON c.id = o.campus_id
                WHERE u.id = ? AND uor.outlet_id IN (${placeholders})
                LIMIT 1
            `, [id, ...outletIds]);

            if (receptionists.length === 0) {
                return errorResponse(res, 'Receptionist not found or you do not have access', 404);
            }

            const r = receptionists[0];

            // Format Details Data
            const data = {
                id: r.id,
                staff_id: r.staff_id,
                name: r.name,
                email: r.email,
                phone: r.phone,
                image: r.image || null, // 🆕 Direct path
                dob: r.dob,
                gender: r.gender,
                address: r.address,
                emergency_contact: r.emergency_contact,
                emergency_email: r.emergency_email,
                role: r.role,
                permissions: (() => {
                    try { return typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []); } 
                    catch (e) { return []; }
                })(),
                max_discount_percent: Number(r.max_discount_percent) || 0,
                status: r.is_active === 1 ? 'Active' : 'Inactive',
                joining_date: r.joining_date,
                last_login: r.last_login,
                created_at: r.created_at,
                outlet: {
                    id: r.outlet_id,
                    name: r.outlet_name,
                    section: r.outlet_section,
                    address: r.outlet_address,
                    campus: r.campus_name
                }
            };

            return successResponse(res, 'Receptionist details fetched successfully', data);
        }

        // ==========================================
        // LIST MODE (Agar id nahi hai URL me)
        // ==========================================
        const { search = '', status, outlet_id, page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [`uor.outlet_id IN (${placeholders})`];
        let params = [...outletIds];

        // 🆕 Search Filter (Name, Phone, Email, Staff ID)
        if (search && search.trim() !== '') {
            whereClauses.push(`(
                u.name LIKE ? 
                OR u.phone LIKE ? 
                OR u.email LIKE ? 
                OR u.staff_id LIKE ?
            )`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
        }

        // Status Filter (Active/Inactive)
        if (status && status !== 'All') {
            whereClauses.push(`u.is_active = ?`);
            params.push(status === 'Active' ? 1 : 0);
        }

        // Specific Outlet Filter
        if (outlet_id) {
            if (outletIds.includes(Number(outlet_id))) {
                whereClauses.push(`uor.outlet_id = ?`);
                params.push(outlet_id);
            } else {
                return errorResponse(res, 'You do not have access to this outlet', 403);
            }
        }

        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

        // Fetch Stats
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(DISTINCT u.id) as total,
                SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) as inactive
            FROM users u
            JOIN user_outlets_receptionist uor ON uor.user_id = u.id
            ${whereSQL}
        `, params);

        const stats = {
            total: Number(statsRows[0]?.total) || 0,
            active: Number(statsRows[0]?.active) || 0,
            inactive: Number(statsRows[0]?.inactive) || 0
        };

        // Fetch Data
        const [receptionists] = await db.query(`
            SELECT 
                u.id, u.staff_id, u.name, u.email, u.phone, u.image, 
                u.dob, u.gender, u.address, u.emergency_contact, u.emergency_email,
                u.role, u.permissions, u.max_discount_percent, u.is_active, 
                u.joining_date, u.last_login, u.created_at,
                o.id as outlet_id, o.name as outlet_name, o.section as outlet_section,
                c.name as campus_name
            FROM users u
            JOIN user_outlets_receptionist uor ON uor.user_id = u.id
            JOIN outlets o ON o.id = uor.outlet_id
            LEFT JOIN campuses c ON c.id = o.campus_id
            ${whereSQL}
            ORDER BY u.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        // Pagination Count
        const [countRows] = await db.query(`
            SELECT COUNT(DISTINCT u.id) as total 
            FROM users u
            JOIN user_outlets_receptionist uor ON uor.user_id = u.id
            ${whereSQL}
        `, params);
        
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // Format List Data
        const data = receptionists.map(r => ({
            id: r.id,
            staff_id: r.staff_id,
            name: r.name,
            email: r.email,
            phone: r.phone,
            image: r.image || null, // 🆕 Direct path
            dob: r.dob,
            gender: r.gender,
            address: r.address,
            emergency_contact: r.emergency_contact,
            emergency_email: r.emergency_email,
            role: r.role,
            permissions: (() => {
                try { return typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []); } 
                catch (e) { return []; }
            })(),
            max_discount_percent: Number(r.max_discount_percent) || 0,
            status: r.is_active === 1 ? 'Active' : 'Inactive',
            joining_date: r.joining_date,
            last_login: r.last_login,
            created_at: r.created_at,
            outlet: {
                id: r.outlet_id,
                name: r.outlet_name,
                section: r.outlet_section,
                campus: r.campus_name
            }
        }));

        return successResponse(res, 'Receptionists fetched successfully', {
            stats,
            data,
            pagination: {
                total: totalRecords,
                page: pageNum,
                limit: limitNum,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1
            }
        });

    } catch (error) {
        console.error('❌ Get Receptionists Error:', error);
        return errorResponse(res, 'Failed to fetch receptionists', 500);
    }
};


const getDailyCollection = async (req, res) => {
    try {
        const userId = req.user?.id || req.student?.id; 
        if (!userId) {
            return errorResponse(res, 'Unauthorized: User ID not found in token', 401);
        }

        const [userRows] = await db.query(`SELECT outlet_id FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (userRows.length === 0 || !userRows[0].outlet_id) {
            return errorResponse(res, 'No outlet assigned to this user', 404);
        }
        const outletId = userRows[0].outlet_id;

        // ==========================================
        // 1. DATE FILTER LOGIC
        // ==========================================
        // Agar URL me date aayi hai (req.query.date) to wo use karo, warna Yesterday
        let targetDate = req.query.date;
        
        if (!targetDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            targetDate = yesterday.toISOString().split('T')[0];
        }

        const search = req.query.search || '';
        const filterType = (req.query.filter_type || 'ALL').toUpperCase();

        // ==========================================
        // 2. STATS (Top Cards) - Date Filtered
        // ==========================================
        const [orderStats] = await db.query(`
            SELECT 
                COUNT(id) as total_orders,
                SUM(final_amount) as total_amount,
                SUM(CASE WHEN payment_method = 'CASH' THEN final_amount ELSE 0 END) as cash_amount,
                SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN final_amount ELSE 0 END) as online_amount,
                SUM(CASE WHEN payment_method = 'QR' THEN final_amount ELSE 0 END) as qr_amount,
                SUM(CASE WHEN payment_method = 'CASH' THEN 1 ELSE 0 END) as cash_orders,
                SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN 1 ELSE 0 END) as online_orders,
                SUM(CASE WHEN payment_method = 'QR' THEN 1 ELSE 0 END) as qr_orders
            FROM orders
            WHERE outlet_id = ? AND DATE(order_date) = ? AND payment_status = 'PAID'
        `, [outletId, targetDate]);

        const [subStats] = await db.query(`
            SELECT 
                COUNT(id) as total_subs,
                SUM(payable_amount) as total_amount,
                SUM(CASE WHEN payment_method = 'CASH' THEN payable_amount ELSE 0 END) as cash_amount,
                SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN payable_amount ELSE 0 END) as online_amount,
                SUM(CASE WHEN payment_method = 'QR' THEN payable_amount ELSE 0 END) as qr_amount,
                SUM(CASE WHEN payment_method = 'CASH' THEN 1 ELSE 0 END) as cash_subs,
                SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN 1 ELSE 0 END) as online_subs,
                SUM(CASE WHEN payment_method = 'QR' THEN 1 ELSE 0 END) as qr_subs
            FROM subscriptions_payments
            WHERE outlet_id = ? AND DATE(created_at) = ? AND payment_status = 'SUCCESS'
        `, [outletId, targetDate]);

        const cash = (Number(orderStats[0]?.cash_amount) || 0) + (Number(subStats[0]?.cash_amount) || 0);
        const online = (Number(orderStats[0]?.online_amount) || 0) + (Number(subStats[0]?.online_amount) || 0);
        const qr = (Number(orderStats[0]?.qr_amount) || 0) + (Number(subStats[0]?.qr_amount) || 0);
        const totalAmount = cash + online + qr;

        const cashOrders = (Number(orderStats[0]?.cash_orders) || 0) + (Number(subStats[0]?.cash_subs) || 0);
        const onlineOrders = (Number(orderStats[0]?.online_orders) || 0) + (Number(subStats[0]?.online_subs) || 0);
        const qrOrders = (Number(orderStats[0]?.qr_orders) || 0) + (Number(subStats[0]?.qr_subs) || 0);
        const totalOrders = cashOrders + onlineOrders + qrOrders;

        // ==========================================
        // 3. RECONCILIATION STATUS - Date Filtered
        // ==========================================
        const [reconRows] = await db.query(`
            SELECT * FROM daily_reconciliations WHERE outlet_id = ? AND collection_date = ?
        `, [outletId, targetDate]);
        const reconData = reconRows.length > 0 ? reconRows[0] : null;

        // ==========================================
        // 4. FETCH TRANSACTIONS - Date Filtered
        // ==========================================
        let orderQuery = `
            SELECT 
                id, 
                order_code as txn_id, 
                customer_name as customer, 
                'Order' as type, 
                final_amount as amount, 
                payment_method, 
                created_at 
            FROM orders 
            WHERE outlet_id = ? AND DATE(order_date) = ? AND payment_status = 'PAID'
        `;
        let orderParams = [outletId, targetDate];

        if (search) {
            orderQuery += ` AND (order_code LIKE ? OR customer_name LIKE ?)`;
            orderParams.push(`%${search}%`, `%${search}%`);
        }
        if (filterType === 'CASH') orderQuery += ` AND payment_method = 'CASH'`;
        else if (filterType === 'UPI') orderQuery += ` AND payment_method IN ('UPI', 'ONLINE')`;
        else if (filterType === 'QR') orderQuery += ` AND payment_method = 'QR'`;

        const [orderTx] = await db.query(orderQuery, orderParams);

        let subQuery = `
            SELECT 
                sp.id, 
                sp.transaction_id as txn_id, 
                s.full_name as customer, 
                'Subscription' as type, 
                sp.payable_amount as amount, 
                sp.payment_method, 
                sp.created_at 
            FROM subscriptions_payments sp
            JOIN students s ON s.id = sp.student_id
            WHERE sp.outlet_id = ? AND DATE(sp.created_at) = ? AND sp.payment_status = 'SUCCESS'
        `;
        let subParams = [outletId, targetDate];

        if (search) {
            subQuery += ` AND (sp.transaction_id LIKE ? OR s.full_name LIKE ?)`;
            subParams.push(`%${search}%`, `%${search}%`);
        }
        if (filterType === 'CASH') subQuery += ` AND sp.payment_method = 'CASH'`;
        else if (filterType === 'UPI') subQuery += ` AND sp.payment_method IN ('UPI', 'ONLINE')`;
        else if (filterType === 'QR') subQuery += ` AND sp.payment_method = 'QR'`;

        const [subTx] = await db.query(subQuery, subParams);

        const allTransactions = [...orderTx, ...subTx].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        const formattedTx = allTransactions.map(t => ({
            id: t.id,
            transaction_id: t.txn_id,
            customer: t.customer,
            type: t.type,
            amount: Number(t.amount),
            payment_mode: t.payment_method || 'CASH',
            date: t.created_at
        }));

        // ==========================================
        // FINAL RESPONSE
        // ==========================================
        return successResponse(res, 'Daily collection fetched successfully', {
            date: targetDate, // 🆕 Jo date filter lagayi hai wo bhi response me dikhegi
            status: reconData ? reconData.status : 'PENDING',
            submitted_at: reconData ? reconData.submitted_at : null,
            total_collection: totalAmount,
            total_orders: totalOrders,
            payment_mode_wise: {
                cash: { amount: cash, orders: cashOrders },
                online: { amount: online, orders: onlineOrders },
                qr: { amount: qr, orders: qrOrders }
            },
            reconciliation_summary: {
                cash_expected: cash,
                cash_actual: reconData ? Number(reconData.actual_cash) : cash,
                online_expected: online,
                online_actual: reconData ? Number(reconData.actual_online) : online,
                qr_expected: qr,
                qr_actual: reconData ? Number(reconData.actual_qr) : qr,
                remarks: reconData ? reconData.remarks : ''
            },
            transactions: formattedTx
        });

    } catch (error) {
        console.error('❌ Daily Collection Error:', error);
        return errorResponse(res, 'Failed to fetch daily collection', 500);
    }
};

const submitDailyCollection = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const managerId = req.user?.id; 
        if (!managerId) return errorResponse(res, 'Unauthorized', 401);

        const { date, actual_cash, actual_online, actual_qr, remarks } = req.body;
        if (!date) return errorResponse(res, 'Date is required', 400);

        const [userRows] = await connection.query(`SELECT outlet_id FROM users WHERE id = ?`, [managerId]);
        if (userRows.length === 0) return errorResponse(res, 'Manager not found', 404);
        const outletId = userRows[0].outlet_id;

        // Expected Calculate
        const [orderStats] = await connection.query(`
            SELECT SUM(CASE WHEN payment_method = 'CASH' THEN final_amount ELSE 0 END) as cash,
                   SUM(CASE WHEN payment_method IN ('UPI','ONLINE') THEN final_amount ELSE 0 END) as online,
                   SUM(CASE WHEN payment_method = 'QR' THEN final_amount ELSE 0 END) as qr
            FROM orders WHERE outlet_id = ? AND DATE(order_date) = ? AND payment_status = 'PAID'
        `, [outletId, date]);

        const [subStats] = await connection.query(`
            SELECT SUM(CASE WHEN payment_method = 'CASH' THEN payable_amount ELSE 0 END) as cash,
                   SUM(CASE WHEN payment_method IN ('UPI','ONLINE') THEN payable_amount ELSE 0 END) as online,
                   SUM(CASE WHEN payment_method = 'QR' THEN payable_amount ELSE 0 END) as qr
            FROM subscriptions_payments WHERE outlet_id = ? AND DATE(created_at) = ? AND payment_status = 'SUCCESS'
        `, [outletId, date]);

        const expCash = (Number(orderStats[0]?.cash) || 0) + (Number(subStats[0]?.cash) || 0);
        const expOnline = (Number(orderStats[0]?.online) || 0) + (Number(subStats[0]?.online) || 0);
        const expQr = (Number(orderStats[0]?.qr) || 0) + (Number(subStats[0]?.qr) || 0);

        // Insert / Update (Status wapas PENDING_REVIEW ho jayega)
        await connection.query(`
            INSERT INTO daily_reconciliations 
            (outlet_id, manager_id, collection_date, expected_cash, actual_cash, expected_online, actual_online, expected_qr, actual_qr, remarks, status, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', NOW())
            ON DUPLICATE KEY UPDATE 
                actual_cash = VALUES(actual_cash),
                actual_online = VALUES(actual_online),
                actual_qr = VALUES(actual_qr),
                remarks = VALUES(remarks),
                status = 'PENDING_REVIEW',
                submitted_at = NOW(),
                manager_id = VALUES(manager_id),
                approved_by = NULL,
                approved_at = NULL
        `, [
            outletId, managerId, date, 
            expCash, actual_cash || 0, 
            expOnline, actual_online || 0, 
            expQr, actual_qr || 0, 
            remarks || null
        ]);

        await connection.commit();
        return successResponse(res, 'Collection submitted for review', { date, status: 'PENDING_REVIEW' });

    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 'Failed to submit collection', 500);
    } finally {
        connection.release();
    }
};


module.exports = {
	studentOrderList,
	studentOrderById,
	getCustomerList,
	getMachineTypes,
	 addMachine,
  getMachineList,
  updateMachine,
  updateMachineStatus,
  deleteMachine,
	createStaff,
	getStaffList,
	updateStaff,
  updateStaffStatus,
  deleteStaff,
	getAssignedOutlets,
  getOutletDashboard,
  getFlaggedOrders,
  resolveFlaggedOrder,
  getOperationalReports,
  getLegalPage,
  getProfile,
  getAllSubscriptionsByOutlet,
   getSubscriptionById,
   approveOrRejectSubscription,
   getOrderList,
    getOrderById,
    getDashboard,
    markOrderAsDelivered,
    getReportsData,
    getCustomerDetailsById,
    	getComplaintsList,
	getComplaintDetails,
	updateComplaint,
	getSupportAndFaqs,
	 getReceptionists,
	 getDailyCollection,
	submitDailyCollection,
	updateSubscriptionStudentDetails
};
