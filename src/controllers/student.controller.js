const db = require('../config/db');
const { generatePermanentQrCode, renderQrDataUrl } = require('../utils/qrcode.utils');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

const axios = require('axios');
const https = require('https');
const { lookup } = require('dns');
const { promisify } = require('util');
const QRCode = require('qrcode');
const dnsLookup = promisify(lookup);

//const { comparePassword } = require('../utils/password.utils');
const { generateToken, blacklistToken } = require('../utils/jwt.utils');
//const { successResponse, errorResponse } = require('../utils/response.utils');
const { getSidebarModulesForUser } = require('../utils/sidebar.utils');
const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');
 

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Student Registration
 */
// const studentRegister = async (req, res) => {
//   try {
//     const {
//       mobileNumber,
//       fullName,
//       role,
//       gender,
//       campusId,
//       rollNumber,
//       outletId,
//       course,
//       hostelName,
//       roomNumber,
//       address,
//       area,
//       pinCode,
//     } = req.body;

//     // Basic validation
//     if (!mobileNumber || !fullName || !role || !gender) {
//       return errorResponse(
//         res,
//         'Mobile number, Full Name, Role, and Gender are required',
//         400
//       );
//     }

//     const userRole = role.toUpperCase();

//     // Validate role
//     if (!['STUDENT', 'NON_STUDENT'].includes(userRole)) {
//       return errorResponse(
//         res,
//         'Role must be STUDENT or NON_STUDENT',
//         400
//       );
//     }

//     // Check existing mobile number
//     const [existing] = await db.query(
//       `SELECT id FROM students WHERE phone = ?`,
//       [mobileNumber]
//     );

//     // =====================================================
//     // STUDENT
//     // =====================================================
//     if (userRole === 'STUDENT') {
//       if (!rollNumber) {
//         return errorResponse(
//           res,
//           'Roll number is required for STUDENT',
//           400
//         );
//       }

//       // If mobile already exists -> UPDATE
//       if (existing.length > 0) {
//         const userId = existing[0].id;

//         await db.query(
//           `UPDATE students SET
//             full_name = ?,
//             role = ?,
//             gender = ?,
//             campus_id = ?,
//             roll_number = ?,
//             outlet_id = ?,
//             course = ?,
//             hostel_name = ?,
//             room_number = ?,
//             permanent_qr = NULL,
//             status = 'REGISTERED_INACTIVE'
//           WHERE id = ?`,
//           [
//             fullName,
//             userRole,
//             gender.toUpperCase(),
//             campusId || null,
//             rollNumber,
//             outletId || null,
//             course || null,
//             hostelName || null,
//             roomNumber || null,
//             userId,
//           ]
//         );

//         return successResponse(
//           res,
//           'Student details updated successfully',
//           {
//             id: userId,
//             phone: mobileNumber,
//             fullName,
//             role: userRole,
//             status: 'REGISTERED_INACTIVE',
//             permanentQr: null,
//           }
//         );
//       }

//       // New student -> INSERT
//       const userId = generateId('stu');

//       await db.query(
//         `INSERT INTO students
//         (
//           id,
//           phone,
//           full_name,
//           role,
//           gender,
//           campus_id,
//           roll_number,
//           outlet_id,
//           course,
//           hostel_name,
//           room_number,
//           permanent_qr,
//           status
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
//         [
//           userId,
//           mobileNumber,
//           fullName,
//           userRole,
//           gender.toUpperCase(),
//           campusId || null,
//           rollNumber,
//           outletId || null,
//           course || null,
//           hostelName || null,
//           roomNumber || null,
//         ]
//       );

//       return successResponse(
//         res,
//         'Student registered successfully. Status: Registered - subscription inactive',
//         {
//           id: userId,
//           phone: mobileNumber,
//           fullName,
//           role: userRole,
//           status: 'REGISTERED_INACTIVE',
//           permanentQr: null,
//         },
//         201
//       );
//     }

//     // =====================================================
//     // NON STUDENT
//     // =====================================================
//     if (userRole === 'NON_STUDENT') {

//       // If mobile already exists -> UPDATE
//       if (existing.length > 0) {
//         const userId = existing[0].id;

//         await db.query(
//           `UPDATE students SET
//             full_name = ?,
//             role = ?,
//             gender = ?,
//             campus_id = ?,
//             outlet_id = ?,
//             address = ?,
//             area = ?,
//             pin_code = ?,
//             permanent_qr = NULL,
//             status = 'REGISTERED_INACTIVE'
//           WHERE id = ?`,
//           [
//             fullName,
//             userRole,
//             gender.toUpperCase(),
//             campusId || null,
//             outletId || null,
//             address || null,
//             area || null,
//             pinCode || null,
//             userId,
//           ]
//         );

//         return successResponse(
//           res,
//           'Non-student details updated successfully',
//           {
//             id: userId,
//             phone: mobileNumber,
//             fullName,
//             role: userRole,
//             status: 'REGISTERED_INACTIVE',
//             permanentQr: null,
//           }
//         );
//       }

//       // New non-student -> INSERT
//       const userId = generateId('stu');

//       await db.query(
//         `INSERT INTO students
//         (
//           id,
//           phone,
//           full_name,
//           role,
//           gender,
//           campus_id,
//           outlet_id,
//           address,
//           area,
//           pin_code,
//           permanent_qr,
//           status
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
//         [
//           userId,
//           mobileNumber,
//           fullName,
//           userRole,
//           gender.toUpperCase(),
//           campusId || null,
//           outletId || null,
//           address || null,
//           area || null,
//           pinCode || null,
//         ]
//       );

//       return successResponse(
//         res,
//         'Non-student registered successfully. Status: Registered - subscription inactive',
//         {
//           id: userId,
//           phone: mobileNumber,
//           fullName,
//           role: userRole,
//           status: 'REGISTERED_INACTIVE',
//           permanentQr: null,
//         },
//         201
//       );
//     }

//   } catch (error) {
//     console.error('Registration Error:', error);
//     return errorResponse(res, 'Failed to register user', 500);
//   }
// };

// 07/10/2026
// const studentRegister = async (req, res) => {
//   try {
//     const {
//       mobileNumber,
//       fullName,
//       role,
//       gender,
//       campusId,
//       rollNumber,
//       outletId,
//       course,
//       hostelName,
//       roomNumber,
//       address,
//       area,
//       pinCode,
//     } = req.body;

//     // Profile image
//     const profileImage = req.file ? req.file.filename : null;

//     // Basic validation
//     if (!mobileNumber || !fullName || !role || !gender) {
//       return errorResponse(
//         res,
//         'Mobile number, Full Name, Role, and Gender are required',
//         400
//       );
//     }

//     const userRole = role.toUpperCase();

//     // Validate role
//     if (!['STUDENT', 'NON_STUDENT'].includes(userRole)) {
//       return errorResponse(
//         res,
//         'Role must be STUDENT or NON_STUDENT',
//         400
//       );
//     }

//     // Check existing mobile
//     const [existing] = await db.query(
//       `SELECT id, profile_image FROM students WHERE phone = ?`,
//       [mobileNumber]
//     );

//     // =====================================================
//     // STUDENT
//     // =====================================================
//     if (userRole === 'STUDENT') {

//       if (!rollNumber) {
//         return errorResponse(
//           res,
//           'Roll number is required for STUDENT',
//           400
//         );
//       }

//       // Existing mobile -> UPDATE
//       if (existing.length > 0) {
//         const userId = existing[0].id;

//         await db.query(
//           `UPDATE students SET
//             full_name = ?,
//             profile_image = COALESCE(?, profile_image),
//             role = ?,
//             gender = ?,
//             campus_id = ?,
//             roll_number = ?,
//             outlet_id = ?,
//             course = ?,
//             hostel_name = ?,
//             room_number = ?,
//             permanent_qr = NULL,
//             status = 'REGISTERED_INACTIVE'
//           WHERE id = ?`,
//           [
//             fullName,
//             profileImage,
//             userRole,
//             gender.toUpperCase(),
//             campusId || null,
//             rollNumber,
//             outletId || null,
//             course || null,
//             hostelName || null,
//             roomNumber || null,
//             userId,
//           ]
//         );

//         return successResponse(
//           res,
//           'Student details updated successfully',
//           {
//             id: userId,
//             phone: mobileNumber,
//             fullName,
//             role: userRole,
//             profileImage: profileImage || existing[0].profile_image,
//             status: 'REGISTERED_INACTIVE',
//             permanentQr: null,
//           }
//         );
//       }

//       // New student -> INSERT
//       const userId = generateId('stu');

//       await db.query(
//         `INSERT INTO students
//         (
//           id,
//           phone,
//           full_name,
//           profile_image,
//           role,
//           gender,
//           campus_id,
//           roll_number,
//           outlet_id,
//           course,
//           hostel_name,
//           room_number,
//           permanent_qr,
//           status
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
//         [
//           userId,
//           mobileNumber,
//           fullName,
//           profileImage,
//           userRole,
//           gender.toUpperCase(),
//           campusId || null,
//           rollNumber,
//           outletId || null,
//           course || null,
//           hostelName || null,
//           roomNumber || null,
//         ]
//       );

//       return successResponse(
//         res,
//         'Student registered successfully. Status: Registered - subscription inactive',
//         {
//           id: userId,
//           phone: mobileNumber,
//           fullName,
//           role: userRole,
//           profileImage,
//           status: 'REGISTERED_INACTIVE',
//           permanentQr: null,
//         },
//         201
//       );
//     }

//     // =====================================================
//     // NON STUDENT
//     // =====================================================
//     if (userRole === 'NON_STUDENT') {

//       // Existing mobile -> UPDATE
//       if (existing.length > 0) {
//         const userId = existing[0].id;

//         await db.query(
//           `UPDATE students SET
//             full_name = ?,
//             profile_image = COALESCE(?, profile_image),
//             role = ?,
//             gender = ?,
//             campus_id = ?,
//             outlet_id = ?,
//             address = ?,
//             area = ?,
//             pin_code = ?,
//             permanent_qr = NULL,
//             status = 'REGISTERED_INACTIVE'
//           WHERE id = ?`,
//           [
//             fullName,
//             profileImage,
//             userRole,
//             gender.toUpperCase(),
//             campusId || null,
//             outletId || null,
//             address || null,
//             area || null,
//             pinCode || null,
//             userId,
//           ]
//         );

//         return successResponse(
//           res,
//           'Non-student details updated successfully',
//           {
//             id: userId,
//             phone: mobileNumber,
//             fullName,
//             role: userRole,
//             profileImage: profileImage || existing[0].profile_image,
//             status: 'REGISTERED_INACTIVE',
//             permanentQr: null,
//           }
//         );
//       }

//       // New non-student -> INSERT
//       const userId = generateId('stu');

//       await db.query(
//         `INSERT INTO students
//         (
//           id,
//           phone,
//           full_name,
//           profile_image,
//           role,
//           gender,
//           campus_id,
//           outlet_id,
//           address,
//           area,
//           pin_code,
//           permanent_qr,
//           status
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
//         [
//           userId,
//           mobileNumber,
//           fullName,
//           profileImage,
//           userRole,
//           gender.toUpperCase(),
//           campusId || null,
//           outletId || null,
//           address || null,
//           area || null,
//           pinCode || null,
//         ]
//       );

//       return successResponse(
//         res,
//         'Non-student registered successfully. Status: Registered - subscription inactive',
//         {
//           id: userId,
//           phone: mobileNumber,
//           fullName,
//           role: userRole,
//           profileImage,
//           status: 'REGISTERED_INACTIVE',
//           permanentQr: null,
//         },
//         201
//       );
//     }

//   } catch (error) {
//     console.error('Registration Error:', error);
//     return errorResponse(res, 'Failed to register user', 500);
//   }
// };
// 07/10/2026
const studentRegister = async (req, res) => {
  try {
    const {
      mobileNumber,
      fullName,
      role,
      gender,
      campusId,
      rollNumber,
      outletId,
      course,
      hostelName,
      roomNumber,
      address,
      area,
      pinCode,
    } = req.body;

    const profileImage = req.file ? req.file.filename : null;

    if (!mobileNumber || !fullName || !role || !gender) {
      return errorResponse(
        res,
        'Mobile number, Full Name, Role, and Gender are required',
        400
      );
    }

    const userRole = role.toUpperCase();

    if (!['STUDENT', 'NON_STUDENT'].includes(userRole)) {
      return errorResponse(
        res,
        'Role must be STUDENT or NON_STUDENT',
        400
      );
    }

    const [existing] = await db.query(
      `SELECT id, profile_image FROM students WHERE phone = ?`,
      [mobileNumber]
    );

    // =====================================================
    // STUDENT
    // =====================================================
    if (userRole === 'STUDENT') {

      // Existing student -> UPDATE
      if (existing.length > 0) {
        const userId = existing[0].id;

        await db.query(
          `UPDATE students SET
            full_name = ?,
            profile_image = COALESCE(?, profile_image),
            role = ?,
            gender = ?,
            campus_id = ?,
            roll_number = ?,
            outlet_id = ?,
            course = ?,
            hostel_name = ?,
            room_number = ?,
            permanent_qr = NULL,
            is_active = 1,
            status = 'REGISTERED_INACTIVE'
          WHERE id = ?`,
          [
            fullName,
            profileImage,
            userRole,
            gender.toUpperCase(),
            campusId || null,
            rollNumber || null,
            outletId || null,
            course || null,
            hostelName || null,
            roomNumber || null,
            userId,
          ]
        );

        // Generate Token
        const api_token = generateToken({
          id: userId,
          phone: mobileNumber,
          role: userRole,
          isStudent: true
        });

        return successResponse(
          res,
          'Student details updated successfully',
          {
            id: userId,
            phone: mobileNumber,
            fullName,
            role: userRole,
            profileImage: profileImage || existing[0].profile_image,
            status: 'REGISTERED_INACTIVE',
            permanentQr: null,
            token: api_token
          }
        );
      }

      // New student -> INSERT
      const userId = generateId('stu');

      await db.query(
        `INSERT INTO students
        (
          id,
          phone,
          full_name,
          profile_image,
          role,
          gender,
          campus_id,
          roll_number,
          outlet_id,
          course,
          hostel_name,
          room_number,
          permanent_qr,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
        [
          userId,
          mobileNumber,
          fullName,
          profileImage,
          userRole,
          gender.toUpperCase(),
          campusId || null,
          rollNumber || null,
          outletId || null,
          course || null,
          hostelName || null,
          roomNumber || null,
        ]
      );

      // Generate Token
      const api_token = generateToken({
        id: userId,
        phone: mobileNumber,
        role: userRole,
        isStudent: true
      });

      return successResponse(
        res,
        'Student registered successfully. Status: Registered - subscription inactive',
        {
          id: userId,
          phone: mobileNumber,
          fullName,
          role: userRole,
          profileImage,
          status: 'REGISTERED_INACTIVE',
          permanentQr: null,
          token: api_token
        },
        201
      );
    }

    // =====================================================
    // NON STUDENT
    // =====================================================
    if (userRole === 'NON_STUDENT') {

      // Existing non-student -> UPDATE
      if (existing.length > 0) {
        const userId = existing[0].id;

        await db.query(
          `UPDATE students SET
            full_name = ?,
            profile_image = COALESCE(?, profile_image),
            role = ?,
            gender = ?,
            campus_id = ?,
            outlet_id = ?,
            address = ?,
            area = ?,
            pin_code = ?,
            permanent_qr = NULL,
            status = 'REGISTERED_INACTIVE'
          WHERE id = ?`,
          [
            fullName,
            profileImage,
            userRole,
            gender.toUpperCase(),
            campusId || null,
            outletId || null,
            address || null,
            area || null,
            pinCode || null,
            userId,
          ]
        );

        // Generate Token
        const api_token = generateToken({
          id: userId,
          phone: mobileNumber,
          role: userRole,
          isStudent: false
        });

        return successResponse(
          res,
          'Non-student details updated successfully',
          {
            id: userId,
            phone: mobileNumber,
            fullName,
            role: userRole,
            profileImage: profileImage || existing[0].profile_image,
            status: 'REGISTERED_INACTIVE',
            permanentQr: null,
            token: api_token
          }
        );
      }

      // New non-student -> INSERT
      const userId = generateId('stu');

      await db.query(
        `INSERT INTO students
        (
          id,
          phone,
          full_name,
          profile_image,
          role,
          gender,
          campus_id,
          outlet_id,
          address,
          area,
          pin_code,
          permanent_qr,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'REGISTERED_INACTIVE')`,
        [
          userId,
          mobileNumber,
          fullName,
          profileImage,
          userRole,
          gender.toUpperCase(),
          campusId || null,
          outletId || null,
          address || null,
          area || null,
          pinCode || null,
        ]
      );

      // Generate Token
      const api_token = generateToken({
        id: userId,
        phone: mobileNumber,
        role: userRole,
        isStudent: false
      });

      return successResponse(
        res,
        'Non-student registered successfully. Status: Registered - subscription inactive',
        {
          id: userId,
          phone: mobileNumber,
          fullName,
          role: userRole,
          profileImage,
          status: 'REGISTERED_INACTIVE',
          permanentQr: null,
          token: api_token
        },
        201
      );
    }

  } catch (error) {
    console.error('Registration Error:', error);
    return errorResponse(res, 'Failed to register user', 500);
  }
};
// Get Banner

const getBannerList = async (req, res) => {
  try {
    const [banners] = await db.query(`
      SELECT
        id,
        image,
        redirect_url,
        status,
        created_at,
        updated_at
      FROM banners
      WHERE status = 1
      ORDER BY id DESC
    `);

    const bannerList = banners.map((banner) => ({
      ...banner,
      image: banner.image
        ? `https://instawash.siberiancrane.tech/uploads/${banner.image}`
        : null
    }));

    return successResponse(
      res,
      'Banner list fetched successfully',
      {
        banners: bannerList
      }
    );

  } catch (error) {
    console.error('Get Banner List Error:', error);

    return errorResponse(
      res,
      'Failed to fetch banner list',
      500
    );
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



// 23/10/2026
// const ORDERS = {
//   table: 'orders',
//   studentId: 'student_id',
//   weightKg: 'total_weight_kg',
//   createdAt: 'created_at'
// };

// // ==========================================
// // Helper: Build consistent services array
// // ==========================================
// const buildServices = (plan) => {
//   if (!plan) return [];

//   const foldPrice  = Number(plan.wash_dry_fold_price_per_kg)  || 0;
//   const foldKg     = Number(plan.wash_dry_fold_min_order_kg)  || 0;

//   const steamPrice = Number(plan.wash_dry_steam_price_per_kg) || 0;
//   const steamKg    = Number(plan.wash_dry_steam_min_order_kg) || 0;

//   return [
//     {
//       code: 'WASH_DRY_FOLD',
//       name: 'Wash • Dry • Fold',
//       price_per_kg: foldPrice,
//       min_order_kg: foldKg,
//       min_order_amount: foldPrice * foldKg
//     },
//     {
//       code: 'WASH_DRY_STEAM',
//       name: 'Wash • Dry • Fold • Iron',
//       price_per_kg: steamPrice,
//       min_order_kg: steamKg,
//       min_order_amount: steamPrice * steamKg
//     }
//   ];
// };


// const getProfile = async (req, res) => {
//   try {
//     const [students] = await db.query(
//       `SELECT
//         s.*,
//         c.name AS campus_name,
//         o.name AS outlet_name
//       FROM students s
//       LEFT JOIN campuses c ON s.campus_id = c.id
//       LEFT JOIN outlets o ON s.outlet_id = o.id
//       WHERE s.id = ?
//       LIMIT 1`,
//       [req.student.id]
//     );

//     if (students.length === 0) {
//       return errorResponse(res, 'Student profile not found', 404);
//     }

//     const student = students[0];

//     // Profile image URL
//     student.profile_image = student.profile_image
//       ? `https://instawash.siberiancrane.tech/uploads/${student.profile_image}`
//       : null;

//     const parseJsonSafe = (value, fallback) => {
//       if (value === null || value === undefined || value === '') return fallback;
//       if (typeof value !== 'string') return value;
//       try { return JSON.parse(value); } catch (e) { return fallback; }
//     };

//     const campusId = Number(student.campus_id);
//     const outletId = Number(student.outlet_id);

//     // ==========================================
//     // Pay as you go plans
//     // ==========================================
//     const [paygPlans] = await db.query(
//       `SELECT
//         id, plan_name, description,
//         wash_dry_fold_price_per_kg, wash_dry_fold_min_order_kg,
//         wash_dry_steam_price_per_kg, wash_dry_steam_min_order_kg,
//         applicability_type, applicable_ids, outlet_discount_limits
//       FROM pay_as_you_go_plans
//       WHERE status = 1
//       ORDER BY id DESC`
//     );

//     const matchedPlan = paygPlans.find(plan => {
//       const applicable = parseJsonSafe(plan.applicable_ids, []);
//       if (!Array.isArray(applicable)) return false;

//       return applicable.some(a =>
//         Number(a.campus_id) === campusId &&
//         Array.isArray(a.outlet_ids) &&
//         a.outlet_ids.map(Number).includes(outletId)
//       );
//     });

//     const findDiscount = (plan) => {
//       if (!plan) return null;
//       const limits = parseJsonSafe(plan.outlet_discount_limits, []);
//       if (!Array.isArray(limits)) return null;

//       return limits.find(l =>
//         Number(l.campus_id) === campusId &&
//         Number(l.outlet_id) === outletId
//       ) || null;
//     };

//     let discountEntry = findDiscount(matchedPlan);
//     if (!discountEntry) {
//       for (const plan of paygPlans) {
//         discountEntry = findDiscount(plan);
//         if (discountEntry) break;
//       }
//     }

//     const maxDiscountPercent = discountEntry
//       ? Number(discountEntry.max_discount_percent) || 0
//       : 0;

//     // ==========================================
//     // Active Subscription
//     // ==========================================
//     const [subs] = await db.query(
//       `SELECT
//         ss.*,
//         p.plan_name AS plan_name,
//         p.maximum_weight_per_order_kg,
//         p.wash_per_month
//       FROM student_subscriptions ss
//       JOIN subscription_plans p ON ss.plan_id = p.id
//       WHERE ss.student_id = ?
//         AND ss.status = 'ACTIVE'
//       ORDER BY ss.created_at DESC
//       LIMIT 1`,
//       [student.id]
//     );

//     const activeSub = subs[0] || null;

//     if (activeSub) {
//       // 🆕 SUBSCRIPTION STATUS & USAGE OVERVIEW CALCULATION
//       const quotaTotal = Number(activeSub.quota_kg_total) || 0;
//       const quotaUsed = Number(activeSub.quota_kg_used) || 0;
//       const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);
      
//       const endDate = new Date(activeSub.end_date);
//       const today = new Date();
//       const timeDiff = endDate - today;
//       const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

//       let totalWashes = 0;
//       let avgWashKg = 0;
//       try {
//         const [orderStats] = await db.query(
//           `SELECT 
//              COUNT(*) as total_orders,
//              SUM(total_weight_kg) as total_weight
//           FROM orders 
//           WHERE student_id = ? 
//              AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION', 'COLLECTED')
//              AND DATE(order_date) >= ?`,
//           [student.id, activeSub.start_date]
//         );
        
//         totalWashes = Number(orderStats[0]?.total_orders) || 0;
//         const totalWeight = Number(orderStats[0]?.total_weight) || 0;
//         avgWashKg = totalWashes > 0 ? (totalWeight / totalWashes).toFixed(1) : 0;
//       } catch (err) {
//         console.warn('Order stats failed:', err.message);
//       }

//       activeSub.subscription_status = {
//         status: 'Active',
//         plan_name: activeSub.plan_name,
//         quota_total_kg: quotaTotal,
//         quota_used_kg: quotaUsed,
//         quota_remaining_kg: quotaRemaining,
//         valid_till: activeSub.end_date,
//         days_left: daysLeft > 0 ? daysLeft : 0,
//         progress_percentage: quotaTotal > 0 ? ((quotaUsed / quotaTotal) * 100).toFixed(1) : 0
//       };

//       activeSub.usage_overview = {
//         current_cycle: `${new Date(activeSub.start_date).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} - ${endDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})}`,
//         quota_kg: quotaTotal,
//         used_kg: quotaUsed,
//         remaining_kg: quotaRemaining,
//         total_washes: totalWashes,
//         avg_wash_kg: Number(avgWashKg),
//         days_left: daysLeft > 0 ? daysLeft : 0
//       };

//       activeSub.max_kg_per_order       = Number(activeSub.maximum_weight_per_order_kg) || 0;
//       activeSub.monthly_used_count     = Number(activeSub.wash_per_month) || 0;
//       activeSub.max_discount_percent   = maxDiscountPercent;
//       activeSub.services = buildServices(matchedPlan);

//       student.activeSubscription = activeSub;

//       if (matchedPlan) {
//         student.payAsYouGo = {
//           available: true,
//           message: 'Active subscription',
//           plan_id: matchedPlan.id,
//           plan_name: matchedPlan.plan_name,
//           max_discount_percent: maxDiscountPercent,
//           services: buildServices(matchedPlan)
//         };
//       } else {
//         student.payAsYouGo = {
//           available: false,
//           message: 'Active subscription',
//           services: []
//         };
//       }

//     } else {
//       student.activeSubscription = null;
//       student.payAsYouGo = {
//         available: false,
//         message: 'No active subscription',
//         services: matchedPlan ? buildServices(matchedPlan) : []
//       };
//     }

//     // ==========================================
//     // Fetch Ready for Collection Orders
//     // ==========================================
//     let readyForCollectionOrders = [];

//     try {
//       const [readyOrders] = await db.query(
//           `
//           SELECT 
//               o.id, o.order_code, o.token_no, o.order_date,
//               o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
//               o.subscription_amount, o.extra_amount, o.discount_percent, 
//               o.discount_amount, o.final_amount, o.payment_status, o.status
//           FROM orders o
//           WHERE o.student_id = ? AND o.status = 'READY_FOR_COLLECTION'
//           ORDER BY o.id DESC
//           `,
//           [student.id]
//       );

//       readyForCollectionOrders = readyOrders.map(order => ({
//           order_id: order.id,
//           order_code: order.order_code,
//           token_no: order.token_no,
//           order_date: order.order_date,
//           weight_kg: Number(order.total_weight_kg),
//           total_amount: Number(order.final_amount),
//           payment_status: order.payment_status,
//           status: order.status,
//           breakdown: {
//               subscription_usage_kg: Number(order.subscription_usage_kg),
//               subscription_amount: Number(order.subscription_amount),
//               extra_payg_kg: Number(order.extra_payg_kg),
//               extra_amount: Number(order.extra_amount),
//               discount_percent: Number(order.discount_percent),
//               discount_amount: Number(order.discount_amount)
//           }
//       }));

//     } catch (err) {
//       console.warn('Failed to fetch ready orders:', err.message);
//     }

//     // ==========================================
//     // 🆕 QR code generation (with ready orders)
//     // ==========================================
//     // 1. Private fields remove karo
//     const qrStudent = { ...student };
//     delete qrStudent.password;
//     delete qrStudent.otp;
//     delete qrStudent.qr_token;

//     // 2. QR payload me student + ready orders dono daalo
//     const qrData = JSON.stringify({
//       type: 'INSTAWASH_STUDENT_PROFILE',
//       profile: qrStudent,
//       readyForCollectionOrders: readyForCollectionOrders // 👈 Added here
//     });

//     // 3. Generate QR
//     const qrCode = await QRCode.toDataURL(qrData, {
//       errorCorrectionLevel: 'M',
//       width: 350,
//       margin: 2
//     });

//     return successResponse(res, 'Profile fetched successfully', {
//       student,
//       readyForCollectionOrders,
//       qrCode
//     });

//   } catch (error) {
//     console.error('Get Profile Error:', error);
//     return errorResponse(res, 'Failed to fetch student profile', 500);
//   }
// };

// 23/10/2026



// ==========================================
// Helper: Build consistent services array
// ==========================================
const buildServices = (plan) => {
  if (!plan) return [];

  const foldPrice  = Number(plan.wash_dry_fold_price_per_kg)  || 0;
  const foldKg     = Number(plan.wash_dry_fold_min_order_kg)  || 0;

  const steamPrice = Number(plan.wash_dry_steam_price_per_kg) || 0;
  const steamKg    = Number(plan.wash_dry_steam_min_order_kg) || 0;

  return [
    {
      code: 'WASH_DRY_FOLD',
      name: 'Wash • Dry • Fold',
      price_per_kg: foldPrice,
      min_order_kg: foldKg,
      min_order_amount: foldPrice * foldKg
    },
    {
      code: 'WASH_DRY_STEAM',
      name: 'Wash • Dry • Fold • Iron',
      price_per_kg: steamPrice,
      min_order_kg: steamKg,
      min_order_amount: steamPrice * steamKg
    }
  ];
};

// ==========================================
// Helper: safe JSON parse
// ==========================================
const parseJsonSafe = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return fallback; }
};

// ==========================================
// Helper: enrich a student record with
// payg plan / subscription / ready orders
// ==========================================
// const enrichStudentData = async (student) => {
//   // Private fields remove karo
//   delete student.password;
//   delete student.otp;
//   delete student.qr_token;

//   // Profile image URL
//   student.profile_image = student.profile_image
//     ? `https://instawash.siberiancrane.tech/uploads/${student.profile_image}`
//     : null;

//   const campusId = Number(student.campus_id);
//   const outletId = Number(student.outlet_id);

//   // ---------- Pay as you go plans ----------
//   const [paygPlans] = await db.query(
//     `SELECT
//       id, plan_name, description,
//       wash_dry_fold_price_per_kg, wash_dry_fold_min_order_kg,
//       wash_dry_steam_price_per_kg, wash_dry_steam_min_order_kg,
//       applicability_type, applicable_ids, outlet_discount_limits
//     FROM pay_as_you_go_plans
//     WHERE status = 1
//     ORDER BY id DESC`
//   );

//   const matchedPlan = paygPlans.find(plan => {
//     const applicable = parseJsonSafe(plan.applicable_ids, []);
//     if (!Array.isArray(applicable)) return false;

//     return applicable.some(a =>
//       Number(a.campus_id) === campusId &&
//       Array.isArray(a.outlet_ids) &&
//       a.outlet_ids.map(Number).includes(outletId)
//     );
//   });

//   const findDiscount = (plan) => {
//     if (!plan) return null;
//     const limits = parseJsonSafe(plan.outlet_discount_limits, []);
//     if (!Array.isArray(limits)) return null;

//     return limits.find(l =>
//       Number(l.campus_id) === campusId &&
//       Number(l.outlet_id) === outletId
//     ) || null;
//   };

//   let discountEntry = findDiscount(matchedPlan);
//   if (!discountEntry) {
//     for (const plan of paygPlans) {
//       discountEntry = findDiscount(plan);
//       if (discountEntry) break;
//     }
//   }

//   const maxDiscountPercent = discountEntry
//     ? Number(discountEntry.max_discount_percent) || 0
//     : 0;

//   // ---------- Active Subscription ----------
//   const [subs] = await db.query(
//     `SELECT
//       ss.*,
//       p.plan_name AS plan_name,
//       p.maximum_weight_per_order_kg,
//       p.wash_per_month
//     FROM student_subscriptions ss
//     JOIN subscription_plans p ON ss.plan_id = p.id
//     WHERE ss.student_id = ?
//       AND ss.status = 'ACTIVE'
//     ORDER BY ss.created_at DESC
//     LIMIT 1`,
//     [student.id]
//   );

//   const activeSub = subs[0] || null;

//   if (activeSub) {
//     const quotaTotal = Number(activeSub.quota_kg_total) || 0;
//     const quotaUsed = Number(activeSub.quota_kg_used) || 0;
//     const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);

//     const endDate = new Date(activeSub.end_date);
//     const today = new Date();
//     const timeDiff = endDate - today;
//     const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

//     let totalWashes = 0;
//     let avgWashKg = 0;
//     try {
//       const [orderStats] = await db.query(
//         `SELECT 
//           COUNT(*) as total_orders,
//           SUM(total_weight_kg) as total_weight
//         FROM orders 
//         WHERE student_id = ? 
//           AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION', 'COLLECTED')
//           AND DATE(order_date) >= ?`,
//         [student.id, activeSub.start_date]
//       );

//       totalWashes = Number(orderStats[0]?.total_orders) || 0;
//       const totalWeight = Number(orderStats[0]?.total_weight) || 0;
//       avgWashKg = totalWashes > 0 ? (totalWeight / totalWashes).toFixed(1) : 0;
//     } catch (err) {
//       console.warn('Order stats failed:', err.message);
//     }

//     activeSub.subscription_status = {
//       status: 'Active',
//       plan_name: activeSub.plan_name,
//       quota_total_kg: quotaTotal,
//       quota_used_kg: quotaUsed,
//       quota_remaining_kg: quotaRemaining,
//       valid_till: activeSub.end_date,
//       days_left: daysLeft > 0 ? daysLeft : 0,
//       progress_percentage: quotaTotal > 0 ? ((quotaUsed / quotaTotal) * 100).toFixed(1) : 0
//     };

//     activeSub.usage_overview = {
//       current_cycle: `${new Date(activeSub.start_date).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} - ${endDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})}`,
//       quota_kg: quotaTotal,
//       used_kg: quotaUsed,
//       remaining_kg: quotaRemaining,
//       total_washes: totalWashes,
//       avg_wash_kg: Number(avgWashKg),
//       days_left: daysLeft > 0 ? daysLeft : 0
//     };

//     activeSub.max_kg_per_order     = Number(activeSub.maximum_weight_per_order_kg) || 0;
//     activeSub.monthly_used_count   = Number(activeSub.wash_per_month) || 0;
//     activeSub.max_discount_percent = maxDiscountPercent;
//     activeSub.services = buildServices(matchedPlan);

//     student.activeSubscription = activeSub;

//     if (matchedPlan) {
//       student.payAsYouGo = {
//         available: true,
//         message: 'Active subscription',
//         plan_id: matchedPlan.id,
//         plan_name: matchedPlan.plan_name,
//         max_discount_percent: maxDiscountPercent,
//         services: buildServices(matchedPlan)
//       };
//     } else {
//       student.payAsYouGo = {
//         available: false,
//         message: 'Active subscription',
//         services: []
//       };
//     }

//   } else {
//     student.activeSubscription = null;
//     student.payAsYouGo = {
//       available: false,
//       message: 'No active subscription',
//       services: matchedPlan ? buildServices(matchedPlan) : []
//     };
//   }

//   // ---------- Ready for Collection Orders ----------
//   let readyForCollectionOrders = [];

//   try {
//     const [readyOrders] = await db.query(
//       `
//       SELECT 
//           o.id, o.order_code, o.token_no, o.order_date,
//           o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
//           o.subscription_amount, o.extra_amount, o.discount_percent, 
//           o.discount_amount, o.final_amount, o.payment_status, o.status
//       FROM orders o
//       WHERE o.student_id = ? AND o.status = 'READY_FOR_COLLECTION'
//       ORDER BY o.id DESC
//       `,
//       [student.id]
//     );

//     readyForCollectionOrders = readyOrders.map(order => ({
//       order_id: order.id,
//       order_code: order.order_code,
//       token_no: order.token_no,
//       order_date: order.order_date,
//       weight_kg: Number(order.total_weight_kg),
//       total_amount: Number(order.final_amount),
//       payment_status: order.payment_status,
//       status: order.status,
//       breakdown: {
//         subscription_usage_kg: Number(order.subscription_usage_kg),
//         subscription_amount: Number(order.subscription_amount),
//         extra_payg_kg: Number(order.extra_payg_kg),
//         extra_amount: Number(order.extra_amount),
//         discount_percent: Number(order.discount_percent),
//         discount_amount: Number(order.discount_amount)
//       }
//     }));

//   } catch (err) {
//     console.warn('Failed to fetch ready orders:', err.message);
//   }

//   return { student, readyForCollectionOrders };
// };

const enrichStudentData = async (student) => {
  // Private fields remove karo
  delete student.password;
  delete student.otp;
  delete student.qr_token;

  // Profile image URL
  student.profile_image = student.profile_image
    ? `https://instawash.siberiancrane.tech/uploads/${student.profile_image}`
    : null;

  const campusId = Number(student.campus_id);
  const outletId = Number(student.outlet_id);

  // ---------- Pay as you go plans ----------
  const [paygPlans] = await db.query(
    `SELECT
      id, plan_name, description,
      wash_dry_fold_price_per_kg, wash_dry_fold_min_order_kg,
      wash_dry_steam_price_per_kg, wash_dry_steam_min_order_kg,
      applicability_type, applicable_ids, outlet_discount_limits
    FROM pay_as_you_go_plans
    WHERE status = 1
    ORDER BY id DESC`
  );

  const matchedPlan = paygPlans.find(plan => {
    const applicable = parseJsonSafe(plan.applicable_ids, []);
    if (!Array.isArray(applicable)) return false;

    return applicable.some(a =>
      Number(a.campus_id) === campusId &&
      Array.isArray(a.outlet_ids) &&
      a.outlet_ids.map(Number).includes(outletId)
    );
  });

  const findDiscount = (plan) => {
    if (!plan) return null;
    const limits = parseJsonSafe(plan.outlet_discount_limits, []);
    if (!Array.isArray(limits)) return null;

    return limits.find(l =>
      Number(l.campus_id) === campusId &&
      Number(l.outlet_id) === outletId
    ) || null;
  };

  let discountEntry = findDiscount(matchedPlan);
  if (!discountEntry) {
    for (const plan of paygPlans) {
      discountEntry = findDiscount(plan);
      if (discountEntry) break;
    }
  }

  const maxDiscountPercent = discountEntry
    ? Number(discountEntry.max_discount_percent) || 0
    : 0;

  // ✅ TOP-LEVEL: student object pe bhi set kar do
  student.max_discount_percent = maxDiscountPercent;

  // ---------- Active Subscription ----------
  const [subs] = await db.query(
    `SELECT
      ss.*,
      p.plan_name AS plan_name,
      p.maximum_weight_per_order_kg,
      p.wash_per_month
    FROM student_subscriptions ss
    JOIN subscription_plans p ON ss.plan_id = p.id
    WHERE ss.student_id = ?
      AND ss.status = 'ACTIVE'
    ORDER BY ss.created_at DESC
    LIMIT 1`,
    [student.id]
  );

  const activeSub = subs[0] || null;

  if (activeSub) {
    const quotaTotal = Number(activeSub.quota_kg_total) || 0;
    const quotaUsed = Number(activeSub.quota_kg_used) || 0;
    const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);

    const endDate = new Date(activeSub.end_date);
    const today = new Date();
    const timeDiff = endDate - today;
    const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

    let totalWashes = 0;
    let avgWashKg = 0;
    try {
      const [orderStats] = await db.query(
        `SELECT 
           COUNT(*) as total_orders,
           SUM(total_weight_kg) as total_weight
        FROM orders 
        WHERE student_id = ? 
           AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION', 'COLLECTED')
           AND DATE(order_date) >= ?`,
        [student.id, activeSub.start_date]
      );

      totalWashes = Number(orderStats[0]?.total_orders) || 0;
      const totalWeight = Number(orderStats[0]?.total_weight) || 0;
      avgWashKg = totalWashes > 0 ? (totalWeight / totalWashes).toFixed(1) : 0;
    } catch (err) {
      console.warn('Order stats failed:', err.message);
    }

    activeSub.subscription_status = {
      status: 'Active',
      plan_name: activeSub.plan_name,
      quota_total_kg: quotaTotal,
      quota_used_kg: quotaUsed,
      quota_remaining_kg: quotaRemaining,
      valid_till: activeSub.end_date,
      days_left: daysLeft > 0 ? daysLeft : 0,
      progress_percentage: quotaTotal > 0 ? ((quotaUsed / quotaTotal) * 100).toFixed(1) : 0
    };

    activeSub.usage_overview = {
      current_cycle: `${new Date(activeSub.start_date).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} - ${endDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})}`,
      quota_kg: quotaTotal,
      used_kg: quotaUsed,
      remaining_kg: quotaRemaining,
      total_washes: totalWashes,
      avg_wash_kg: Number(avgWashKg),
      days_left: daysLeft > 0 ? daysLeft : 0
    };

    activeSub.max_kg_per_order     = Number(activeSub.maximum_weight_per_order_kg) || 0;
    activeSub.monthly_used_count   = Number(activeSub.wash_per_month) || 0;
    activeSub.max_discount_percent = maxDiscountPercent;
    activeSub.services = buildServices(matchedPlan);

    student.activeSubscription = activeSub;

    if (matchedPlan) {
      student.payAsYouGo = {
        available: true,
        message: 'Active subscription',
        plan_id: matchedPlan.id,
        plan_name: matchedPlan.plan_name,
        max_discount_percent: maxDiscountPercent,
        services: buildServices(matchedPlan)
      };
    } else {
      student.payAsYouGo = {
        available: false,
        message: 'Active subscription',
        max_discount_percent: maxDiscountPercent,
        services: []
      };
    }

  } else {
    student.activeSubscription = null;
    student.payAsYouGo = {
      available: true,
      message: 'No active subscription',
      plan_id: matchedPlan ? matchedPlan.id : null,
      plan_name: matchedPlan ? matchedPlan.plan_name : null,
      max_discount_percent: maxDiscountPercent,
      services: matchedPlan ? buildServices(matchedPlan) : []
    };
  }

  // ---------- Ready for Collection Orders ----------
  let readyForCollectionOrders = [];

  try {
    const [readyOrders] = await db.query(
      `
      SELECT 
          o.id, o.order_code, o.token_no, o.order_date,
          o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
          o.subscription_amount, o.extra_amount, o.discount_percent, 
          o.discount_amount, o.final_amount, o.payment_status, o.status
      FROM orders o
      WHERE o.student_id = ? AND o.status = 'READY_FOR_COLLECTION'
      ORDER BY o.id DESC
      `,
      [student.id]
    );

    readyForCollectionOrders = readyOrders.map(order => ({
      order_id: order.id,
      order_code: order.order_code,
      token_no: order.token_no,
      order_date: order.order_date,
      weight_kg: Number(order.total_weight_kg),
      total_amount: Number(order.final_amount),
      payment_status: order.payment_status,
      status: order.status,
      breakdown: {
        subscription_usage_kg: Number(order.subscription_usage_kg),
        subscription_amount: Number(order.subscription_amount),
        extra_payg_kg: Number(order.extra_payg_kg),
        extra_amount: Number(order.extra_amount),
        discount_percent: Number(order.discount_percent),
        discount_amount: Number(order.discount_amount)
      }
    }));

  } catch (err) {
    console.warn('Failed to fetch ready orders:', err.message);
  }

  return { student, readyForCollectionOrders };
};

// ==========================================
// @desc    Get student profile (QR me sirf id)
// @route   GET /api/student/profile
// ==========================================
const getProfile = async (req, res) => {
  try {
    const [students] = await db.query(
      `SELECT
        s.*,
        c.name AS campus_name,
        o.name AS outlet_name
      FROM students s
      LEFT JOIN campuses c ON s.campus_id = c.id
      LEFT JOIN outlets o ON s.outlet_id = o.id
      WHERE s.id = ?
      LIMIT 1`,
      [req.student.id]
    );

    if (students.length === 0) {
      return errorResponse(res, 'Student profile not found', 404);
    }

    const rawStudent = students[0];

    // ✅ Enrich (subscription, payg, ready orders) — private fields bhi delete honge
    const { student, readyForCollectionOrders } = await enrichStudentData(rawStudent);

    // ==========================================
    // ✅ QR — sirf student ID encode karo
    // ==========================================
    const qrPayload = {
      type: 'INSTAWASH_STUDENT',
      id: student.id
    };

    const qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'M',
      width: 350,
      margin: 2
    });

    return successResponse(res, 'Profile fetched successfully', {
      student,
      readyForCollectionOrders,
      qrCode
    });

  } catch (error) {
    console.error('Get Profile Error:', error);
    return errorResponse(res, 'Failed to fetch student profile', 500);
  }
};

// ==========================================
// @desc    Get student full data by QR scan (id)
// @route   GET /api/admin/student-qr/:id
// @access  Admin / Staff (scanner)
// ==========================================
const getStudentByQr = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    if (!studentId || isNaN(studentId)) {
      return errorResponse(res, 'Invalid student id', 400);
    }

    const [students] = await db.query(
      `SELECT
        s.*,
        c.name AS campus_name,
        o.name AS outlet_name
      FROM students s
      LEFT JOIN campuses c ON s.campus_id = c.id
      LEFT JOIN outlets o ON s.outlet_id = o.id
      WHERE s.id = ?
      LIMIT 1`,
      [studentId]
    );

    if (students.length === 0) {
      return errorResponse(res, 'Student not found', 404);
    }

    const rawStudent = students[0];

    // ✅ Enrich (private fields auto delete)
    const { student, readyForCollectionOrders } = await enrichStudentData(rawStudent);

    return successResponse(res, 'Student data fetched successfully', {
      student,
      readyForCollectionOrders
    });

  } catch (error) {
    console.error('Get Student By QR Error:', error);
    return errorResponse(res, 'Failed to fetch student data', 500);
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

// All campuses List
const getCampuses = async (req, res) => {
  try {
    const [campuses] = await db.query(`
      SELECT id, name, address, created_at
      FROM campuses
      WHERE is_active = 1
      ORDER BY name ASC
    `);

    return successResponse(res, 'Campus list fetched successfully', {
      campuses,
    });
  } catch (error) {
    console.error('Get Campuses Error:', error);
    return errorResponse(res, 'Failed to fetch campus list', 500);
  }
};

//campus outlet
// const getCampusOutlets = async (req, res) => {
//   try {
//     const { campus_id, section } = req.params;

//     if (!campus_id || !section) {
//       return errorResponse(
//         res,
//         'Campus ID and section are required',
//         400
//       );
//     }

//     const [outlets] = await db.query(
//       `
//         SELECT
//           id,
//           campus_id,
//           name,
//           address,
//           section,
//           is_active,
//           created_at
//         FROM outlets
//         WHERE campus_id = ?
//           AND section = ?
//           AND is_active = 1
//         ORDER BY name ASC
//       `,
//       [campus_id, section]
//     );

//     return successResponse(
//       res,
//       'Campus outlets fetched successfully',
//       {
//         campus_id,
//         section,
//         outlets
//       }
//     );
//   } catch (error) {
//     console.error('Get Campus Outlets Error:', error);
//     return errorResponse(
//       res,
//       'Failed to fetch campus outlets',
//       500
//     );
//   }
// };

//campus outlet
const getCampusOutlets = async (req, res) => {
  try {
    const { campus_id, section } = req.params;

    if (!campus_id || !section) {
      return errorResponse(
        res,
        'Campus ID and section are required',
        400
      );
    }

    const [outlets] = await db.query(
      `
        SELECT
          id,
          campus_id,
          name,
          address,
          section,
          is_active,
          created_at
        FROM outlets
        WHERE campus_id = ?
          AND section = ?
          AND is_active = 1
        ORDER BY name ASC
      `,
      [campus_id, section]
    );

    // 🆕 Check if no outlets found
    if (outlets.length === 0) {
      return errorResponse(
        res,
        'No outlets found for the given campus and section',
        400
      );
    }

    return successResponse(
      res,
      'Campus outlets fetched successfully',
      {
        campus_id,
        section,
        outlets
      }
    );
  } catch (error) {
    console.error('Get Campus Outlets Error:', error);
    return errorResponse(
      res,
      'Failed to fetch campus outlets',
      500
    );
  }
};
// ======================================================
// GET SUBSCRIPTION PLAN LIST
// ======================================================

// const getSubscriptionPlanList = async (req, res) => {
//     try {
//         const { plan_type, month, year, student_id } = req.query;

//         if (!student_id) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Student ID is required'
//             });
//         }

//         // ======================================================
//         // CHECK STUDENT PAYMENT STATUS
//         // ======================================================
//         const [subscriptions] = await db.query(
//             `
//             SELECT
//                 id,
//                 transaction_id,
//                 student_id,
//                 campus_id,
//                 outlet_id,
//                 plan_name,
//                 original_price,
//                 discount_amount,
//                 payable_amount,
//                 purchase_month,
//                 validity_start,
//                 validity_end,
//                 payment_status,
//                 payment_method,
//                 rejection_reason,
//                 created_at
//             FROM subscriptions_payments
//             WHERE student_id = ?
//             ORDER BY created_at DESC, id DESC
//             LIMIT 1
//             `,
//             [student_id]
//         );

//         if (subscriptions.length > 0) {
//             const subscription = subscriptions[0];

//             const paymentStatus = String(
//                 subscription.payment_status || ''
//             ).trim().toUpperCase();

//             if (
//                 paymentStatus === 'PENDING' ||
//                 paymentStatus === 'SUCCESS'
//             ) {
//                 return res.status(200).json({
//                     status: true,
//                     message: 'Subscription payment details fetched successfully',
//                     data: {
//                         studentId: student_id,
//                         hasSubscription: true,
//                         paymentStatus,
//                         subscription
//                     }
//                 });
//             }

//             // FAILED / REJECTED status:
//             // Continue and show subscription plans.
//         }

//         // ======================================================
//         // GET SUBSCRIPTION PLAN LIST
//         // ======================================================
//         let sql = `
//             SELECT
//                 id,
//                 plan_name,
//                 plan_code,
//                 plan_type,
//                 original_annual_price,
//                 monthly_wash_limit_kg,
//                 wash_per_month,
//                 maximum_weight_per_order_kg,
//                 description,
//                 start_date,
//                 end_date,
//                 monthly_pricing,
//                 applicable_ids,
//                 status,
//                 created_at,
//                 updated_at
//             FROM subscription_plans
//         `;

//         const params = [];

//         if (plan_type) {
//             sql += ` WHERE plan_type = ?`;
//             params.push(plan_type);
//         }

//         sql += ` ORDER BY id DESC`;

//         const [plans] = await db.query(sql, params);

//         // ======================================================
//         // PARSE JSON VALUES
//         // ======================================================
//         const parseJson = (value, fallback = []) => {
//             if (typeof value === 'string') {
//                 try {
//                     return JSON.parse(value);
//                 } catch (error) {
//                     return fallback;
//                 }
//             }
//             return value ?? fallback;
//         };

//         // ======================================================
//         // MONTH-WISE PRICING CALCULATION
//         // ======================================================
//         const data = plans.map(item => {
//             const monthlyPricing = parseJson(item.monthly_pricing);
//             const applicableIds = parseJson(item.applicable_ids);

//             let calculatedMonth = null;
//             let selectedPricing = null;

//             if (month && year && item.start_date) {
//                 const startDate = new Date(item.start_date);
//                 const startYear = startDate.getUTCFullYear();
//                 const startMonth = startDate.getUTCMonth() + 1;

//                 const requestedMonth = Number(month);
//                 const requestedYear = Number(year);

//                 const monthDifference =
//                     (requestedYear - startYear) * 12 +
//                     (requestedMonth - startMonth) + 1;

//                 if (
//                     Number.isInteger(requestedMonth) &&
//                     requestedMonth >= 1 &&
//                     requestedMonth <= 12 &&
//                     Number.isInteger(requestedYear) &&
//                     monthDifference >= 1
//                 ) {
//                     calculatedMonth = monthDifference;

//                     if (
//                         Array.isArray(monthlyPricing) &&
//                         monthlyPricing.length > 0
//                     ) {
//                         selectedPricing =
//                             monthlyPricing.find(
//                                 price =>
//                                     Number(price.month) === calculatedMonth
//                             ) ||
//                             monthlyPricing
//                                 .filter(
//                                     price =>
//                                         Number(price.month) <= calculatedMonth
//                                 )
//                                 .sort(
//                                     (a, b) =>
//                                         Number(b.month) - Number(a.month)
//                                 )[0] ||
//                             null;
//                     }
//                 }
//             }

//             return {
//                 id: item.id,
//                 planName: item.plan_name,
//                 planCode: item.plan_code,
//                 planType: item.plan_type,
//                 originalAnnualPrice: Number(item.original_annual_price || 0),
//                 monthlyWashLimitKg: Number(item.monthly_wash_limit_kg || 0),
//                 washPerMonth: Number(item.wash_per_month || 0),
//                 maximumWeightPerOrderKg: Number(item.maximum_weight_per_order_kg || 0),
//                 description: item.description,
//                 startDate: item.start_date,
//                 endDate: item.end_date,
//                 monthlyPricing,

//                 requestedMonth: month ? Number(month) : null,
//                 requestedYear: year ? Number(year) : null,
//                 calculatedSubscriptionMonth: calculatedMonth,
//                 selectedPricing,

//                 applicableIds,

//                 status: Number(item.status),
//                 statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',

//                 createdAt: item.created_at,
//                 updatedAt: item.updated_at
//             };
//         });

//         // ======================================================
//         // RESPONSE: SHOW PLANS
//         // ======================================================
//         return res.status(200).json({
//             status: true,
//             message: 'Subscription plan list fetched successfully',
//             data: {
//                 studentId: student_id,
//                 hasSubscription: false,
//                 subscription: null,
//                 plans: data
//             }
//         });

//     } catch (error) {
//         console.error('Get Subscription Plan List Error:', error);
//         return res.status(500).json({
//             status: false,
//             message: 'Failed to fetch subscription plan list'
//         });
//     }
// };

const getSubscriptionPlanList = async (req, res) => {
    try {
        const { plan_type, month, year, student_id } = req.query;

        if (!student_id) {
            return res.status(400).json({
                status: false,
                message: 'Student ID is required'
            });
        }

        // ======================================================
        // FETCH STUDENT STATUS
        // ======================================================
        const [studentRows] = await db.query(
            `SELECT id, status FROM students WHERE id = ? LIMIT 1`,
            [student_id]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Student not found'
            });
        }

        const studentStatus = String(studentRows[0].status || '').trim().toUpperCase();
        const isActiveSubscribed = studentStatus === 'ACTIVE_SUBSCRIBED';

        // ======================================================
        // LATEST PAYMENT RECORD
        // ======================================================
        const [subscriptions] = await db.query(
            `
            SELECT
                id, transaction_id, student_id, plan_id, campus_id, outlet_id,
                plan_name, original_price, discount_amount, payable_amount,
                purchase_month, validity_start, validity_end,
                payment_status, payment_method, rejection_reason, created_at
            FROM subscriptions_payments
            WHERE student_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            `,
            [student_id]
        );

        const subscriptionData = subscriptions[0] || null;
        const hasPaymentRecord = !!subscriptionData;

        const paymentStatusRaw = hasPaymentRecord
            ? String(subscriptionData.payment_status || '').trim().toUpperCase()
            : null;

        const isPaymentSuccess = paymentStatusRaw === 'SUCCESS';

        let usageDetails = null;
        let usageLogs = [];

        // ======================================================
        // CASE 1: ACTIVE_SUBSCRIBED → subscription + usage
        // ======================================================
        if (isActiveSubscribed && hasPaymentRecord) {
            const [studentSubs] = await db.query(
                `
                SELECT
                    id, student_id, plan_id, start_date, end_date,
                    quota_kg_total, quota_kg_used, status, created_at,
                    washes_used, washes_limit, last_reset_date, updated_at
                FROM student_subscriptions
                WHERE student_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                `,
                [student_id]
            );

            if (studentSubs.length > 0) {
                const sub = studentSubs[0];

                const quotaTotal = Number(sub.quota_kg_total || 0);
                const quotaUsed = Number(sub.quota_kg_used || 0);
                const quotaRemaining = Math.max(quotaTotal - quotaUsed, 0);
                const quotaUsedPercent = quotaTotal > 0
                    ? Number(((quotaUsed / quotaTotal) * 100).toFixed(2))
                    : 0;

                const washesLimit = Number(sub.washes_limit || 0);
                const washesUsed = Number(sub.washes_used || 0);
                const washesRemaining = Math.max(washesLimit - washesUsed, 0);

                usageDetails = {
                    subscriptionId: sub.id,
                    planId: sub.plan_id,
                    startDate: sub.start_date,
                    endDate: sub.end_date,
                    status: Number(sub.status),
                    statusName: Number(sub.status) === 1 ? 'Active' : 'Inactive',
                    quotaKgTotal: quotaTotal,
                    quotaKgUsed: quotaUsed,
                    quotaKgRemaining: quotaRemaining,
                    quotaUsedPercent,
                    washesLimit,
                    washesUsed,
                    washesRemaining,
                    lastResetDate: sub.last_reset_date,
                    createdAt: sub.created_at,
                    updatedAt: sub.updated_at
                };

                const [logs] = await db.query(
                    `
                    SELECT
                        id, subscription_id, order_id, student_id,
                        quota_used_kg, extra_paid_kg, order_date, created_at
                    FROM subscription_usage_logs
                    WHERE subscription_id = ?
                    ORDER BY order_date DESC, id DESC
                    `,
                    [sub.id]
                );

                usageLogs = logs.map(log => ({
                    id: log.id,
                    subscriptionId: log.subscription_id,
                    orderId: log.order_id,
                    studentId: log.student_id,
                    quotaUsedKg: Number(log.quota_used_kg || 0),
                    extraPaidKg: Number(log.extra_paid_kg || 0),
                    orderDate: log.order_date,
                    createdAt: log.created_at
                }));
            }

            return res.status(200).json({
                status: true,
                message: 'Subscription payment details fetched successfully',
                data: {
                    studentId: student_id,
                    hasSubscription: true,
                    paymentStatus: 'SUCCESS',
                    subscription: subscriptionData,
                    usage: usageDetails,
                    usageLogs
                }
            });
        }

        // ======================================================
        // CASE 2: ACTIVE_SUBSCRIBED nahi + payment SUCCESS
        // ======================================================
        if (!isActiveSubscribed && hasPaymentRecord && isPaymentSuccess) {
            return res.status(200).json({
                status: true,
                message: 'Subscription payment details fetched successfully',
                data: {
                    studentId: student_id,
                    hasSubscription: false,
                    paymentStatus: 'PENDING',
                    subscription: subscriptionData,
                    usage: null,
                    usageLogs: []
                }
            });
        }

        // ======================================================
        // CASE 3 & 4: PLANS dikhao ✅
        // ======================================================
        const plansData = await fetchPlans(plan_type, month, year);

        return res.status(200).json({
            status: true,
            message: 'Subscription plan list fetched successfully',
            data: {
                studentId: student_id,
                hasSubscription: false,
                subscription: null,
                usage: null,
                usageLogs: [],
                plans: plansData
            }
        });

    } catch (error) {
        console.error('Get Subscription Plan List Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch subscription plan list'
        });
    }
};

// ======================================================
// HELPER: Plans fetch + format (Date Fix Included)
// ======================================================
async function fetchPlans(plan_type, month, year) {
    let sql = `
        SELECT
            id, plan_name, plan_code, plan_type,
            original_annual_price, monthly_wash_limit_kg, wash_per_month,
            maximum_weight_per_order_kg, description, start_date, end_date,
            monthly_pricing, applicable_ids, status, created_at, updated_at
        FROM subscription_plans
    `;
    const params = [];

    if (plan_type) {
        sql += ` WHERE plan_type = ?`;
        params.push(plan_type);
    }
    sql += ` ORDER BY id DESC`;

    const [plans] = await db.query(sql, params);

    // Helper to safely parse JSON
    const parseJson = (value, fallback = []) => {
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch (e) { return fallback; }
        }
        return value ?? fallback;
    };

    // ✅ Helper to format Date to YYYY-MM-DD (Local Timezone)
    const formatDate = (dateVal) => {
        if (!dateVal) return null;
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return dateVal;
        
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    return plans.map(item => {
        const monthlyPricing = parseJson(item.monthly_pricing);
        const applicableIds = parseJson(item.applicable_ids);

        let calculatedMonth = null;
        let selectedPricing = null;

        // ✅ Format dates
        const formattedStartDate = formatDate(item.start_date);
        const formattedEndDate = formatDate(item.end_date);

        if (month && year && formattedStartDate) {
            const startDateParts = formattedStartDate.split('-');
            const startYear = parseInt(startDateParts[0]);
            const startMonth = parseInt(startDateParts[1]);

            const requestedMonth = Number(month);
            const requestedYear = Number(year);

            const monthDifference =
                (requestedYear - startYear) * 12 +
                (requestedMonth - startMonth) + 1;

            if (
                Number.isInteger(requestedMonth) &&
                requestedMonth >= 1 &&
                requestedMonth <= 12 &&
                Number.isInteger(requestedYear) &&
                monthDifference >= 1
            ) {
                calculatedMonth = monthDifference;

                if (Array.isArray(monthlyPricing) && monthlyPricing.length > 0) {
                    selectedPricing =
                        monthlyPricing.find(p => Number(p.month) === calculatedMonth) ||
                        monthlyPricing
                            .filter(p => Number(p.month) <= calculatedMonth)
                            .sort((a, b) => Number(b.month) - Number(a.month))[0] ||
                        null;
                }
            }
        }

        return {
            id: item.id,
            planName: item.plan_name,
            planCode: item.plan_code,
            planType: item.plan_type,
            originalAnnualPrice: Number(item.original_annual_price || 0),
            monthlyWashLimitKg: Number(item.monthly_wash_limit_kg || 0),
            washPerMonth: Number(item.wash_per_month || 0),
            maximumWeightPerOrderKg: Number(item.maximum_weight_per_order_kg || 0),
            description: item.description,
            
            // ✅ Returning formatted dates (YYYY-MM-DD)
            startDate: formattedStartDate,
            endDate: formattedEndDate,
            
            monthlyPricing,
            requestedMonth: month ? Number(month) : null,
            requestedYear: year ? Number(year) : null,
            calculatedSubscriptionMonth: calculatedMonth,
            selectedPricing,
            applicableIds,
            status: Number(item.status),
            statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',
            
            // ✅ Formatting created/updated at too
            createdAt: formatDate(item.created_at),
            updatedAt: formatDate(item.updated_at)
        };
    });
}
// ======================================================
// GET SUBSCRIPTION PLAN BY ID
// ======================================================
const getSubscriptionPlanById = async (req, res) => {
    try {

        const { id } = req.params;


        const [plans] = await db.query(
            `
            SELECT
                id,
                plan_name,
                plan_code,
                plan_type,
                original_annual_price,
                monthly_wash_limit_kg,
                wash_per_month,
                maximum_weight_per_order_kg,
                description,
                start_date,
                end_date,
                monthly_pricing,
                applicability_type,
                applicable_ids,
                status,
                created_at,
                updated_at
            FROM subscription_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        if (plans.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Subscription plan not found'
            });
        }


        const item = plans[0];


        const data = {

            id: item.id,

            planName: item.plan_name,

            planCode: item.plan_code,

            planType: item.plan_type,

            originalAnnualPrice:
                Number(item.original_annual_price),

            monthlyWashLimitKg:
                Number(item.monthly_wash_limit_kg),

            washPerMonth:
                Number(item.wash_per_month),

            maximumWeightPerOrderKg:
                Number(item.maximum_weight_per_order_kg),

            description:
                item.description,

            startDate:
                item.start_date,

            endDate:
                item.end_date,

            monthlyPricing:
                typeof item.monthly_pricing === 'string'
                    ? JSON.parse(item.monthly_pricing)
                    : (item.monthly_pricing || []),

            applicabilityType:
                item.applicability_type,

            applicableIds:
                typeof item.applicable_ids === 'string'
                    ? JSON.parse(item.applicable_ids)
                    : (item.applicable_ids || []),

            status:
                Number(item.status),

            statusName:
                Number(item.status) === 1
                    ? 'Active'
                    : 'Inactive',

            createdAt:
                item.created_at,

            updatedAt:
                item.updated_at

        };


        return res.status(200).json({
            status: true,
            message: 'Subscription plan fetched successfully',
            data
        });


    } catch (error) {

        console.error(
            'Get Subscription Plan By ID Error:',
            error
        );

        return res.status(500).json({
            status: false,
            message: 'Failed to fetch subscription plan'
        });
    }
};




// @desc    Update Payment Status (Success/Failed)
// @route   PUT /api/payment/update-status/:transaction_id
const updatePaymentStatus = async (req, res) => {
    try {
        const { transaction_id } = req.params;
        const { payment_status, payment_method } = req.body;

        if (!payment_status) {
            return res.status(400).json({ success: false, message: 'payment_status is required' });
        }

        const allowedStatuses = ['Pending', 'Success', 'Failed', 'Rejected'];
        if (!allowedStatuses.includes(payment_status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}`
            });
        }

        const [result] = await db.execute(
            `UPDATE subscriptions_payments SET payment_status = ?, payment_method = ? WHERE transaction_id = ?`,
            [payment_status, payment_method || 'Razorpay', transaction_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        res.status(200).json({
            success: true,
            message: `Payment status updated to ${payment_status}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Reject Subscription (Receptionist/Admin)
// @route   PATCH /api/payment/reject/:transaction_id
const rejectSubscription = async (req, res) => {
    try {
        const { transaction_id } = req.params;
        const { rejection_reason } = req.body;

        if (!rejection_reason) {
            return res.status(400).json({
                success: false,
                message: 'rejection_reason is required'
            });
        }

        const [existing] = await db.execute(
            `SELECT id, payment_status FROM subscriptions_payments WHERE transaction_id = ?`,
            [transaction_id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        if (existing[0].payment_status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: `Only Pending subscriptions can be rejected. Current status: ${existing[0].payment_status}`
            });
        }

        const [result] = await db.execute(
            `UPDATE subscriptions_payments SET payment_status = 'Rejected', rejection_reason = ? WHERE transaction_id = ?`,
            [rejection_reason, transaction_id]
        );

        res.status(200).json({
            success: true,
            message: 'Subscription rejected successfully',
            data: {
                transaction_id,
                status: 'Rejected',
                rejection_reason
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get Subscription Details by Transaction ID
// @route   GET /api/payment/details/:transaction_id
const getPaymentDetails = async (req, res) => {
    try {
        const { transaction_id } = req.params;

        const [rows] = await db.execute(
            `SELECT * FROM subscriptions_payments WHERE transaction_id = ?`,
            [transaction_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        res.status(200).json({ success: true, data: rows[0] });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get All Pending Subscriptions (For Receptionist)
// @route   GET /api/payment/pending
const getPendingSubscriptions = async (req, res) => {
    try {
        const { outlet_id } = req.query;
        let query = `SELECT * FROM subscriptions_payments WHERE payment_status = 'Pending'`;
        let params = [];

        if (outlet_id) {
            query += ` AND outlet_id = ?`;
            params.push(outlet_id);
        }

        query += ` ORDER BY created_at DESC`;

        const [rows] = await db.execute(query, params);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// // ==================================================
// // Helper: Format Order Status Label
// // ==================================================
// const formatOrderStatus = (status) => {
//     if (!status) return 'Unknown';
//     switch (status.toUpperCase()) {
//         case 'RECEIVED': return 'Received';
//         case 'PENDING': return 'Pending';
//         case 'IN_WASH': return 'In Wash';
//         case 'READY_FOR_COLLECTION': return 'Ready for Collection';
//         case 'COLLECTED': return 'Collected';
//         case 'CANCELLED': return 'Cancelled';
//         default: return status;
//     }
// };


// // ==================================================
// // STUDENT: GET MY ORDERS LIST
// // ==================================================
// const getStudentOrderList = async (req, res) => {
//     try {
//         // ✅ Middleware aapke student ko req.student me set kar raha hai
//         const studentId = req.student?.id || req.user?.id; 

//         if (!studentId) {
//             return errorResponse(res, 'Unauthorized: Student ID not found', 401);
//         }

//         const {
//             status = 'ACTIVE', // 'ACTIVE' ya 'COMPLETED'
//             page = 1,
//             limit = 10
//         } = req.query;

//         const pageNum = Math.max(1, parseInt(page) || 1);
//         const limitNum = Math.max(1, parseInt(limit) || 10);
//         const offset = (pageNum - 1) * limitNum;

//         let whereClauses = [`o.student_id = ?`];
//         let params = [studentId];

//         // Tab Filter (Active vs Completed)
//         if (status === 'ACTIVE') {
//             whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
//         } else if (status === 'COMPLETED') {
//             whereClauses.push(`o.status IN ('COLLECTED', 'CANCELLED')`);
//         }

//         const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

//         // 1. Stats for Tabs (Active vs Completed counts)
//         const [statsRows] = await db.query(
//             `
//             SELECT
//                 SUM(CASE WHEN status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION') THEN 1 ELSE 0 END) AS active_count,
//                 SUM(CASE WHEN status IN ('COLLECTED', 'CANCELLED') THEN 1 ELSE 0 END) AS completed_count
//             FROM orders
//             WHERE student_id = ?
//             `,
//             [studentId]
//         );

//         const stats = {
//             active: Number(statsRows[0].active_count) || 0,
//             completed: Number(statsRows[0].completed_count) || 0
//         };

//         // 2. Pagination Count
//         const [countRows] = await db.query(
//             `SELECT COUNT(*) AS total FROM orders o ${whereSQL}`,
//             params
//         );
//         const totalRecords = countRows[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         // 3. Fetch Orders
//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id, o.order_code, o.token_no, o.order_date,
//                 o.total_weight_kg, o.status, o.extra_payg_kg,
//                 outl.name AS outlet_name,
//                 -- Latest status timestamps for UI
//                 (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'RECEIVED' LIMIT 1) AS received_at,
//                 (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'IN_WASH' LIMIT 1) AS in_wash_at
//             FROM orders o
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             ${whereSQL}
//             ORDER BY o.id DESC
//             LIMIT ${limitNum} OFFSET ${offset}
//             `,
//             params
//         );

//         // 4. Format Data
//         const data = rows.map(r => {
//             // Fallback for missing wash_type column
//             let washType = r.extra_payg_kg > 0 ? 'Wash & Iron (PAYG)' : 'Regular Wash';

//             return {
//                 id: r.id,
//                 order_code: r.order_code,
//                 token_no: r.token_no,
//                 order_date: r.order_date,
//                 weight_kg: Number(r.total_weight_kg),
//                 wash_type: washType, 
//                 status: formatOrderStatus(r.status), // ✅ Helper used
//                 raw_status: r.status,
//                 outlet: r.outlet_name,
//                 timeline: {
//                     received_at: r.received_at,
//                     in_wash_at: r.in_wash_at
//                 }
//             };
//         });

//         return successResponse(res, 'My Orders fetched successfully', {
//             stats,
//             data,
//             pagination: {
//                 total: totalRecords,
//                 page: pageNum,
//                 limit: limitNum,
//                 totalPages,
//                 hasNextPage: pageNum < totalPages,
//                 hasPrevPage: pageNum > 1
//             }
//         });

//     } catch (error) {
//         console.error('❌ Student Order List Error:', error);
//         return errorResponse(res, 'Failed to fetch orders', 500);
//     }
// };

// ==================================================
// Helper: Format Order Status Label
// ==================================================
const formatOrderStatus = (status) => {
    if (!status) return 'Unknown';
    switch (status.toUpperCase()) {
        case 'RECEIVED': return 'Received';
        case 'PENDING': return 'Pending';
        case 'IN_WASH': return 'In Wash';
        case 'READY_FOR_COLLECTION': return 'Ready for Collection';
        case 'COLLECTED': return 'Collected';
        case 'DELIVERED': return 'Delivered';
        case 'CANCELLED': return 'Cancelled';
        default: return status;
    }
};

// ==================================================
// STUDENT: GET MY ORDERS LIST
// ==================================================
// const getStudentOrderList_old = async (req, res) => {
//     try {
//         // ✅ Middleware aapke student ko req.student me set kar raha hai
//         const studentId = req.student?.id || req.user?.id; 

//         if (!studentId) {
//             return errorResponse(res, 'Unauthorized: Student ID not found', 401);
//         }

//         const {
//             status = 'ACTIVE', // Frontend se 'ACTIVE' ya 'COMPLETED' aayega
//             page = 1,
//             limit = 10
//         } = req.query;

//         // 🆕 Space remove karo aur uppercase me convert karo (Robust Fix)
//         const reqStatus = status.trim().toUpperCase(); 

//         const pageNum = Math.max(1, parseInt(page) || 1);
//         const limitNum = Math.max(1, parseInt(limit) || 10);
//         const offset = (pageNum - 1) * limitNum;

//         // Base Query
//         let whereClauses = [`o.student_id = ?`];
//         let params = [studentId];

//         // ==================================================
//         // TAB FILTER LOGIC
//         // ==================================================
//         if (reqStatus === 'ACTIVE') {
//             // Active tab me ye 3 status aayenge
//             whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
//         } else if (reqStatus === 'COMPLETED') {
//             // Complete tab me Collected/Delivered aayega
//             whereClauses.push(`o.status IN ('COLLECTED', 'DELIVERED')`);
//         } else if (reqStatus === 'ALL') {
//             // Agar ALL manga ho to kuch filter mat lagao
//         } else {
//             // Agar kuch aur bheja hai to default ACTIVE hi maano
//             whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
//         }

//         const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

//         // 1. Stats for Tabs (Active vs Completed counts)
//         const [statsRows] = await db.query(
//             `
//             SELECT
//                 SUM(CASE WHEN status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION') THEN 1 ELSE 0 END) AS active_count,
//                 SUM(CASE WHEN status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) AS completed_count
//             FROM orders
//             WHERE student_id = ?
//             `,
//             [studentId]
//         );

//         const stats = {
//             active: Number(statsRows[0].active_count) || 0,
//             completed: Number(statsRows[0].completed_count) || 0
//         };

//         // 2. Pagination Count
//         const [countRows] = await db.query(
//             `SELECT COUNT(*) AS total FROM orders o ${whereSQL}`,
//             params
//         );
//         const totalRecords = countRows[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         // 3. Fetch Orders
//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id, o.order_code, o.token_no, o.order_date,
//                 o.total_weight_kg, o.status, o.extra_payg_kg,
//                 outl.name AS outlet_name,
//                 -- Latest status timestamps for UI
//                 (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'RECEIVED' LIMIT 1) AS received_at,
//                 (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'IN_WASH' LIMIT 1) AS in_wash_at
//             FROM orders o
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             ${whereSQL}
//             ORDER BY o.id DESC
//             LIMIT ${limitNum} OFFSET ${offset}
//             `,
//             params
//         );

//         // 4. Format Data
//         const data = rows.map(r => {
//             let washType = r.extra_payg_kg > 0 ? 'Wash & Iron (PAYG)' : 'Regular Wash';

//             return {
//                 id: r.id,
//                 order_code: r.order_code,
//                 token_no: r.token_no,
//                 order_date: r.order_date,
//                 weight_kg: Number(r.total_weight_kg),
//                 wash_type: washType, 
//                 status: formatOrderStatus(r.status),
//                 raw_status: r.status,
//                 outlet: r.outlet_name,
//                 timeline: {
//                     received_at: r.received_at,
//                     in_wash_at: r.in_wash_at
//                 }
//             };
//         });

//         return successResponse(res, 'My Orders fetched successfully', {
//             stats,
//             data,
//             pagination: {
//                 total: totalRecords,
//                 page: pageNum,
//                 limit: limitNum,
//                 totalPages,
//                 hasNextPage: pageNum < totalPages,
//                 hasPrevPage: pageNum > 1
//             }
//         });

//     } catch (error) {
//         console.error('❌ Student Order List Error:', error);
//         return errorResponse(res, 'Failed to fetch orders', 500);
//     }
// };

const getStudentOrderList = async (req, res) => {
    try {
        const studentId = req.student?.id || req.user?.id; 

        if (!studentId) {
            return errorResponse(res, 'Unauthorized: Student ID not found', 401);
        }

        const {
            status = 'ACTIVE',
            page = 1,
            limit = 10
        } = req.query;

        const reqStatus = status.trim().toUpperCase(); 

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [`o.student_id = ?`];
        let params = [studentId];

        // ==================================================
        // TAB FILTER LOGIC
        // ==================================================
        if (reqStatus === 'ACTIVE') {
            whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
        } else if (reqStatus === 'COMPLETED') {
            whereClauses.push(`o.status IN ('COLLECTED', 'DELIVERED')`);
        } else if (reqStatus === 'ALL') {
            // Kuch filter nahi
        } else {
            whereClauses.push(`o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')`);
        }

        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

        // 1. Stats
        const [statsRows] = await db.query(
            `
            SELECT
                SUM(CASE WHEN status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION') THEN 1 ELSE 0 END) AS active_count,
                SUM(CASE WHEN status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) AS completed_count
            FROM orders
            WHERE student_id = ?
            `,
            [studentId]
        );

        const stats = {
            active: Number(statsRows[0].active_count) || 0,
            completed: Number(statsRows[0].completed_count) || 0
        };

        // 2. Count
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM orders o ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // 3. Fetch Orders (payment_method add kiya)
        const [rows] = await db.query(
            `
            SELECT
                o.id, o.order_code, o.token_no, o.order_date,
                o.total_weight_kg, o.status, o.extra_payg_kg,
                o.payment_method,  -- ✅ Yahan add kiya
                outl.name AS outlet_name,
                (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'RECEIVED' LIMIT 1) AS received_at,
                (SELECT created_at FROM order_status_logs WHERE order_id = o.id AND status = 'IN_WASH' LIMIT 1) AS in_wash_at
            FROM orders o
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            ${whereSQL}
            ORDER BY o.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        // 4. Format Data (payment_method map kiya)
        const data = rows.map(r => {
            let washType = r.extra_payg_kg > 0 ? 'Wash & Iron (PAYG)' : 'Regular Wash';

            return {
                id: r.id,
                order_code: r.order_code,
                token_no: r.token_no,
                order_date: r.order_date,
                weight_kg: Number(r.total_weight_kg),
                wash_type: washType, 
                status: formatOrderStatus(r.status),
                raw_status: r.status,
                outlet: r.outlet_name,
                payment_method: r.payment_method || null, // ✅ Yahan bhi add kiya
                timeline: {
                    received_at: r.received_at,
                    in_wash_at: r.in_wash_at
                }
            };
        });

        return successResponse(res, 'My Orders fetched successfully', {
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
        console.error('❌ Student Order List Error:', error);
        return errorResponse(res, 'Failed to fetch orders', 500);
    }
};

// ==================================================
// STUDENT: GET ORDER DETAILS
// ==================================================
const getStudentOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // ✅ Middleware aapke student ko req.student me set kar raha hai
        const studentId = req.student?.id || req.user?.id;

        if (!studentId) {
            return errorResponse(res, 'Unauthorized: Student ID not found', 401);
        }

        // 1. Fetch Order Details (Security check: student_id match hona chahiye)
        const [orders] = await db.query(
            `
            SELECT
                o.*,
                outl.name AS outlet_name,
                outl.address AS outlet_address,
                c.name AS campus_name
            FROM orders o
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN campuses c ON c.id = o.campus_id
            WHERE o.id = ? AND o.student_id = ?
            LIMIT 1
            `,
            [id, studentId]
        );

        if (orders.length === 0) {
            return errorResponse(res, 'Order not found or you do not have access to this order', 404);
        }

        const o = orders[0];

        // 2. Fetch Timeline Logs
        const [logs] = await db.query(
            `
            SELECT status, created_at, remarks
            FROM order_status_logs
            WHERE order_id = ?
            ORDER BY created_at ASC
            `,
            [id]
        );

        // 3. Build Timeline Object
        const timelineMap = {
            RECEIVED: null,
            IN_WASH: null,
            READY_FOR_COLLECTION: null,
            COLLECTED: null,
            DELIVERED: null
        };

        logs.forEach(log => {
            if (timelineMap[log.status] !== undefined) {
                timelineMap[log.status] = {
                    time: log.created_at,
                    remarks: log.remarks
                };
            }
        });

        // 4. Parse Services JSON
        let servicesArr = [];
        try {
            servicesArr = o.services
                ? (typeof o.services === 'string' ? JSON.parse(o.services) : o.services)
                : [];
        } catch (e) {
            servicesArr = [];
        }

        // 5. Format Data
        const data = {
            id: o.id,
            order_code: o.order_code,
            laundry_tag_id: o.token_no ? `#${o.token_no}` : null,
            order_date: o.order_date,
            status: formatOrderStatus(o.status),
            raw_status: o.status,

            outlet: {
                name: o.outlet_name,
                address: o.outlet_address,
                campus: o.campus_name
            },

            // Timeline
            timeline: {
                received: timelineMap.RECEIVED || null,
                in_wash: timelineMap.IN_WASH || null,
                ready: timelineMap.READY_FOR_COLLECTION || null,
                collected: timelineMap.COLLECTED || timelineMap.DELIVERED || null
            },

            // Order Summary
            summary: {
                total_weight_kg: Number(o.total_weight_kg),
                subscription_usage_kg: Number(o.subscription_usage_kg),
                extra_payg_kg: Number(o.extra_payg_kg),
                services: servicesArr, 
            },

            // Billing
            billing: {
                total_amount: Number(o.final_amount),
                payment_status: o.payment_status
            }
        };

        return successResponse(res, 'Order details fetched successfully', data);

    } catch (error) {
        console.error('❌ Student Order Details Error:', error);
        return errorResponse(res, 'Failed to fetch order details', 500);
    }
};
// // ==================================================
// // STUDENT: GET ORDER DETAILS
// // ==================================================
// const getStudentOrderDetails = async (req, res) => {
//     try {
//         const { id } = req.params;
        
//         // ✅ Middleware aapke student ko req.student me set kar raha hai
//         const studentId = req.student?.id || req.user?.id;

//         if (!studentId) {
//             return errorResponse(res, 'Unauthorized: Student ID not found', 401);
//         }

//         // 1. Fetch Order Details (Security check: student_id match hona chahiye)
//         const [orders] = await db.query(
//             `
//             SELECT
//                 o.*,
//                 outl.name AS outlet_name,
//                 outl.address AS outlet_address,
//                 c.name AS campus_name
//             FROM orders o
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             LEFT JOIN campuses c ON c.id = o.campus_id
//             WHERE o.id = ? AND o.student_id = ?
//             LIMIT 1
//             `,
//             [id, studentId]
//         );

//         if (orders.length === 0) {
//             return errorResponse(res, 'Order not found or you do not have access to this order', 404);
//         }

//         const o = orders[0];

//         // 2. Fetch Timeline Logs
//         const [logs] = await db.query(
//             `
//             SELECT status, created_at, remarks
//             FROM order_status_logs
//             WHERE order_id = ?
//             ORDER BY created_at ASC
//             `,
//             [id]
//         );

//         // 3. Build Timeline Object
//         const timelineMap = {
//             RECEIVED: null,
//             IN_WASH: null,
//             READY_FOR_COLLECTION: null,
//             COLLECTED: null
//         };

//         logs.forEach(log => {
//             if (timelineMap[log.status] !== undefined) {
//                 timelineMap[log.status] = {
//                     time: log.created_at,
//                     remarks: log.remarks
//                 };
//             }
//         });

//         // 4. Parse Services JSON
//         let servicesArr = [];
//         try {
//             servicesArr = o.services
//                 ? (typeof o.services === 'string' ? JSON.parse(o.services) : o.services)
//                 : [];
//         } catch (e) {
//             servicesArr = [];
//         }

//         // 5. Format Data
//         const data = {
//             id: o.id,
//             order_code: o.order_code,
//             laundry_tag_id: o.token_no ? `#${o.token_no}` : null,
//             order_date: o.order_date,
//             status: formatOrderStatus(o.status), // ✅ Helper used
//             raw_status: o.status,

//             outlet: {
//                 name: o.outlet_name,
//                 address: o.outlet_address,
//                 campus: o.campus_name
//             },

//             // Timeline
//             timeline: {
//                 received: timelineMap.RECEIVED || null,
//                 in_wash: timelineMap.IN_WASH || null,
//                 ready: timelineMap.READY_FOR_COLLECTION || null,
//                 collected: timelineMap.COLLECTED || null
//             },

//             // Order Summary (Strictly DB columns)
//             summary: {
//                 total_weight_kg: Number(o.total_weight_kg),
//                 subscription_usage_kg: Number(o.subscription_usage_kg),
//                 extra_payg_kg: Number(o.extra_payg_kg),
//                 services: servicesArr, 
//             },

//             // Billing
//             billing: {
//                 total_amount: Number(o.final_amount),
//                 payment_status: o.payment_status
//             }
//         };

//         return successResponse(res, 'Order details fetched successfully', data);

//     } catch (error) {
//         console.error('❌ Student Order Details Error:', error);
//         return errorResponse(res, 'Failed to fetch order details', 500);
//     }
// };



// ==================================================
// STUDENT: RAISE A COMPLAINT (Report an Issue)
// ==================================================
const raiseComplaint = async (req, res) => {
    try {
        // 1. Student ID from Token
        const studentId = req.student?.id || req.user?.id;
        if (!studentId) {
            return errorResponse(res, 'Unauthorized: Student ID not found', 401);
        }

        // 2. Extract Body Data
        const {
            order_id,           // Screenshot me "Order Reference" (Optional)
            category,           // "Missing Item", "Damaged Item", etc.
            description         // User ka text
        } = req.body;

        // 3. Validation
        if (!category || !description) {
            return errorResponse(res, 'Category and Description are required', 400);
        }

        // 4. Handle Image Upload (Agar multer middleware laga hai)
        let photoUrl = null;
        if (req.file) {
            // Aapke upload logic ke hisaab se path set karo (AWS S3 ya local)
            // Example: photoUrl = `/uploads/complaints/${req.file.filename}`;
            photoUrl = req.file.location || `/uploads/${req.file.filename}`;
        }

        // 5. Optional: Validate ki order_id us student ka hi hai (Security check)
        if (order_id) {
            const [orderCheck] = await db.query(
                `SELECT id FROM orders WHERE id = ? AND student_id = ? LIMIT 1`,
                [order_id, studentId]
            );
            if (orderCheck.length === 0) {
                return errorResponse(res, 'Invalid Order ID or you do not have access to this order', 400);
            }
        }

        // 6. Insert into Database
        const [result] = await db.query(
            `
            INSERT INTO complaints 
            (student_id, order_id, category, description, photo_url, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
            `,
            [studentId, order_id || null, category, description, photoUrl]
        );

        // 7. Response
        return successResponse(res, 'Complaint submitted successfully', {
            complaint_id: result.insertId,
            order_reference: order_id || null,
            category: category,
            description: description,
            photo_url: photoUrl,
            status: 'PENDING',
            submitted_at: new Date()
        }, 201);

    } catch (error) {
        console.error('❌ Raise Complaint Error:', error);
        return errorResponse(res, 'Failed to submit complaint', 500);
    }
};


// ==================================================
// SUBMIT OR UPDATE RATING
// POST /api/student/ratings
// ==================================================
const submitRating = async (req, res) => {
    try {
        const { order_id, rating } = req.body;

        // 1. 🛑 Strict Validation: Sirf order_id aur rating allow hain
        const allowedKeys = ['order_id', 'rating'];
        const bodyKeys = Object.keys(req.body);
        const hasInvalidKeys = bodyKeys.some(key => !allowedKeys.includes(key));

        if (hasInvalidKeys) {
            return errorResponse(res, 'Invalid fields provided. Only "order_id" and "rating" are allowed.', 400);
        }

        // 2. Validate: Dono fields hona zaroori hai
        if (!order_id || rating === undefined) {
            return errorResponse(res, 'order_id and rating are required', 400);
        }

        // 3. Validate: rating 1 se 5 ke bich honi chahiye
        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return errorResponse(res, 'Rating must be an integer between 1 and 5', 400);
        }

        // 4. Check karo ki order exist karta hai ya nahi (Optional but recommended)
        // Agar aap chahte ho ki bina order ke rating na ho, to ye check rakhein
        const [orderExists] = await db.query(`SELECT id FROM orders WHERE id = ?`, [order_id]);
        if (orderExists.length === 0) {
            return errorResponse(res, 'Order not found', 404);
        }

        // 5. Check if rating already exists for this order
        const [existingRating] = await db.query(
            `SELECT id FROM ratings WHERE order_id = ? LIMIT 1`, 
            [order_id]
        );

        let message = '';
        let ratingId = null;
        let isUpdate = false;

        if (existingRating.length > 0) {
            // --- UPDATE LOGIC ---
            ratingId = existingRating[0].id;
            await db.query(
                `UPDATE ratings SET rating = ?, updated_at = NOW() WHERE order_id = ?`,
                [numericRating, order_id]
            );
            message = 'Rating updated successfully';
            isUpdate = true;
        } else {
            // --- INSERT LOGIC ---
            const [insertResult] = await db.query(
                `INSERT INTO ratings (order_id, rating) VALUES (?, ?)`,
                [order_id, numericRating]
            );
            ratingId = insertResult.insertId;
            message = 'Rating submitted successfully';
        }

        // 6. Final Response
        return successResponse(res, message, {
            id: ratingId,
            order_id: Number(order_id),
            rating: numericRating,
            action: isUpdate ? 'UPDATED' : 'CREATED'
        }, isUpdate ? 200 : 201);

    } catch (error) {
        console.error('❌ Submit Rating Error:', error);
        return errorResponse(res, 'Failed to submit rating', 500);
    }
};


const getStudentPayAsYouGoPlans = async (req, res) => {
    try {
        // 1. Token se Student ID nikalo
        const studentId = req.student?.id || req.user?.id;
        if (!studentId) {
            return errorResponse(res, 'Unauthorized: Student ID not found', 401);
        }

        // 2. Student ka Campus aur Outlet check karo
        const [studentRows] = await db.query(
            `SELECT campus_id, outlet_id, role, gender FROM students WHERE id = ? LIMIT 1`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return errorResponse(res, 'Student profile not found', 404);
        }

        const { campus_id, outlet_id, role, gender } = studentRows[0];
        const studentCampusId = Number(campus_id);
        const studentOutletId = Number(outlet_id);

        // Agar student ka campus/outlet set nahi hai
        if (!studentCampusId || !studentOutletId) {
            return errorResponse(res, 'Campus or Outlet not assigned to student', 400);
        }

        // 3. Pay As You Go Plans fetch karo (sirf active)
        const [plans] = await db.query(`
            SELECT 
                id, plan_name, description,
                wash_dry_fold_price_per_kg, wash_dry_fold_min_order_kg,
                wash_dry_steam_price_per_kg, wash_dry_steam_min_order_kg,
                applicability_type, applicable_ids, outlet_discount_limits
            FROM pay_as_you_go_plans
            WHERE status = 1
            ORDER BY id DESC
        `);

        // 4. Filter karo: Student ke campus aur outlet ke hisaab se
        const applicablePlans = plans.filter(plan => {
            let applicable = [];
            try {
                applicable = typeof plan.applicable_ids === 'string' 
                    ? JSON.parse(plan.applicable_ids) 
                    : (plan.applicable_ids || []);
            } catch (e) {
                return false;
            }

            if (!Array.isArray(applicable)) return false;

            // Check karo ki student ka campus_id aur outlet_id applicable list me hai ya nahi
            return applicable.some(item => 
                Number(item.campus_id) === studentCampusId &&
                Array.isArray(item.outlet_ids) &&
                item.outlet_ids.map(Number).includes(studentOutletId)
            );
        });

        if (applicablePlans.length === 0) {
            return successResponse(res, 'No PAYG plans available for this location', {
                header_info: { student_type: role === 'STUDENT' ? 'Student' : 'Non-Student', gender },
                plans: []
            });
        }

        // 5. Format Response (Screenshot ke hisaab se)
        const formattedPlans = [];
        
        // Pehle hum ek plan me saari services merge kar ke dete hain
        // As per screenshot, ek plan me do cards hote hain: Wash Dry Fold aur Wash Dry Fold + Iron
        applicablePlans.forEach((plan, index) => {
            // Agar multiple plans hain, to har plan ke liye alag set bhejenge
            // (Assuming ek plan me services defined hain)
            
            const foldPrice = Number(plan.wash_dry_fold_price_per_kg) || 0;
            const foldMinKg = Number(plan.wash_dry_fold_min_order_kg) || 5;
            
            const steamPrice = Number(plan.wash_dry_steam_price_per_kg) || 0;
            const steamMinKg = Number(plan.wash_dry_steam_min_order_kg) || 5;

            // Check if "Popular" tag apply karna hai (Optional logic)
            const isPopular = index === 0; 

            // Plan 1: Wash Dry Fold
            if (foldPrice > 0) {
                formattedPlans.push({
                    service_code: 'WASH_DRY_FOLD',
                    title: 'Wash • Dry • Fold',
                    price_per_kg: foldPrice,
                    min_order_kg: foldMinKg,
                    min_charge: foldPrice * foldMinKg,
                    tag: isPopular ? 'Popular' : null,
                    features: [
                        'Professional washing',
                        'Machine dry',
                        'Neatly folded'
                    ],
                    note: `If you take ${foldMinKg} KG or less, you will still be charged for ${foldMinKg} KG.`
                });
            }

            // Plan 2: Wash Dry Fold + Iron (Steam)
            if (steamPrice > 0) {
                formattedPlans.push({
                    service_code: 'WASH_DRY_STEAM',
                    title: 'Wash • Dry • Fold and Iron',
                    price_per_kg: steamPrice,
                    min_order_kg: steamMinKg,
                    min_charge: steamPrice * steamMinKg,
                    tag: null,
                    features: [
                        'Professional washing',
                        'Machine dry',
                        'Neatly folded',
                        'Steam iron'
                    ],
                    note: `If you take ${steamMinKg} KG or less, you will still be charged for ${steamMinKg} KG.`
                });
            }
        });

        // 6. Final Response
        return successResponse(res, 'PAYG plans fetched successfully', {
            header_info: {
                // Screenshot ke top banner ke liye
                message: `Showing plans for ${gender === 'MALE' ? 'male' : 'female'} ${role === 'STUDENT' ? 'Student' : 'Non-Student'}`,
                subtext: 'Plans are based on your registered type and outlet. Only applicable plans are shown.'
            },
            plans: formattedPlans
        });

    } catch (error) {
        console.error('❌ Get PAYG Plans Error:', error);
        return errorResponse(res, 'Failed to fetch PAYG plans', 500);
    }
};

// ==================================================
// STUDENT: GET COMPLAINTS (Full Details in List)
// ==================================================
const getComplaints = async (req, res) => {
    try {
        const studentId = req.student?.id || req.user?.id;
        if (!studentId) return errorResponse(res, 'Unauthorized', 401);

        const { search = '', status, page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [`c.student_id = ?`];
        let params = [studentId];

        // Search Filter
        if (search && search.trim() !== '') {
            whereClauses.push(`(c.id LIKE ? OR c.category LIKE ? OR o.order_code LIKE ?)`);
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        // Status Filter
        if (status && status !== 'All') {
            whereClauses.push(`c.status = ?`);
            params.push(status.toUpperCase());
        }

        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

        // ==========================================
        // 1. STATS (Top Cards)
        // ==========================================
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) as total_raised,
                SUM(CASE WHEN status IN ('OPEN', 'PROCESSING', 'IN_PROGRESS') THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved
            FROM complaints 
            WHERE student_id = ?
        `, [studentId]);

        const stats = {
            total_raised: Number(statsRows[0]?.total_raised) || 0,
            in_progress: Number(statsRows[0]?.in_progress) || 0,
            resolved: Number(statsRows[0]?.resolved) || 0
        };

        // ==========================================
        // 2. PAGINATION COUNT
        // ==========================================
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total 
             FROM complaints c 
             LEFT JOIN orders o ON o.id = c.order_id 
             ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ==========================================
        // 3. FETCH COMPLAINTS LIST
        // ==========================================
        const [complaints] = await db.query(`
            SELECT 
                c.id, c.category, c.description, c.status, c.created_at, c.resolved_at,
                o.order_code
            FROM complaints c
            LEFT JOIN orders o ON o.id = c.order_id
            ${whereSQL}
            ORDER BY c.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        // ==========================================
        // 4. FETCH REMARKS & BUILD TIMELINE FOR EACH COMPLAINT
        // ==========================================
        let formattedData = [];

        if (complaints.length > 0) {
            const complaintIds = complaints.map(c => c.id);

            // Ek hi query me saare complaints ke remarks nikaal lo
            const [allNotes] = await db.query(`
                SELECT cn.complaint_id, cn.id, cn.note, cn.created_at, u.name as staff_name, u.role as staff_role
                FROM complaint_notes cn
                LEFT JOIN users u ON u.id = cn.staff_id
                WHERE cn.complaint_id IN (?)
                ORDER BY cn.created_at ASC
            `, [complaintIds]);

            // Notes ko complaint_id ke hisaab se group karo
            const notesMap = {};
            allNotes.forEach(n => {
                if (!notesMap[n.complaint_id]) notesMap[n.complaint_id] = [];
                notesMap[n.complaint_id].push({
                    id: n.id,
                    remark: n.note,
                    staff_name: n.staff_name || 'Support Team',
                    staff_role: n.staff_role || 'Admin',
                    date: n.created_at
                });
            });

            // Har complaint ko format karo
            formattedData = complaints.map(c => {
                const remarks = notesMap[c.id] || [];

                // Timeline dynamic build
                let timeline = [
                    { title: 'Issue Reported', date: c.created_at, description: 'Ticket created with photos attached', is_completed: true }
                ];
                if (c.status !== 'OPEN') {
                    timeline.push({ title: 'Under Inspection', date: null, description: 'Assigned to Outlet Manager', is_completed: true });
                }
                if (['PROCESSING', 'IN_PROGRESS', 'RESOLVED'].includes(c.status)) {
                    timeline.push({ title: 'Re-wash In Progress', date: null, description: 'Stain treatment and delicate wash cycle active', is_completed: true });
                }
                if (c.status === 'RESOLVED') {
                    timeline.push({ title: 'Resolution Completed', date: c.resolved_at, description: 'Garment verified & ready for collection', is_completed: true });
                } else {
                    timeline.push({ title: 'Resolution Completed', date: 'Expected soon', description: 'Garment will be verified & ready for collection', is_completed: false });
                }

                return {
                    id: c.id,
                    ticket_id: `TK-${new Date(c.created_at).getFullYear()}-${String(c.id).padStart(4, '0')}`,
                    status: c.status,
                    created_at: c.created_at,
                    order_reference: c.order_code || 'N/A',
                    category: c.category,
                    description: c.description,
                    remarks: remarks,      // 👈 Ye list me hi aa raha hai
                    timeline: timeline     // 👈 Ye bhi list me hi aa raha hai
                };
            });
        }

        // ==========================================
        // FINAL RESPONSE
        // ==========================================
        return successResponse(res, 'Complaints fetched successfully', {
            stats,
            data: formattedData,
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
        console.error('❌ Get Complaints Error:', error);
        return errorResponse(res, 'Failed to fetch complaints', 500);
    }
};

module.exports = {
	 submitRating,
	raiseComplaint,
  studentRegister,
  getBannerList,
  uploadIdCardPhoto,
  getProfile,
  updateProfile,
  selectPlanPayAtOutlet,
  getStudentDashboard,
  getStudentOrders,
  rateOutlet,
  getNotices,
  getCampuses,
  getCampusOutlets,
  getSubscriptionPlanList,
  getSubscriptionPlanById,
    updatePaymentStatus,
    rejectSubscription,
    getPaymentDetails,
    getPendingSubscriptions,
    getStudentOrderList,
    getStudentOrderDetails,
    getStudentPayAsYouGoPlans,
     getComplaints,
   getStudentByQr
};
