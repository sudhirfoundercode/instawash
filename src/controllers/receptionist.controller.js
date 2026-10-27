const db = require('../config/db');
const { calculatePaygBilling } = require('../utils/payg.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Search Students by Phone or Subscription ID or Roll Number
 */
const searchStudent = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return errorResponse(res, 'Search query is required', 400);
    }

    const searchPattern = `%${query}%`;
    const [students] = await db.query(
      `SELECT s.*, c.name as campus_name 
       FROM students s 
       LEFT JOIN campuses c ON s.campus_id = c.id 
       WHERE s.phone LIKE ? OR s.student_id_card LIKE ? OR s.permanent_qr = ?`,
      [searchPattern, searchPattern, query]
    );

    for (const student of students) {
      const [subs] = await db.query(
        `SELECT ss.*, p.name as plan_name, p.payg_rate_per_kg, p.min_billing_unit_kg 
         FROM student_subscriptions ss 
         JOIN subscription_plans p ON ss.plan_id = p.id 
         WHERE ss.student_id = ? AND ss.status = 'ACTIVE' 
         ORDER BY ss.created_at DESC LIMIT 1`,
        [student.id]
      );
      student.activeSubscription = subs[0] || null;
    }

    return successResponse(res, 'Students found successfully', students);
  } catch (error) {
    console.error('Student Search Error:', error);
    return errorResponse(res, 'Failed to search student', 500);
  }
};

/**
 * Get Student by Permanent QR Code Scan
 */
const getStudentByQr = async (req, res) => {
  try {
    const { qrToken } = req.params;

    const [students] = await db.query(
      `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.permanent_qr = ?`,
      [qrToken]
    );

    if (students.length === 0) {
      return errorResponse(res, 'Student not found with scanned QR Code', 404);
    }

    const student = students[0];
    const [subs] = await db.query(
      `SELECT ss.*, p.name as plan_name, p.payg_rate_per_kg, p.min_billing_unit_kg 
       FROM student_subscriptions ss 
       JOIN subscription_plans p ON ss.plan_id = p.id 
       WHERE ss.student_id = ? AND ss.status = 'ACTIVE' 
       ORDER BY ss.created_at DESC LIMIT 1`,
      [student.id]
    );
    student.activeSubscription = subs[0] || null;

    return successResponse(res, 'Student details fetched via QR scan', student);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch student by QR', 500);
  }
};

/**
 * Item Intake at Drop-Off
 */
const createDropOffIntake = async (req, res) => {
  try {
    const {
      studentId,
      pieceCount,
      weightKg,
      washType,
      withIron,
      itemCondition,
      discountPercent,
    } = req.body;

    if (!studentId || !pieceCount || !weightKg || !washType) {
      return errorResponse(res, 'Student ID, Piece count, Weight (KG), and Wash type are required', 400);
    }

    const [students] = await db.query(`SELECT * FROM students WHERE id = ?`, [studentId]);
    if (students.length === 0) {
      return errorResponse(res, 'Student not found', 404);
    }

    const student = students[0];
    const section = student.gender === 'FEMALE' ? 'Girls Section' : 'Boys Section';

    const outletId = req.assignedOutletIds && req.assignedOutletIds.length > 0
      ? req.assignedOutletIds[0]
      : (await db.query(`SELECT id FROM outlets LIMIT 1`))[0][0]?.id;

    if (!outletId) {
      return errorResponse(res, 'No outlet assigned to receptionist', 400);
    }

    // Active subscription
    const [subs] = await db.query(
      `SELECT ss.*, p.payg_rate_per_kg, p.min_billing_unit_kg 
       FROM student_subscriptions ss 
       JOIN subscription_plans p ON ss.plan_id = p.id 
       WHERE ss.student_id = ? AND ss.status = 'ACTIVE' 
       ORDER BY ss.created_at DESC LIMIT 1`,
      [studentId]
    );

    const activeSub = subs[0] || null;
    const remainingQuota = activeSub ? activeSub.remaining_quota_kg : 0;
    const paygRate = activeSub ? activeSub.payg_rate_per_kg : 50.0;
    const minBillingUnit = activeSub ? activeSub.min_billing_unit_kg : 5.0;

    const reqDiscount = parseFloat(discountPercent || 0);
    const maxDiscountAllowed = req.user.role === 'SUPER_ADMIN' ? 100 : (req.user.max_discount_percent || 0);
    if (reqDiscount > maxDiscountAllowed) {
      return errorResponse(
        res,
        `Discount (${reqDiscount}%) exceeds your max allowed discount of ${maxDiscountAllowed}%`,
        400
      );
    }

    const inputWeight = parseFloat(weightKg);
    const paygCalc = calculatePaygBilling({
      remainingQuotaKg: remainingQuota,
      intakeWeightKg: inputWeight,
      paygRatePerKg: paygRate,
      minBillingUnitKg: minBillingUnit,
      discountPercent: reqDiscount,
    });

    const quotaDeducted = Math.min(inputWeight, remainingQuota);
    if (activeSub && quotaDeducted > 0) {
      await db.query(
        `UPDATE student_subscriptions SET remaining_quota_kg = GREATEST(remaining_quota_kg - ?, 0) WHERE id = ?`,
        [quotaDeducted, activeSub.id]
      );
    }

    const orderId = generateId('ord');
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    await db.query(
      `INSERT INTO orders (id, order_number, student_id, outlet_id, section, intake_staff_id, piece_count, weight_kg, wash_type, with_iron, item_condition, status, payg_over_quota_kg, payg_amount, discount_percent, discount_amount, final_amount) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?)`,
      [
        orderId,
        orderNumber,
        studentId,
        outletId,
        section,
        req.user.id,
        parseInt(pieceCount),
        inputWeight,
        washType,
        withIron ? 1 : 0,
        itemCondition || 'Good',
        paygCalc.overQuotaKg,
        paygCalc.paygAmount,
        reqDiscount,
        paygCalc.discountAmount,
        paygCalc.finalAmount,
      ]
    );

    await db.query(
      `INSERT INTO order_status_logs (id, order_id, status, updated_by_id) VALUES (?, ?, 'RECEIVED', ?)`,
      [generateId('osl'), orderId, req.user.id]
    );

    return successResponse(res, 'Order intake completed successfully at drop-off', { orderId, orderNumber, finalAmount: paygCalc.finalAmount }, 201);
  } catch (error) {
    console.error('Intake Error:', error);
    return errorResponse(res, 'Failed to complete order intake', 500);
  }
};

/**
 * Update Order Status
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['RECEIVED', 'IN_WASH', 'READY', 'COLLECTED'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    await db.query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId]);

    await db.query(
      `INSERT INTO order_status_logs (id, order_id, status, updated_by_id) VALUES (?, ?, ?, ?)`,
      [generateId('osl'), orderId, status, req.user.id]
    );

    return successResponse(res, `Order status updated to ${status}`);
  } catch (error) {
    console.error('Update Order Status Error:', error);
    return errorResponse(res, 'Failed to update order status', 500);
  }
};

/**
 * Register or Update Student by Receptionist / Staff (Sets status to ACTIVE_SUBSCRIBED)
 */
const registerStudentByReceptionist = async (req, res) => {
  try {
    const { generatePermanentQrCode } = require('../utils/qrcode.utils');
    const { hashPassword } = require('../utils/password.utils');
    const {
      phone,
      mobileNumber,
      mobile,
      mobile_no,
      phoneNumber,
      phone_number,
      fullName,
      full_name,
      name,
      gender,
      campusId,
      campus_id,
      studentIdCard,
      student_id_card,
      rollNumber,
      roll_number,
      studentId,
      gradYear,
      grad_year,
      course,
      hostelName,
      hostel_name,
      roomNumber,
      room_number,
      email,
      password,
    } = req.body;

    const contactPhone = phone || mobileNumber || mobile || mobile_no || phoneNumber || phone_number;
    const studentName = fullName || full_name || name;
    const idCard = studentIdCard || student_id_card || rollNumber || roll_number || studentId;
    const targetCampusId = campusId || campus_id || null;
    const targetGradYear = (gradYear || grad_year) ? parseInt(gradYear || grad_year) : null;
    const targetCourse = course || null;
    const targetHostel = hostelName || hostel_name || null;
    const targetRoom = roomNumber || room_number || null;
    const targetEmail = email || null;
    const targetGender = (gender || 'MALE').toUpperCase();

    if (!contactPhone || !studentName || !idCard) {
      return errorResponse(res, 'Phone number, Full Name, and Student ID / Roll Number are required', 400);
    }

    // 1. Check if student with this mobile/phone number already exists
    const [existingStudents] = await db.query(`SELECT * FROM students WHERE phone = ?`, [contactPhone]);

    if (existingStudents.length > 0) {
      const existingStudent = existingStudents[0];
      let hashedPassword = existingStudent.password;
      if (password) {
        hashedPassword = await hashPassword(password);
      }

      // Update existing student record and set status to ACTIVE_SUBSCRIBED
      await db.query(
        `UPDATE students SET 
          full_name = ?, 
          gender = ?, 
          student_id_card = ?, 
          campus_id = COALESCE(?, campus_id),
          grad_year = COALESCE(?, grad_year),
          course = COALESCE(?, course),
          hostel_name = COALESCE(?, hostel_name),
          room_number = COALESCE(?, room_number),
          email = COALESCE(?, email),
          password = ?,
          status = 'ACTIVE_SUBSCRIBED'
        WHERE id = ?`,
        [
          studentName,
          targetGender,
          idCard,
          targetCampusId,
          targetGradYear,
          targetCourse,
          targetHostel,
          targetRoom,
          targetEmail,
          hashedPassword,
          existingStudent.id,
        ]
      );

      const [updatedRows] = await db.query(
        `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.id = ?`,
        [existingStudent.id]
      );
      const updatedStudent = updatedRows[0];

      return successResponse(res, 'Existing student profile updated successfully by Receptionist', {
        student: updatedStudent,
        isUpdated: true,
        id: updatedStudent.id,
        phone: updatedStudent.phone,
        fullName: updatedStudent.full_name,
        permanentQr: updatedStudent.permanent_qr,
        status: 'ACTIVE_SUBSCRIBED',
      }, 200);
    }

    // 2. Mobile number does not exist -> Create new student record with ACTIVE_SUBSCRIBED status
    const [existingCard] = await db.query(`SELECT id FROM students WHERE student_id_card = ?`, [idCard]);
    if (existingCard.length > 0) {
      return errorResponse(res, 'A student account with this Student ID / Roll Number already exists', 400);
    }

    const hashedPassword = await hashPassword(password || 'Student@123');
    const newStudentId = generateId('stu');
    const permanentQr = generatePermanentQrCode(newStudentId);

    await db.query(
      `INSERT INTO students (id, phone, full_name, gender, campus_id, student_id_card, grad_year, course, hostel_name, room_number, email, password, permanent_qr, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE_SUBSCRIBED')`,
      [
        newStudentId,
        contactPhone,
        studentName,
        targetGender,
        targetCampusId,
        idCard,
        targetGradYear,
        targetCourse,
        targetHostel,
        targetRoom,
        targetEmail,
        hashedPassword,
        permanentQr,
      ]
    );

    const [newRows] = await db.query(
      `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.id = ?`,
      [newStudentId]
    );
    const newStudent = newRows[0];

    return successResponse(res, 'Student registered successfully by Receptionist', {
      student: newStudent,
      isCreated: true,
      id: newStudentId,
      phone: contactPhone,
      fullName: studentName,
      permanentQr,
      status: 'ACTIVE_SUBSCRIBED',
    }, 201);
  } catch (error) {
    console.error('Receptionist Student Register Error:', error);
    return errorResponse(res, 'Failed to register student', 500);
  }
};

/**
 * Daily Activity Log
 */
const getDailyActivityLog = async (req, res) => {
  try {
    const staffId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const [ownDropOffs] = await db.query(
      `SELECT o.*, s.full_name as student_name FROM orders o JOIN students s ON o.student_id = s.id WHERE o.intake_staff_id = ? AND DATE(o.created_at) = ?`,
      [staffId, today]
    );

    const [ownCollections] = await db.query(
      `SELECT osl.*, o.order_number, s.full_name as student_name 
       FROM order_status_logs osl 
       JOIN orders o ON osl.order_id = o.id 
       JOIN students s ON o.student_id = s.id 
       WHERE osl.updated_by_id = ? AND osl.status = 'COLLECTED' AND DATE(osl.created_at) = ?`,
      [staffId, today]
    );

    return successResponse(res, 'Daily activity log fetched successfully', {
      dropOffCount: ownDropOffs.length,
      collectionCount: ownCollections.length,
      dropOffs: ownDropOffs,
      collections: ownCollections,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch daily activity log', 500);
  }
};

module.exports = {
  searchStudent,
  getStudentByQr,
  registerStudentByReceptionist,
  createDropOffIntake,
  updateOrderStatus,
  getDailyActivityLog,
};
