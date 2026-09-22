const db = require('../config/db');
const { generatePermanentQrCode, renderQrDataUrl } = require('../utils/qrcode.utils');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Student Registration
 */
const studentRegister = async (req, res) => {
  try {
    const {
      mobileNumber,
      fullName,
      gender,
      campusId,
      studentIdCard,
      gradYear,
      course,
      hostelName,
      roomNumber,
      email,
      password,
    } = req.body;

    if (!mobileNumber || !fullName || !gender || !studentIdCard) {
      return errorResponse(
        res,
        'Mobile number, Full Name, Gender (MALE/FEMALE), and Student ID/Roll number are required',
        400
      );
    }

    const [existing] = await db.query(`SELECT id FROM students WHERE phone = ?`, [mobileNumber]);
    if (existing.length > 0) {
      return errorResponse(res, 'A student account with this mobile number already exists', 400);
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await hashPassword(password);
    }

    const studentId = generateId('stu');
    const permanentQr = generatePermanentQrCode(studentId);

    await db.query(
      `INSERT INTO students (id, phone, full_name, gender, campus_id, student_id_card, grad_year, course, hostel_name, room_number, email, password, permanent_qr, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTERED_INACTIVE')`,
      [
        studentId,
        mobileNumber,
        fullName,
        gender.toUpperCase(),
        campusId || null,
        studentIdCard,
        gradYear ? parseInt(gradYear) : null,
        course || null,
        hostelName || null,
        roomNumber || null,
        email || null,
        hashedPassword,
        permanentQr,
      ]
    );

    return successResponse(res, 'Student registered successfully. Status: Registered - subscription inactive', { id: studentId, phone: mobileNumber, fullName, permanentQr }, 201);
  } catch (error) {
    console.error('Student Registration Error:', error);
    return errorResponse(res, 'Failed to register student', 500);
  }
};

/**
 * Upload Student ID Card Photo
 */
const uploadIdCardPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'ID Card image file is required', 400);
    }

    const photoUrl = `/uploads/${req.file.filename}`;
    await db.query(`UPDATE students SET id_card_photo = ? WHERE id = ?`, [photoUrl, req.student.id]);

    return successResponse(res, 'ID card photo uploaded successfully', { photoUrl });
  } catch (error) {
    return errorResponse(res, 'Failed to upload ID card photo', 500);
  }
};

/**
 * Get Student Profile & Permanent QR
 */
const getProfile = async (req, res) => {
  try {
    const [students] = await db.query(
      `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.id = ?`,
      [req.student.id]
    );

    const student = students[0];
    const [subs] = await db.query(
      `SELECT ss.*, p.name as plan_name FROM student_subscriptions ss JOIN subscription_plans p ON ss.plan_id = p.id WHERE ss.student_id = ? AND ss.status = 'ACTIVE' ORDER BY ss.created_at DESC LIMIT 1`,
      [student.id]
    );

    student.activeSubscription = subs[0] || null;
    const qrDataUrl = await renderQrDataUrl(student.permanent_qr);
    const section = student.gender === 'FEMALE' ? 'Girls Section' : 'Boys Section';

    return successResponse(res, 'Student profile fetched successfully', {
      student,
      section,
      permanentQrString: student.permanent_qr,
      qrDataUrl,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch student profile', 500);
  }
};

/**
 * Update Profile
 */
const updateProfile = async (req, res) => {
  try {
    const { hostelName, roomNumber, email, course, gradYear } = req.body;

    const updates = [];
    const params = [];

    if (hostelName !== undefined) { updates.push('hostel_name = ?'); params.push(hostelName); }
    if (roomNumber !== undefined) { updates.push('room_number = ?'); params.push(roomNumber); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (course !== undefined) { updates.push('course = ?'); params.push(course); }
    if (gradYear !== undefined) { updates.push('grad_year = ?'); params.push(parseInt(gradYear)); }

    if (updates.length > 0) {
      params.push(req.student.id);
      await db.query(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return successResponse(res, 'Profile updated successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to update profile', 500);
  }
};

/**
 * Select Subscription Plan
 */
const selectPlanPayAtOutlet = async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) {
      return errorResponse(res, 'Subscription Plan ID is required', 400);
    }

    const [plans] = await db.query(`SELECT * FROM subscription_plans WHERE id = ?`, [planId]);
    if (plans.length === 0) {
      return errorResponse(res, 'Subscription Plan not found', 404);
    }

    const plan = plans[0];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.cycle_days);

    const subId = generateId('sub');
    await db.query(
      `INSERT INTO student_subscriptions (id, student_id, plan_id, start_date, end_date, allocated_quota_kg, remaining_quota_kg, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT')`,
      [subId, req.student.id, planId, startDate, endDate, plan.quota_kg, plan.quota_kg]
    );

    return successResponse(
      res,
      'Subscription plan selected. Please visit outlet accountant to pay and activate your plan.',
      {
        subscriptionId: subId,
        activationInstruction: 'Show your QR code or Phone number at the outlet accountant desk for payment confirmation.',
      },
      201
    );
  } catch (error) {
    return errorResponse(res, 'Failed to select subscription plan', 500);
  }
};

/**
 * Student Home Dashboard
 */
const getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.student.id;

    const [students] = await db.query(
      `SELECT s.*, c.name as campus_name FROM students s LEFT JOIN campuses c ON s.campus_id = c.id WHERE s.id = ?`,
      [studentId]
    );

    const student = students[0];

    const [subs] = await db.query(
      `SELECT ss.*, p.name as plan_name FROM student_subscriptions ss JOIN subscription_plans p ON ss.plan_id = p.id WHERE ss.student_id = ? AND ss.status = 'ACTIVE' ORDER BY ss.created_at DESC LIMIT 1`,
      [studentId]
    );

    const activeSub = subs[0] || null;

    const [outlets] = await db.query(`SELECT name FROM outlets LIMIT 1`);
    const currentOutletName = outlets[0]?.name || 'Main Campus Outlet';

    const [liveOrders] = await db.query(
      `SELECT o.*, ot.name as outlet_name FROM orders o JOIN outlets ot ON o.outlet_id = ot.id WHERE o.student_id = ? ORDER BY o.created_at DESC LIMIT 1`,
      [studentId]
    );

    const qrDataUrl = await renderQrDataUrl(student.permanent_qr);

    return successResponse(res, 'Student dashboard loaded successfully', {
      studentName: student.full_name,
      studentStatus: student.status,
      currentPlan: activeSub ? activeSub.plan_name : 'No Active Plan',
      remainingQuotaKg: activeSub ? activeSub.remaining_quota_kg : 0,
      totalQuotaKg: activeSub ? activeSub.allocated_quota_kg : 0,
      outletName: currentOutletName,
      liveOrder: liveOrders[0] || null,
      permanentQr: student.permanent_qr,
      qrDataUrl,
    });
  } catch (error) {
    console.error('Student Dashboard Error:', error);
    return errorResponse(res, 'Failed to load student dashboard', 500);
  }
};

/**
 * Order Tracking & History
 */
const getStudentOrders = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, ot.name as outlet_name FROM orders o JOIN outlets ot ON o.outlet_id = ot.id WHERE o.student_id = ? ORDER BY o.created_at DESC`,
      [req.student.id]
    );

    return successResponse(res, 'Student orders fetched successfully', orders);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch student orders', 500);
  }
};

/**
 * Raise Complaint
 */
const raiseComplaint = async (req, res) => {
  try {
    const { orderId, type, description } = req.body;

    if (!orderId || !type || !description) {
      return errorResponse(res, 'Order ID, Complaint Type, and Description are required', 400);
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const complaintId = generateId('cmp');
    await db.query(
      `INSERT INTO complaints (id, student_id, order_id, type, description, photo_url, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [complaintId, req.student.id, orderId, type, description, photoUrl]
    );

    const flagReason = type === 'MISSING_ITEM' ? 'MISSING_ITEM' : type === 'DELAY' ? 'DELAY' : type === 'DAMAGE' ? 'DAMAGE' : 'OTHER';
    const flagId = generateId('flg');

    await db.query(
      `INSERT INTO order_flags (id, order_id, reason, details, status) VALUES (?, ?, ?, ?, 'OPEN') ON DUPLICATE KEY UPDATE reason = VALUES(reason), details = VALUES(details)`,
      [flagId, orderId, flagReason, description]
    );

    return successResponse(res, 'Complaint submitted successfully and flagged for Outlet Manager resolution', { complaintId }, 201);
  } catch (error) {
    console.error('Raise Complaint Error:', error);
    return errorResponse(res, 'Failed to submit complaint', 500);
  }
};

/**
 * Rate Outlet
 */
const rateOutlet = async (req, res) => {
  try {
    const { orderId, score, comment } = req.body;

    if (!orderId || !score) {
      return errorResponse(res, 'Order ID and Score (1-5) are required', 400);
    }

    const [orders] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (orders.length === 0 || orders[0].student_id !== req.student.id) {
      return errorResponse(res, 'Order not found or unauthorized', 404);
    }

    const ratingId = generateId('rtg');
    await db.query(
      `INSERT INTO ratings (id, student_id, order_id, outlet_id, score, comment) VALUES (?, ?, ?, ?, ?, ?)`,
      [ratingId, req.student.id, orderId, orders[0].outlet_id, parseInt(score), comment || null]
    );

    return successResponse(res, 'Outlet rated successfully', { ratingId }, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to submit rating', 500);
  }
};

/**
 * Get Notices
 */
const getNotices = async (req, res) => {
  try {
    const [notices] = await db.query(
      `SELECT * FROM notices WHERE target_type = 'ALL_STUDENTS' OR target_type = 'ALL_OUTLETS' ORDER BY created_at DESC`
    );

    return successResponse(res, 'Notices fetched successfully', notices);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch notices', 500);
  }
};

module.exports = {
  studentRegister,
  uploadIdCardPhoto,
  getProfile,
  updateProfile,
  selectPlanPayAtOutlet,
  getStudentDashboard,
  getStudentOrders,
  raiseComplaint,
  rateOutlet,
  getNotices,
};
