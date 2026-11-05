const db = require('../config/db');
const { hashPassword } = require('../utils/password.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { createTopicDirect} = require('./notification.controller');

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

const getAllPayments = async (req, res) => {
    try {
        // ==========================================
        // 🟢 CASE 1: DETAIL VIEW
        // ==========================================
        if (req.query.id && req.query.type) {
            const { id, type } = req.query;

            let query = '';
            if (type === 'subscription') {
                query = `
                    SELECT sp.*, 
                           s.full_name AS student_name, s.phone AS student_phone, s.profile_image AS student_image,
                           c.name AS campus_name, c.institution_name AS campus_institution,
                           o.name AS outlet_name, o.section AS outlet_section
                    FROM subscriptions_payments sp
                    LEFT JOIN students s ON sp.student_id = s.id
                    LEFT JOIN campuses c ON sp.campus_id = c.id
                    LEFT JOIN outlets o ON sp.outlet_id = o.id
                    WHERE sp.id = ?
                `;
            } else if (type === 'payg') {
                query = `
                    SELECT wt.*, 
                           s.full_name AS student_name, s.phone AS student_phone, s.profile_image AS student_image
                    FROM wallet_transactions wt
                    LEFT JOIN students s ON wt.user_id = s.id
                    WHERE wt.id = ?
                `;
            } else {
                return res.status(400).json({ success: false, message: 'Invalid type. Use type=subscription or type=payg' });
            }

            const [rows] = await db.execute(query, [id]);
            
            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Payment record not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        }


        // ==========================================
        // 🔵 CASE 2: LIST VIEW (With All Filters)
        // ==========================================
        const { 
            tab = 'All', 
            search, 
            payment_type, 
            campus_id, 
            outlet_id, 
            payment_mode, 
            payment_status, 
            start_date, 
            end_date,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;

        // 🔥 DATE FIX: Sirf DATE() function use karenge taaki time issue na aaye
        let startDateVal = null;
        let endDateVal = null;
        if (start_date && end_date) {
            startDateVal = start_date;
            endDateVal = end_date;
        }

        // 🔥 1. UNION QUERY WITH JOINS
        let unionQuery = `
            SELECT 
                sp.id, 
                sp.transaction_id AS payment_id, 
                sp.student_id AS user_id,
                s.full_name AS student_name,
                s.phone AS student_phone,
                sp.campus_id,
                sp.outlet_id,
                c.name AS campus_name,
                c.institution_name AS campus_institution,
                o.name AS outlet_name,
                sp.plan_name AS title,
                sp.payable_amount AS amount,
                sp.payment_method AS payment_mode,
                sp.payment_status AS status,
                sp.created_at,
                'Subscription' AS type
            FROM subscriptions_payments sp
            LEFT JOIN students s ON sp.student_id = s.id
            LEFT JOIN campuses c ON sp.campus_id = c.id
            LEFT JOIN outlets o ON sp.outlet_id = o.id
            
            UNION ALL
            
            SELECT 
                wt.id, 
                wt.transaction_id AS payment_id, 
                wt.user_id,
                s.full_name AS student_name,
                s.phone AS student_phone,
                NULL AS campus_id,
                NULL AS outlet_id,
                NULL AS campus_name,
                NULL AS campus_institution,
                NULL AS outlet_name,
                'Pay As You Go' AS title,
                wt.amount,
                wt.payment_gateway AS payment_mode,
                wt.status,
                wt.created_at,
                'PAYG' AS type
            FROM wallet_transactions wt
            LEFT JOIN students s ON wt.user_id = s.id
        `;

        let finalQuery = `SELECT * FROM (${unionQuery}) AS combined_payments WHERE 1=1`;
        let countQuery = `SELECT COUNT(*) as total FROM (${unionQuery}) AS combined_payments WHERE 1=1`;
        let params = [];

        // 🔍 1. TABS FILTER
        if (tab === 'Subscription') {
            finalQuery += ` AND type = 'Subscription'`;
            countQuery += ` AND type = 'Subscription'`;
        } else if (tab === 'PAYG') {
            finalQuery += ` AND type = 'PAYG'`;
            countQuery += ` AND type = 'PAYG'`;
        } else if (tab === 'Pending') {
            finalQuery += ` AND status IN ('Pending', 'PENDING')`;
            countQuery += ` AND status IN ('Pending', 'PENDING')`;
        } else if (tab === 'Failed') {
            finalQuery += ` AND status IN ('Failed', 'FAILED')`;
            countQuery += ` AND status IN ('Failed', 'FAILED')`;
        }

        // 🔍 2. DROPDOWN FILTERS
        if (payment_type && payment_type.trim() !== '' && payment_type !== 'All Types') {
            finalQuery += ` AND type = ?`; 
            countQuery += ` AND type = ?`;
            params.push(payment_type === 'PAYG' ? 'PAYG' : 'Subscription');
        }

        if (campus_id && campus_id.trim() !== '' && campus_id !== 'All Campuses') {
            finalQuery += ` AND campus_id = ?`; 
            countQuery += ` AND campus_id = ?`;
            params.push(campus_id);
        }

        if (outlet_id && outlet_id.trim() !== '' && outlet_id !== 'All Outlets') {
            finalQuery += ` AND outlet_id = ?`; 
            countQuery += ` AND outlet_id = ?`;
            params.push(outlet_id);
        }

        if (payment_mode && payment_mode.trim() !== '' && payment_mode !== 'All Modes') {
            finalQuery += ` AND payment_mode = ?`; 
            countQuery += ` AND payment_mode = ?`;
            params.push(payment_mode);
        }

        if (payment_status && payment_status.trim() !== '' && payment_status !== 'All Status') {
            finalQuery += ` AND status = ?`; 
            countQuery += ` AND status = ?`;
            params.push(payment_status);
        }

        // 🔍 3. DATE RANGE FILTER (Using DATE() to ignore time)
        if (startDateVal && endDateVal) {
            finalQuery += ` AND DATE(created_at) BETWEEN ? AND ?`;
            countQuery += ` AND DATE(created_at) BETWEEN ? AND ?`;
            params.push(startDateVal, endDateVal);
        }

        // 🔍 4. SEARCH FILTER
        if (search && search.trim() !== '') {
            finalQuery += ` AND (payment_id LIKE ? OR student_name LIKE ? OR student_phone LIKE ?)`;
            countQuery += ` AND (payment_id LIKE ? OR student_name LIKE ? OR student_phone LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        // 🔍 5. PAGINATION & SORTING
        finalQuery += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        
        // Count query execute karein
        const [countResult] = await db.execute(countQuery, params);
        const totalRecords = countResult[0]?.total || 0;
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // Data query execute karein
        const dataParams = [...params, parseInt(limit), parseInt(offset)];
        const [rows] = await db.execute(finalQuery, dataParams);

        const formattedData = rows.map(row => ({
            ...row,
            amount: Number(row.amount)
        }));

        // ==========================================
        // 📊 DASHBOARD STATS (Ab Har Filter Ke Hisaab Se)
        // ==========================================
        let statsData = {
            total_payments: 0,
            today_collection: 0,
            total_revenue: 0
        };

        try {
            // Hum yahan ek hi query banayenge jo saare filters apply karegi.
            // Since 2 tables hain, humne dono ke liye alag alag total nikaala hai aur jod diya hai.
            
            let subWhere = ` WHERE 1=1 `;
            let subParams = [];

            let paygWhere = ` WHERE 1=1 `;
            let paygParams = [];

            // Date filter lagao
            if (startDateVal && endDateVal) {
                subWhere += ` AND DATE(created_at) BETWEEN ? AND ? `;
                subParams.push(startDateVal, endDateVal);
                
                paygWhere += ` AND DATE(created_at) BETWEEN ? AND ? `;
                paygParams.push(startDateVal, endDateVal);
            }

            // Campus filter (Sirf subscription me hai)
            if (campus_id && campus_id.trim() !== '' && campus_id !== 'All Campuses') {
                subWhere += ` AND campus_id = ? `;
                subParams.push(campus_id);
            }

            // Outlet filter (Sirf subscription me hai)
            if (outlet_id && outlet_id.trim() !== '' && outlet_id !== 'All Outlets') {
                subWhere += ` AND outlet_id = ? `;
                subParams.push(outlet_id);
            }

            // Status filter
            if (payment_status && payment_status.trim() !== '' && payment_status !== 'All Status') {
                subWhere += ` AND payment_status = ? `;
                subParams.push(payment_status);

                paygWhere += ` AND status = ? `;
                paygParams.push(payment_status);
            }

            // Mode filter
            if (payment_mode && payment_mode.trim() !== '' && payment_mode !== 'All Modes') {
                subWhere += ` AND payment_method = ? `;
                subParams.push(payment_mode);

                paygWhere += ` AND payment_gateway = ? `;
                paygParams.push(payment_mode);
            }

            // Payment Type Filter (Agar PAYG select kiya hai toh Subscription ka count 0 hoga)
            let includeSubscription = true;
            let includePayg = true;

            if (payment_type === 'PAYG') {
                includeSubscription = false;
            } else if (payment_type === 'Subscription') {
                includePayg = false;
            }

            // Query 1: Subscription Stats
            let subStatsData = { count: 0, revenue: 0 };
            if (includeSubscription) {
                const [subStats] = await db.execute(`
                    SELECT 
                        COUNT(*) AS count,
                        COALESCE(SUM(CASE WHEN payment_status IN ('Success', 'SUCCESS', 'Paid', 'PAID') THEN payable_amount ELSE 0 END), 0) AS revenue
                    FROM subscriptions_payments 
                    ${subWhere}
                `, subParams);
                subStatsData = subStats[0];
            }

            // Query 2: PAYG Stats
            let paygStatsData = { count: 0, revenue: 0 };
            if (includePayg) {
                const [paygStats] = await db.execute(`
                    SELECT 
                        COUNT(*) AS count,
                        COALESCE(SUM(CASE WHEN status IN ('Success', 'SUCCESS', 'Paid', 'PAID') THEN amount ELSE 0 END), 0) AS revenue
                    FROM wallet_transactions 
                    ${paygWhere}
                `, paygParams);
                paygStatsData = paygStats[0];
            }

            // Total Revenue
            const totalRevenue = Number(subStatsData.revenue || 0) + Number(paygStatsData.revenue || 0);

            // Today's Collection (Agar date filter laga hai, toh us date range ka sum bhejenge)
            // Agar filter nahi laga, toh aaj ka din nikaalenge
            let todayCollection = 0;
            if (startDateVal && endDateVal) {
                // Selected Range ka collection
                const [todayRange] = await db.execute(`
                    SELECT 
                        (SELECT COALESCE(SUM(payable_amount), 0) FROM subscriptions_payments WHERE DATE(created_at) BETWEEN ? AND ? AND payment_status IN ('Success', 'SUCCESS', 'Paid', 'PAID')) +
                        (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE DATE(created_at) BETWEEN ? AND ? AND status IN ('Success', 'SUCCESS', 'Paid', 'PAID'))
                    AS collection
                `, [startDateVal, endDateVal, startDateVal, endDateVal]);
                todayCollection = Number(todayRange[0].collection) || 0;
            } else {
                // Aaj ka din (No Date filter)
                const [todayCurrent] = await db.execute(`
                    SELECT 
                        (SELECT COALESCE(SUM(payable_amount), 0) FROM subscriptions_payments WHERE DATE(created_at) = CURDATE() AND payment_status IN ('Success', 'SUCCESS', 'Paid', 'PAID')) +
                        (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE DATE(created_at) = CURDATE() AND status IN ('Success', 'SUCCESS', 'Paid', 'PAID'))
                    AS collection
                `);
                todayCollection = Number(todayCurrent[0].collection) || 0;
            }

            statsData = {
                total_payments: (Number(subStatsData.count) || 0) + (Number(paygStatsData.count) || 0),
                today_collection: todayCollection, // Ab ye filter ke hisaab se aayega
                total_revenue: totalRevenue
            };

        } catch (statsError) {
            console.error('⚠️ Stats query failed:', statsError.message);
        }

        // ==========================================
        // 📤 RESPONSE
        // ==========================================
        return res.status(200).json({
            success: true,
            stats: statsData,
            pagination: {
                total_records: totalRecords,
                total_pages: totalPages,
                current_page: parseInt(page),
                limit: parseInt(limit)
            },
            count: formattedData.length,
            data: formattedData
        });

    } catch (error) {
        console.error('❌ Payment API Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server Error', 
            error: error.message 
        });
    }
};

/**
 * Super Admin Dashboard Overview
 * GET /api/superadmin/dashboard
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


// ======================================================
// ADD SUBSCRIPTION PLAN
// ======================================================
// const addSubscriptionPlan = async (req, res) => {
//     try {

//         const {
//             planName,
//             planCode,
//             planType,
//             originalAnnualPrice,
//             monthlyWashLimitKg,
//             washPerMonth,
//             maximumWeightPerOrderKg,
//             description,
//             startDate,
//             endDate,
//             monthlyPricing,
//             applicabilityType,
//             applicableIds,
//             status
//         } = req.body;


//         // Required validation
//         if (!planName) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Plan name is required'
//             });
//         }

//         if (!planCode) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Plan code is required'
//             });
//         }

//         if (!planType) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Plan type is required'
//             });
//         }

//         if (originalAnnualPrice === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Original annual price is required'
//             });
//         }

//         if (monthlyWashLimitKg === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Monthly wash limit KG is required'
//             });
//         }

//         if (washPerMonth === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Wash per month is required'
//             });
//         }

//         if (maximumWeightPerOrderKg === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Maximum weight per order KG is required'
//             });
//         }

//         if (!startDate) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Start date is required'
//             });
//         }

//         if (!endDate) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'End date is required'
//             });
//         }


//         // Check duplicate plan code
//         const [existingPlan] = await db.query(
//             `
//             SELECT id
//             FROM subscription_plans
//             WHERE plan_code = ?
//             LIMIT 1
//             `,
//             [planCode]
//         );


//         if (existingPlan.length > 0) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Plan code already exists'
//             });
//         }


//         // Applicability validation
//         const validApplicabilityTypes = [
//             'ALL',
//             'SPECIFIC_CAMPUS',
//             'SPECIFIC_OUTLET'
//         ];


//         const finalApplicabilityType =
//             applicabilityType || 'ALL';


//         if (
//             !validApplicabilityTypes.includes(
//                 finalApplicabilityType
//             )
//         ) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Invalid applicability type'
//             });
//         }


//         // Applicable IDs
//         const finalApplicableIds =
//             Array.isArray(applicableIds)
//                 ? applicableIds
//                 : [];


//         // Monthly pricing
//         const finalMonthlyPricing =
//             Array.isArray(monthlyPricing)
//                 ? monthlyPricing
//                 : [];


//         // Status
//         const finalStatus =
//             status === 0 ? 0 : 1;


//         // Insert Subscription Plan
//         const [result] = await db.query(
//             `
//             INSERT INTO subscription_plans
//             (
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
//                 applicability_type,
//                 applicable_ids,
//                 status,
//                 created_at,
//                 updated_at
//             )
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
//             `,
//             [
//                 planName,
//                 planCode,
//                 planType,
//                 originalAnnualPrice,
//                 monthlyWashLimitKg,
//                 washPerMonth,
//                 maximumWeightPerOrderKg,
//                 description || null,
//                 startDate,
//                 endDate,
//                 JSON.stringify(finalMonthlyPricing),
//                 finalApplicabilityType,
//                 JSON.stringify(finalApplicableIds),
//                 finalStatus
//             ]
//         );


//         return res.status(201).json({
//             status: true,
//             message: 'Subscription plan created successfully',
//             data: {
//                 id: result.insertId
//             }
//         });


//     } catch (error) {

//         console.error(
//             'Add Subscription Plan Error:',
//             error
//         );

//         return res.status(500).json({
//             status: false,
//             message: 'Failed to create subscription plan'
//         });
//     }
// };

const addSubscriptionPlan = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            planName,
            planType,
            originalAnnualPrice,
            monthlyWashLimitKg,
            washPerMonth,
            maximumWeightPerOrderKg,
            description,
            startDate,
            endDate,
            monthlyPricing,
            applicableCampuses, // 👈 [{ campus_id, outlet_ids: [] }]
            status
        } = req.body;

        // ---------- Basic Validation ----------
        if (!planName) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Plan name is required' });
        }
        if (!planType) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Plan type is required' });
        }
        if (originalAnnualPrice === undefined) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Original annual price is required' });
        }
        if (monthlyWashLimitKg === undefined) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Monthly wash limit KG is required' });
        }
        if (washPerMonth === undefined) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Wash per month is required' });
        }
        if (maximumWeightPerOrderKg === undefined) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Maximum weight per order KG is required' });
        }
        if (!startDate || !endDate) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Start date and end date are required' });
        }

        // ---------- applicableCampuses Validation ----------
        const finalApplicableCampuses = Array.isArray(applicableCampuses)
            ? applicableCampuses
            : [];

        if (finalApplicableCampuses.length > 0) {
            for (const c of finalApplicableCampuses) {
                if (
                    !c ||
                    typeof c.campus_id === 'undefined' ||
                    !Array.isArray(c.outlet_ids) ||
                    c.outlet_ids.length === 0
                ) {
                    await connection.rollback();
                    return res.status(400).json({
                        status: false,
                        message: 'Each campus must have campus_id and non-empty outlet_ids array'
                    });
                }
            }
        }

        const finalMonthlyPricing = Array.isArray(monthlyPricing) ? monthlyPricing : [];
        const finalStatus = status === 0 ? 0 : 1;

        // ---------- Generate Unique Plan Code ----------
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let planCode;
        let existingPlan;

        do {
            let randomCode = '';
            for (let i = 0; i < 6; i++) {
                randomCode += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            planCode = `ANL-${randomCode}`;

            const [rows] = await connection.query(
                `SELECT id FROM subscription_plans WHERE plan_code = ? LIMIT 1`,
                [planCode]
            );
            existingPlan = rows;
        } while (existingPlan.length > 0);

        // ---------- Insert Subscription Plan ----------
        const [result] = await connection.query(
            `
            INSERT INTO subscription_plans
            (
                plan_name, plan_code, plan_type, original_annual_price,
                monthly_wash_limit_kg, wash_per_month, maximum_weight_per_order_kg,
                description, start_date, end_date, monthly_pricing,
                applicable_ids, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
                planName,
                planCode,
                planType,
                originalAnnualPrice,
                monthlyWashLimitKg,
                washPerMonth,
                maximumWeightPerOrderKg,
                description || null,
                startDate,
                endDate,
                JSON.stringify(finalMonthlyPricing),
                JSON.stringify(finalApplicableCampuses),
                finalStatus
            ]
        );

        const planId = result.insertId;

        // ---------- Insert Campus-Outlet Mapping ----------
        if (finalApplicableCampuses.length > 0) {
            const mappingValues = [];

            for (const c of finalApplicableCampuses) {
                for (const outletId of c.outlet_ids) {
                    mappingValues.push([planId, c.campus_id, outletId]);
                }
            }

            if (mappingValues.length > 0) {
                await connection.query(
                    `INSERT INTO subscription_plan_applicability (plan_id, campus_id, outlet_id) VALUES ?`,
                    [mappingValues]
                );
            }
        }

        await connection.commit();

        return res.status(201).json({
            status: true,
            message: 'Subscription plan created successfully',
            data: {
                id: planId,
                planCode,
                campusesLinked: finalApplicableCampuses.length,
                outletsLinked: finalApplicableCampuses.reduce(
                    (sum, c) => sum + (c.outlet_ids?.length || 0), 0
                )
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Add Subscription Plan Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to create subscription plan'
        });
    } finally {
        connection.release();
    }
};
// ======================================================
// GET SUBSCRIPTION PLAN LIST
// ======================================================

const getSubscriptionPlanList = async (req, res) => {
    try {
        const {
            search = '',
            status,
            campus_id,
            outlet_id,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // ==================================================
        // 1️⃣ STATS
        // ==================================================
        const [planStatsRows] = await db.query(`
            SELECT
                COUNT(*) AS total_plans,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active_plans,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS inactive_plans
            FROM subscription_plans
        `);

        const totalPlans = Number(planStatsRows[0].total_plans) || 0;
        const activePlans = Number(planStatsRows[0].active_plans) || 0;
        const inactivePlans = Number(planStatsRows[0].inactive_plans) || 0;

        const [subStatsRows] = await db.query(`
            SELECT COUNT(*) AS total_subscriptions
            FROM subscriptions_payments
            WHERE payment_status = 'success'
        `);
        const totalSubscriptions = Number(subStatsRows[0].total_subscriptions) || 0;

        const stats = {
            totalPlans,
            activePlans,
            inactivePlans,
            totalSubscriptions
        };

        // ==================================================
        // 2️⃣ LIST filters
        // ==================================================
        let whereClauses = [];
        let params = [];

        if (search && search.trim() !== '') {
            whereClauses.push(`(
                sp.plan_name LIKE ?
                OR sp.plan_code LIKE ?
                OR sp.description LIKE ?
            )`);
            const likeSearch = `%${search.trim()}%`;
            params.push(likeSearch, likeSearch, likeSearch);
        }

        if (status !== undefined && status !== '' && status !== 'all') {
            whereClauses.push(`sp.status = ?`);
            params.push(Number(status));
        }

        if (campus_id) {
            whereClauses.push(`(
                sp.applicable_ids IS NULL
                OR sp.applicable_ids = '[]'
                OR JSON_CONTAINS(sp.applicable_ids, JSON_OBJECT('campus_id', ?), '$')
            )`);
            params.push(Number(campus_id));
        }

        if (outlet_id) {
            whereClauses.push(`(
                sp.applicable_ids IS NULL
                OR sp.applicable_ids = '[]'
                OR JSON_SEARCH(sp.applicable_ids, 'one', ?, NULL, '$[*].outlet_ids[*]') IS NOT NULL
            )`);
            params.push(Number(outlet_id));
        }

        const whereSQL = whereClauses.length > 0
            ? `WHERE ${whereClauses.join(' AND ')}`
            : '';

        // Count
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM subscription_plans sp ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ==================================================
        // 3️⃣ Main Query — campus aur outlet NAMES ke saath
        // ==================================================
        const [plans] = await db.query(
            `
            SELECT
                sp.id,
                sp.plan_name,
                sp.plan_code,
                sp.plan_type,
                sp.original_annual_price,
                sp.monthly_wash_limit_kg,
                sp.wash_per_month,
                sp.maximum_weight_per_order_kg,
                sp.description,
                sp.start_date,
                sp.end_date,
                sp.monthly_pricing,
                sp.applicable_ids,
                sp.status,
                sp.created_at,
                sp.updated_at,

                (
                    SELECT COUNT(DISTINCT spa.campus_id)
                    FROM subscription_plan_applicability spa
                    WHERE spa.plan_id = sp.id
                ) AS campus_count,

                (
                    SELECT COUNT(DISTINCT spa.outlet_id)
                    FROM subscription_plan_applicability spa
                    WHERE spa.plan_id = sp.id
                ) AS outlet_count,

                (
                    SELECT COUNT(*)
                    FROM subscriptions_payments sub
                    WHERE sub.plan_id = sp.id
                      AND sub.payment_status = 'success'
                ) AS total_users

            FROM subscription_plans sp
            ${whereSQL}
            ORDER BY sp.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        // ==================================================
        // 4️⃣ Campus aur Outlet NAMES alag query se fetch karo
        //    (sirf is page ke plans ke liye)
        // ==================================================
        const planIds = plans.map(p => p.id);

        let campusMap = {};
        let outletMap = {};

        if (planIds.length > 0) {
            // Campuses for these plans
            const [campusRows] = await db.query(
                `
                SELECT DISTINCT
                    spa.plan_id,
                    spa.campus_id,
                    c.name AS campus_name,
                    c.institution_name AS campus_institution
                FROM subscription_plan_applicability spa
                LEFT JOIN campuses c ON c.id = spa.campus_id
                WHERE spa.plan_id IN (?)
                ORDER BY spa.plan_id, c.name
                `,
                [planIds]
            );

            // Outlets for these plans
            const [outletRows] = await db.query(
                `
                SELECT DISTINCT
                    spa.plan_id,
                    spa.outlet_id,
                    spa.campus_id,
                    o.name AS outlet_name,
                    o.section AS outlet_section,
                    c.name AS campus_name
                FROM subscription_plan_applicability spa
                LEFT JOIN outlets  o ON o.id = spa.outlet_id
                LEFT JOIN campuses c ON c.id = spa.campus_id
                WHERE spa.plan_id IN (?)
                ORDER BY spa.plan_id, o.name
                `,
                [planIds]
            );

            // Group by plan
            campusRows.forEach(row => {
                if (!campusMap[row.plan_id]) campusMap[row.plan_id] = [];
                campusMap[row.plan_id].push({
                    campusId: row.campus_id,
                    campusName: row.campus_name || `Campus #${row.campus_id}`,
                    institutionName: row.campus_institution
                });
            });

            outletRows.forEach(row => {
                if (!outletMap[row.plan_id]) outletMap[row.plan_id] = [];
                outletMap[row.plan_id].push({
                    outletId: row.outlet_id,
                    outletName: row.outlet_name || `Outlet #${row.outlet_id}`,
                    section: row.outlet_section,
                    campusId: row.campus_id,
                    campusName: row.campus_name
                });
            });
        }

        // ==================================================
        // 5️⃣ Format response
        // ==================================================
        const data = plans.map(item => {
            const start = item.start_date ? new Date(item.start_date) : null;
            const end = item.end_date ? new Date(item.end_date) : null;
            let validityMonths = null;
            if (start && end) {
                validityMonths =
                    (end.getFullYear() - start.getFullYear()) * 12 +
                    (end.getMonth() - start.getMonth());
            }

            const applicableIds =
                typeof item.applicable_ids === 'string'
                    ? JSON.parse(item.applicable_ids)
                    : (item.applicable_ids || []);

            const campuses = campusMap[item.id] || [];
            const outlets = outletMap[item.id] || [];

            const campusCount = Number(item.campus_count) || 0;
            const outletCount = Number(item.outlet_count) || 0;

            // Labels (frontend me direct dikhane ke liye)
            let campusLabel = 'All Campuses';
            let outletLabel = 'All Outlets';

            if (campusCount > 0) {
                campusLabel =
                    campusCount === 1
                        ? campuses[0]?.campusName || '1 Campus'
                        : `${campuses[0]?.campusName || ''} +${campusCount - 1}`;
            }

            if (outletCount > 0) {
                outletLabel = `${outletCount} Outlet${outletCount > 1 ? 's' : ''}`;
            }

            return {
                id: item.id,
                planName: item.plan_name,
                planCode: item.plan_code,
                planType: item.plan_type,
                originalAnnualPrice: Number(item.original_annual_price),
                monthlyWashLimitKg: Number(item.monthly_wash_limit_kg),
                washPerMonth: Number(item.wash_per_month),
                maximumWeightPerOrderKg: Number(item.maximum_weight_per_order_kg),
                description: item.description,
                startDate: item.start_date,
                endDate: item.end_date,
                validityMonths,

                monthlyPricing:
                    typeof item.monthly_pricing === 'string'
                        ? JSON.parse(item.monthly_pricing)
                        : (item.monthly_pricing || []),

                applicableIds,
                applicableCampuses: applicableIds,

                // 🆕 Campus + Outlet names ke saath
                campuses: campuses.map(c => ({
                    campusId: c.campusId,
                    campusName: c.campusName,
                    institutionName: c.institutionName
                })),

                outlets: outlets.map(o => ({
                    outletId: o.outletId,
                    outletName: o.outletName,
                    section: o.section,
                    campusId: o.campusId,
                    campusName: o.campusName
                })),

                // Short labels (table ke "Assigned To" column ke liye)
                assignedTo: {
                    campusLabel,
                    outletLabel,
                    campusCount,
                    outletCount,
                    campusNames: campuses.map(c => c.campusName)
                },

                totalUsers: Number(item.total_users) || 0,
                status: Number(item.status),
                statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',
                createdAt: item.created_at,
                updatedAt: item.updated_at
            };
        });

        return res.status(200).json({
            status: true,
            message: 'Subscription plans fetched successfully',
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
        console.error('Get Subscription Plan List Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch subscription plan list'
        });
    }
};
// ======================================================
// GET SUBSCRIPTION PLAN BY ID
// ======================================================
const getSubscriptionPlanById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        // ==================================================
        // 1️⃣ Plan Basic Info
        // ==================================================
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

        // ==================================================
        // 2️⃣ Assigned Campuses + Outlets (mapping table se)
        // ==================================================
        const [mappings] = await db.query(
            `
            SELECT
                spa.campus_id,
                c.name  AS campus_name,
                spa.outlet_id,
                o.name  AS outlet_name,
                o.section AS outlet_section,
                o.address AS outlet_address
            FROM subscription_plan_applicability spa
            LEFT JOIN campuses c ON c.id = spa.campus_id
            LEFT JOIN outlets  o ON o.id = spa.outlet_id
            WHERE spa.plan_id = ?
            ORDER BY spa.campus_id, spa.outlet_id
            `,
            [id]
        );

        // Campus-wise grouping
        const campusMap = {};
        const outletsList = [];

        mappings.forEach(row => {
            if (!campusMap[row.campus_id]) {
                campusMap[row.campus_id] = {
                    campusId: row.campus_id,
                    campusName: row.campus_name || `Campus #${row.campus_id}`,
                    outlets: []
                };
            }

            if (row.outlet_id) {
                campusMap[row.campus_id].outlets.push({
                    outletId: row.outlet_id,
                    outletName: row.outlet_name || `Outlet #${row.outlet_id}`,
                    section: row.outlet_section,
                    address: row.outlet_address
                });

                outletsList.push({
                    outletId: row.outlet_id,
                    outletName: row.outlet_name || `Outlet #${row.outlet_id}`,
                    campusId: row.campus_id,
                    campusName: row.campus_name,
                    section: row.outlet_section,
                    address: row.outlet_address
                });
            }
        });

        const campuses = Object.values(campusMap);

        // ==================================================
        // 3️⃣ Total Users Count (from subscriptions_payments)
        // ==================================================
        const [userCountRows] = await db.query(
            `
            SELECT COUNT(*) AS total_users
            FROM subscriptions_payments
            WHERE plan_id = ?
              AND payment_status = 'success'
            `,
            [id]
        );

        const totalUsers = Number(userCountRows[0].total_users) || 0;

        // ==================================================
        // 4️⃣ Validity Duration Calculation
        // ==================================================
        const start = item.start_date ? new Date(item.start_date) : null;
        const end = item.end_date ? new Date(item.end_date) : null;

        let totalMonths = null;
        let durationLabel = null;

        if (start && end) {
            totalMonths =
                (end.getFullYear() - start.getFullYear()) * 12 +
                (end.getMonth() - start.getMonth());

            if (totalMonths === 12) durationLabel = '12 Months (1 Year)';
            else if (totalMonths > 0) durationLabel = `${totalMonths} Months`;
            else durationLabel = null;
        }

        // ==================================================
        // 5️⃣ Assigned To Label
        // ==================================================
        const campusCount = campuses.length;
        const outletCount = outletsList.length;

        let applicableTo = 'All Campuses & All Outlets';
        if (campusCount > 0 && outletCount > 0) {
            applicableTo = `${campusCount} Campus${campusCount > 1 ? 'es' : ''} & ${outletCount} Outlet${outletCount > 1 ? 's' : ''}`;
        } else if (campusCount > 0) {
            applicableTo = `${campusCount} Campus${campusCount > 1 ? 'es' : ''}`;
        }

        // ==================================================
        // 6️⃣ Build Response
        // ==================================================
        const data = {
            // Basic
            id: item.id,
            planName: item.plan_name,
            planCode: item.plan_code,
            planType: item.plan_type,
            originalAnnualPrice: Number(item.original_annual_price),
            description: item.description,
            createdAt: item.created_at,
            updatedAt: item.updated_at,

            // Status
            status: Number(item.status),
            statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',

            // Top stat boxes
            stats: {
                totalUsers: totalUsers,
                totalCampuses: campusCount,
                totalOutlets: outletCount,
                originalPrice: Number(item.original_annual_price)
            },

            // Usage Limits
            usageLimits: {
                monthlyWashLimitKg: Number(item.monthly_wash_limit_kg),
                maximumWeightPerOrderKg: Number(item.maximum_weight_per_order_kg),
                washPerMonth: Number(item.wash_per_month)
            },

            // Validity
            validity: {
                startDate: item.start_date,
                endDate: item.end_date,
                totalMonths: totalMonths,
                durationLabel: durationLabel
            },

            // Purchase-month based pricing
            monthlyPricing:
                typeof item.monthly_pricing === 'string'
                    ? JSON.parse(item.monthly_pricing)
                    : (item.monthly_pricing || []),

            // Assigned Campuses & Outlets
            assignedTo: {
                applicableTo: applicableTo,
                totalCampuses: campusCount,
                totalOutlets: outletCount,
                campuses: campuses,          // [{ campusId, campusName, outlets: [...] }]
                outlets: outletsList         // flat list (Outlets tab ke liye)
            },

            // Raw applicable_ids (backup)
            applicableIds:
                typeof item.applicable_ids === 'string'
                    ? JSON.parse(item.applicable_ids)
                    : (item.applicable_ids || [])
        };

        return res.status(200).json({
            status: true,
            message: 'Subscription plan fetched successfully',
            data
        });

    } catch (error) {
        console.error('Get Subscription Plan By ID Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch subscription plan'
        });
    }
};
// ======================================================
// UPDATE SUBSCRIPTION PLAN
// ======================================================
const updateSubscriptionPlan = async (req, res) => {
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;

        if (!id) {
            await connection.rollback();
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        const {
            planName,
            planCode,
            planType,
            originalAnnualPrice,
            monthlyWashLimitKg,
            washPerMonth,
            maximumWeightPerOrderKg,
            description,
            startDate,
            endDate,
            monthlyPricing,
            applicableCampuses,
            status
        } = req.body;

        // ==================================================
        // Check plan exists
        // ==================================================
        const [existingPlan] = await connection.query(
            `SELECT id, plan_code FROM subscription_plans WHERE id = ? LIMIT 1`,
            [id]
        );

        if (existingPlan.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                status: false,
                message: 'Subscription plan not found'
            });
        }

        // ==================================================
        // Duplicate planCode check (agar planCode bheja ho)
        // ==================================================
        if (planCode !== undefined && planCode !== existingPlan[0].plan_code) {
            const [duplicatePlan] = await connection.query(
                `SELECT id FROM subscription_plans WHERE plan_code = ? AND id != ? LIMIT 1`,
                [planCode, id]
            );

            if (duplicatePlan.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    status: false,
                    message: 'Plan code already exists'
                });
            }
        }

        // ==================================================
        // Validate applicableCampuses (agar bheja ho)
        // ==================================================
        let finalApplicableCampuses = null;

        if (applicableCampuses !== undefined) {
            finalApplicableCampuses = Array.isArray(applicableCampuses)
                ? applicableCampuses
                : [];

            if (finalApplicableCampuses.length > 0) {
                for (const c of finalApplicableCampuses) {
                    if (
                        !c ||
                        typeof c.campus_id === 'undefined' ||
                        !Array.isArray(c.outlet_ids) ||
                        c.outlet_ids.length === 0
                    ) {
                        await connection.rollback();
                        return res.status(400).json({
                            status: false,
                            message: 'Each campus must have campus_id and non-empty outlet_ids array'
                        });
                    }
                }
            }
        }

        // ==================================================
        // Build dynamic UPDATE
        // ==================================================
        const fields = [];
        const values = [];

        if (planName !== undefined) {
            fields.push('plan_name = ?');
            values.push(planName);
        }
        if (planCode !== undefined) {
            fields.push('plan_code = ?');
            values.push(planCode);
        }
        if (planType !== undefined) {
            fields.push('plan_type = ?');
            values.push(planType);
        }
        if (originalAnnualPrice !== undefined) {
            fields.push('original_annual_price = ?');
            values.push(originalAnnualPrice);
        }
        if (monthlyWashLimitKg !== undefined) {
            fields.push('monthly_wash_limit_kg = ?');
            values.push(monthlyWashLimitKg);
        }
        if (washPerMonth !== undefined) {
            fields.push('wash_per_month = ?');
            values.push(washPerMonth);
        }
        if (maximumWeightPerOrderKg !== undefined) {
            fields.push('maximum_weight_per_order_kg = ?');
            values.push(maximumWeightPerOrderKg);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            values.push(description);
        }
        if (startDate !== undefined) {
            fields.push('start_date = ?');
            values.push(startDate);
        }
        if (endDate !== undefined) {
            fields.push('end_date = ?');
            values.push(endDate);
        }
        if (monthlyPricing !== undefined) {
            fields.push('monthly_pricing = ?');
            values.push(JSON.stringify(Array.isArray(monthlyPricing) ? monthlyPricing : []));
        }
        if (finalApplicableCampuses !== null) {
            fields.push('applicable_ids = ?');
            values.push(JSON.stringify(finalApplicableCampuses));
        }
        if (status !== undefined) {
            fields.push('status = ?');
            values.push(status === 0 ? 0 : 1);
        }

        // Agar kuch bhi update nahi karna
        if (fields.length === 0 && finalApplicableCampuses === null) {
            await connection.rollback();
            return res.status(400).json({
                status: false,
                message: 'No fields provided to update'
            });
        }

        // Always update updated_at
        fields.push('updated_at = NOW()');

        if (fields.length > 1) {  // sirf updated_at ke alawa kuch fields hain
            const updateSQL = `
                UPDATE subscription_plans
                SET ${fields.join(', ')}
                WHERE id = ?
            `;
            values.push(id);

            await connection.query(updateSQL, values);
        }

        // ==================================================
        // Sync mapping table (sirf agar applicableCampuses bheja ho)
        // ==================================================
        if (finalApplicableCampuses !== null) {
            // Purana delete
            await connection.query(
                `DELETE FROM subscription_plan_applicability WHERE plan_id = ?`,
                [id]
            );

            // Naya insert
            if (finalApplicableCampuses.length > 0) {
                const mappingValues = [];

                for (const c of finalApplicableCampuses) {
                    for (const outletId of c.outlet_ids) {
                        mappingValues.push([id, c.campus_id, outletId]);
                    }
                }

                if (mappingValues.length > 0) {
                    await connection.query(
                        `INSERT INTO subscription_plan_applicability (plan_id, campus_id, outlet_id) VALUES ?`,
                        [mappingValues]
                    );
                }
            }
        }

        await connection.commit();

        return res.status(200).json({
            status: true,
            message: 'Subscription plan updated successfully',
            data: {
                id: Number(id),
                updatedFields: fields
                    .filter(f => f !== 'updated_at = NOW()')
                    .map(f => f.split(' = ')[0]),
                campusesLinked: finalApplicableCampuses
                    ? finalApplicableCampuses.length
                    : undefined,
                outletsLinked: finalApplicableCampuses
                    ? finalApplicableCampuses.reduce(
                        (sum, c) => sum + (c.outlet_ids?.length || 0), 0
                    )
                    : undefined
            }
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (e) { /* ignore */ }
        }

        console.error('❌ Update Subscription Plan Error:', error);

        return res.status(500).json({
            status: false,
            message: 'Failed to update subscription plan',
            debug: {
                errorMessage: error.message,
                errorCode: error.code,
                sqlMessage: error.sqlMessage || null,
                sql: error.sql || null
            }
        });

    } finally {
        if (connection) connection.release();
    }
};
// ======================================================
// DELETE SUBSCRIPTION PLAN
// ======================================================
const deleteSubscriptionPlan = async (req, res) => {
    try {

        const { id } = req.params;


        const [existingPlan] = await db.query(
            `
            SELECT id
            FROM subscription_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        if (existingPlan.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Subscription plan not found'
            });
        }


        await db.query(
            `
            DELETE FROM subscription_plans
            WHERE id = ?
            `,
            [id]
        );


        return res.status(200).json({
            status: true,
            message: 'Subscription plan deleted successfully'
        });


    } catch (error) {

        console.error(
            'Delete Subscription Plan Error:',
            error
        );

        return res.status(500).json({
            status: false,
            message: 'Failed to delete subscription plan'
        });
    }
};

// ======================================================
// ACTIVE / INACTIVE SUBSCRIPTION PLAN
// ======================================================
const updateSubscriptionPlanStatus = async (req, res) => {
    try {

        const { id } = req.params;

        const { status } = req.body;


        // Only 0 and 1 allowed
        if (status !== 0 && status !== 1) {
            return res.status(400).json({
                status: false,
                message: 'Status must be 1 (Active) or 0 (Inactive)'
            });
        }


        // Check plan
        const [plan] = await db.query(
            `
            SELECT
                id,
                plan_name
            FROM subscription_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        if (plan.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Subscription plan not found'
            });
        }


        // Update status
        await db.query(
            `
            UPDATE subscription_plans
            SET
                status = ?,
                updated_at = NOW()
            WHERE id = ?
            `,
            [status, id]
        );


        return res.status(200).json({
            status: true,
            message:
                status === 1
                    ? 'Subscription plan activated successfully'
                    : 'Subscription plan deactivated successfully',

            data: {
                id: Number(id),
                planName: plan[0].plan_name,
                status: status,
                statusName:
                    status === 1
                        ? 'Active'
                        : 'Inactive'
            }
        });


    } catch (error) {

        console.error(
            'Update Subscription Plan Status Error:',
            error
        );

        return res.status(500).json({
            status: false,
            message: 'Failed to update subscription plan status'
        });
    }
};




// ======================================================
// EXPORT ALL FUNCTIONS
// ======================================================


// ===============================
// ADD PAY AS YOU GO PLAN
// ===============================
const addPayAsYouGoPlan = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            planName,
            description,
            washDryFoldPricePerKg,
            washDryFoldMinOrderKg,
            washDrySteamPricePerKg,
            washDrySteamMinOrderKg,
            applicableCampuses,        // [{ campus_id, outlet_ids: [], max_discount_percent }]
            outletDiscountLimits,      // [{ outlet_id, campus_id, max_discount_percent }]
            status
        } = req.body;

        // ---------- Required Validation ----------
        if (!planName) {
            await connection.rollback();
            return res.status(400).json({ status: false, message: 'Plan name is required' });
        }

        if (
            washDryFoldPricePerKg === undefined ||
            washDryFoldMinOrderKg === undefined ||
            washDrySteamPricePerKg === undefined ||
            washDrySteamMinOrderKg === undefined
        ) {
            await connection.rollback();
            return res.status(400).json({
                status: false,
                message: 'Service pricing and minimum order values are required'
            });
        }

        // ---------- Applicability (based on applicableCampuses) ----------
        const finalApplicableCampuses = Array.isArray(applicableCampuses)
            ? applicableCampuses
            : [];

        if (finalApplicableCampuses.length > 0) {
            for (const c of finalApplicableCampuses) {
                if (
                    !c ||
                    typeof c.campus_id === 'undefined' ||
                    !Array.isArray(c.outlet_ids) ||
                    c.outlet_ids.length === 0
                ) {
                    await connection.rollback();
                    return res.status(400).json({
                        status: false,
                        message: 'Each campus must have campus_id and non-empty outlet_ids array'
                    });
                }
            }
        }

        // Determine applicability type automatically
        let applicabilityType = 'ALL';
        if (finalApplicableCampuses.length > 0) {
            applicabilityType = 'SPECIFIC';
        }

        // ---------- Outlet Discount Limits ----------
        const finalDiscountLimits = Array.isArray(outletDiscountLimits)
            ? outletDiscountLimits
            : [];

        const finalStatus = status === 0 ? 0 : 1;

        // ---------- Insert Plan ----------
        const [result] = await connection.query(
            `
            INSERT INTO pay_as_you_go_plans
            (
                plan_name,
                description,
                wash_dry_fold_price_per_kg,
                wash_dry_fold_min_order_kg,
                wash_dry_steam_price_per_kg,
                wash_dry_steam_min_order_kg,
                applicability_type,
                applicable_ids,
                outlet_discount_limits,
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
                planName,
                description || null,
                washDryFoldPricePerKg,
                washDryFoldMinOrderKg,
                washDrySteamPricePerKg,
                washDrySteamMinOrderKg,
                applicabilityType,
                JSON.stringify(finalApplicableCampuses),
                JSON.stringify(finalDiscountLimits),
                finalStatus
            ]
        );

        const planId = result.insertId;

        // ---------- Insert Mapping with Discount ----------
        if (finalApplicableCampuses.length > 0) {
            // Discount map build karo (outlet_id -> max_discount_percent)
            const discountMap = {};
            finalDiscountLimits.forEach(d => {
                if (d.outlet_id !== undefined) {
                    discountMap[d.outlet_id] = d.max_discount_percent || 0;
                }
            });

            const mappingValues = [];
            for (const c of finalApplicableCampuses) {
                for (const outletId of c.outlet_ids) {
                    const discount = discountMap[outletId] !== undefined
                        ? discountMap[outletId]
                        : (c.max_discount_percent || 0);
                    mappingValues.push([planId, c.campus_id, outletId, discount]);
                }
            }

            if (mappingValues.length > 0) {
                await connection.query(
                    `INSERT INTO pay_as_you_go_plan_applicability 
                     (plan_id, campus_id, outlet_id, max_discount_percent) 
                     VALUES ?`,
                    [mappingValues]
                );
            }
        }

        await connection.commit();

        return res.status(201).json({
            status: true,
            message: 'Pay As You Go plan created successfully',
            data: {
                id: planId,
                planName,
                status: finalStatus,
                campusesLinked: finalApplicableCampuses.length,
                outletsLinked: finalApplicableCampuses.reduce(
                    (sum, c) => sum + (c.outlet_ids?.length || 0), 0
                )
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Add Pay As You Go Plan Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to create Pay As You Go plan',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    } finally {
        connection.release();
    }
};


// ===============================
// GET PAY AS YOU GO PLAN LIST
// ===============================
const getPayAsYouGoPlanList = async (req, res) => {
    try {
        const {
            search = '',
            status,
            campus_id,
            outlet_id,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // ---------- Stats ----------
        const [statsRows] = await db.query(`
            SELECT
                COUNT(*) AS total_plans,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active_plans,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS inactive_plans
            FROM pay_as_you_go_plans
        `);

        const [outletStatsRows] = await db.query(`
            SELECT COUNT(DISTINCT outlet_id) AS total_outlets
            FROM pay_as_you_go_plan_applicability
        `);

        const stats = {
            totalPlans: Number(statsRows[0].total_plans) || 0,
            activePlans: Number(statsRows[0].active_plans) || 0,
            inactivePlans: Number(statsRows[0].inactive_plans) || 0,
            assignedOutlets: Number(outletStatsRows[0].total_outlets) || 0
        };

        // ---------- Filters ----------
        let whereClauses = [];
        let params = [];

        if (search && search.trim() !== '') {
            whereClauses.push(`(
                p.plan_name LIKE ?
                OR p.description LIKE ?
            )`);
            const likeSearch = `%${search.trim()}%`;
            params.push(likeSearch, likeSearch);
        }

        if (status !== undefined && status !== '' && status !== 'all') {
            whereClauses.push(`p.status = ?`);
            params.push(Number(status));
        }

        if (campus_id) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM pay_as_you_go_plan_applicability m
                WHERE m.plan_id = p.id AND m.campus_id = ?
            )`);
            params.push(Number(campus_id));
        }

        if (outlet_id) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM pay_as_you_go_plan_applicability m
                WHERE m.plan_id = p.id AND m.outlet_id = ?
            )`);
            params.push(Number(outlet_id));
        }

        const whereSQL = whereClauses.length > 0
            ? `WHERE ${whereClauses.join(' AND ')}`
            : '';

        // ---------- Count ----------
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM pay_as_you_go_plans p ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ---------- Main Query ----------
        const [plans] = await db.query(
            `
            SELECT
                p.id,
                p.plan_name,
                p.description,
                p.wash_dry_fold_price_per_kg,
                p.wash_dry_fold_min_order_kg,
                p.wash_dry_steam_price_per_kg,
                p.wash_dry_steam_min_order_kg,
                p.applicability_type,
                p.applicable_ids,
                p.outlet_discount_limits,
                p.status,
                p.created_at,
                p.updated_at,

                (
                    SELECT COUNT(DISTINCT m.campus_id)
                    FROM pay_as_you_go_plan_applicability m
                    WHERE m.plan_id = p.id
                ) AS campus_count,

                (
                    SELECT COUNT(DISTINCT m.outlet_id)
                    FROM pay_as_you_go_plan_applicability m
                    WHERE m.plan_id = p.id
                ) AS outlet_count

            FROM pay_as_you_go_plans p
            ${whereSQL}
            ORDER BY p.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        // ---------- Fetch campus/outlet names for this page ----------
        const planIds = plans.map(p => p.id);
        let campusMap = {};
        let outletMap = {};

        if (planIds.length > 0) {
            const [campusRows] = await db.query(
                `
                SELECT DISTINCT m.plan_id, m.campus_id, c.name AS campus_name
                FROM pay_as_you_go_plan_applicability m
                LEFT JOIN campuses c ON c.id = m.campus_id
                WHERE m.plan_id IN (?)
                ORDER BY m.plan_id, c.name
                `,
                [planIds]
            );

            const [outletRows] = await db.query(
                `
                SELECT DISTINCT m.plan_id, m.outlet_id, m.campus_id, 
                       o.name AS outlet_name, o.section,
                       c.name AS campus_name
                FROM pay_as_you_go_plan_applicability m
                LEFT JOIN outlets o ON o.id = m.outlet_id
                LEFT JOIN campuses c ON c.id = m.campus_id
                WHERE m.plan_id IN (?)
                ORDER BY m.plan_id, o.name
                `,
                [planIds]
            );

            campusRows.forEach(row => {
                if (!campusMap[row.plan_id]) campusMap[row.plan_id] = [];
                campusMap[row.plan_id].push({
                    campusId: row.campus_id,
                    campusName: row.campus_name || `Campus #${row.campus_id}`
                });
            });

            outletRows.forEach(row => {
                if (!outletMap[row.plan_id]) outletMap[row.plan_id] = [];
                outletMap[row.plan_id].push({
                    outletId: row.outlet_id,
                    outletName: row.outlet_name || `Outlet #${row.outlet_id}`,
                    section: row.section,
                    campusId: row.campus_id,
                    campusName: row.campus_name
                });
            });
        }

        // ---------- Format ----------
        const data = plans.map(item => {
            const campuses = campusMap[item.id] || [];
            const outlets = outletMap[item.id] || [];
            const campusCount = Number(item.campus_count) || 0;
            const outletCount = Number(item.outlet_count) || 0;

            const applicableIds =
                typeof item.applicable_ids === 'string'
                    ? JSON.parse(item.applicable_ids)
                    : (item.applicable_ids || []);

            const outletDiscountLimits =
                typeof item.outlet_discount_limits === 'string'
                    ? JSON.parse(item.outlet_discount_limits)
                    : (item.outlet_discount_limits || []);

            return {
                id: item.id,
                planName: item.plan_name,
                description: item.description,

                washDryFold: {
                    pricePerKg: Number(item.wash_dry_fold_price_per_kg),
                    minimumOrderKg: Number(item.wash_dry_fold_min_order_kg)
                },

                washDrySteamPress: {
                    pricePerKg: Number(item.wash_dry_steam_price_per_kg),
                    minimumOrderKg: Number(item.wash_dry_steam_min_order_kg)
                },

                applicabilityType: item.applicability_type,
                applicableIds,
                applicableCampuses: applicableIds,

                campuses: campuses,
                outlets: outlets,

                assignedTo: {
                    campusLabel: campusCount > 0
                        ? (campusCount === 1
                            ? (campuses[0]?.campusName || '1 Campus')
                            : `${campuses[0]?.campusName || ''} +${campusCount - 1}`)
                        : 'All Campuses & All Outlets',
                    outletLabel: outletCount > 0
                        ? `${outletCount} Outlet${outletCount > 1 ? 's' : ''}`
                        : 'All Outlets',
                    campusCount,
                    outletCount,
                    campusNames: campuses.map(c => c.campusName)
                },

                outletDiscountLimits,

                discountLimitType: 'Outlet-wise',

                status: Number(item.status),
                statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',

                createdAt: item.created_at,
                updatedAt: item.updated_at
            };
        });

        return res.status(200).json({
            status: true,
            message: 'Pay As You Go plan list fetched successfully',
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
        console.error('Get Pay As You Go Plan List Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch Pay As You Go plan list',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    }
};


// ===============================
// GET PAY AS YOU GO PLAN BY ID
// ===============================
const getPayAsYouGoPlanById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        // ---------- Plan Basic ----------
        const [plans] = await db.query(
            `
            SELECT
                id, plan_name, description,
                wash_dry_fold_price_per_kg, wash_dry_fold_min_order_kg,
                wash_dry_steam_price_per_kg, wash_dry_steam_min_order_kg,
                applicability_type, applicable_ids, outlet_discount_limits,
                status, created_at, updated_at
            FROM pay_as_you_go_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );

        if (plans.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Pay As You Go plan not found'
            });
        }

        const item = plans[0];

        // ---------- Mapping + Names ----------
        const [mappings] = await db.query(
            `
            SELECT
                m.campus_id,
                c.name AS campus_name,
                m.outlet_id,
                o.name AS outlet_name,
                o.section AS outlet_section,
                m.max_discount_percent
            FROM pay_as_you_go_plan_applicability m
            LEFT JOIN campuses c ON c.id = m.campus_id
            LEFT JOIN outlets o ON o.id = m.outlet_id
            WHERE m.plan_id = ?
            ORDER BY m.campus_id, m.outlet_id
            `,
            [id]
        );

        const campusMap = {};
        const outletsList = [];
        const discountLimits = [];

        mappings.forEach(row => {
            if (!campusMap[row.campus_id]) {
                campusMap[row.campus_id] = {
                    campusId: row.campus_id,
                    campusName: row.campus_name || `Campus #${row.campus_id}`,
                    outlets: []
                };
            }

            if (row.outlet_id) {
                const outletObj = {
                    outletId: row.outlet_id,
                    outletName: row.outlet_name || `Outlet #${row.outlet_id}`,
                    section: row.outlet_section,
                    maxDiscountPercent: Number(row.max_discount_percent) || 0
                };

                campusMap[row.campus_id].outlets.push(outletObj);

                outletsList.push({
                    ...outletObj,
                    campusId: row.campus_id,
                    campusName: row.campus_name
                });

                discountLimits.push({
                    campusId: row.campus_id,
                    campusName: row.campus_name,
                    outletId: row.outlet_id,
                    outletName: row.outlet_name,
                    section: row.outlet_section,
                    maxDiscountPercent: Number(row.max_discount_percent) || 0
                });
            }
        });

        const campuses = Object.values(campusMap);

        // ---------- Stats ----------
        const [customerRows] = await db.query(
            `
            SELECT COUNT(DISTINCT student_id) AS total_customers
            FROM subscriptions_payments
            WHERE campus_id IN (
                SELECT DISTINCT campus_id 
                FROM pay_as_you_go_plan_applicability 
                WHERE plan_id = ?
            )
            `,
            [id]
        );

        const [orderRows] = await db.query(
            `
            SELECT COUNT(*) AS total_orders
            FROM subscriptions_payments
            WHERE plan_id = ?
              AND payment_status = 'success'
            `,
            [id]
        );

        const campusCount = campuses.length;
        const outletCount = outletsList.length;

        // ---------- Response ----------
        const data = {
            id: item.id,
            planName: item.plan_name,
            description: item.description,

            washDryFold: {
                pricePerKg: Number(item.wash_dry_fold_price_per_kg),
                minimumOrderKg: Number(item.wash_dry_fold_min_order_kg)
            },

            washDrySteamPress: {
                pricePerKg: Number(item.wash_dry_steam_price_per_kg),
                minimumOrderKg: Number(item.wash_dry_steam_min_order_kg)
            },

            stats: {
                assignedCampuses: campusCount,
                assignedOutlets: outletCount,
                totalCustomers: Number(customerRows[0].total_customers) || 0,
                totalOrders: Number(orderRows[0].total_orders) || 0,
                assignedCampusesLabel: campusCount === 0 ? 'All' : String(campusCount),
                assignedOutletsLabel: String(outletCount)
            },

            assignedLocations: {
                campusLabel: campusCount === 0 ? 'All Campuses' : `${campusCount} Campuses`,
                campusSubLabel: campusCount === 0
                    ? 'This plan is available for all campuses.'
                    : `This plan is available for ${campusCount} campuses.`,
                outletLabel: outletCount === 0 ? 'All Outlets' : `All Outlets (${outletCount})`,
                outletSubLabel: outletCount === 0
                    ? 'This plan is available for all outlets across campuses.'
                    : `This plan is available for ${outletCount} outlets across campuses.`,
                campuses: campuses,
                outlets: outletsList
            },

            outletDiscountLimits: discountLimits,
            discountLimitType: 'Outlet-wise',

            applicabilityType: item.applicability_type,
            applicableIds:
                typeof item.applicable_ids === 'string'
                    ? JSON.parse(item.applicable_ids)
                    : (item.applicable_ids || []),

            status: Number(item.status),
            statusName: Number(item.status) === 1 ? 'Active' : 'Inactive',

            createdAt: item.created_at,
            updatedAt: item.updated_at
        };

        return res.status(200).json({
            status: true,
            message: 'Pay As You Go plan fetched successfully',
            data
        });

    } catch (error) {
        console.error('Get Pay As You Go Plan By ID Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch Pay As You Go plan',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    }
};


// ===============================
// UPDATE PAY AS YOU GO PLAN
// ===============================
const updatePayAsYouGoPlan = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        const {
            planName,
            description,
            washDryFoldPricePerKg,
            washDryFoldMinOrderKg,
            washDrySteamPricePerKg,
            washDrySteamMinOrderKg,
            applicableCampuses,
            outletDiscountLimits,
            status
        } = req.body;

        // Check plan exists
        const [existingPlan] = await connection.query(
            `SELECT id FROM pay_as_you_go_plans WHERE id = ? LIMIT 1`,
            [id]
        );

        if (existingPlan.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                status: false,
                message: 'Pay As You Go plan not found'
            });
        }

        // ---------- Dynamic UPDATE (partial update supported) ----------
        const fields = [];
        const values = [];

        if (planName !== undefined) { fields.push('plan_name = ?'); values.push(planName); }
        if (description !== undefined) { fields.push('description = ?'); values.push(description); }
        if (washDryFoldPricePerKg !== undefined) { fields.push('wash_dry_fold_price_per_kg = ?'); values.push(washDryFoldPricePerKg); }
        if (washDryFoldMinOrderKg !== undefined) { fields.push('wash_dry_fold_min_order_kg = ?'); values.push(washDryFoldMinOrderKg); }
        if (washDrySteamPricePerKg !== undefined) { fields.push('wash_dry_steam_price_per_kg = ?'); values.push(washDrySteamPricePerKg); }
        if (washDrySteamMinOrderKg !== undefined) { fields.push('wash_dry_steam_min_order_kg = ?'); values.push(washDrySteamMinOrderKg); }
        if (status !== undefined) { fields.push('status = ?'); values.push(status === 0 ? 0 : 1); }

        let finalApplicableCampuses = null;
        if (applicableCampuses !== undefined) {
            finalApplicableCampuses = Array.isArray(applicableCampuses)
                ? applicableCampuses
                : [];

            if (finalApplicableCampuses.length > 0) {
                for (const c of finalApplicableCampuses) {
                    if (
                        !c ||
                        typeof c.campus_id === 'undefined' ||
                        !Array.isArray(c.outlet_ids) ||
                        c.outlet_ids.length === 0
                    ) {
                        await connection.rollback();
                        return res.status(400).json({
                            status: false,
                            message: 'Each campus must have campus_id and non-empty outlet_ids array'
                        });
                    }
                }
            }

            const applicType = finalApplicableCampuses.length > 0 ? 'SPECIFIC' : 'ALL';
            fields.push('applicability_type = ?');
            values.push(applicType);

            fields.push('applicable_ids = ?');
            values.push(JSON.stringify(finalApplicableCampuses));
        }

        let finalDiscountLimits = null;
        if (outletDiscountLimits !== undefined) {
            finalDiscountLimits = Array.isArray(outletDiscountLimits)
                ? outletDiscountLimits
                : [];
            fields.push('outlet_discount_limits = ?');
            values.push(JSON.stringify(finalDiscountLimits));
        }

        if (fields.length === 0 && finalApplicableCampuses === null) {
            await connection.rollback();
            return res.status(400).json({
                status: false,
                message: 'No fields provided to update'
            });
        }

        if (fields.length > 0) {
            fields.push('updated_at = NOW()');
            values.push(id);

            await connection.query(
                `UPDATE pay_as_you_go_plans SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        // ---------- Sync Mapping Table ----------
        if (finalApplicableCampuses !== null) {
            await connection.query(
                `DELETE FROM pay_as_you_go_plan_applicability WHERE plan_id = ?`,
                [id]
            );

            if (finalApplicableCampuses.length > 0) {
                const discountMap = {};
                (finalDiscountLimits || []).forEach(d => {
                    if (d.outlet_id !== undefined) {
                        discountMap[d.outlet_id] = d.max_discount_percent || 0;
                    }
                });

                const mappingValues = [];
                for (const c of finalApplicableCampuses) {
                    for (const outletId of c.outlet_ids) {
                        const discount = discountMap[outletId] !== undefined
                            ? discountMap[outletId]
                            : (c.max_discount_percent || 0);
                        mappingValues.push([id, c.campus_id, outletId, discount]);
                    }
                }

                if (mappingValues.length > 0) {
                    await connection.query(
                        `INSERT INTO pay_as_you_go_plan_applicability 
                         (plan_id, campus_id, outlet_id, max_discount_percent) 
                         VALUES ?`,
                        [mappingValues]
                    );
                }
            }
        }

        await connection.commit();

        return res.status(200).json({
            status: true,
            message: 'Pay As You Go plan updated successfully',
            data: {
                id: Number(id),
                updatedFields: fields
                    .filter(f => f !== 'updated_at = NOW()')
                    .map(f => f.split(' = ')[0])
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Update Pay As You Go Plan Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to update Pay As You Go plan',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    } finally {
        connection.release();
    }
};




// ===============================
// DELETE PAY AS YOU GO PLAN
// ===============================
const deletePayAsYouGoPlan = async (req, res) => {
    try {

        const { id } = req.params;


        const [existingPlan] = await db.query(
            `
            SELECT id
            FROM pay_as_you_go_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        if (existingPlan.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Pay As You Go plan not found'
            });
        }


        await db.query(
            `
            DELETE FROM pay_as_you_go_plans
            WHERE id = ?
            `,
            [id]
        );


        return res.status(200).json({
            status: true,
            message: 'Pay As You Go plan deleted successfully'
        });

    } catch (error) {

        console.error('Delete Pay As You Go Plan Error:', error);

        return res.status(500).json({
            status: false,
            message: 'Failed to delete Pay As You Go plan'
        });
    }
};



// ===============================
// ACTIVE / INACTIVE
// ===============================
const updatePayAsYouGoPlanStatus = async (req, res) => {
    try {

        const { id } = req.params;
        const { status } = req.body;


        if (status !== 0 && status !== 1) {
            return res.status(400).json({
                status: false,
                message: 'Status must be 1 (Active) or 0 (Inactive)'
            });
        }


        const [existingPlan] = await db.query(
            `
            SELECT id, plan_name
            FROM pay_as_you_go_plans
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        if (existingPlan.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Pay As You Go plan not found'
            });
        }


        await db.query(
            `
            UPDATE pay_as_you_go_plans
            SET
                status = ?,
                updated_at = NOW()
            WHERE id = ?
            `,
            [status, id]
        );


        return res.status(200).json({
            status: true,
            message:
                status === 1
                    ? 'Pay As You Go plan activated successfully'
                    : 'Pay As You Go plan deactivated successfully',
            data: {
                id: Number(id),
                planName: existingPlan[0].plan_name,
                status: status,
                statusName: status === 1
                    ? 'Active'
                    : 'Inactive'
            }
        });

    } catch (error) {

        console.error('Update Pay As You Go Plan Status Error:', error);

        return res.status(500).json({
            status: false,
            message: 'Failed to update Pay As You Go plan status'
        });
    }
};



// ==========================================
// 1. CAMPUS APIs
// ==========================================

// @desc    Get All Campuses (List Page)
// @route   GET /api/admin/campuses
// with Filters

// const getAllCampuses = async (req, res) => {
//     try {
//         const {
//             city,
//             search,
//             type = 'receptionist',   // receptionist | pay_as_you_go
//             page = 1,
//             limit = 10
//         } = req.query;

//         const VALID_TYPES = ['receptionist', 'pay_as_you_go'];
//         if (!VALID_TYPES.includes(type)) {
//             return res.status(400).json({
//                 success: false,
//                 message: `type must be one of: ${VALID_TYPES.join(', ')}`
//             });
//         }

//         const pageNum = Math.max(1, parseInt(page) || 1);
//         const limitNum = Math.max(1, parseInt(limit) || 10);
//         const offset = (pageNum - 1) * limitNum;

//         // ==================================================
//         // Base WHERE (Sirf active campuses)
//         // ==================================================
//         // YAHAN CHANGE: Default mein hi c.is_active = 1 laga diya hai
//         let whereClause = `WHERE c.is_active = 1`;
//         let params = [];

//         if (city) {
//             whereClause += ` AND c.city = ?`;
//             params.push(city);
//         }
//         if (search) {
//             whereClause += ` AND (c.name LIKE ? OR c.institution_name LIKE ? OR c.city LIKE ?)`;
//             params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//         }

//         // ==================================================
//         // Count
//         // ==================================================
//         const [countResult] = await db.execute(
//             `SELECT COUNT(*) as total FROM campuses c ${whereClause}`,
//             params
//         );
//         const totalRecords = countResult[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         // ==================================================
//         // Type wise extra columns
//         // ==================================================
//         let typeColumns = '';

//         if (type === 'receptionist') {
//             typeColumns = `
//                 ,(
//                     SELECT COUNT(DISTINCT uo.outlet_id)
//                     FROM user_outlets uo
//                     INNER JOIN outlets o ON o.id = uo.outlet_id
//                     INNER JOIN users u ON u.id = uo.user_id AND u.is_active = 1
//                     WHERE o.campus_id = c.id
//                 ) AS outlets_with_manager,

//                 (
//                     SELECT COUNT(DISTINCT uor.outlet_id)
//                     FROM user_outlets_receptionist uor
//                     INNER JOIN outlets o ON o.id = uor.outlet_id
//                     INNER JOIN users u ON u.id = uor.user_id AND u.is_active = 1
//                     WHERE o.campus_id = c.id
//                 ) AS outlets_with_receptionist
//             `;
//         } else {
//             // pay_as_you_go (sirf active plans, status = 1)
//             typeColumns = `
//                 ,(
//                     SELECT COUNT(DISTINCT pa.outlet_id)
//                     FROM pay_as_you_go_plan_applicability pa
//                     INNER JOIN pay_as_you_go_plans p ON p.id = pa.plan_id AND p.status = 1
//                     INNER JOIN outlets o ON o.id = pa.outlet_id
//                     WHERE o.campus_id = c.id
//                 ) AS outlets_with_plan,

//                 (
//                     SELECT COUNT(DISTINCT pa.plan_id)
//                     FROM pay_as_you_go_plan_applicability pa
//                     INNER JOIN pay_as_you_go_plans p ON p.id = pa.plan_id AND p.status = 1
//                     WHERE pa.campus_id = c.id
//                 ) AS total_plans
//             `;
//         }

//         // ==================================================
//         // Main Query
//         // ==================================================
//         const [rows] = await db.execute(
//             `
//             SELECT
//                 c.*,

//                 (SELECT COUNT(*) FROM outlets o WHERE o.campus_id = c.id AND o.is_active = 1) AS total_outlets,
//                 (SELECT COUNT(*) FROM students s WHERE s.campus_id = c.id) AS total_students
//                 ${typeColumns}

//             FROM campuses c
//             ${whereClause}
//             ORDER BY c.created_at DESC
//             LIMIT ${limitNum} OFFSET ${offset}
//             `,
//             params
//         );

//         // ==================================================
//         // is_fully_setup (type wise)
//         // ==================================================
//         const data = rows.map(campus => {
//             const totalOutlets = Number(campus.total_outlets) || 0;
//             let isFullySetup = false;

//             if (type === 'receptionist') {
//                 const withManager = Number(campus.outlets_with_manager) || 0;
//                 const withReceptionist = Number(campus.outlets_with_receptionist) || 0;

//                 isFullySetup =
//                     totalOutlets > 0 &&
//                     withManager === totalOutlets &&
//                     withReceptionist === totalOutlets;
//             } else {
//                 const withPlan = Number(campus.outlets_with_plan) || 0;

//                 isFullySetup =
//                     totalOutlets > 0 &&
//                     withPlan === totalOutlets;
//             }

//             return {
//                 ...campus,
//                 type,
//                 is_fully_setup: isFullySetup
//             };
//         });

//         // ==================================================
//         // Stats (Sirf active campuses ka)
//         // ==================================================
//         // YAHAN CHANGE: Ab sirf active campuses ka count hoga
//         const [[stats]] = await db.execute(`
//             SELECT
//                 COUNT(*) as total_campuses,
//                 (SELECT COUNT(*) FROM students) as total_students
//             FROM campuses
//             WHERE is_active = 1
//         `);

//         // ==================================================
//         // Cities (Sirf active campuses ki cities)
//         // ==================================================
//         // YAHAN CHANGE: Cities bhi sirf active campuses se
//         const [citiesResult] = await db.execute(`
//             SELECT DISTINCT city FROM campuses
//             WHERE city IS NOT NULL AND city != '' AND is_active = 1
//             ORDER BY city ASC
//         `);
//         const cities = citiesResult.map(row => row.city);

//         // ==================================================
//         // Response
//         // ==================================================
//         res.status(200).json({
//             success: true,
//             type,
//             stats,
//             cities,
//             data,
//             pagination: {
//                 total_records: totalRecords,
//                 total_pages: totalPages,
//                 current_page: pageNum,
//                 limit: limitNum
//             }
//         });

//     } catch (error) {
//         console.error('Error in getAllCampuses:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Server Error'
//         });
//     }
// };
const getAllCampuses = async (req, res) => {
    try {
        const {
            city,
            search,
            type = 'receptionist',   // receptionist | pay_as_you_go
            page = 1,
            limit = 10
        } = req.query;

        const VALID_TYPES = ['receptionist', 'pay_as_you_go'];
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `type must be one of: ${VALID_TYPES.join(', ')}`
            });
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // ==================================================
        // Base WHERE (Active + Inactive dono campuses)
        // ==================================================
        let whereClause = `WHERE 1=1`;
        let params = [];

        if (city) {
            whereClause += ` AND c.city = ?`;
            params.push(city);
        }
        if (search) {
            whereClause += ` AND (c.name LIKE ? OR c.institution_name LIKE ? OR c.city LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // ==================================================
        // Count
        // ==================================================
        const [countResult] = await db.execute(
            `SELECT COUNT(*) as total FROM campuses c ${whereClause}`,
            params
        );
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ==================================================
        // Type wise extra columns
        // ==================================================
        let typeColumns = '';

        if (type === 'receptionist') {
            typeColumns = `
                ,(
                    SELECT COUNT(DISTINCT uo.outlet_id)
                    FROM user_outlets uo
                    INNER JOIN outlets o ON o.id = uo.outlet_id
                    INNER JOIN users u ON u.id = uo.user_id AND u.is_active = 1
                    WHERE o.campus_id = c.id
                ) AS outlets_with_manager,

                (
                    SELECT COUNT(DISTINCT uor.outlet_id)
                    FROM user_outlets_receptionist uor
                    INNER JOIN outlets o ON o.id = uor.outlet_id
                    INNER JOIN users u ON u.id = uor.user_id AND u.is_active = 1
                    WHERE o.campus_id = c.id
                ) AS outlets_with_receptionist
            `;
        } else {
            // pay_as_you_go (sirf active plans, status = 1)
            typeColumns = `
                ,(
                    SELECT COUNT(DISTINCT pa.outlet_id)
                    FROM pay_as_you_go_plan_applicability pa
                    INNER JOIN pay_as_you_go_plans p ON p.id = pa.plan_id AND p.status = 1
                    INNER JOIN outlets o ON o.id = pa.outlet_id
                    WHERE o.campus_id = c.id
                ) AS outlets_with_plan,

                (
                    SELECT COUNT(DISTINCT pa.plan_id)
                    FROM pay_as_you_go_plan_applicability pa
                    INNER JOIN pay_as_you_go_plans p ON p.id = pa.plan_id AND p.status = 1
                    WHERE pa.campus_id = c.id
                ) AS total_plans
            `;
        }

        // ==================================================
        // Main Query
        // ==================================================
        // YAHAN CHANGE: students count me is_active IN (0, 1) laga diya hai
        const [rows] = await db.execute(
            `
            SELECT
                c.*,

                (SELECT COUNT(*) FROM outlets o WHERE o.campus_id = c.id AND o.is_active = 1) AS total_outlets,
                (SELECT COUNT(*) FROM students s WHERE s.campus_id = c.id AND s.is_active IN (0, 1)) AS total_students
                ${typeColumns}

            FROM campuses c
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        // ==================================================
        // is_fully_setup (type wise)
        // ==================================================
        const data = rows.map(campus => {
            const totalOutlets = Number(campus.total_outlets) || 0;
            let isFullySetup = false;

            if (type === 'receptionist') {
                const withManager = Number(campus.outlets_with_manager) || 0;
                const withReceptionist = Number(campus.outlets_with_receptionist) || 0;

                isFullySetup =
                    totalOutlets > 0 &&
                    withManager === totalOutlets &&
                    withReceptionist === totalOutlets;
            } else {
                const withPlan = Number(campus.outlets_with_plan) || 0;

                isFullySetup =
                    totalOutlets > 0 &&
                    withPlan === totalOutlets;
            }

            return {
                ...campus,
                type,
                is_fully_setup: isFullySetup
            };
        });

        // ==================================================
        // Stats (Active + Inactive campuses ka count)
        // ==================================================
        // YAHAN CHANGE: total_students me bhi is_active IN (0, 1) laga diya hai
        const [[stats]] = await db.execute(`
            SELECT
                COUNT(*) as total_campuses,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) as active_campuses,
                COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END), 0) as inactive_campuses,
                (SELECT COUNT(*) FROM students WHERE is_active IN (0, 1)) as total_students
            FROM campuses
        `);

        // ==================================================
        // Cities (Active + Inactive dono campuses ki cities)
        // ==================================================
        const [citiesResult] = await db.execute(`
            SELECT DISTINCT city FROM campuses
            WHERE city IS NOT NULL AND city != ''
            ORDER BY city ASC
        `);
        const cities = citiesResult.map(row => row.city);

        // ==================================================
        // Response
        // ==================================================
        res.status(200).json({
            success: true,
            type,
            stats,
            cities,
            data,
            pagination: {
                total_records: totalRecords,
                total_pages: totalPages,
                current_page: pageNum,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('Error in getAllCampuses:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};
// @desc    Get Single Campus Details
// @route   GET /api/admin/campuses/:id
// const getCampusById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const [campus] = await db.execute(`SELECT * FROM campuses WHERE id = ?`, [id]);

//         if (campus.length === 0) return res.status(404).json({ success: false, message: 'Campus not found' });

//         // Get Outlets for this campus
//         const [outlets] = await db.execute(`
//             SELECT o.*, 
//             (SELECT COUNT(*) FROM students s WHERE s.outlet_id = o.id) as students_count
//             FROM outlets o WHERE o.campus_id = ?
//         `, [id]);

//         res.status(200).json({ success: true, data: { ...campus[0], outlets } });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };

const getCampusById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get Campus Details
        const [campus] = await db.execute(`SELECT * FROM campuses WHERE id = ?`, [id]);

        if (campus.length === 0) {
            return res.status(404).json({ success: false, message: 'Campus not found' });
        }

        // 2. Get Outlets
        const [outlets] = await db.execute(`
            SELECT 
                o.*, 
                u.name AS manager_name,
                u.phone AS manager_phone,
                u.email AS manager_email,
                (SELECT COUNT(*) FROM students s WHERE s.outlet_id = o.id) AS students_count,
                (SELECT COUNT(*) FROM machines mc WHERE mc.outlet_id = o.id) AS machines_count,
                (SELECT COUNT(*) FROM orders ord WHERE ord.outlet_id = o.id AND ord.status IN ('active', 'pending', 'in-progress')) AS active_orders_count
            FROM outlets o 
            LEFT JOIN users u ON u.outlet_id = o.id AND u.campus_id = o.campus_id 
            WHERE o.campus_id = ?
        `, [id]);

        // 3. Active Subscription Plans count (MariaDB compatible)
        const [[plansCount]] = await db.execute(`
            SELECT 
                COUNT(*) as total_plans,
                COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) as active_plans,
                COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) as inactive_plans
            FROM subscription_plans
            WHERE 
                FIND_IN_SET(?, applicable_ids) > 0
                OR applicable_ids LIKE ?
                OR applicable_ids LIKE ?
        `, [
            id,
            `%"${id}"%`,     // JSON array of strings
            `%"id":${id}%`   // JSON array of objects
        ]);

        // 4. Totals
        let totalStudents = 0;
        let totalMachines = 0;
        let totalActiveOrders = 0;

        outlets.forEach(outlet => {
            totalStudents += Number(outlet.students_count || 0);
            totalMachines += Number(outlet.machines_count || 0);
            totalActiveOrders += Number(outlet.active_orders_count || 0);
        });

        res.status(200).json({ 
            success: true, 
            data: { 
                ...campus[0], 
                outlets,
                subscription_plans: {
                    total_plans: Number(plansCount.total_plans) || 0,
                    active_plans: Number(plansCount.active_plans) || 0,
                    inactive_plans: Number(plansCount.inactive_plans) || 0
                },
                stats: {
                    total_outlets: outlets.length,
                    total_students: totalStudents,
                    total_machines: totalMachines,
                    total_active_orders: totalActiveOrders,
                    total_active_plans: Number(plansCount.active_plans) || 0
                }
            } 
        });

    } catch (error) {
        console.error("Error fetching campus details:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create Campus
// @route   POST /api/admin/campuses
const createCampus = async (req, res) => {
    try {
        const { institution_name, name, address, city, state, pin_code, is_active } = req.body;

        const [result] = await db.execute(
            `INSERT INTO campuses (institution_name, name, address, city, state, pin_code, is_active, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [institution_name, name, address, city, state, pin_code,  is_active ? 1 : 0]
        );

        res.status(201).json({ success: true, message: 'Campus created successfully', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update Campus Details
// @route   PUT /api/admin/campuses/:id
// const updateCampus = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const body = req.body;

//         // 1. Check if campus exists
//         const [existing] = await db.execute(`SELECT id FROM campuses WHERE id = ?`, [id]);
//         if (existing.length === 0) {
//             return res.status(404).json({ success: false, message: 'Campus not found' });
//         }

//         // 2. Allowed fields in campuses table
//         const allowedFields = [
//             'institution_name', 
//             'name', 
//             'address', 
//             'city', 
//             'state', 
//             'pin_code', 
//             'latitude', 
//             'longitude'
//         ];

//         let updateFields = [];
//         let params = [];

//         // 3. Loop through allowed fields and pick only those present in request body
//         allowedFields.forEach(field => {
//             if (body[field] !== undefined) {
//                 updateFields.push(`${field} = ?`);
                
//                 // Convert empty string to NULL
//                 const value = body[field] === '' ? null : body[field];
//                 params.push(value);
//             }
//         });

//         // 4. If no valid field was sent
//         if (updateFields.length === 0) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'No fields provided for update. Please send at least one field.' 
//             });
//         }

//         // 5. Build dynamic query
//         const query = `UPDATE campuses SET ${updateFields.join(', ')} WHERE id = ?`;
        
//         // 6. Add id for WHERE clause
//         params.push(id);

//         // 7. Execute query
//         await db.execute(query, params);

//         res.status(200).json({ 
//             success: true, 
//             message: 'Campus updated successfully',
//             updated_fields: updateFields.map(f => f.split(' = ')[0])
//         });

//     } catch (error) {
//         console.error("Error in updateCampus:", error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };
const updateCampus = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;

        // 1. Check if campus exists
        const [existing] = await db.execute(`SELECT id FROM campuses WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Campus not found' });
        }

        // 2. Allowed fields in campuses table
        const allowedFields = [
            'institution_name',
            'name',
            'address',
            'city',
            'state',
            'pin_code',
            'latitude',
            'longitude',
            'is_active'   // ✅ added
        ];

        let updateFields = [];
        let params = [];

        // 3. Loop through allowed fields and pick only those present in request body
        allowedFields.forEach(field => {
            if (body[field] !== undefined) {   // ✅ sirf tab update jab bheja gaya ho
                updateFields.push(`${field} = ?`);

                let value = body[field];

                // Empty string -> NULL (text fields ke liye)
                if (value === '') {
                    value = null;
                }

                // is_active ko 1/0 mein convert karo (true/false/"true"/"false"/1/0 sab handle)
                if (field === 'is_active' && value !== null) {
                    value = (value === true || value === 1 || value === '1' || value === 'true') ? 1 : 0;
                }

                params.push(value);
            }
        });

        // 4. If no valid field was sent
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update. Please send at least one field.'
            });
        }

        // 5. Build dynamic query
        const query = `UPDATE campuses SET ${updateFields.join(', ')} WHERE id = ?`;

        // 6. Add id for WHERE clause
        params.push(id);

        // 7. Execute query
        await db.execute(query, params);

        res.status(200).json({
            success: true,
            message: 'Campus updated successfully',
            updated_fields: updateFields.map(f => f.split(' = ')[0])
        });

    } catch (error) {
        console.error("Error in updateCampus:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Toggle Campus Status (Active/Inactive)
// @route   PATCH /api/admin/campuses/:id/status
const toggleCampusStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (is_active === undefined) {
            return res.status(400).json({ success: false, message: 'is_active field is required' });
        }

        const [result] = await db.execute(
            `UPDATE campuses SET is_active = ? WHERE id = ?`,
            [is_active ? 1 : 0, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Campus not found' });
        }

        res.status(200).json({
            success: true,
            message: `Campus marked as ${is_active ? 'Active' : 'Inactive'}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// ==========================================
// 2. OUTLET APIs
// ==========================================

// const getCampusOutlets = async (req, res) => {
//   try {
//     const { campus_ids, section } = req.body;

//     // Validation
//     if (!campus_ids || !Array.isArray(campus_ids) || campus_ids.length === 0) {
//       return errorResponse(
//         res,
//         'campus_ids must be a non-empty array',
//         400
//       );
//     }

//     if (!section) {
//       return errorResponse(res, 'section is required', 400);
//     }

//     // Normalize section
//     const normalizedSection = String(section).toLowerCase().trim();

//     // Non-student detect
//     const isNonStudent =
//       normalizedSection === 'all' ||
//       normalizedSection === 'non_student' ||
//       normalizedSection === 'non student' ||
//       normalizedSection === 'nonstudent';

//     // IN clause ke liye placeholders
//     const placeholders = campus_ids.map(() => '?').join(',');

//     let query = `
//       SELECT
//         id,
//         campus_id,
//         name,
//         address,
//         section,
//         is_active,
//         created_at
//       FROM outlets
//       WHERE campus_id IN (${placeholders})
//         AND is_active = 1
//     `;

//     const params = [...campus_ids];

//     // Student ke liye section filter
//     if (!isNonStudent) {
//       query += ` AND LOWER(section) = LOWER(?)`;
//       params.push(section);
//     }

//     query += ` ORDER BY campus_id ASC, name ASC`;

//     const [outlets] = await db.query(query, params);

//     // Campus-wise group karke bhejna ho to (optional)
//     const grouped = campus_ids.reduce((acc, id) => {
//       acc[id] = outlets.filter(o => String(o.campus_id) === String(id));
//       return acc;
//     }, {});

//     return successResponse(
//       res,
//       'Campus outlets fetched successfully',
//       {
//         campus_ids,
//         section: isNonStudent ? 'all' : section,
//         total: outlets.length,
//         outlets,
//         grouped_by_campus: grouped // optional
//       }
//     );
//   } catch (error) {
//     console.error('Get Campus Outlets Error:', error);
//     return errorResponse(res, 'Failed to fetch campus outlets', 500);
//   }
// };

// const getCampusOutlets_15_10_2026 = async (req, res) => {
//   try {
//     const { campus_ids, section } = req.body;

//     // Validation
//     if (!campus_ids || !Array.isArray(campus_ids) || campus_ids.length === 0) {
//       return errorResponse(
//         res,
//         'campus_ids must be a non-empty array',
//         400
//       );
//     }

//     if (!section) {
//       return errorResponse(res, 'section is required', 400);
//     }

//     // Normalize section
//     const normalizedSection = String(section).toLowerCase().trim();

//     // Non-student detect
//     const isNonStudent =
//       normalizedSection === 'all' ||
//       normalizedSection === 'non_student' ||
//       normalizedSection === 'non student' ||
//       normalizedSection === 'nonstudent';

//     // IN clause placeholders
//     const placeholders = campus_ids.map(() => '?').join(',');

//     let query = `
//       SELECT
//         o.id,
//         o.campus_id,
//         o.name,
//         o.address,
//         o.section,
//         o.is_active,
//         o.created_at,

//         -- 🆕 Manager assigned count
//         (
//           SELECT COUNT(*)
//           FROM user_outlets uo
//           WHERE uo.outlet_id = o.id
//         ) AS manager_count,

//         -- 🆕 Receptionist assigned count
//         (
//           SELECT COUNT(*)
//           FROM user_outlets_receptionist uor
//           WHERE uor.outlet_id = o.id
//         ) AS receptionist_count

//       FROM outlets o
//       WHERE o.campus_id IN (${placeholders})
//         AND o.is_active = 1
//     `;

//     const params = [...campus_ids];

//     // Student ke liye section filter
//     if (!isNonStudent) {
//       query += ` AND LOWER(o.section) = LOWER(?)`;
//       params.push(section);
//     }

//     query += ` ORDER BY o.campus_id ASC, o.name ASC`;

//     const [outlets] = await db.query(query, params);

//     // ==================================================
//     // 🆕 Format with status
//     // ==================================================
//     const formattedOutlets = outlets.map(item => {
//       const managerCount = Number(item.manager_count) || 0;
//       const receptionistCount = Number(item.receptionist_count) || 0;

//       const hasManager = managerCount > 0;
//       const hasReceptionist = receptionistCount > 0;

//       return {
//         id: item.id,
//         campus_id: item.campus_id,
//         name: item.name,
//         address: item.address,
//         section: item.section,
//         is_active: item.is_active,
//         created_at: item.created_at,

//         // Manager info
//         has_manager: hasManager,
//         manager_count: managerCount,
//         manager_status: hasManager ? 'assigned' : 'not_assigned',

//         // Receptionist info
//         has_receptionist: hasReceptionist,
//         receptionist_count: receptionistCount,
//         receptionist_status: hasReceptionist ? 'assigned' : 'not_assigned',

//         // Overall
//         is_fully_assigned: hasManager && hasReceptionist
//       };
//     });

//     // Campus-wise group
//     const grouped = campus_ids.reduce((acc, id) => {
//       acc[id] = formattedOutlets.filter(
//         o => String(o.campus_id) === String(id)
//       );
//       return acc;
//     }, {});

//     return successResponse(
//       res,
//       'Campus outlets fetched successfully',
//       {
//         campus_ids,
//         section: isNonStudent ? 'all' : section,
//         total: formattedOutlets.length,
//         outlets: formattedOutlets,
//         grouped_by_campus: grouped
//       }
//     );

//   } catch (error) {
//     console.error('Get Campus Outlets Error:', error);
//     return errorResponse(res, 'Failed to fetch campus outlets', 500);
//   }
// };
const getCampusOutlets = async (req, res) => {
  try {
    const { campus_ids, section, type = 'receptionist' } = req.body;

    // Validation
    if (!campus_ids || !Array.isArray(campus_ids) || campus_ids.length === 0) {
      return errorResponse(res, 'campus_ids must be a non-empty array', 400);
    }

    if (!section) {
      return errorResponse(res, 'section is required', 400);
    }

    const VALID_TYPES = ['receptionist', 'pay_as_you_go'];
    if (!VALID_TYPES.includes(type)) {
      return errorResponse(res, `type must be one of: ${VALID_TYPES.join(', ')}`, 400);
    }

    // Normalize section
    const normalizedSection = String(section).toLowerCase().trim();

    // Non-student detect
    const isNonStudent =
      normalizedSection === 'all' ||
      normalizedSection === 'non_student' ||
      normalizedSection === 'non student' ||
      normalizedSection === 'nonstudent';

    // IN clause placeholders
    const placeholders = campus_ids.map(() => '?').join(',');

    // Type wise columns
    const typeColumns =
      type === 'receptionist'
        ? `
        ,(
          SELECT COUNT(*)
          FROM user_outlets uo
          INNER JOIN users u ON u.id = uo.user_id AND u.is_active = 1
          WHERE uo.outlet_id = o.id
        ) AS manager_count,

        (
          SELECT COUNT(*)
          FROM user_outlets_receptionist uor
          INNER JOIN users u ON u.id = uor.user_id AND u.is_active = 1
          WHERE uor.outlet_id = o.id
        ) AS receptionist_count
        `
        : `
        ,(
          SELECT COUNT(DISTINCT pa.plan_id)
          FROM pay_as_you_go_plan_applicability pa
          INNER JOIN pay_as_you_go_plans p ON p.id = pa.plan_id AND p.status = 1
          WHERE pa.outlet_id = o.id
        ) AS plan_count
        `;

    let query = `
      SELECT
        o.id,
        o.campus_id,
        o.name,
        o.address,
        o.section,
        o.is_active,
        o.created_at
        ${typeColumns}
      FROM outlets o
      WHERE o.campus_id IN (${placeholders})
        AND o.is_active = 1
    `;

    const params = [...campus_ids];

    // Student ke liye section filter
    if (!isNonStudent) {
      query += ` AND LOWER(o.section) = LOWER(?)`;
      params.push(section);
    }

    query += ` ORDER BY o.campus_id ASC, o.name ASC`;

    const [outlets] = await db.query(query, params);

    // ==================================================
    // Format with status (type wise)
    // ==================================================
    const formattedOutlets = outlets.map(item => {
      const base = {
        id: item.id,
        campus_id: item.campus_id,
        name: item.name,
        address: item.address,
        section: item.section,
        is_active: item.is_active,
        created_at: item.created_at
      };

      if (type === 'receptionist') {
        const managerCount = Number(item.manager_count) || 0;
        const receptionistCount = Number(item.receptionist_count) || 0;

        const hasManager = managerCount > 0;
        const hasReceptionist = receptionistCount > 0;

        return {
          ...base,

          // Manager info
          has_manager: hasManager,
          manager_count: managerCount,
          manager_status: hasManager ? 'assigned' : 'not_assigned',

          // Receptionist info
          has_receptionist: hasReceptionist,
          receptionist_count: receptionistCount,
          receptionist_status: hasReceptionist ? 'assigned' : 'not_assigned',

          // Overall
          is_fully_assigned: hasManager && hasReceptionist
        };
      }

      // pay_as_you_go
      const planCount = Number(item.plan_count) || 0;
      const hasPlan = planCount > 0;

      return {
        ...base,
        has_plan: hasPlan,
        plan_count: planCount,
        plan_status: hasPlan ? 'assigned' : 'not_assigned',
        is_fully_assigned: hasPlan
      };
    });

    // Campus-wise group
    const grouped = campus_ids.reduce((acc, id) => {
      acc[id] = formattedOutlets.filter(
        o => String(o.campus_id) === String(id)
      );
      return acc;
    }, {});

    return successResponse(
      res,
      'Campus outlets fetched successfully',
      {
        campus_ids,
        type,
        section: isNonStudent ? 'all' : section,
        total: formattedOutlets.length,
        outlets: formattedOutlets,
        grouped_by_campus: grouped
      }
    );

  } catch (error) {
    console.error('Get Campus Outlets Error:', error);
    return errorResponse(res, 'Failed to fetch campus outlets', 500);
  }
};
// // @desc    Get All Outlets
// // @route   GET /api/admin/outlets
// // with Filter
// const getAllOutlets = async (req, res) => {
//     try {
//         // 1. Query params extract karein
//         const { 
//             campus_id, 
//             city, 
//             section, 
//             search, 
//             page = 1, 
//             limit = 10 
//         } = req.query;

//         // Pagination calculations
//         const pageNum = parseInt(page, 10) || 1;
//         const limitNum = parseInt(limit, 10) || 10;
//         const offset = (pageNum - 1) * limitNum;

//         // 2. Base Query for Data with Filters
//         // YAHAN CHANGE: Default mein hi is_active = 1 laga diya hai
//         let baseQuery = `
//             FROM outlets o
//             LEFT JOIN campuses c ON o.campus_id = c.id
//             WHERE o.is_active = 1
//         `;
//         let params = [];

//         // Apply Filters dynamically
//         // NOTE: 'status' filter hata diya kyunki ab hum sirf active outlets hi dikha rahe hain
//         if (campus_id) { 
//             baseQuery += ` AND o.campus_id = ?`; 
//             params.push(campus_id); 
//         }
//         if (city) { 
//             baseQuery += ` AND o.city = ?`; 
//             params.push(city); 
//         }
//         if (section) { 
//             baseQuery += ` AND o.section = ?`; 
//             params.push(section); 
//         }
//         if (search) { 
//             baseQuery += ` AND o.name LIKE ?`; 
//             params.push(`%${search}%`); 
//         }

//         // 3. Total Count Query
//         const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
//         const [countResult] = await db.execute(countQuery, params);
//         const totalRecords = countResult[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         // 4. Main Data Query
//         let dataQuery = `
//             SELECT o.*, c.name as campus_name,
//             (SELECT COUNT(*) FROM students s WHERE s.outlet_id = o.id) as total_students,
//             (SELECT COUNT(*) FROM orders ord WHERE ord.outlet_id = o.id AND ord.status = 'active') as active_orders
//             ${baseQuery}
//             ORDER BY o.created_at DESC
//             LIMIT ? OFFSET ?
//         `;

//         const dataParams = [...params, limitNum, offset];
//         const [rows] = await db.execute(dataQuery, dataParams);

//         // 5. Dashboard Stats (Sirf active outlets ka)
//         // YAHAN CHANGE: Stats bhi sirf active outlets ka calculate kar rahe hain
//         const [[stats]] = await db.execute(`
//             SELECT 
//                 COUNT(*) as total_outlets
//             FROM outlets
//             WHERE is_active = 1
//         `);

//         // 6. Response
//         res.status(200).json({ 
//             success: true, 
//             stats, 
//             data: rows,
//             pagination: {
//                 total_records: totalRecords,
//                 total_pages: totalPages,
//                 current_page: pageNum,
//                 limit: limitNum
//             }
//         });

//     } catch (error) {
//         console.error("Error in getAllOutlets:", error);
//         res.status(500).json({ success: false, message: 'Server Error', error: error.message });
//     }
// };


// // @desc    Get Single Outlet Details (Screenshot 1)
// // @route   GET /api/admin/outlets/:id

// const getOutletById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const outletId = Number(id);

//         // 1. Fetch Outlet & Campus Details
//         const [outletData] = await db.execute(`
//             SELECT o.*, c.name as campus_name, c.address as campus_address
//             FROM outlets o
//             LEFT JOIN campuses c ON o.campus_id = c.id
//             WHERE o.id = ?
//             LIMIT 1
//         `, [outletId]);

//         if (outletData.length === 0) {
//             return errorResponse(res, 'Outlet not found', 404);
//         }
//         const outlet = outletData[0];

//         // 2. Fetch Metrics
//         const [metricsResult] = await db.execute(`
//             SELECT 
//                 (SELECT COUNT(*) FROM students WHERE outlet_id = ?) AS total_customers,
//                 (
//                     SELECT COUNT(*) FROM subscriptions_payments 
//                     WHERE outlet_id = ? 
//                     AND payment_status IN ('paid', 'SUCCESS', 'Paid') 
//                     AND validity_end >= CURDATE()
//                 ) AS total_subscriptions,
//                 (SELECT COUNT(*) FROM orders WHERE outlet_id = ?) AS total_orders,
//                 (SELECT COUNT(*) FROM orders WHERE outlet_id = ? AND status IN ('COLLECTED', 'DELIVERED')) AS completed_orders,
//                 (SELECT COUNT(*) FROM orders WHERE outlet_id = ? AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')) AS pending_orders,
//                 (SELECT IFNULL(SUM(final_amount), 0) FROM orders WHERE outlet_id = ? AND payment_status IN ('paid', 'PAID')) AS total_revenue,
//                 (
//                     SELECT IFNULL(SUM(final_amount), 0) FROM orders 
//                     WHERE outlet_id = ? 
//                     AND payment_status IN ('paid', 'PAID') 
//                     AND DATE(order_date) = CURDATE()
//                 ) AS todays_revenue,
//                 (
//                     SELECT COUNT(*) FROM complaints c
//                     JOIN orders o ON o.id = c.order_id
//                     WHERE o.outlet_id = ? AND UPPER(c.status) = 'OPEN'
//                 ) AS open_complaints,
//                 (SELECT COUNT(*) FROM students WHERE outlet_id = ? AND LOWER(role) = 'student') AS total_students,
//                 (SELECT COUNT(*) FROM students WHERE outlet_id = ? AND LOWER(role) != 'student') AS total_non_students
//         `, [
//             outletId, outletId, outletId, outletId, outletId, 
//             outletId, outletId, outletId, outletId, outletId
//         ]);

//         const metrics = metricsResult[0];

//         // 3. Fetch Outlet Manager (Role: OUTLET_MANAGER, MANAGER, BOTH)
//         const [managers] = await db.execute(`
//             SELECT id, name, phone, email, staff_id, image, created_at, role
//             FROM users 
//             WHERE outlet_id = ? 
//               AND UPPER(role) IN ('OUTLET_MANAGER', 'MANAGER', 'BOTH')
//             LIMIT 1
//         `, [outletId]);

//         const outletManager = managers.length > 0 ? managers[0] : null;

//         // 4. Fetch Staff (Role: LAUNDRY_STAFF, RECEPTIONIST, STAFF)
//         // Note: BOTH wale manager me aa gaye, isliye staff list me exclude karenge
//         const [staffList] = await db.execute(`
//             SELECT id, name, phone, email, role, staff_id, is_active
//             FROM users 
//             WHERE outlet_id = ? 
//               AND UPPER(role) IN ('LAUNDRY_STAFF', 'RECEPTIONIST', 'STAFF')
//               AND id != ?
//         `, [outletId, outletManager ? outletManager.id : 0]);

//         // 5. Fetch Machines List & Counts
//         const [machines] = await db.execute(`
//             SELECT id, machine_code, machine_name, machine_type, category, status, image
//             FROM machines 
//             WHERE outlet_id = ?
//         `, [outletId]);

//         const machineCounts = {
//             total: machines.length,
//             active: machines.filter(m => m.status === 'ACTIVE').length,
//             maintenance: machines.filter(m => m.status === 'MAINTENANCE').length,
//             in_use: machines.filter(m => m.status === 'IN_USE').length,
//             inactive: machines.filter(m => m.status === 'INACTIVE').length,
//         };

//         // 6. Final Response
//         return successResponse(res, 'Outlet details fetched successfully', {
//             outlet: {
//                 id: outlet.id,
//                 name: outlet.name,
//                 campus_name: outlet.campus_name,
//                 section: outlet.section,
//                 status: outlet.is_active ? 'Active' : 'Inactive',
//                 city: outlet.city,
//                 state: outlet.state,
//                 pincode: outlet.pin_code,
//                 address: outlet.address,
//                 latitude: outlet.latitude,
//                 longitude: outlet.longitude,
//                 created_at: outlet.created_at,
//                 updated_at: outlet.updated_at,
//                 outlet_id_code: `OUT-${String(outlet.id).padStart(3, '0')}`
//             },
//             metrics: {
//                 total_customers: Number(metrics.total_customers) || 0,
//                 total_subscriptions: Number(metrics.total_subscriptions) || 0,
//                 total_orders: Number(metrics.total_orders) || 0,
//                 completed_orders: Number(metrics.completed_orders) || 0,
//                 pending_orders: Number(metrics.pending_orders) || 0,
//                 total_revenue: Number(metrics.total_revenue) || 0,
//                 todays_revenue: Number(metrics.todays_revenue) || 0,
//                 open_complaints: Number(metrics.open_complaints) || 0,
//                 total_students: Number(metrics.total_students) || 0,
//                 total_non_students: Number(metrics.total_non_students) || 0,
//                 completion_rate: metrics.total_orders > 0 
//                     ? `${((metrics.completed_orders / metrics.total_orders) * 100).toFixed(0)}%` 
//                     : '0%'
//             },
//             outlet_manager: outletManager ? {
//                 id: outletManager.id,
//                 name: outletManager.name,
//                 staff_id: outletManager.staff_id,
//                 phone: outletManager.phone,
//                 email: outletManager.email,
//                 image: outletManager.image ? `https://instawash.siberiancrane.tech/uploads/${outletManager.image}` : null,
//                 joined: outletManager.created_at,
//                 status: 'Active'
//             } : null,
//             staff: {
//                 total: staffList.length,
//                 active: staffList.filter(s => s.is_active).length,
//                 inactive: staffList.filter(s => !s.is_active).length,
//                 list: staffList.map(s => ({
//                     id: s.id,
//                     name: s.name,
//                     role: s.role,
//                     staff_id: s.staff_id,
//                     phone: s.phone,
//                     email: s.email,
//                     status: s.is_active ? 'Active' : 'Inactive'
//                 }))
//             },
//             machines: {
//                 ...machineCounts,
//                 list: machines.map(m => ({
//                     id: m.id,
//                     code: m.machine_code,
//                     name: m.machine_name,
//                     type: m.machine_type,
//                     category: m.category,
//                     status: m.status,
//                     image: m.image ? `https://instawash.siberiancrane.tech/uploads/${m.image}` : null
//                 }))
//             }
//         });

//     } catch (error) {
//         console.error('❌ Get Outlet By ID Error:', error);
//         return errorResponse(res, 'Failed to fetch outlet details', 500);
//     }
// };

// // @desc    Create Outlet
// // @route   POST /api/admin/outlets
// const createOutlet = async (req, res) => {
//     try {
//         const { name, campus_id, section, address, city, state, pin_code, is_active } = req.body;

//         if (!campus_id) return res.status(400).json({ success: false, message: 'Campus is required' });

//         const [result] = await db.execute(
//             `INSERT INTO outlets (name, campus_id, section, address, city, state, pin_code, is_active, created_at) 
//              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
//             [name, campus_id, section, address, city, state, pin_code,  is_active ? 1 : 0]
//         );

//         res.status(201).json({ success: true, message: 'Outlet created successfully', id: result.insertId });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };

// // @desc    Update Outlet Details
// // @route   PUT /api/admin/outlets/:id
// const updateOutlet = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const body = req.body;

//         // 1. Check if outlet exists
//         const [existing] = await db.execute(`SELECT id FROM outlets WHERE id = ?`, [id]);
//         if (existing.length === 0) {
//             return res.status(404).json({ success: false, message: 'Outlet not found' });
//         }

//         // 2. Allowed fields in outlets table
//         const allowedFields = [
//             'name',
//             'campus_id',
//             'section',
//             'address',
//             'city',
//             'state',
//             'pin_code',
//             'latitude',
//             'longitude',
//             'manager_id',
//             'is_active'   // ✅ added
//         ];

//         let updateFields = [];
//         let params = [];

//         // 3. Loop through allowed fields and pick only those present in request body
//         allowedFields.forEach(field => {
//             if (body[field] !== undefined) {   // ✅ sirf tab update jab bheja gaya ho
//                 updateFields.push(`${field} = ?`);

//                 let value = body[field];

//                 // Empty string -> NULL (text fields ke liye)
//                 if (value === '') {
//                     value = null;
//                 }

//                 // is_active ko 1/0 mein convert karo
//                 if (field === 'is_active' && value !== null) {
//                     value = (value === true || value === 1 || value === '1' || value === 'true') ? 1 : 0;
//                 }

//                 params.push(value);
//             }
//         });

//         // 4. If no valid field was sent
//         if (updateFields.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'No fields provided for update. Please send at least one field.'
//             });
//         }

//         // 5. Build dynamic query
//         const query = `UPDATE outlets SET ${updateFields.join(', ')} WHERE id = ?`;

//         // 6. Add id for WHERE clause
//         params.push(id);

//         // 7. Execute query
//         await db.execute(query, params);

//         res.status(200).json({
//             success: true,
//             message: 'Outlet updated successfully',
//             updated_fields: updateFields.map(f => f.split(' = ')[0])
//         });

//     } catch (error) {
//         console.error("Error in updateOutlet:", error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };

// @desc    Get All Outlets
// @route   GET /api/admin/outlets
// with Filter
const getAllOutlets = async (req, res) => {
    try {
        // 1. Query params extract karein
        const { 
            campus_id, 
            city, 
            section, 
            search, 
            page = 1, 
            limit = 10,
            is_active   // optional: '1' | '0' | 'all'
        } = req.query;

        // Pagination calculations
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        // 2. Base Query for Data with Filters
        // YAHAN CHANGE: Pehle `WHERE o.is_active = 1` tha (sirf active).
        // Ab default me SABHI outlets (active + inactive) aayenge.
        let baseQuery = `
            FROM outlets o
            LEFT JOIN campuses c ON o.campus_id = c.id
            WHERE 1=1
        `;
        let params = [];

        // is_active optional filter (agar explicitly bheja jaye)
        if (is_active !== undefined && is_active !== '' && is_active !== 'all') {
            baseQuery += ` AND o.is_active = ?`;
            params.push(Number(is_active));
        }

        if (campus_id) { 
            baseQuery += ` AND o.campus_id = ?`; 
            params.push(campus_id); 
        }
        if (city) { 
            baseQuery += ` AND o.city = ?`; 
            params.push(city); 
        }
        if (section) { 
            baseQuery += ` AND o.section = ?`; 
            params.push(section); 
        }
        if (search) { 
            baseQuery += ` AND o.name LIKE ?`; 
            params.push(`%${search}%`); 
        }

        // 3. Total Count Query
        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const [countResult] = await db.execute(countQuery, params);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // 4. Main Data Query
        let dataQuery = `
            SELECT o.*, c.name as campus_name,
            (SELECT COUNT(*) FROM students s WHERE s.outlet_id = o.id) as total_students,
            (SELECT COUNT(*) FROM orders ord WHERE ord.outlet_id = o.id AND ord.status = 'active') as active_orders
            ${baseQuery}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const dataParams = [...params, limitNum, offset];
        const [rows] = await db.execute(dataQuery, dataParams);

        // ✅ Format validity_date + timestamps in each row
        const data = rows.map(r => ({
            ...r,
            validity_date: r.validity_date 
                ? new Date(r.validity_date).toISOString().split('T')[0] 
                : null,
            created_at: r.created_at 
                ? new Date(r.created_at).toISOString() 
                : null,
            updated_at: r.updated_at 
                ? new Date(r.updated_at).toISOString() 
                : null
        }));

        // 5. Dashboard Stats (Active + Inactive dono ka count)
        const [[stats]] = await db.execute(`
            SELECT 
                COUNT(*) as total_outlets,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) as active_outlets,
                COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END), 0) as inactive_outlets,
                (SELECT COUNT(*) FROM orders) as total_orders
            FROM outlets
        `);

        // 6. Response
        res.status(200).json({ 
            success: true, 
            stats, 
            data,
            pagination: {
                total_records: totalRecords,
                total_pages: totalPages,
                current_page: pageNum,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error("Error in getAllOutlets:", error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Get Single Outlet Details
// @route   GET /api/admin/outlets/:id
const getOutletById = async (req, res) => {
    try {
        const { id } = req.params;
        const outletId = Number(id);

        // 1. Fetch Outlet & Campus Details
        const [outletData] = await db.execute(`
            SELECT o.*, c.name as campus_name, c.address as campus_address
            FROM outlets o
            LEFT JOIN campuses c ON o.campus_id = c.id
            WHERE o.id = ?
            LIMIT 1
        `, [outletId]);

        if (outletData.length === 0) {
            return errorResponse(res, 'Outlet not found', 404);
        }
        const outlet = outletData[0];

        // 2. Fetch Metrics
        const [metricsResult] = await db.execute(`
            SELECT 
                (SELECT COUNT(*) FROM students WHERE outlet_id = ?) AS total_customers,
                (
                    SELECT COUNT(*) FROM subscriptions_payments 
                    WHERE outlet_id = ? 
                    AND payment_status IN ('paid', 'SUCCESS', 'Paid') 
                    AND validity_end >= CURDATE()
                ) AS total_subscriptions,
                (SELECT COUNT(*) FROM orders WHERE outlet_id = ?) AS total_orders,
                (SELECT COUNT(*) FROM orders WHERE outlet_id = ? AND status IN ('COLLECTED', 'DELIVERED')) AS completed_orders,
                (SELECT COUNT(*) FROM orders WHERE outlet_id = ? AND status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION')) AS pending_orders,
                (SELECT IFNULL(SUM(final_amount), 0) FROM orders WHERE outlet_id = ? AND payment_status IN ('paid', 'PAID')) AS total_revenue,
                (
                    SELECT IFNULL(SUM(final_amount), 0) FROM orders 
                    WHERE outlet_id = ? 
                    AND payment_status IN ('paid', 'PAID') 
                    AND DATE(order_date) = CURDATE()
                ) AS todays_revenue,
                (
                    SELECT COUNT(*) FROM complaints c
                    JOIN orders o ON o.id = c.order_id
                    WHERE o.outlet_id = ? AND UPPER(c.status) = 'OPEN'
                ) AS open_complaints,
                (SELECT COUNT(*) FROM students WHERE outlet_id = ? AND LOWER(role) = 'student') AS total_students,
                (SELECT COUNT(*) FROM students WHERE outlet_id = ? AND LOWER(role) != 'student') AS total_non_students
        `, [
            outletId, outletId, outletId, outletId, outletId, 
            outletId, outletId, outletId, outletId, outletId
        ]);

        const metrics = metricsResult[0];

        // 3. Fetch Outlet Manager
        // Match: role = 'OUTLET_MANAGER' / 'MANAGER' / 'BOTH'
        //     OR roles JSON array me 'OUTLET_MANAGER' / 'MANAGER' present
        const [managers] = await db.execute(`
            SELECT id, name, phone, email, staff_id, image, created_at, role, roles
            FROM users 
            WHERE outlet_id = ? 
              AND (
                    UPPER(role) IN ('OUTLET_MANAGER', 'MANAGER', 'BOTH')
                 OR UPPER(roles) LIKE '%"OUTLET_MANAGER"%'
                 OR UPPER(roles) LIKE '%"MANAGER"%'
              )
            LIMIT 1
        `, [outletId]);

        const outletManager = managers.length > 0 ? managers[0] : null;

        // 3b. Fetch Receptionist
        // Match: role = 'RECEPTIONIST' / 'BOTH'
        //     OR roles JSON array me 'RECEPTIONIST' present
        // NOTE: agar same user 'BOTH' hai to wo manager + receptionist dono me aayega.
        // Agar duplicate nahi chahiye to manager id exclude kar sakte ho — neeche optional flag.
        const EXCLUDE_MANAGER_FROM_RECEPTIONIST = false; // true karo agar same user ko sirf manager block me dikhana hai

        let receptionistQuery = `
            SELECT id, name, phone, email, staff_id, image, created_at, role, roles
            FROM users 
            WHERE outlet_id = ? 
              AND (
                    UPPER(role) IN ('RECEPTIONIST', 'BOTH')
                 OR UPPER(roles) LIKE '%"RECEPTIONIST"%'
              )
        `;
        const receptionistParams = [outletId];

        if (EXCLUDE_MANAGER_FROM_RECEPTIONIST && outletManager) {
            receptionistQuery += ` AND id != ?`;
            receptionistParams.push(outletManager.id);
        }
        receptionistQuery += ` LIMIT 1`;

        const [receptionists] = await db.execute(receptionistQuery, receptionistParams);
        const receptionist = receptionists.length > 0 ? receptionists[0] : null;

        // 4. Fetch Staff (LAUNDRY_STAFF, STAFF only)
        // Manager + Receptionist dono ko exclude karo taaki duplicate na dikhe
        const [staffList] = await db.execute(`
            SELECT id, name, phone, email, role, staff_id, is_active
            FROM users 
            WHERE outlet_id = ? 
              AND UPPER(role) IN ('Laundry Staff', 'STAFF')
              AND id != ?
              AND id != ?
        `, [
            outletId, 
            outletManager ? outletManager.id : 0,
            receptionist ? receptionist.id : 0
        ]);

        // 5. Fetch Machines List & Counts
        const [machines] = await db.execute(`
            SELECT id, machine_code, machine_name, machine_type, category, status, image
            FROM machines 
            WHERE outlet_id = ?
        `, [outletId]);

        const machineCounts = {
            total: machines.length,
            active: machines.filter(m => m.status === 'ACTIVE').length,
            maintenance: machines.filter(m => m.status === 'MAINTENANCE').length,
            in_use: machines.filter(m => m.status === 'IN_USE').length,
            inactive: machines.filter(m => m.status === 'INACTIVE').length,
        };

        // Helper for user image URL
        const buildImage = (img) => img 
            ? `https://instawash.siberiancrane.tech/uploads/${img}` 
            : null;

        // 6. Final Response
        return successResponse(res, 'Outlet details fetched successfully', {
            outlet: {
                id: outlet.id,
                name: outlet.name,
                campus_name: outlet.campus_name,
                section: outlet.section,
                status: outlet.is_active ? 'Active' : 'Inactive',
                city: outlet.city,
                state: outlet.state,
                pincode: outlet.pin_code,
                address: outlet.address,
                latitude: outlet.latitude,
                longitude: outlet.longitude,
                // ✅ validity_date
                validity_date: outlet.validity_date 
                    ? new Date(outlet.validity_date).toISOString().split('T')[0] 
                    : null,
                // ✅ Timestamps
                created_at: outlet.created_at 
                    ? new Date(outlet.created_at).toISOString() 
                    : null,
                updated_at: outlet.updated_at 
                    ? new Date(outlet.updated_at).toISOString() 
                    : null,
                outlet_id_code: `OUT-${String(outlet.id).padStart(3, '0')}`
            },
            metrics: {
                total_customers: Number(metrics.total_customers) || 0,
                total_subscriptions: Number(metrics.total_subscriptions) || 0,
                total_orders: Number(metrics.total_orders) || 0,
                completed_orders: Number(metrics.completed_orders) || 0,
                pending_orders: Number(metrics.pending_orders) || 0,
                total_revenue: Number(metrics.total_revenue) || 0,
                todays_revenue: Number(metrics.todays_revenue) || 0,
                open_complaints: Number(metrics.open_complaints) || 0,
                total_students: Number(metrics.total_students) || 0,
                total_non_students: Number(metrics.total_non_students) || 0,
                completion_rate: metrics.total_orders > 0 
                    ? `${((metrics.completed_orders / metrics.total_orders) * 100).toFixed(0)}%` 
                    : '0%'
            },
            outlet_manager: outletManager ? {
                id: outletManager.id,
                name: outletManager.name,
                staff_id: outletManager.staff_id,
                phone: outletManager.phone,
                email: outletManager.email,
                image: buildImage(outletManager.image),
                joined: outletManager.created_at,
                status: 'Active'
            } : null,
            // ✅ Receptionist block (same shape as manager)
            receptionist: receptionist ? {
                id: receptionist.id,
                name: receptionist.name,
                staff_id: receptionist.staff_id,
                phone: receptionist.phone,
                email: receptionist.email,
                image: buildImage(receptionist.image),
                joined: receptionist.created_at,
                status: 'Active'
            } : null,
            staff: {
                total: staffList.length,
                active: staffList.filter(s => s.is_active).length,
                inactive: staffList.filter(s => !s.is_active).length,
                list: staffList.map(s => ({
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    staff_id: s.staff_id,
                    phone: s.phone,
                    email: s.email,
                    status: s.is_active ? 'Active' : 'Inactive'
                }))
            },
            machines: {
                ...machineCounts,
                list: machines.map(m => ({
                    id: m.id,
                    code: m.machine_code,
                    name: m.machine_name,
                    type: m.machine_type,
                    category: m.category,
                    status: m.status,
                    image: buildImage(m.image)
                }))
            }
        });

    } catch (error) {
        console.error('❌ Get Outlet By ID Error:', error);
        return errorResponse(res, 'Failed to fetch outlet details', 500);
    }
};
// @desc    Create Outlet
// @route   POST /api/admin/outlets
const createOutlet = async (req, res) => {
    try {
        const { 
            name, campus_id, section, address, city, state, 
            pin_code, is_active, validity_date 
        } = req.body;

        if (!campus_id) {
            return res.status(400).json({ success: false, message: 'Campus is required' });
        }

        const validity = validity_date && validity_date !== '' ? validity_date : null;

        const [result] = await db.execute(
            `INSERT INTO outlets 
             (name, campus_id, section, address, city, state, pin_code, is_active, validity_date, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                name, campus_id, section, address, city, state, pin_code, 
                is_active ? 1 : 0, 
                validity
            ]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Outlet created successfully', 
            id: result.insertId 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update Outlet Details
// @route   PUT /api/admin/outlets/:id
const updateOutlet = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;

        // 1. Check outlet exists
        const [existing] = await db.execute(`SELECT id FROM outlets WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Outlet not found' });
        }

        // 2. Allowed fields
        const allowedFields = [
            'name',
            'campus_id',
            'section',
            'address',
            'city',
            'state',
            'pin_code',
            'latitude',
            'longitude',
            'manager_id',
            'is_active',
            'validity_date'
        ];

        let updateFields = [];
        let params = [];

        // 3. Build SET clause
        allowedFields.forEach(field => {
            if (body[field] !== undefined) {
                updateFields.push(`${field} = ?`);

                let value = body[field];

                // Empty string -> NULL
                if (value === '') {
                    value = null;
                }

                // is_active -> 1/0
                if (field === 'is_active' && value !== null) {
                    value = (value === true || value === 1 || value === '1' || value === 'true') ? 1 : 0;
                }

                params.push(value);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update. Please send at least one field.'
            });
        }

        // ✅ 4. Force updated_at to NOW() explicitly (DB trigger pe bhi depend nahi)
        updateFields.push(`updated_at = NOW()`);

        // 5. Query
        const query = `UPDATE outlets SET ${updateFields.join(', ')} WHERE id = ?`;
        params.push(id);

        // 6. Execute
        await db.execute(query, params);

        // ✅ 7. Fetch updated row to return fresh updated_at
        const [updatedRows] = await db.execute(
            `SELECT id, created_at, updated_at FROM outlets WHERE id = ?`,
            [id]
        );
        const updated = updatedRows[0];

        res.status(200).json({
            success: true,
            message: 'Outlet updated successfully',
            updated_fields: updateFields
                .map(f => f.split(' = ')[0])
                .filter(f => f !== 'updated_at'),
            created_at: updated.created_at 
                ? new Date(updated.created_at).toISOString() 
                : null,
            updated_at: updated.updated_at 
                ? new Date(updated.updated_at).toISOString() 
                : null
        });

    } catch (error) {
        console.error("Error in updateOutlet:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Toggle Outlet Status (Active/Inactive)
// @route   PATCH /api/admin/outlets/:id/status
const toggleOutletStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (is_active === undefined) {
            return res.status(400).json({ success: false, message: 'is_active field is required' });
        }

        const [result] = await db.execute(
            `UPDATE outlets SET is_active = ? WHERE id = ?`,
            [is_active ? 1 : 0, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Outlet not found' });
        }

        res.status(200).json({
            success: true,
            message: `Outlet marked as ${is_active ? 'Active' : 'Inactive'}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// ==========================================
// EXPORT ALL FUNCTIONS
// ==========================================

/**
 * Receptionist / Employee Management
 */

// ==================================================
// Helper: Generate Random Employee ID (EMP + 5 digits) 
// ==================================================
const generateEmployeeId = async (connection) => {
    const MAX_ATTEMPTS = 20;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        // EMP + random 5-digit number (10000 - 99999)
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const employeeId = `EMP${randomNum}`;

        // Check duplicate
        const [existing] = await connection.query(
            `SELECT id FROM users WHERE staff_id = ? LIMIT 1`,
            [employeeId]
        );

        if (existing.length === 0) {
            return employeeId;
        }

        attempts++;
    }

    // Fallback: timestamp-based unique ID (agar 20 attempts me bhi nahi mila)
    return `EMP${Date.now().toString().slice(-5)}`;
};


// ==================================================
// Helper: Validate Campus Consistency
// ==================================================
const validateCampusAssignments = async (
    connection,
    campusId,
    receptionistOutletId,
    managerOutletIds,
    excludeUserId = null
) => {
    const campusIdNum = Number(campusId);

    const allOutletIdsSet = new Set();

    if (receptionistOutletId) {
        allOutletIdsSet.add(Number(receptionistOutletId));
    }

    if (Array.isArray(managerOutletIds) && managerOutletIds.length > 0) {
        managerOutletIds.forEach(id => allOutletIdsSet.add(Number(id)));
    }

    const allOutletIds = [...allOutletIdsSet];

    if (allOutletIds.length === 0) {
        return { valid: true };
    }

    const placeholders = allOutletIds.map(() => '?').join(',');

    const [outletRows] = await connection.query(
        `SELECT id, campus_id, name, section FROM outlets WHERE id IN (${placeholders})`,
        allOutletIds
    );

    if (outletRows.length !== allOutletIds.length) {
        const foundIds = outletRows.map(o => Number(o.id));
        const missingIds = allOutletIds.filter(id => !foundIds.includes(id));

        return {
            valid: false,
            message: `Outlet(s) not found: ID ${missingIds.join(', ')}. Please check the outlet IDs.`
        };
    }

    const wrongCampus = outletRows.find(o => Number(o.campus_id) !== campusIdNum);

    if (wrongCampus) {
        return {
            valid: false,
            message: `Outlet "${wrongCampus.name}" (ID: ${wrongCampus.id}) is not part of the selected campus. All outlets must belong to the same campus.`
        };
    }

    if (receptionistOutletId) {
        const [recConflict] = await connection.query(
            `
            SELECT uor.user_id, u.name AS user_name, u.staff_id, o.name AS outlet_name
            FROM user_outlets_receptionist uor
            INNER JOIN users u ON u.id = uor.user_id
            INNER JOIN outlets o ON o.id = uor.outlet_id
            WHERE uor.outlet_id = ?
              AND uor.user_id != ?
            LIMIT 1
            `,
            [receptionistOutletId, excludeUserId || 0]
        );

        if (recConflict.length > 0) {
            return {
                valid: false,
                message: `Outlet "${recConflict[0].outlet_name}" is already assigned to receptionist "${recConflict[0].user_name}" (${recConflict[0].staff_id}). Please unassign first.`
            };
        }
    }

    return { valid: true };
};


// ==================================================
// CREATE EMPLOYEE
// ==================================================
const createReceptionist_15_10_2026 = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            // ❌ staffId hata diya — ab backend generate karega
            name,
            email,
            phone,
            password,
            campusId,
            image,                // ✅ image URL directly
            dob,
            gender,
            address,
            emergencyContact,
            emergencyEmail,
            receptionistOutletId,
            managerOutletIds,
            section,
            shift,
            maxDiscountPercent,
            permissions,
            permissionCodes,
            isActive
        } = req.body;

        const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

        // ---------- Basic Validation ----------
        // ❌ staffId validation hata di
        if (!name || !password) {
            await connection.rollback();
            return errorResponse(res, 'Name and Password are required', 400);
        }

        if (!campusId) {
            await connection.rollback();
            return errorResponse(res, 'Campus is required', 400);
        }

        const hasReceptionistRole = !!receptionistOutletId;
        const hasManagerRole = Array.isArray(managerOutletIds) && managerOutletIds.length > 0;

        if (!hasReceptionistRole && !hasManagerRole) {
            await connection.rollback();
            return errorResponse(
                res,
                'At least one assignment (Receptionist or Outlet Manager) is required',
                400
            );
        }

        if (receptionistOutletId && Array.isArray(receptionistOutletId)) {
            await connection.rollback();
            return errorResponse(
                res,
                'Receptionist can only be assigned to one outlet. Use a single outlet_id, not an array.',
                400
            );
        }

        // ---------- Campus + Outlet validation ----------
        const validation = await validateCampusAssignments(
            connection,
            campusId,
            receptionistOutletId,
            managerOutletIds,
            null
        );

        if (!validation.valid) {
            await connection.rollback();
            return errorResponse(res, validation.message, 400);
        }

        // ---------- 🆕 Auto-generate Employee ID ----------
        const staffId = await generateEmployeeId(connection);

        // ---------- Roles ----------
        const roles = [];
        if (hasReceptionistRole) roles.push('RECEPTIONIST');
        if (hasManagerRole) roles.push('OUTLET_MANAGER');

        let primaryRole = roles.length === 2 ? 'BOTH' : roles[0];

        const selectedPerms =
            permissions ||
            permissionCodes ||
            DEFAULT_ROLE_PERMISSIONS[primaryRole === 'BOTH' ? 'RECEPTIONIST' : primaryRole] ||
            [];

        const hashedPassword = await hashPassword(password);
        const finalIsActive = isActive === 0 || isActive === false ? 0 : 1;

        // ---------- Insert User ----------
        const [insertResult] = await connection.query(
            `
            INSERT INTO users
            (
                staff_id, name, email, phone, image, dob, gender, address,
                emergency_contact, emergency_email,
                password, role_id, role, roles, permissions, max_discount_percent,
                is_active, campus_id, outlet_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
                staffId,
                name,
                email || null,
                phone || null,
                image || null,               // ✅ image URL directly save
                dob || null,
                gender || null,
                address || null,
                emergencyContact || null,
                emergencyEmail || null,
                hashedPassword,
                primaryRole.toLowerCase(),
                primaryRole,
                JSON.stringify(roles),
                JSON.stringify(selectedPerms),
                parseFloat(maxDiscountPercent || 0),
                finalIsActive,
                campusId,
                receptionistOutletId || (managerOutletIds[0] || null)
            ]
        );

        const userId = insertResult.insertId;

        // ---------- Receptionist Assignment ----------
        if (receptionistOutletId) {
            await connection.query(
                `INSERT INTO user_outlets_receptionist (user_id, outlet_id) VALUES (?, ?)`,
                [userId, receptionistOutletId]
            );
        }

        // ---------- Manager Assignments ----------
        if (hasManagerRole) {
            const managerValues = managerOutletIds.map(oId => [userId, oId]);

            if (managerValues.length > 0) {
                await connection.query(
                    `INSERT INTO user_outlets (user_id, outlet_id) VALUES ?`,
                    [managerValues]
                );
            }
        }

        await connection.commit();

        return successResponse(
            res,
            'Employee created successfully',
            {
                id: userId,
                staffId,                    // 🆕 auto-generated
                name,
                image,
                roles,
                primaryRole,
                permissions: selectedPerms,
                campusId,
                receptionistOutletId: receptionistOutletId || null,
                managerOutletIds: managerOutletIds || [],
                isActive: finalIsActive
            },
            201
        );

    } catch (error) {
        await connection.rollback();
        console.error('❌ Create Receptionist Error:', error);
        console.error('❌ SQL Message:', error.sqlMessage);
        console.error('❌ SQL:', error.sql);
        return errorResponse(res, 'Failed to create employee', 500);
    } finally {
        connection.release();
    }
};

const createReceptionist = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            name,
            email,
            phone,
            password,
            campusId,
            image,
            dob,
            gender,
            address,
            emergencyContact,
            emergencyEmail,
            receptionistOutletId,
            managerOutletIds,
            section,
            shift,
            maxDiscountPercent,
            permissions,
            permissionCodes,
            isActive
        } = req.body;

        const { DEFAULT_ROLE_PERMISSIONS } = require('../constants/permissions');

        // ---------- Basic Validation ----------
        if (!name || !password) {
            await connection.rollback();
            return errorResponse(res, 'Name and Password are required', 400);
        }

        if (!campusId) {
            await connection.rollback();
            return errorResponse(res, 'Campus is required', 400);
        }

        const hasReceptionistRole = !!receptionistOutletId;
        const hasManagerRole = Array.isArray(managerOutletIds) && managerOutletIds.length > 0;

        if (!hasReceptionistRole && !hasManagerRole) {
            await connection.rollback();
            return errorResponse(
                res,
                'At least one assignment (Receptionist or Outlet Manager) is required',
                400
            );
        }

        if (receptionistOutletId && Array.isArray(receptionistOutletId)) {
            await connection.rollback();
            return errorResponse(
                res,
                'Receptionist can only be assigned to one outlet. Use a single outlet_id, not an array.',
                400
            );
        }

        // ---------- Campus + Outlet validation ----------
        const validation = await validateCampusAssignments(
            connection,
            campusId,
            receptionistOutletId,
            managerOutletIds,
            null
        );

        if (!validation.valid) {
            await connection.rollback();
            return errorResponse(res, validation.message, 400);
        }

        // ---------- Auto-generate Employee ID ----------
        const staffId = await generateEmployeeId(connection);

        // ---------- Roles ----------
        const roles = [];
        if (hasReceptionistRole) roles.push('RECEPTIONIST');
        if (hasManagerRole) roles.push('OUTLET_MANAGER');

        // 🆕 Dono assign = BOTH, warna jo ek role hai wahi
        let primaryRole;
        if (hasReceptionistRole && hasManagerRole) {
            primaryRole = 'BOTH';
        } else if (hasManagerRole) {
            primaryRole = 'OUTLET_MANAGER';
        } else {
            primaryRole = 'RECEPTIONIST';
        }

        const selectedPerms =
            permissions ||
            permissionCodes ||
            DEFAULT_ROLE_PERMISSIONS[primaryRole === 'BOTH' ? 'RECEPTIONIST' : primaryRole] ||
            [];

        const hashedPassword = await hashPassword(password);
        const finalIsActive = isActive === 0 || isActive === false ? 0 : 1;

        // ---------- Insert User ----------
        const [insertResult] = await connection.query(
            `
            INSERT INTO users
            (
                staff_id, name, email, phone, image, dob, gender, address,
                emergency_contact, emergency_email,
                password, role_id, role, roles, permissions, max_discount_percent,
                is_active, campus_id, outlet_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
                staffId,
                name,
                email || null,
                phone || null,
                image || null,
                dob || null,
                gender || null,
                address || null,
                emergencyContact || null,
                emergencyEmail || null,
                hashedPassword,
                primaryRole,                 // 🆕 role_id (RECEPTIONIST | OUTLET_MANAGER | BOTH)
                primaryRole,                 // role      (RECEPTIONIST | OUTLET_MANAGER | BOTH)
                JSON.stringify(roles),
                JSON.stringify(selectedPerms),
                parseFloat(maxDiscountPercent || 0),
                finalIsActive,
                campusId,
                receptionistOutletId || (managerOutletIds?.[0] || null)
            ]
        );

        const userId = insertResult.insertId;

        // ---------- Receptionist Assignment ----------
        if (receptionistOutletId) {
            await connection.query(
                `INSERT INTO user_outlets_receptionist (user_id, outlet_id) VALUES (?, ?)`,
                [userId, receptionistOutletId]
            );
        }

        // ---------- Manager Assignments ----------
        if (hasManagerRole) {
            const managerValues = managerOutletIds.map(oId => [userId, oId]);

            if (managerValues.length > 0) {
                await connection.query(
                    `INSERT INTO user_outlets (user_id, outlet_id) VALUES ?`,
                    [managerValues]
                );
            }
        }

        await connection.commit();

        return successResponse(
            res,
            'Employee created successfully',
            {
                id: userId,
                staffId,
                name,
                image,
                roles,
                role: primaryRole,
                role_id: primaryRole,
                primaryRole,
                permissions: selectedPerms,
                campusId,
                receptionistOutletId: receptionistOutletId || null,
                managerOutletIds: managerOutletIds || [],
                isActive: finalIsActive
            },
            201
        );

    } catch (error) {
        await connection.rollback();
        console.error('❌ Create Receptionist Error:', error);
        console.error('❌ SQL Message:', error.sqlMessage);
        console.error('❌ SQL:', error.sql);
        return errorResponse(res, 'Failed to create employee', 500);
    } finally {
        connection.release();
    }
};


// ==================================================
// GET RECEPTIONIST (List + Detail)
// ==================================================
// const getReceptionist_15_10_2026 = async (req, res) => {
//     try {
//         const { id } = req.params;

//         if (id) {
//             return await getReceptionistDetail(req, res);
//         }

//         return await getReceptionistList(req, res);

//     } catch (error) {
//         console.error('Get Receptionist Error:', error);
//         return errorResponse(res, 'Failed to fetch receptionist data', 500);
//     }
// };

// ==================================================
// Internal: LIST
// ==================================================
// const getReceptionistList_15_10_2026 = async (req, res) => {
//     const {
//         search = '',
//         campus_id,
//         status,
//         role,
//         page = 1,
//         limit = 10
//     } = req.query;

//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.max(1, parseInt(limit) || 10);
//     const offset = (pageNum - 1) * limitNum;

//     // Stats
//     const [statsRows] = await db.query(`
//         SELECT
//             COUNT(*) AS total_receptionists,
//             SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_receptionists,
//             SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_receptionists
//         FROM users
//         WHERE role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH')
//     `);

//     const [outletStatsRows] = await db.query(`
//         SELECT COUNT(DISTINCT uor.outlet_id) AS total_outlets_covered
//         FROM user_outlets_receptionist uor
//         INNER JOIN users u ON u.id = uor.user_id
//         WHERE u.is_active = 1
//     `);

//     const stats = {
//         totalReceptionists: Number(statsRows[0].total_receptionists) || 0,
//         activeReceptionists: Number(statsRows[0].active_receptionists) || 0,
//         inactiveReceptionists: Number(statsRows[0].inactive_receptionists) || 0,
//         outletsCovered: Number(outletStatsRows[0].total_outlets_covered) || 0
//     };

//     // Filters
//     let whereClauses = [`u.role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH')`];
//     let params = [];

//     if (search && search.trim() !== '') {
//         whereClauses.push(`(
//             u.name LIKE ?
//             OR u.staff_id LIKE ?
//             OR u.email LIKE ?
//             OR u.phone LIKE ?
//         )`);
//         const s = `%${search.trim()}%`;
//         params.push(s, s, s, s);
//     }

//     if (campus_id) {
//         whereClauses.push(`u.campus_id = ?`);
//         params.push(Number(campus_id));
//     }

//     if (status === 'Active') whereClauses.push(`u.is_active = 1`);
//     else if (status === 'Inactive') whereClauses.push(`u.is_active = 0`);

//     if (role) {
//         whereClauses.push(`u.role = ?`);
//         params.push(role);
//     }

//     const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

//     // Count
//     const [countRows] = await db.query(
//         `SELECT COUNT(*) AS total FROM users u ${whereSQL}`,
//         params
//     );
//     const totalRecords = countRows[0].total;
//     const totalPages = Math.ceil(totalRecords / limitNum);

//     // Main Query
//     const [rows] = await db.query(
//         `
//         SELECT
//             u.id, u.staff_id, u.name, u.email, u.phone, u.image,
//             u.role, u.campus_id, u.is_active, u.last_login,
//             u.created_at,
//             c.name AS campus_name
//         FROM users u
//         LEFT JOIN campuses c ON c.id = u.campus_id
//         ${whereSQL}
//         ORDER BY u.created_at DESC
//         LIMIT ${limitNum} OFFSET ${offset}
//         `,
//         params
//     );

//     // Fetch assignments
//     const userIds = rows.map(r => r.id);
//     let receptionistOutletMap = {};
//     let managerOutletMap = {};

//     if (userIds.length > 0) {
//         const placeholders = userIds.map(() => '?').join(',');

//         const [recRows] = await db.query(
//             `
//             SELECT uor.user_id, uor.outlet_id,
//                   o.name AS outlet_name, o.section
//             FROM user_outlets_receptionist uor
//             LEFT JOIN outlets o ON o.id = uor.outlet_id
//             WHERE uor.user_id IN (${placeholders})
//             `,
//             userIds
//         );

//         recRows.forEach(r => {
//             if (!receptionistOutletMap[r.user_id]) receptionistOutletMap[r.user_id] = [];
//             receptionistOutletMap[r.user_id].push({
//                 outletId: r.outlet_id,
//                 outletName: r.outlet_name,
//                 section: r.section
//             });
//         });

//         const [mgrRows] = await db.query(
//             `
//             SELECT uo.user_id, uo.outlet_id,
//                   o.name AS outlet_name, o.section
//             FROM user_outlets uo
//             LEFT JOIN outlets o ON o.id = uo.outlet_id
//             WHERE uo.user_id IN (${placeholders})
//             `,
//             userIds
//         );

//         mgrRows.forEach(r => {
//             if (!managerOutletMap[r.user_id]) managerOutletMap[r.user_id] = [];
//             managerOutletMap[r.user_id].push({
//                 outletId: r.outlet_id,
//                 outletName: r.outlet_name,
//                 section: r.section
//             });
//         });
//     }

//     // Format
//     const data = rows.map(u => {
//         const recOutlets = receptionistOutletMap[u.id] || [];
//         const mgrOutlets = managerOutletMap[u.id] || [];

//         let rolesArr = [];
//         if (u.role === 'BOTH') {
//             rolesArr = ['RECEPTIONIST', 'OUTLET_MANAGER'];
//         } else if (u.role) {
//             rolesArr = [u.role];
//         }

//         const otherRoles = rolesArr.filter(r => r !== 'RECEPTIONIST');

//         return {
//             id: u.id,
//             staffId: u.staff_id,
//             name: u.name,
//             email: u.email,
//             phone: u.phone,
//             image: u.image,             // ✅ image URL

//             roles: rolesArr,
//             roleLabel: rolesArr.map(r =>
//                 r === 'RECEPTIONIST' ? 'Receptionist'
//                 : r === 'OUTLET_MANAGER' ? 'Outlet Manager'
//                 : r
//             ),

//             campusId: u.campus_id,
//             campusName: u.campus_name,

//             receptionistAssignments: recOutlets,
//             managerAssignments: mgrOutlets,

//             assignedOutletsLabel: recOutlets.length > 0
//                 ? recOutlets[0].outletName
//                 : (mgrOutlets.length > 0 ? mgrOutlets[0].outletName : null),
//             assignedOutletsCount: recOutlets.length + mgrOutlets.length,

//             otherRolesLabel: otherRoles.length > 0
//                 ? otherRoles.map(r =>
//                     r === 'OUTLET_MANAGER'
//                         ? `Outlet Manager (${mgrOutlets.length} Outlets)`
//                         : r
//                   ).join(', ')
//                 : '-',

//             status: Number(u.is_active),
//             statusName: Number(u.is_active) === 1 ? 'Active' : 'Inactive',

//             lastLogin: u.last_login,
//             createdAt: u.created_at
//         };
//     });

//     return successResponse(res, 'Receptionists fetched successfully', {
//         stats,
//         data,
//         pagination: {
//             total: totalRecords,
//             page: pageNum,
//             limit: limitNum,
//             totalPages,
//             hasNextPage: pageNum < totalPages,
//             hasPrevPage: pageNum > 1
//         }
//     });
// };

const getReceptionist = async (req, res) => {
    try {
        const { id } = req.params;

        if (id) {
            return await getReceptionistDetail(req, res);
        }

        return await getReceptionistList(req, res);

    } catch (error) {
        console.error('Get Receptionist Error:', error);
        return errorResponse(res, 'Failed to fetch receptionist data', 500);
    }
}; 

const VALID_RECEPTIONIST_ROLES = ['RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH'];

const safeJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (e) { return fallback; }
};

const getReceptionistList = async (req, res) => {
    const {
        search = '',
        campus_id,
        status,
        role,
        page = 1,
        limit = 10
    } = req.query;

    // limit=all => pagination ke bina saare records
    const fetchAll = String(limit).toLowerCase() === 'all';
    const pageNum = fetchAll ? 1 : Math.max(1, parseInt(page) || 1);
    const limitNum = fetchAll ? 0 : Math.max(1, parseInt(limit) || 10);
    const offset = fetchAll ? 0 : (pageNum - 1) * limitNum;

    // ==================================================
    // Role normalize + validate
    // ==================================================
    let roleFilter = null;
    if (role !== undefined && String(role).trim() !== '') {
        roleFilter = String(role).trim().toUpperCase().replace(/[\s-]+/g, '_');

        if (!VALID_RECEPTIONIST_ROLES.includes(roleFilter)) {
            return errorResponse(
                res,
                `role must be one of: ${VALID_RECEPTIONIST_ROLES.join(', ')}`,
                400
            );
        }
    }

    // ==================================================
    // Campus ids (single ya comma separated)
    // ==================================================
    let campusIds = [];
    if (campus_id !== undefined && String(campus_id).trim() !== '') {
        campusIds = String(campus_id)
            .split(',')
            .map(v => Number(v.trim()))
            .filter(v => Number.isInteger(v) && v > 0);

        if (campusIds.length === 0) {
            return errorResponse(res, 'campus_id must be a valid number', 400);
        }
    }

    // ==================================================
    // Status normalize + validate
    // ==================================================
    let statusValue = null;
    if (status !== undefined && String(status).trim() !== '') {
        const s = String(status).trim().toLowerCase();

        if (s === 'active' || s === '1') statusValue = 1;
        else if (s === 'inactive' || s === '0') statusValue = 0;
        else {
            return errorResponse(res, 'status must be Active, Inactive, 1 or 0', 400);
        }
    }

    // ==================================================
    // Stats
    // ==================================================
    const [statsRows] = await db.query(`
        SELECT
            COUNT(*) AS total_receptionists,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_receptionists,
            SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_receptionists,

            SUM(CASE WHEN role IN ('OUTLET_MANAGER', 'BOTH') THEN 1 ELSE 0 END) AS total_manager,
            SUM(CASE WHEN role IN ('OUTLET_MANAGER', 'BOTH') AND is_active = 1 THEN 1 ELSE 0 END) AS active_manager,
            SUM(CASE WHEN role IN ('OUTLET_MANAGER', 'BOTH') AND is_active = 0 THEN 1 ELSE 0 END) AS inactive_manager
        FROM users
        WHERE role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH')
    `);

    const [outletStatsRows] = await db.query(`
        SELECT COUNT(DISTINCT uor.outlet_id) AS total_outlets_covered
        FROM user_outlets_receptionist uor
        INNER JOIN users u ON u.id = uor.user_id
        WHERE u.is_active = 1
    `);

    const stats = {
        totalReceptionists: Number(statsRows[0].total_receptionists) || 0,
        activeReceptionists: Number(statsRows[0].active_receptionists) || 0,
        inactiveReceptionists: Number(statsRows[0].inactive_receptionists) || 0,
        outletsCovered: Number(outletStatsRows[0].total_outlets_covered) || 0,

        total_manager: Number(statsRows[0].total_manager) || 0,
        active_manager: Number(statsRows[0].active_manager) || 0,
        inactive_manager: Number(statsRows[0].inactive_manager) || 0
    };

    // ==================================================
    // Filters
    // ==================================================
    const whereClauses = [`u.role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH')`];
    const params = [];

    if (search && String(search).trim() !== '') {
        whereClauses.push(`(
            u.name LIKE ?
            OR u.staff_id LIKE ?
            OR u.email LIKE ?
            OR u.phone LIKE ?
        )`);
        const s = `%${String(search).trim()}%`;
        params.push(s, s, s, s);
    }

    if (campusIds.length > 0) {
        whereClauses.push(`u.campus_id IN (${campusIds.map(() => '?').join(',')})`);
        params.push(...campusIds);
    }

    if (statusValue !== null) {
        whereClauses.push(`u.is_active = ?`);
        params.push(statusValue);
    }

    if (roleFilter) {
        whereClauses.push(`u.role = ?`);
        params.push(roleFilter);
    }

    const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

    // ==================================================
    // Count
    // ==================================================
    const [countRows] = await db.query(
        `SELECT COUNT(*) AS total FROM users u ${whereSQL}`,
        params
    );
    const totalRecords = Number(countRows[0].total) || 0;
    const totalPages = fetchAll ? 1 : Math.ceil(totalRecords / limitNum);

    // ==================================================
    // Main Query (users ka poora data)
    // ==================================================
    const limitSQL = fetchAll ? '' : `LIMIT ${limitNum} OFFSET ${offset}`;

    const [rows] = await db.query(
        `
        SELECT
            u.*,
            c.name AS campus_name
        FROM users u
        LEFT JOIN campuses c ON c.id = u.campus_id
        ${whereSQL}
        ORDER BY u.created_at DESC
        ${limitSQL}
        `,
        params
    );

    // ==================================================
    // Fetch assignments
    // ==================================================
    const userIds = rows.map(r => r.id);
    const receptionistOutletMap = {};
    const managerOutletMap = {};

    if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',');

        const [recRows] = await db.query(
            `
            SELECT uor.user_id, uor.outlet_id,
                   o.name AS outlet_name, o.address AS outlet_address,
                   o.section, o.is_active AS outlet_is_active
            FROM user_outlets_receptionist uor
            LEFT JOIN outlets o ON o.id = uor.outlet_id
            WHERE uor.user_id IN (${placeholders})
            `,
            userIds
        );

        recRows.forEach(r => {
            if (!receptionistOutletMap[r.user_id]) receptionistOutletMap[r.user_id] = [];
            receptionistOutletMap[r.user_id].push({
                outletId: r.outlet_id,
                outletName: r.outlet_name,
                outletAddress: r.outlet_address,
                section: r.section,
                outletIsActive: r.outlet_is_active
            });
        });

        const [mgrRows] = await db.query(
            `
            SELECT uo.user_id, uo.outlet_id,
                   o.name AS outlet_name, o.address AS outlet_address,
                   o.section, o.is_active AS outlet_is_active
            FROM user_outlets uo
            LEFT JOIN outlets o ON o.id = uo.outlet_id
            WHERE uo.user_id IN (${placeholders})
            `,
            userIds
        );

        mgrRows.forEach(r => {
            if (!managerOutletMap[r.user_id]) managerOutletMap[r.user_id] = [];
            managerOutletMap[r.user_id].push({
                outletId: r.outlet_id,
                outletName: r.outlet_name,
                outletAddress: r.outlet_address,
                section: r.section,
                outletIsActive: r.outlet_is_active
            });
        });
    }

    // ==================================================
    // Format
    // ==================================================
    const data = rows.map(u => {
        const recOutlets = receptionistOutletMap[u.id] || [];
        const mgrOutlets = managerOutletMap[u.id] || [];

        let rolesArr = [];
        if (u.role === 'BOTH') {
            rolesArr = ['RECEPTIONIST', 'OUTLET_MANAGER'];
        } else if (u.role) {
            rolesArr = [u.role];
        }

        const otherRoles = rolesArr.filter(r => r !== 'RECEPTIONIST');

        // password kabhi response me nahi jayega
        //const { password, otp, ...userFields } = u;
        const { otp, ...userFields } = u;

        return {
            // DB ke saare columns (snake_case)
            ...userFields,

            // Frontend ke liye camelCase
            id: u.id,
            staffId: u.staff_id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            image: u.image,
            dob: u.dob,
            gender: u.gender,
            address: u.address,
            emergencyContact: u.emergency_contact,
            emergencyEmail: u.emergency_email,
            maxDiscountPercent: Number(u.max_discount_percent) || 0,
            permissions: safeJson(u.permissions, []),

            role: u.role,
            roleId: u.role_id,
            roles: rolesArr,
            rolesStored: safeJson(u.roles, rolesArr),
            roleLabel: rolesArr.map(r =>
                r === 'RECEPTIONIST' ? 'Receptionist'
                : r === 'OUTLET_MANAGER' ? 'Outlet Manager'
                : r
            ),

            campusId: u.campus_id,
            campusName: u.campus_name,
            outletId: u.outlet_id,

            receptionistAssignments: recOutlets,
            managerAssignments: mgrOutlets,

            assignedOutletsLabel: recOutlets.length > 0
                ? recOutlets[0].outletName
                : (mgrOutlets.length > 0 ? mgrOutlets[0].outletName : null),
            assignedOutletsCount: recOutlets.length + mgrOutlets.length,

            otherRolesLabel: otherRoles.length > 0
                ? otherRoles.map(r =>
                    r === 'OUTLET_MANAGER'
                        ? `Outlet Manager (${mgrOutlets.length} Outlets)`
                        : r
                  ).join(', ')
                : '-',

            status: Number(u.is_active),
            statusName: Number(u.is_active) === 1 ? 'Active' : 'Inactive',

            lastLogin: u.last_login,
            createdAt: u.created_at,
            updatedAt: u.updated_at
        };
    });

    // ==================================================
    // Response
    // ==================================================
    return successResponse(res, 'Receptionists fetched successfully', {
        filters: {
            search: String(search).trim() || null,
            campus_id: campusIds.length > 0 ? campusIds : null,
            status: statusValue === null ? null : (statusValue === 1 ? 'Active' : 'Inactive'),
            role: roleFilter
        },
        stats,
        data,
        pagination: {
            total: totalRecords,
            page: pageNum,
            limit: fetchAll ? totalRecords : limitNum,
            totalPages,
            hasNextPage: fetchAll ? false : pageNum < totalPages,
            hasPrevPage: fetchAll ? false : pageNum > 1
        }
    });
};
// ==================================================
// Internal: DETAIL
// ==================================================
const getReceptionistDetail = async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return errorResponse(res, 'Receptionist ID is required', 400);
    }

    const [users] = await db.query(
        `
        SELECT
            u.id, u.staff_id, u.name, u.email, u.phone, u.image,
            u.dob, u.gender, u.address,
            u.emergency_contact, u.emergency_email,
            u.role, u.roles, u.permissions,
            u.max_discount_percent, u.is_active,
            u.campus_id, u.last_login,
            u.created_at, u.updated_at,
            c.name AS campus_name
        FROM users u
        LEFT JOIN campuses c ON c.id = u.campus_id
        WHERE u.id = ? AND u.role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH')
        LIMIT 1
        `,
        [id]
    );

    if (users.length === 0) {
        return errorResponse(res, 'Receptionist not found', 404);
    }

    const u = users[0];

    let rolesArr = [];
    try {
        rolesArr = u.roles
            ? (typeof u.roles === 'string' ? JSON.parse(u.roles) : u.roles)
            : (u.role === 'BOTH' ? ['RECEPTIONIST', 'OUTLET_MANAGER'] : [u.role]);
    } catch (e) {
        rolesArr = u.role === 'BOTH' ? ['RECEPTIONIST', 'OUTLET_MANAGER'] : [u.role];
    }

    // Receptionist Assignments
    const [recAssignments] = await db.query(
        `
        SELECT
            uor.outlet_id, o.name AS outlet_name,
            o.section AS outlet_type, o.is_active AS outlet_is_active,
            o.campus_id, c.name AS campus_name
        FROM user_outlets_receptionist uor
        LEFT JOIN outlets o ON o.id = uor.outlet_id
        LEFT JOIN campuses c ON c.id = o.campus_id
        WHERE uor.user_id = ?
        `,
        [id]
    );

    // Manager Assignments
    const [mgrAssignments] = await db.query(
        `
        SELECT
            uo.outlet_id, o.name AS outlet_name,
            o.section AS outlet_type, o.is_active AS outlet_is_active,
            o.campus_id, c.name AS campus_name
        FROM user_outlets uo
        LEFT JOIN outlets o ON o.id = uo.outlet_id
        LEFT JOIN campuses c ON c.id = o.campus_id
        WHERE uo.user_id = ?
        `,
        [id]
    );

    const data = {
        id: u.id,
        staffId: u.staff_id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        image: u.image,             // ✅ image URL

        roles: rolesArr,
        roleLabel: rolesArr.map(r =>
            r === 'RECEPTIONIST' ? 'Receptionist'
            : r === 'OUTLET_MANAGER' ? 'Outlet Manager'
            : r
        ),

        campusId: u.campus_id,
        campusName: u.campus_name,

        stats: {
            campus: u.campus_name,
            employeeId: u.staff_id,
            accountStatus: Number(u.is_active) === 1 ? 'Active' : 'Inactive'
        },

        basicInfo: {
            fullName: u.name,
            employeeId: u.staff_id,
            email: u.email,
            phone: u.phone,
            campus: u.campus_name,
            accountStatus: Number(u.is_active) === 1 ? 'Active' : 'Inactive',
            image: u.image,
            dob: u.dob,
            gender: u.gender,
            address: u.address,
            emergencyContact: u.emergency_contact,
            emergencyEmail: u.emergency_email,
            maxDiscountPercent: Number(u.max_discount_percent) || 0,
            permissions: (() => {
                try {
                    return typeof u.permissions === 'string'
                        ? JSON.parse(u.permissions)
                        : (u.permissions || []);
                } catch (e) {
                    return [];
                }
            })()
        },

        receptionistAssignment: {
            title: 'Receptionist Assignment',
            subtitle: `Outlet(s) where ${u.name} is assigned as a Receptionist.`,
            outlets: recAssignments.map(o => ({
                outletId: o.outlet_id,
                outletName: o.outlet_name,
                outletType: o.outlet_type,
                campusId: o.campus_id,
                campusName: o.campus_name,
                status: Number(o.outlet_is_active) === 1 ? 'Active' : 'Inactive'
            }))
        },

        managerAssignments: {
            title: 'Outlet Manager Assignments',
            subtitle: `Outlet(s) where ${u.name} is assigned as an Outlet Manager.`,
            outlets: mgrAssignments.map(o => ({
                outletId: o.outlet_id,
                outletName: o.outlet_name,
                outletType: o.outlet_type,
                campusId: o.campus_id,
                campusName: o.campus_name,
                status: Number(o.outlet_is_active) === 1 ? 'Active' : 'Inactive'
            }))
        },

        status: Number(u.is_active),
        statusName: Number(u.is_active) === 1 ? 'Active' : 'Inactive',
        lastLogin: u.last_login,
        createdAt: u.created_at,
        updatedAt: u.updated_at
    };

    return successResponse(res, 'Receptionist details fetched successfully', data);
};


// ==================================================
// UPDATE RECEPTIONIST
// ==================================================
const updateReceptionist = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        const {
            name, email, phone, password,
            image,                    // ✅ image URL update
            dob, gender, address,
            emergencyContact, emergencyEmail,
            campusId,
            receptionistOutletId,
            managerOutletIds,
            maxDiscountPercent, permissions, isActive
        } = req.body;

        const [existing] = await connection.query(
            `SELECT id, role, campus_id FROM users 
             WHERE id = ? AND role IN ('RECEPTIONIST', 'OUTLET_MANAGER', 'BOTH') 
             LIMIT 1`,
            [id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return errorResponse(res, 'Receptionist not found', 404);
        }

        if (receptionistOutletId && Array.isArray(receptionistOutletId)) {
            await connection.rollback();
            return errorResponse(
                res,
                'Receptionist can only be assigned to one outlet. Use a single outlet_id, not an array.',
                400
            );
        }

        // Effective values
        const effectiveCampusId = campusId !== undefined ? campusId : existing[0].campus_id;

        let effectiveRecOutlet = receptionistOutletId;

        if (receptionistOutletId === undefined) {
            const [oldRec] = await connection.query(
                `SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ? LIMIT 1`,
                [id]
            );
            effectiveRecOutlet = oldRec.length > 0 ? oldRec[0].outlet_id : null;
        }

        let effectiveMgrOutlets = managerOutletIds;

        if (managerOutletIds === undefined) {
            const [oldMgr] = await connection.query(
                `SELECT outlet_id FROM user_outlets WHERE user_id = ?`,
                [id]
            );
            effectiveMgrOutlets = oldMgr.map(r => r.outlet_id);
        }

        // Validation
        if (
            receptionistOutletId !== undefined ||
            managerOutletIds !== undefined ||
            campusId !== undefined
        ) {
            const validation = await validateCampusAssignments(
                connection,
                effectiveCampusId,
                effectiveRecOutlet,
                effectiveMgrOutlets,
                id
            );

            if (!validation.valid) {
                await connection.rollback();
                return errorResponse(res, validation.message, 400);
            }
        }

        // Dynamic updates
        const updates = [];
        const params = [];

        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
        if (image !== undefined) { updates.push('image = ?'); params.push(image); }
        if (dob !== undefined) { updates.push('dob = ?'); params.push(dob); }
        if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
        if (address !== undefined) { updates.push('address = ?'); params.push(address); }
        if (emergencyContact !== undefined) {
            updates.push('emergency_contact = ?');
            params.push(emergencyContact);
        }
        if (emergencyEmail !== undefined) {
            updates.push('emergency_email = ?');
            params.push(emergencyEmail);
        }
        if (campusId !== undefined) { updates.push('campus_id = ?'); params.push(campusId); }
        if (maxDiscountPercent !== undefined) {
            updates.push('max_discount_percent = ?');
            params.push(parseFloat(maxDiscountPercent));
        }
        if (permissions !== undefined) {
            updates.push('permissions = ?');
            params.push(JSON.stringify(permissions));
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive ? 1 : 0);
        }
        if (password) {
            updates.push('password = ?');
            params.push(await hashPassword(password));
        }

        // Role recalc
        const hasRec = receptionistOutletId !== undefined ? !!receptionistOutletId : undefined;
        const hasMgr = Array.isArray(managerOutletIds) ? managerOutletIds.length > 0 : undefined;

        if (hasRec !== undefined || hasMgr !== undefined) {
            const [existingRec] = await connection.query(
                `SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ?`,
                [id]
            );
            const [existingMgr] = await connection.query(
                `SELECT outlet_id FROM user_outlets WHERE user_id = ?`,
                [id]
            );

            const willHaveRec = hasRec !== undefined ? hasRec : existingRec.length > 0;
            const willHaveMgr = hasMgr !== undefined ? hasMgr : existingMgr.length > 0;

            let newRole;
            if (willHaveRec && willHaveMgr) newRole = 'BOTH';
            else if (willHaveRec) newRole = 'RECEPTIONIST';
            else if (willHaveMgr) newRole = 'OUTLET_MANAGER';
            else newRole = existing[0].role;

            updates.push('role = ?');
            params.push(newRole);

            const rolesArr = [];
            if (willHaveRec) rolesArr.push('RECEPTIONIST');
            if (willHaveMgr) rolesArr.push('OUTLET_MANAGER');

            updates.push('roles = ?');
            params.push(JSON.stringify(rolesArr));
        }

        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            params.push(id);

            await connection.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }

        // Sync receptionist
        if (receptionistOutletId !== undefined) {
            await connection.query(
                `DELETE FROM user_outlets_receptionist WHERE user_id = ?`,
                [id]
            );

            if (receptionistOutletId) {
                await connection.query(
                    `INSERT INTO user_outlets_receptionist (user_id, outlet_id) VALUES (?, ?)`,
                    [id, receptionistOutletId]
                );
            }
        }

        // Sync managers
        if (Array.isArray(managerOutletIds)) {
            await connection.query(
                `DELETE FROM user_outlets WHERE user_id = ?`,
                [id]
            );

            if (managerOutletIds.length > 0) {
                const values = managerOutletIds.map(oId => [id, oId]);
                await connection.query(
                    `INSERT INTO user_outlets (user_id, outlet_id) VALUES ?`,
                    [values]
                );
            }
        }

        await connection.commit();

        return successResponse(res, 'Receptionist updated successfully', {
            id,
            updatedFields: updates
                .filter(u => u !== 'updated_at = NOW()')
                .map(u => u.split(' = ')[0])
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Update Receptionist Error:', error);
        console.error('❌ SQL Message:', error.sqlMessage);
        console.error('❌ SQL:', error.sql);
        return errorResponse(res, 'Failed to update Receptionist', 500);
    } finally {
        connection.release();
    }
};

// ==========================================================
// Orders table config (apne DB ke hisaab se badal lena)
// ==========================================================
const ORDERS = {
  table: 'orders',
  studentId: 'student_id',
  weightKg: 'weight_kg',       // order ka kg
  createdAt: 'created_at'
};

const CUSTOMER_STATUS_MAP = {
  ACTIVE_SUBSCRIBED: 'Active',
  REGISTERED_INACTIVE: 'Inactive',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended'
};

// ==========================================================
// CUSTOMER LIST
// ==========================================================
const getCustomerList = async (req, res) => {
  try {
    const {
      campus_id,
      outlet_id,
      customer_type = 'all',              // all | student | non_student
      subscription_status = 'all',        // all | subscribed | non_subscribed | expired | <plan name> | <plan id>
      status = 'all',                     // all | active | inactive | expired | suspended (ya raw value)
      search = '',
      page = 1,
      limit = 10
    } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.max(parseInt(limit) || 10, 1);
    const offset = (pageNumber - 1) * limitNumber;

    const STATUS_MAP = CUSTOMER_STATUS_MAP;

    const STATUS_KEY_TO_RAW = {
      active: 'ACTIVE_SUBSCRIBED',
      inactive: 'REGISTERED_INACTIVE',
      expired: 'EXPIRED',
      suspended: 'SUSPENDED'
    };

    const fromSQL = `
      FROM students s
      LEFT JOIN outlets o ON o.id = s.outlet_id
      LEFT JOIN campuses c ON c.id = s.campus_id
      LEFT JOIN student_subscriptions ss
        ON ss.id = (
          SELECT ss2.id
          FROM student_subscriptions ss2
          WHERE ss2.student_id = s.id
          ORDER BY (ss2.status = 'ACTIVE') DESC, ss2.created_at DESC, ss2.id DESC
          LIMIT 1
        )
      LEFT JOIN subscription_plans p ON p.id = ss.plan_id
    `;

    const subStatusExpr = `
      (CASE
        WHEN ss.id IS NULL THEN 'Non-Subscribed'
        WHEN ss.status = 'ACTIVE'
             AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
          THEN 'Subscribed'
        ELSE 'Expired'
      END)
    `;

    // ==========================================================
    // BASE WHERE (campus + outlet + ONLY is_active in 0,1)
    // ==========================================================
    // ✅ is_active IN (0,1) condition yahan add ki hai
    // taaki stats, count, aur list sabhi sirf valid is_active wale
    // customers par hi chalein.
    let baseWhere = `WHERE s.is_active IN (0, 1)`;
    const baseParams = [];

    if (campus_id) {
      baseWhere += ` AND s.campus_id = ?`;
      baseParams.push(campus_id);
    }

    if (outlet_id) {
      baseWhere += ` AND s.outlet_id = ?`;
      baseParams.push(outlet_id);
    }

    // LIST WHERE
    let where = baseWhere;
    const params = [...baseParams];

    if (customer_type === 'student') {
      where += ` AND s.role = 'STUDENT'`;
    } else if (customer_type === 'non_student') {
      where += ` AND s.role = 'NON_STUDENT'`;
    }

    if (String(search).trim() !== '') {
      const searchValue = `%${String(search).trim()}%`;

      where += `
        AND (
          s.full_name LIKE ?
          OR s.phone LIKE ?
          OR CONCAT('IWO', LPAD(s.id, 5, '0')) LIKE ?
        )
      `;
      params.push(searchValue, searchValue, searchValue);
    }

    // Subscription filter
    const subFilter = String(subscription_status).trim();
    const subFilterKey = subFilter.toLowerCase();
    const SUB_STATUS_KEYS = ['', 'all', 'subscribed', 'non_subscribed', 'expired'];

    if (subFilterKey === 'subscribed') {
      where += ` AND ${subStatusExpr} = 'Subscribed'`;
    } else if (subFilterKey === 'non_subscribed') {
      where += ` AND ${subStatusExpr} = 'Non-Subscribed'`;
    } else if (subFilterKey === 'expired') {
      where += ` AND ${subStatusExpr} = 'Expired'`;
    } else if (!SUB_STATUS_KEYS.includes(subFilterKey)) {
      if (/^\d+$/.test(subFilter)) {
        where += ` AND p.id = ?`;
        params.push(Number(subFilter));
      } else {
        where += ` AND LOWER(TRIM(p.plan_name)) = LOWER(TRIM(?))`;
        params.push(subFilter);
      }
      where += ` AND ${subStatusExpr} = 'Subscribed'`;
    }

    // Status filter
    const statusInput = String(status).trim();
    const statusKey = statusInput.toLowerCase();

    if (statusKey !== '' && statusKey !== 'all') {
      if (statusKey === 'active') {
        where += ` AND s.is_active = 1`;
      } else if (statusKey === 'inactive') {
        where += ` AND s.is_active = 0`;
      } else {
        const statusRaw = STATUS_KEY_TO_RAW[statusKey] || statusInput.toUpperCase();

        if (!STATUS_MAP[statusRaw]) {
          return res.status(400).json({
            status: false,
            message: 'status must be one of: all, active, inactive, expired, suspended'
          });
        }

        where += ` AND s.status = ?`;
        params.push(statusRaw);
      }
    }

    // ==========================================================
    // STATS (sirf is_active 0/1 wale customers par)
    // ==========================================================
    const [statsRows] = await db.query(
      `
      SELECT
        COUNT(*) AS total_customers,
        SUM(CASE WHEN s.is_active = 1 THEN 1 ELSE 0 END) AS active_customers,
        SUM(CASE WHEN s.is_active = 0 THEN 1 ELSE 0 END) AS inactive_customers,
        SUM(CASE WHEN s.status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired_customers,
        SUM(CASE WHEN s.status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended_customers,
        SUM(CASE WHEN ${subStatusExpr} = 'Subscribed' THEN 1 ELSE 0 END) AS active_subscriptions,
        SUM(CASE WHEN ${subStatusExpr} = 'Subscribed' THEN COALESCE(ss.quota_kg_used, 0) ELSE 0 END) AS total_wash_used_kg
      ${fromSQL}
      ${baseWhere}
      `,
      baseParams
    );

    const totalCustomers = Number(statsRows[0].total_customers) || 0;
    const activeCustomers = Number(statsRows[0].active_customers) || 0;
    const activeSubscriptions = Number(statsRows[0].active_subscriptions) || 0;

    const percent = (value) =>
      totalCustomers > 0 ? Math.round((value / totalCustomers) * 100) : 0;

    const stats = {
      total_customers: totalCustomers,
      active_customers: activeCustomers,
      active_customers_percent: percent(activeCustomers),
      inactive_customers: Number(statsRows[0].inactive_customers) || 0,
      expired_customers: Number(statsRows[0].expired_customers) || 0,
      suspended_customers: Number(statsRows[0].suspended_customers) || 0,
      active_subscriptions: activeSubscriptions,
      active_subscriptions_percent: percent(activeSubscriptions),
      total_wash_used_kg: Number(statsRows[0].total_wash_used_kg) || 0
    };

    // TOTAL COUNT (baseWhere ke through hi is_active filter apply hai)
    const [countResult] = await db.query(
      `SELECT COUNT(*) AS total ${fromSQL} ${where}`,
      params
    );
    const total = Number(countResult[0].total) || 0;

    // CUSTOMER LIST
    const [customers] = await db.query(
      `
      SELECT
        s.id,
        CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
        s.full_name,
        s.phone,
        s.profile_image,
        s.role,
        s.gender,
        s.status AS student_status,
        s.is_active,
        s.campus_id,
        c.name AS campus_name,
        s.outlet_id,
        o.name AS outlet_name,
        s.roll_number,
        s.course,
        s.hostel_name,
        s.room_number,
        s.address,
        s.area,
        s.pin_code,
        s.permanent_qr,
        s.created_at,

        ${subStatusExpr} AS subscription_status,

        ss.id AS subscription_id,
        p.id AS plan_id,
        p.plan_name,
        p.monthly_wash_limit_kg,
        p.maximum_weight_per_order_kg,
        p.wash_per_month,
        ss.end_date AS valid_till,
        ss.quota_kg_total,
        COALESCE(ss.quota_kg_used, 0) AS used_kg

      ${fromSQL}
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset]
    );

    // DROPDOWN DATA
    const [campusRows] = await db.query(
      `SELECT id, name FROM campuses ORDER BY name ASC`
    );

    const [outletRows] = campus_id
      ? await db.query(
          `SELECT id, name, campus_id FROM outlets WHERE campus_id = ? ORDER BY name ASC`,
          [campus_id]
        )
      : await db.query(
          `SELECT id, name, campus_id FROM outlets ORDER BY name ASC`
        );

    const [planRows] = await db.query(
      `SELECT id, plan_name FROM subscription_plans ORDER BY plan_name ASC`
    );

    const subscriptionOptions = [
      { value: 'all', label: 'All Subscription Status', type: 'status' },
      { value: 'subscribed', label: 'Subscribed', type: 'status' },
      { value: 'non_subscribed', label: 'Non-Subscribed', type: 'status' },
      { value: 'expired', label: 'Expired', type: 'status' },
      ...planRows.map(pl => ({
        value: pl.plan_name,
        label: pl.plan_name,
        plan_id: pl.id,
        type: 'plan'
      }))
    ];

    const statusOptions = [
      { value: 'all', label: 'All Status' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'expired', label: 'Expired', raw: 'EXPIRED' },
      { value: 'suspended', label: 'Suspended', raw: 'SUSPENDED' }
    ];

    // FORMAT
    const imageUrl = (image) =>
      image ? `https://instawash.siberiancrane.tech/uploads/${image}` : null;

    const customerTypeLabel = (role, gender) => {
      if (role === 'NON_STUDENT') return 'Non-Student';
      const g = String(gender || '').toLowerCase();
      if (g === 'female') return 'Female Student';
      if (g === 'male') return 'Male Student';
      return 'Student';
    };

    const customerData = customers.map((item, index) => {
      const hasPlan = !!item.subscription_id;
      const monthlyKg = Number(item.monthly_wash_limit_kg) || 0;
      const quotaTotal = item.quota_kg_total !== null && item.quota_kg_total !== undefined
        ? Number(item.quota_kg_total)
        : monthlyKg;
      const usedKg = Number(item.used_kg) || 0;

      return {
        sr_no: offset + index + 1,

        id: item.id,
        customer_id: item.customer_id,
        full_name: item.full_name,
        phone: item.phone,
        profile_image: imageUrl(item.profile_image),

        role: item.role,
        gender: item.gender,
        customer_type_label: customerTypeLabel(item.role, item.gender),

        campus_id: item.campus_id,
        campus_name: item.campus_name,
        outlet_id: item.outlet_id,
        outlet_name: item.outlet_name,

        roll_number: item.roll_number,
        course: item.course,
        hostel_name: item.hostel_name,
        room_number: item.room_number,
        address: item.address,
        area: item.area,
        pin_code: item.pin_code,
        permanent_qr: item.permanent_qr,

        subscription_status: item.subscription_status,
        subscription_label: hasPlan ? item.plan_name : 'No Subscription',
        plan_id: item.plan_id || null,

        plan_limits: hasPlan
          ? {
              monthly_kg: monthlyKg,
              max_kg_per_order: Number(item.maximum_weight_per_order_kg) || 0,
              max_times_per_month: Number(item.wash_per_month) || 0
            }
          : null,

        valid_till: hasPlan ? item.valid_till : null,
        quota_kg_total: hasPlan ? quotaTotal : 0,
        used_kg: usedKg,
        remaining_kg: hasPlan ? Math.max(quotaTotal - usedKg, 0) : 0,

        // ✅ status ab is_active se (0 = Inactive, 1 = Active)
        status: item.is_active == 1 ? 'Active' : 'Inactive',
        status_raw: item.student_status,
        is_active: Number(item.is_active) || 0,

        created_at: item.created_at
      };
    });

    return res.status(200).json({
      status: true,
      message: 'Customer list fetched successfully',
      data: {
        stats,
        customers: customerData,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          total_pages: Math.ceil(total / limitNumber),
          showing_from: total === 0 ? 0 : offset + 1,
          showing_to: Math.min(offset + limitNumber, total)
        },
        filters: {
          campuses: campusRows,
          outlets: outletRows,
          subscription_options: subscriptionOptions,
          status_options: statusOptions
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

// ==========================================================
// CUSTOMER DETAILS
// ==========================================================
const getCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({
        status: false,
        message: 'Valid customer id is required'
      });
    }

    // ==========================================
    // CUSTOMER + CAMPUS + OUTLET
    // ✅ sirf is_active IN (0,1) wale hi dikhenge
    // ==========================================
    const [rows] = await db.query(
      `
      SELECT
        s.id,
        CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
        s.full_name,
        s.phone,
        s.profile_image,
        s.role,
        s.gender,
        s.status AS student_status,
        s.is_active,
        s.campus_id,
        c.name AS campus_name,
        s.outlet_id,
        o.name AS outlet_name,
        s.roll_number,
        s.course,
        s.hostel_name,
        s.room_number,
        s.address,
        s.area,
        s.pin_code,
        s.permanent_qr,
        s.created_at
      FROM students s
      LEFT JOIN campuses c ON c.id = s.campus_id
      LEFT JOIN outlets o ON o.id = s.outlet_id
      WHERE s.id = ? AND s.is_active IN (0, 1)
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Customer not found'
      });
    }

    const s = rows[0];

    // ==========================================
    // SUBSCRIPTION (active ho to wahi, warna latest)
    // ==========================================
    const [subRows] = await db.query(
      `
      SELECT
        ss.id,
        ss.plan_id,
        ss.start_date,
        ss.end_date,
        ss.quota_kg_total,
        ss.quota_kg_used,
        ss.status,
        ss.created_at,
        p.plan_name,
        p.plan_code,
        p.plan_type,
        p.description,
        p.original_annual_price,
        p.monthly_wash_limit_kg,
        p.wash_per_month,
        p.maximum_weight_per_order_kg
      FROM student_subscriptions ss
      LEFT JOIN subscription_plans p ON p.id = ss.plan_id
      WHERE ss.student_id = ?
      ORDER BY (ss.status = 'ACTIVE') DESC, ss.created_at DESC, ss.id DESC
      LIMIT 1
      `,
      [id]
    );

    const sub = subRows[0] || null;

    // ==========================================
    // HELPERS
    // ==========================================
    const formatDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    const monthLabel = (d) =>
      d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const ymKey = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const imageUrl = (image) =>
      image ? `https://instawash.siberiancrane.tech/uploads/${image}` : null;

    const customerTypeLabel = (role, gender) => {
      if (role === 'NON_STUDENT') return 'Non-Student';
      const g = String(gender || '').toLowerCase();
      if (g === 'female') return 'Female Student';
      if (g === 'male') return 'Male Student';
      return 'Student';
    };

    // ==========================================
    // SUBSCRIPTION OVERVIEW
    // ==========================================
    let subscription = null;
    let usageHistory = [];

    if (sub) {
      const isRunning =
        sub.status === 'ACTIVE' &&
        (!sub.end_date || new Date(sub.end_date) >= new Date(new Date().toDateString()));

      const monthlyQuota = Number(sub.monthly_wash_limit_kg) || 0;
      const maxWashes = Number(sub.wash_per_month) || 0;
      const originalPrice = sub.original_annual_price !== null
        ? Number(sub.original_annual_price)
        : null;

      const purchaseDate = sub.start_date || sub.created_at;
      const purchaseDateObj = purchaseDate ? new Date(purchaseDate) : null;

      subscription = {
        subscription_id: sub.id,
        plan_id: sub.plan_id,
        plan_name: sub.plan_name,
        plan_code: sub.plan_code,
        plan_type: sub.plan_type,
        description: sub.description,
        status: isRunning ? 'Active' : 'Expired',
        valid_till: formatDate(sub.end_date),
        valid_till_raw: sub.end_date,

        purchase_date: formatDate(purchaseDate),
        purchase_month: purchaseDateObj && !isNaN(purchaseDateObj.getTime())
          ? purchaseDateObj.toLocaleDateString('en-GB', { month: 'long' })
          : null,

        original_price: originalPrice,
        discount_percent: null,
        discount_amount: null,
        paid_amount: null,

        monthly_quota_kg: monthlyQuota,
        max_kg_per_order: Number(sub.maximum_weight_per_order_kg) || 0,
        max_washes_per_month: maxWashes,

        quota_kg_total: sub.quota_kg_total !== null ? Number(sub.quota_kg_total) : null,
        quota_kg_used: Number(sub.quota_kg_used) || 0
      };

      // ==========================================
      // MONTHLY USAGE HISTORY
      // ==========================================
      const startObj = new Date(sub.start_date || sub.created_at);
      const endObj = sub.end_date ? new Date(sub.end_date) : null;

      if (!isNaN(startObj.getTime())) {
        const months = [];
        const cursor = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
        const last = endObj && !isNaN(endObj.getTime())
          ? new Date(endObj.getFullYear(), endObj.getMonth(), 1)
          : new Date(startObj.getFullYear(), startObj.getMonth() + 11, 1);

        while (cursor <= last && months.length < 24) {
          months.push(new Date(cursor));
          cursor.setMonth(cursor.getMonth() + 1);
        }

        let usageMap = {};
        let usageFromOrders = true;

        try {
          const rangeStart = new Date(startObj.getFullYear(), startObj.getMonth(), 1);

          const [usageRows] = await db.query(
            `
            SELECT
              DATE_FORMAT(${ORDERS.createdAt}, '%Y-%m') AS ym,
              COALESCE(SUM(${ORDERS.weightKg}), 0) AS used_kg,
              COUNT(*) AS washes
            FROM ${ORDERS.table}
            WHERE ${ORDERS.studentId} = ?
              AND ${ORDERS.createdAt} >= ?
            GROUP BY ym
            `,
            [id, rangeStart]
          );

          usageRows.forEach(r => {
            usageMap[r.ym] = {
              used_kg: Number(r.used_kg) || 0,
              washes: Number(r.washes) || 0
            };
          });
        } catch (err) {
          usageFromOrders = false;
          console.warn('Customer usage history (orders) failed:', err.sqlMessage || err.message);
        }

        const currentKey = ymKey(new Date());

        usageHistory = months.map((m, index) => {
          const key = ymKey(m);

          let used = 0;
          let washes = 0;

          if (usageFromOrders) {
            used = usageMap[key] ? usageMap[key].used_kg : 0;
            washes = usageMap[key] ? usageMap[key].washes : 0;
          } else if (key === currentKey) {
            used = Number(sub.quota_kg_used) || 0;
          }

          const extra = Math.max(used - monthlyQuota, 0);

          return {
            sr_no: index + 1,
            month: monthLabel(m),
            monthly_quota_kg: monthlyQuota,
            used_kg: used,
            remaining_kg: Math.max(monthlyQuota - used, 0),
            washes_used: washes,
            max_washes: maxWashes,
            washes_label: `${washes} / ${maxWashes}`,
            extra_payg_kg: extra,
            payg_amount: null,
            is_current_month: key === currentKey
          };
        });
      }
    }

    // ==========================================
    // RESPONSE
    // ==========================================
    const addressParts = [
      s.room_number ? `Room No. ${s.room_number}` : null,
      s.hostel_name,
      s.campus_name,
      s.area,
      s.address
    ].filter(Boolean);

    return res.status(200).json({
      status: true,
      message: 'Customer details fetched successfully',
      data: {
        id: s.id,
        customer_id: s.customer_id,
        full_name: s.full_name,
        profile_image: imageUrl(s.profile_image),

        // ✅ status ab is_active se
        status: s.is_active == 1 ? 'Active' : 'Inactive',
        status_raw: s.student_status,
        is_active: Number(s.is_active) || 0,

        role: s.role,
        gender: s.gender,
        customer_type_label: customerTypeLabel(s.role, s.gender),

        phone: s.phone,
        email: null,
        registered_on: formatDate(s.created_at),
        registered_on_raw: s.created_at,

        campus_id: s.campus_id,
        campus_name: s.campus_name,
        outlet_id: s.outlet_id,
        outlet_name: s.outlet_name,
        full_address: addressParts.join(', '),

        roll_number: s.roll_number,
        course: s.course,
        hostel_name: s.hostel_name,
        room_number: s.room_number,
        address: s.address,
        area: s.area,
        pin_code: s.pin_code,
        permanent_qr: s.permanent_qr,

        has_subscription: !!sub,
        subscription,

        usage_history: usageHistory
      }
    });

  } catch (error) {
    console.error('Get Customer Details Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch customer details'
    });
  }
};

// ==========================================================
// CUSTOMER (ek hi API: id ho to details, warna list)
// ==========================================================
const getCustomer = async (req, res) => {
  try {
    const id = req.params.id || req.query.id;

    if (id) {
      req.params.id = id;
      return await getCustomerDetails(req, res);
    }

    return await getCustomerList(req, res);

  } catch (error) {
    console.error('Get Customer Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch customer data'
    });
  }
};



// // ==========================================================
// // CUSTOMER LIST
// // ==========================================================
// const getCustomerList = async (req, res) => {
//   try {
//     const {
//       campus_id,
//       outlet_id,
//       customer_type = 'all',              // all | student | non_student
//       subscription_status = 'all',        // all | subscribed | non_subscribed | expired | <plan name> | <plan id>
//       status = 'all',                     // all | active | inactive | expired | suspended (ya raw value)
//       search = '',
//       page = 1,
//       limit = 10
//     } = req.query;

//     const pageNumber = Math.max(parseInt(page) || 1, 1);
//     const limitNumber = Math.max(parseInt(limit) || 10, 1);
//     const offset = (pageNumber - 1) * limitNumber;

//     const STATUS_MAP = CUSTOMER_STATUS_MAP;

//     const STATUS_KEY_TO_RAW = {
//       active: 'ACTIVE_SUBSCRIBED',
//       inactive: 'REGISTERED_INACTIVE',
//       expired: 'EXPIRED',
//       suspended: 'SUSPENDED'
//     };

//     const fromSQL = `
//       FROM students s
//       LEFT JOIN outlets o ON o.id = s.outlet_id
//       LEFT JOIN campuses c ON c.id = s.campus_id
//       LEFT JOIN student_subscriptions ss
//         ON ss.id = (
//           SELECT ss2.id
//           FROM student_subscriptions ss2
//           WHERE ss2.student_id = s.id
//           ORDER BY (ss2.status = 'ACTIVE') DESC, ss2.created_at DESC, ss2.id DESC
//           LIMIT 1
//         )
//       LEFT JOIN subscription_plans p ON p.id = ss.plan_id
//     `;

//     const subStatusExpr = `
//       (CASE
//         WHEN ss.id IS NULL THEN 'Non-Subscribed'
//         WHEN ss.status = 'ACTIVE'
//              AND (ss.end_date IS NULL OR DATE(ss.end_date) >= CURDATE())
//           THEN 'Subscribed'
//         ELSE 'Expired'
//       END)
//     `;

//     // BASE WHERE (campus + outlet)
//     let baseWhere = `WHERE 1=1`;
//     const baseParams = [];

//     if (campus_id) {
//       baseWhere += ` AND s.campus_id = ?`;
//       baseParams.push(campus_id);
//     }

//     if (outlet_id) {
//       baseWhere += ` AND s.outlet_id = ?`;
//       baseParams.push(outlet_id);
//     }

//     // LIST WHERE
//     let where = baseWhere;
//     const params = [...baseParams];

//     if (customer_type === 'student') {
//       where += ` AND s.role = 'STUDENT'`;
//     } else if (customer_type === 'non_student') {
//       where += ` AND s.role = 'NON_STUDENT'`;
//     }

//     if (String(search).trim() !== '') {
//       const searchValue = `%${String(search).trim()}%`;

//       where += `
//         AND (
//           s.full_name LIKE ?
//           OR s.phone LIKE ?
//           OR CONCAT('IWO', LPAD(s.id, 5, '0')) LIKE ?
//         )
//       `;
//       params.push(searchValue, searchValue, searchValue);
//     }

//     // Subscription filter (status + plan wise)
//     const subFilter = String(subscription_status).trim();
//     const subFilterKey = subFilter.toLowerCase();
//     const SUB_STATUS_KEYS = ['', 'all', 'subscribed', 'non_subscribed', 'expired'];

//     if (subFilterKey === 'subscribed') {
//       where += ` AND ${subStatusExpr} = 'Subscribed'`;
//     } else if (subFilterKey === 'non_subscribed') {
//       where += ` AND ${subStatusExpr} = 'Non-Subscribed'`;
//     } else if (subFilterKey === 'expired') {
//       where += ` AND ${subStatusExpr} = 'Expired'`;
//     } else if (!SUB_STATUS_KEYS.includes(subFilterKey)) {
//       if (/^\d+$/.test(subFilter)) {
//         where += ` AND p.id = ?`;
//         params.push(Number(subFilter));
//       } else {
//         where += ` AND LOWER(TRIM(p.plan_name)) = LOWER(TRIM(?))`;
//         params.push(subFilter);
//       }
//       where += ` AND ${subStatusExpr} = 'Subscribed'`;
//     }

//     // Status filter (students.status)
//     const statusInput = String(status).trim();
//     const statusKey = statusInput.toLowerCase();

//     if (statusKey !== '' && statusKey !== 'all') {
//       const statusRaw = STATUS_KEY_TO_RAW[statusKey] || statusInput.toUpperCase();

//       if (!STATUS_MAP[statusRaw]) {
//         return res.status(400).json({
//           status: false,
//           message: 'status must be one of: all, active, inactive, expired, suspended'
//         });
//       }

//       where += ` AND s.status = ?`;
//       params.push(statusRaw);
//     }

//     // STATS
//     const [statsRows] = await db.query(
//       `
//       SELECT
//         COUNT(*) AS total_customers,
//         SUM(CASE WHEN s.status = 'ACTIVE_SUBSCRIBED' THEN 1 ELSE 0 END) AS active_customers,
//         SUM(CASE WHEN s.status = 'REGISTERED_INACTIVE' THEN 1 ELSE 0 END) AS inactive_customers,
//         SUM(CASE WHEN s.status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired_customers,
//         SUM(CASE WHEN s.status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended_customers,
//         SUM(CASE WHEN ${subStatusExpr} = 'Subscribed' THEN 1 ELSE 0 END) AS active_subscriptions,
//         SUM(CASE WHEN ${subStatusExpr} = 'Subscribed' THEN COALESCE(ss.quota_kg_used, 0) ELSE 0 END) AS total_wash_used_kg
//       ${fromSQL}
//       ${baseWhere}
//       `,
//       baseParams
//     );

//     const totalCustomers = Number(statsRows[0].total_customers) || 0;
//     const activeCustomers = Number(statsRows[0].active_customers) || 0;
//     const activeSubscriptions = Number(statsRows[0].active_subscriptions) || 0;

//     const percent = (value) =>
//       totalCustomers > 0 ? Math.round((value / totalCustomers) * 100) : 0;

//     const stats = {
//       total_customers: totalCustomers,
//       active_customers: activeCustomers,
//       active_customers_percent: percent(activeCustomers),
//       inactive_customers: Number(statsRows[0].inactive_customers) || 0,
//       expired_customers: Number(statsRows[0].expired_customers) || 0,
//       suspended_customers: Number(statsRows[0].suspended_customers) || 0,
//       active_subscriptions: activeSubscriptions,
//       active_subscriptions_percent: percent(activeSubscriptions),
//       total_wash_used_kg: Number(statsRows[0].total_wash_used_kg) || 0
//     };

//     // TOTAL COUNT
//     const [countResult] = await db.query(
//       `SELECT COUNT(*) AS total ${fromSQL} ${where}`,
//       params
//     );
//     const total = Number(countResult[0].total) || 0;

//     // CUSTOMER LIST
//     const [customers] = await db.query(
//       `
//       SELECT
//         s.id,
//         CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
//         s.full_name,
//         s.phone,
//         s.profile_image,
//         s.role,
//         s.gender,
//         s.status AS student_status,
//         s.campus_id,
//         c.name AS campus_name,
//         s.outlet_id,
//         o.name AS outlet_name,
//         s.roll_number,
//         s.course,
//         s.hostel_name,
//         s.room_number,
//         s.address,
//         s.area,
//         s.pin_code,
//         s.permanent_qr,
//         s.created_at,

//         ${subStatusExpr} AS subscription_status,

//         ss.id AS subscription_id,
//         p.id AS plan_id,
//         p.plan_name,
//         p.monthly_wash_limit_kg,
//         p.maximum_weight_per_order_kg,
//         p.wash_per_month,
//         ss.end_date AS valid_till,
//         ss.quota_kg_total,
//         COALESCE(ss.quota_kg_used, 0) AS used_kg

//       ${fromSQL}
//       ${where}
//       ORDER BY s.id DESC
//       LIMIT ? OFFSET ?
//       `,
//       [...params, limitNumber, offset]
//     );

//     // DROPDOWN DATA
//     const [campusRows] = await db.query(
//       `SELECT id, name FROM campuses ORDER BY name ASC`
//     );

//     const [outletRows] = campus_id
//       ? await db.query(
//           `SELECT id, name, campus_id FROM outlets WHERE campus_id = ? ORDER BY name ASC`,
//           [campus_id]
//         )
//       : await db.query(
//           `SELECT id, name, campus_id FROM outlets ORDER BY name ASC`
//         );

//     const [planRows] = await db.query(
//       `SELECT id, plan_name FROM subscription_plans ORDER BY plan_name ASC`
//     );

//     const subscriptionOptions = [
//       { value: 'all', label: 'All Subscription Status', type: 'status' },
//       { value: 'subscribed', label: 'Subscribed', type: 'status' },
//       { value: 'non_subscribed', label: 'Non-Subscribed', type: 'status' },
//       { value: 'expired', label: 'Expired', type: 'status' },
//       ...planRows.map(pl => ({
//         value: pl.plan_name,
//         label: pl.plan_name,
//         plan_id: pl.id,
//         type: 'plan'
//       }))
//     ];

//     const statusOptions = [
//       { value: 'all', label: 'All Status' },
//       { value: 'active', label: 'Active', raw: 'ACTIVE_SUBSCRIBED' },
//       { value: 'inactive', label: 'Inactive', raw: 'REGISTERED_INACTIVE' },
//       { value: 'expired', label: 'Expired', raw: 'EXPIRED' },
//       { value: 'suspended', label: 'Suspended', raw: 'SUSPENDED' }
//     ];

//     // FORMAT
//     const imageUrl = (image) =>
//       image ? `https://instawash.siberiancrane.tech/uploads/${image}` : null;

//     const customerTypeLabel = (role, gender) => {
//       if (role === 'NON_STUDENT') return 'Non-Student';
//       const g = String(gender || '').toLowerCase();
//       if (g === 'female') return 'Female Student';
//       if (g === 'male') return 'Male Student';
//       return 'Student';
//     };

//     const customerData = customers.map((item, index) => {
//       const hasPlan = !!item.subscription_id;
//       const monthlyKg = Number(item.monthly_wash_limit_kg) || 0;
//       const quotaTotal = item.quota_kg_total !== null && item.quota_kg_total !== undefined
//         ? Number(item.quota_kg_total)
//         : monthlyKg;
//       const usedKg = Number(item.used_kg) || 0;

//       return {
//         sr_no: offset + index + 1,

//         id: item.id,
//         customer_id: item.customer_id,
//         full_name: item.full_name,
//         phone: item.phone,
//         profile_image: imageUrl(item.profile_image),

//         role: item.role,
//         gender: item.gender,
//         customer_type_label: customerTypeLabel(item.role, item.gender),

//         campus_id: item.campus_id,
//         campus_name: item.campus_name,
//         outlet_id: item.outlet_id,
//         outlet_name: item.outlet_name,

//         roll_number: item.roll_number,
//         course: item.course,
//         hostel_name: item.hostel_name,
//         room_number: item.room_number,
//         address: item.address,
//         area: item.area,
//         pin_code: item.pin_code,
//         permanent_qr: item.permanent_qr,

//         subscription_status: item.subscription_status,
//         subscription_label: hasPlan ? item.plan_name : 'No Subscription',
//         plan_id: item.plan_id || null,

//         plan_limits: hasPlan
//           ? {
//               monthly_kg: monthlyKg,
//               max_kg_per_order: Number(item.maximum_weight_per_order_kg) || 0,
//               max_times_per_month: Number(item.wash_per_month) || 0
//             }
//           : null,

//         valid_till: hasPlan ? item.valid_till : null,
//         quota_kg_total: hasPlan ? quotaTotal : 0,
//         used_kg: usedKg,
//         remaining_kg: hasPlan ? Math.max(quotaTotal - usedKg, 0) : 0,

//         status: STATUS_MAP[item.student_status] || item.student_status,
//         status_raw: item.student_status,

//         created_at: item.created_at
//       };
//     });

//     return res.status(200).json({
//       status: true,
//       message: 'Customer list fetched successfully',
//       data: {
//         stats,
//         customers: customerData,
//         pagination: {
//           page: pageNumber,
//           limit: limitNumber,
//           total,
//           total_pages: Math.ceil(total / limitNumber),
//           showing_from: total === 0 ? 0 : offset + 1,
//           showing_to: Math.min(offset + limitNumber, total)
//         },
//         filters: {
//           campuses: campusRows,
//           outlets: outletRows,
//           subscription_options: subscriptionOptions,
//           status_options: statusOptions
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Get Customer List Error:', error);
//     return res.status(500).json({
//       status: false,
//       message: 'Failed to fetch customer list'
//     });
//   }
// };

// // ==========================================================
// // CUSTOMER DETAILS
// // ==========================================================
// const getCustomerDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!id || !/^\d+$/.test(String(id))) {
//       return res.status(400).json({
//         status: false,
//         message: 'Valid customer id is required'
//       });
//     }

//     // ==========================================
//     // CUSTOMER + CAMPUS + OUTLET
//     // ==========================================
//     const [rows] = await db.query(
//       `
//       SELECT
//         s.id,
//         CONCAT('IWO', LPAD(s.id, 5, '0')) AS customer_id,
//         s.full_name,
//         s.phone,
//         s.profile_image,
//         s.role,
//         s.gender,
//         s.status AS student_status,
//         s.campus_id,
//         c.name AS campus_name,
//         s.outlet_id,
//         o.name AS outlet_name,
//         s.roll_number,
//         s.course,
//         s.hostel_name,
//         s.room_number,
//         s.address,
//         s.area,
//         s.pin_code,
//         s.permanent_qr,
//         s.created_at
//       FROM students s
//       LEFT JOIN campuses c ON c.id = s.campus_id
//       LEFT JOIN outlets o ON o.id = s.outlet_id
//       WHERE s.id = ?
//       LIMIT 1
//       `,
//       [id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({
//         status: false,
//         message: 'Customer not found'
//       });
//     }

//     const s = rows[0];

//     // ==========================================
//     // SUBSCRIPTION (active ho to wahi, warna latest)
//     // ==========================================
//     const [subRows] = await db.query(
//       `
//       SELECT
//         ss.id,
//         ss.plan_id,
//         ss.start_date,
//         ss.end_date,
//         ss.quota_kg_total,
//         ss.quota_kg_used,
//         ss.status,
//         ss.created_at,
//         p.plan_name,
//         p.plan_code,
//         p.plan_type,
//         p.description,
//         p.original_annual_price,
//         p.monthly_wash_limit_kg,
//         p.wash_per_month,
//         p.maximum_weight_per_order_kg
//       FROM student_subscriptions ss
//       LEFT JOIN subscription_plans p ON p.id = ss.plan_id
//       WHERE ss.student_id = ?
//       ORDER BY (ss.status = 'ACTIVE') DESC, ss.created_at DESC, ss.id DESC
//       LIMIT 1
//       `,
//       [id]
//     );

//     const sub = subRows[0] || null;

//     // ==========================================
//     // HELPERS
//     // ==========================================
//     const formatDate = (value) => {
//       if (!value) return null;
//       const d = new Date(value);
//       if (isNaN(d.getTime())) return null;
//       return d.toLocaleDateString('en-GB', {
//         day: '2-digit',
//         month: 'short',
//         year: 'numeric'
//       }); // 12 Feb 2024
//     };

//     const monthLabel = (d) =>
//       d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); // October 2026

//     const ymKey = (d) =>
//       `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

//     const imageUrl = (image) =>
//       image ? `https://instawash.siberiancrane.tech/uploads/${image}` : null;

//     const customerTypeLabel = (role, gender) => {
//       if (role === 'NON_STUDENT') return 'Non-Student';
//       const g = String(gender || '').toLowerCase();
//       if (g === 'female') return 'Female Student';
//       if (g === 'male') return 'Male Student';
//       return 'Student';
//     };

//     // ==========================================
//     // SUBSCRIPTION OVERVIEW
//     // ==========================================
//     let subscription = null;
//     let usageHistory = [];

//     if (sub) {
//       const isRunning =
//         sub.status === 'ACTIVE' &&
//         (!sub.end_date || new Date(sub.end_date) >= new Date(new Date().toDateString()));

//       const monthlyQuota = Number(sub.monthly_wash_limit_kg) || 0;
//       const maxWashes = Number(sub.wash_per_month) || 0;
//       const originalPrice = sub.original_annual_price !== null
//         ? Number(sub.original_annual_price)
//         : null;

//       const purchaseDate = sub.start_date || sub.created_at;
//       const purchaseDateObj = purchaseDate ? new Date(purchaseDate) : null;

//       subscription = {
//         subscription_id: sub.id,
//         plan_id: sub.plan_id,
//         plan_name: sub.plan_name,
//         plan_code: sub.plan_code,
//         plan_type: sub.plan_type,
//         description: sub.description,
//         status: isRunning ? 'Active' : 'Expired',
//         valid_till: formatDate(sub.end_date),
//         valid_till_raw: sub.end_date,

//         purchase_date: formatDate(purchaseDate),
//         purchase_month: purchaseDateObj && !isNaN(purchaseDateObj.getTime())
//           ? purchaseDateObj.toLocaleDateString('en-GB', { month: 'long' })
//           : null,

//         original_price: originalPrice,
//         // schema me discount/paid amount nahi mila, payments table se jodna padega
//         discount_percent: null,
//         discount_amount: null,
//         paid_amount: null,

//         monthly_quota_kg: monthlyQuota,
//         max_kg_per_order: Number(sub.maximum_weight_per_order_kg) || 0,
//         max_washes_per_month: maxWashes,

//         quota_kg_total: sub.quota_kg_total !== null ? Number(sub.quota_kg_total) : null,
//         quota_kg_used: Number(sub.quota_kg_used) || 0
//       };

//       // ==========================================
//       // MONTHLY USAGE HISTORY (subscription start se end tak)
//       // ==========================================
//       const startObj = new Date(sub.start_date || sub.created_at);
//       const endObj = sub.end_date ? new Date(sub.end_date) : null;

//       if (!isNaN(startObj.getTime())) {
//         // Month list banao (max 24 months)
//         const months = [];
//         const cursor = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
//         const last = endObj && !isNaN(endObj.getTime())
//           ? new Date(endObj.getFullYear(), endObj.getMonth(), 1)
//           : new Date(startObj.getFullYear(), startObj.getMonth() + 11, 1);

//         while (cursor <= last && months.length < 24) {
//           months.push(new Date(cursor));
//           cursor.setMonth(cursor.getMonth() + 1);
//         }

//         // Orders se month wise used kg + washes
//         let usageMap = {};
//         let usageFromOrders = true;

//         try {
//           const rangeStart = new Date(startObj.getFullYear(), startObj.getMonth(), 1);

//           const [usageRows] = await db.query(
//             `
//             SELECT
//               DATE_FORMAT(${ORDERS.createdAt}, '%Y-%m') AS ym,
//               COALESCE(SUM(${ORDERS.weightKg}), 0) AS used_kg,
//               COUNT(*) AS washes
//             FROM ${ORDERS.table}
//             WHERE ${ORDERS.studentId} = ?
//               AND ${ORDERS.createdAt} >= ?
//             GROUP BY ym
//             `,
//             [id, rangeStart]
//           );

//           usageRows.forEach(r => {
//             usageMap[r.ym] = {
//               used_kg: Number(r.used_kg) || 0,
//               washes: Number(r.washes) || 0
//             };
//           });
//         } catch (err) {
//           // orders ke column naam alag hon to API crash na ho
//           usageFromOrders = false;
//           console.warn('Customer usage history (orders) failed:', err.sqlMessage || err.message);
//         }

//         const currentKey = ymKey(new Date());

//         usageHistory = months.map((m, index) => {
//           const key = ymKey(m);

//           let used = 0;
//           let washes = 0;

//           if (usageFromOrders) {
//             used = usageMap[key] ? usageMap[key].used_kg : 0;
//             washes = usageMap[key] ? usageMap[key].washes : 0;
//           } else if (key === currentKey) {
//             // fallback: sirf current month, subscription ke quota_kg_used se
//             used = Number(sub.quota_kg_used) || 0;
//           }

//           const extra = Math.max(used - monthlyQuota, 0);

//           return {
//             sr_no: index + 1,
//             month: monthLabel(m),
//             monthly_quota_kg: monthlyQuota,
//             used_kg: used,
//             remaining_kg: Math.max(monthlyQuota - used, 0),
//             washes_used: washes,
//             max_washes: maxWashes,
//             washes_label: `${washes} / ${maxWashes}`,
//             extra_payg_kg: extra,
//             // PAYG rate/amount ka source (pay_as_you_go ya payments) pata nahi, isliye null
//             payg_amount: null,
//             is_current_month: key === currentKey
//           };
//         });
//       }
//     }

//     // ==========================================
//     // RESPONSE
//     // ==========================================
//     const addressParts = [
//       s.room_number ? `Room No. ${s.room_number}` : null,
//       s.hostel_name,
//       s.campus_name,
//       s.area,
//       s.address
//     ].filter(Boolean);

//     return res.status(200).json({
//       status: true,
//       message: 'Customer details fetched successfully',
//       data: {
//         // Header
//         id: s.id,
//         customer_id: s.customer_id,
//         full_name: s.full_name,
//         profile_image: imageUrl(s.profile_image),
//         status: CUSTOMER_STATUS_MAP[s.student_status] || s.student_status,
//         status_raw: s.student_status,
//         role: s.role,
//         gender: s.gender,
//         customer_type_label: customerTypeLabel(s.role, s.gender),

//         // Contact
//         phone: s.phone,
//         email: null, // students table me email column nahi hai
//         registered_on: formatDate(s.created_at),
//         registered_on_raw: s.created_at,

//         // Campus / Outlet / Address
//         campus_id: s.campus_id,
//         campus_name: s.campus_name,
//         outlet_id: s.outlet_id,
//         outlet_name: s.outlet_name,
//         full_address: addressParts.join(', '),

//         roll_number: s.roll_number,
//         course: s.course,
//         hostel_name: s.hostel_name,
//         room_number: s.room_number,
//         address: s.address,
//         area: s.area,
//         pin_code: s.pin_code,
//         permanent_qr: s.permanent_qr,

//         // Subscription Overview
//         has_subscription: !!sub,
//         subscription,

//         // Monthly Usage History
//         usage_history: usageHistory
//       }
//     });

//   } catch (error) {
//     console.error('Get Customer Details Error:', error);
//     return res.status(500).json({
//       status: false,
//       message: 'Failed to fetch customer details'
//     });
//   }
// };

// // ==========================================================
// // CUSTOMER (ek hi API: id ho to details, warna list)
// // ==========================================================
// const getCustomer = async (req, res) => {
//   try {
//     // id URL se (/customers/12) ya query se (/customers?id=12)
//     const id = req.params.id || req.query.id;

//     if (id) {
//       req.params.id = id;
//       return await getCustomerDetails(req, res);
//     }

//     return await getCustomerList(req, res);

//   } catch (error) {
//     console.error('Get Customer Error:', error);
//     return res.status(500).json({
//       status: false,
//       message: 'Failed to fetch customer data'
//     });
//   }
// };
// // ==========================================================

// ==========================================================
// UPDATE CUSTOMER STATUS (Active/Inactive Toggle)
// Route: PUT /api/customers/:id/status
// Body: { "is_active": 1 } ya { "is_active": 0 }
// ==========================================================
const updateCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // 1. Validation
        if (id === undefined || id === null || id === '') {
            return res.status(400).json({
                status: false,
                message: 'Customer ID is required'
            });
        }

        if (is_active === undefined || is_active === null) {
            return res.status(400).json({
                status: false,
                message: 'is_active is required (0 or 1)'
            });
        }

        // Accept: 0, 1, true, false, "0", "1"
        const normalized = Number(is_active);
        if (![0, 1].includes(normalized)) {
            return res.status(400).json({
                status: false,
                message: 'is_active must be 0 or 1'
            });
        }

        // 2. Check student exists
        const [existing] = await db.query(
            `SELECT id, full_name, is_active, status FROM students WHERE id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Customer not found'
            });
        }

        // 3. Agar already same value hai toh skip (optional)
        if (Number(existing[0].is_active) === normalized) {
            return res.status(200).json({
                status: true,
                message: `Customer is already ${normalized === 1 ? 'Active' : 'Inactive'}`,
                data: {
                    id: existing[0].id,
                    full_name: existing[0].full_name,
                    is_active: normalized,
                    status: normalized === 1 ? 'Active' : 'Inactive',
                    status_raw: existing[0].status
                }
            });
        }

        // 4. Update
        await db.query(
            `UPDATE students SET is_active = ? WHERE id = ?`,
            [normalized, id]
        );

        // 5. Response
        return res.status(200).json({
            status: true,
            message: `Customer ${normalized === 1 ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: existing[0].id,
                full_name: existing[0].full_name,
                is_active: normalized,
                status: normalized === 1 ? 'Active' : 'Inactive',
                status_raw: existing[0].status
            }
        });

    } catch (error) {
        console.error('Update Customer Status Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to update customer status',
            error: error.message
        });
    }
};

// ==========================================================
// STAFF LIST
// ==========================================================
const getStaffList = async (req, res) => {
  try {
    const {
      campus_id,
      outlet_id,
      status = 'all',            // all | active | inactive | 1 | 0
      search = '',
      sort_by = 'created',       // name | staff_id | campus | outlet | status | created
      sort_order = 'desc',       // asc | desc
      page = 1,
      limit = 10
    } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.max(parseInt(limit) || 10, 1);
    const offset = (pageNumber - 1) * limitNumber;

    // STATUS normalize + validate
    let statusValue = null; // 1 | 0 | null
    const statusKey = String(status).trim().toLowerCase();

    if (statusKey !== '' && statusKey !== 'all') {
      if (statusKey === 'active' || statusKey === '1') statusValue = 1;
      else if (statusKey === 'inactive' || statusKey === '0') statusValue = 0;
      else {
        return res.status(400).json({
          status: false,
          message: 'status must be one of: all, active, inactive'
        });
      }
    }

    // SORT (whitelist)
    const SORT_MAP = {
      name: 'u.name',
      staff_id: 'u.staff_id',
      campus: 'c.name',
      outlet: 'o.name',
      status: 'u.is_active',
      created: 'u.id'
    };
    const sortColumn = SORT_MAP[String(sort_by).toLowerCase()] || SORT_MAP.created;
    const sortDirection = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // BASE WHERE (role + campus + outlet)
    let baseWhere = `WHERE u.role = 'Laundry Staff'`;
    const baseParams = [];

    if (campus_id) {
      baseWhere += ` AND u.campus_id = ?`;
      baseParams.push(campus_id);
    }

    if (outlet_id) {
      baseWhere += ` AND u.outlet_id = ?`;
      baseParams.push(outlet_id);
    }

    // LIST WHERE (base + search + status)
    let where = baseWhere;
    const params = [...baseParams];

    if (String(search).trim() !== '') {
      const searchValue = `%${String(search).trim()}%`;

      where += `
        AND (
          u.name LIKE ?
          OR u.staff_id LIKE ?
        )
      `;
      params.push(searchValue, searchValue);
    }

    if (statusValue !== null) {
      where += ` AND u.is_active = ?`;
      params.push(statusValue);
    }

    // STATS (campus/outlet ke hisaab se, search/status se nahi)
    const [statsRows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) AS inactive,
        COUNT(DISTINCT u.outlet_id) AS assigned_outlets
      FROM users u
      ${baseWhere}
      `,
      baseParams
    );

    const stats = {
      total_staff: Number(statsRows[0].total) || 0,
      active_staff: Number(statsRows[0].active) || 0,
      inactive_staff: Number(statsRows[0].inactive) || 0,
      assigned_outlets: Number(statsRows[0].assigned_outlets) || 0
    };

    // TOTAL COUNT (filters ke baad)
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params
    );
    const total = Number(countRows[0].total) || 0;

    // STAFF LIST
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
        c.name AS campus_name,
        u.outlet_id,
        o.name AS outlet_name,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN outlets o ON o.id = u.outlet_id
      LEFT JOIN campuses c ON c.id = u.campus_id
      ${where}
      ORDER BY ${sortColumn} ${sortDirection}, u.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset]
    );

    // DROPDOWN DATA
    const [campusRows] = await db.query(
      `SELECT id, name FROM campuses ORDER BY name ASC`
    );

    const [outletRows] = campus_id
      ? await db.query(
          `SELECT id, name, campus_id FROM outlets WHERE campus_id = ? ORDER BY name ASC`,
          [campus_id]
        )
      : await db.query(
          `SELECT id, name, campus_id FROM outlets ORDER BY name ASC`
        );

    const statusOptions = [
      { value: 'all', label: 'All Status' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ];

    // FORMAT
    const safeJson = (value, fallback) => {
      if (value === null || value === undefined || value === '') return fallback;
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch (e) { return fallback; }
    };

    const staffList = staff.map((item, index) => ({
      sr_no: offset + index + 1,

      ...item,

      permissions: safeJson(item.permissions, []),

      image: item.image
        ? `https://instawash.siberiancrane.tech/uploads/${item.image}`
        : null,

      status: Number(item.is_active) === 1 ? 'Active' : 'Inactive'
    }));

    // RESPONSE
    return res.status(200).json({
      status: true,
      message: 'Staff list fetched successfully',
      data: {
        stats,
        count: {
          total: stats.total_staff,
          active: stats.active_staff,
          inactive: stats.inactive_staff
        },
        staff: staffList,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          total_pages: Math.ceil(total / limitNumber),
          showing_from: total === 0 ? 0 : offset + 1,
          showing_to: Math.min(offset + limitNumber, total),
          has_next_page: pageNumber < Math.ceil(total / limitNumber),
          has_prev_page: pageNumber > 1
        },
        filters: {
          campuses: campusRows,
          outlets: outletRows,
          status_options: statusOptions
        }
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

// ==========================================================
// STAFF DETAILS
// ==========================================================
const getStaffDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({
        status: false,
        message: 'Valid staff id is required'
      });
    }

    // STAFF + CAMPUS + OUTLET
    const [rows] = await db.query(
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
        c.name AS campus_name,
        u.outlet_id,
        o.name AS outlet_name,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN campuses c ON c.id = u.campus_id
      LEFT JOIN outlets o ON o.id = u.outlet_id
      WHERE u.id = ?
        AND u.role = 'Laundry Staff'
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'Staff not found'
      });
    }

    const staff = rows[0];

    // REPORTING TO (outlet ka active Outlet Manager)
    let reportingTo = null;

    if (staff.outlet_id) {
      const [managerRows] = await db.query(
        `
        SELECT u.id, u.name, u.staff_id, u.phone
        FROM user_outlets uo
        INNER JOIN users u ON u.id = uo.user_id
        WHERE uo.outlet_id = ?
          AND u.is_active = 1
        ORDER BY u.id ASC
        LIMIT 1
        `,
        [staff.outlet_id]
      );

      if (managerRows.length > 0) {
        const m = managerRows[0];
        reportingTo = {
          id: m.id,
          name: m.name,
          staff_id: m.staff_id,
          phone: m.phone,
          designation: 'Outlet Manager',
          label: `${m.name} (Outlet Manager)`
        };
      }
    }

    // PERMISSIONS
    const safeJson = (value, fallback) => {
      if (value === null || value === undefined || value === '') return fallback;
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch (e) { return fallback; }
    };

    const ROLE_ACCESS_MAP = {
      'Laundry Staff': ['Manage laundry orders (Received → In Wash → Ready)']
    };

    const permissionCodes = safeJson(staff.permissions, []);
    const permissionList = Array.isArray(permissionCodes) ? permissionCodes : [];
    const accessList = ROLE_ACCESS_MAP[staff.role] || [];

    // FORMAT
    const isActive = Number(staff.is_active) === 1;

    const formatDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    const initials = String(staff.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');

    const joiningDate = staff.joining_date || staff.created_at;

    const data = {
      // Header
      id: staff.id,
      name: staff.name,
      initials,
      image: staff.image
        ? `https://instawash.siberiancrane.tech/uploads/${staff.image}`
        : null,
      staff_id: staff.staff_id,
      status: isActive ? 'Active' : 'Inactive',
      is_active: Number(staff.is_active),
      working_status: isActive ? 'Currently Working' : 'Not Working',
      staff_since: formatDate(joiningDate)
        ? `Staff member since ${formatDate(joiningDate)}`
        : null,

      // Basic Information
      basic_information: {
        full_name: staff.name,
        employee_id: staff.staff_id,
        phone: staff.phone,
        email: staff.email,
        joining_date: formatDate(joiningDate),
        joining_date_raw: joiningDate,
        status: isActive ? 'Active' : 'Inactive',
        dob: staff.dob,
        address: staff.address,
        remarks: staff.remarks
      },

      // Assignment Information
      assignment_information: {
        campus_id: staff.campus_id,
        campus: staff.campus_name,
        outlet_id: staff.outlet_id,
        outlet: staff.outlet_name,
        reporting_to: reportingTo ? reportingTo.label : null,
        reporting_to_details: reportingTo
      },

      // Permissions & Access
      permissions_access: {
        role: staff.role,
        role_id: staff.role_id,
        max_discount_percent: Number(staff.max_discount_percent) || 0,
        permission_codes: permissionList,
        access: accessList
      },

      created_at: staff.created_at,
      updated_at: staff.updated_at
    };

    return res.status(200).json({
      status: true,
      message: 'Staff details fetched successfully',
      data
    });

  } catch (error) {
    console.error('Get Staff Details Error:', error);

    return res.status(500).json({
      status: false,
      message: 'Failed to fetch staff details'
    });
  }
};

// ==========================================================
// STAFF (ek hi API: id ho to details, warna list)
// ==========================================================
const getStaff = async (req, res) => {
  try {
    // id URL se (/staff/12) ya query se (/staff?id=12) dono chalegi
    const id = req.params.id || req.query.id;

    if (id) {
      req.params.id = id;
      return await getStaffDetails(req, res);
    }

    return await getStaffList(req, res);

  } catch (error) {
    console.error('Get Staff Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch staff data'
    });
  }
};


// ==================================================
// Helper: Build Machine Image URL
// ==================================================
const buildMachineImageUrl = (image) => {
    if (!image) return null;
    if (image.startsWith('http')) return image;
    return `https://instawash.siberiancrane.tech/uploads/${image}`;
};


// ==================================================
// GET MACHINES (List + Detail Combined)
// ==================================================
const getMachines = async (req, res) => {
    try {
        const { outletId } = req.params;

        if (outletId) {
            return await getMachineDetail(req, res);
        }

        return await getMachineList(req, res);

    } catch (error) {
        console.error('❌ Get Machines Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch machines'
        });
    }
};


// ==================================================
// LIST MODE — Outlet-wise Summary (Screenshot 2)
// ==================================================
const getMachineList = async (req, res) => {
    try {
        const {
            search,
            campus_id,
            outlet_id,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // ==================================================
        // 🆕 Clean Params — empty string / null / undefined sab handle
        // ==================================================
        const cleanString = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).trim();
            if (s === '' || s === 'null' || s === 'undefined') return null;
            return s;
        };

        const cleanNumber = (val) => {
            const s = cleanString(val);
            if (s === null) return null;
            const n = Number(s);
            if (isNaN(n) || n <= 0) return null;
            return n;
        };

        const searchVal = cleanString(search);
        const campusIdVal = cleanNumber(campus_id);
        const outletIdVal = cleanNumber(outlet_id);

        // ==================================================
        // STATS
        // ==================================================
        const [statsRows] = await db.query(`
            SELECT
                COUNT(*) AS total_machines,
                SUM(CASE WHEN UPPER(machine_type) LIKE '%WASH%' THEN 1 ELSE 0 END) AS washing_machines,
                SUM(CASE WHEN UPPER(machine_type) LIKE '%DRY%' THEN 1 ELSE 0 END) AS dryers,
                SUM(CASE WHEN UPPER(machine_type) LIKE '%IRON%' THEN 1 ELSE 0 END) AS ironing_machines
            FROM machines
        `);

        const stats = {
            totalMachines: Number(statsRows[0].total_machines) || 0,
            washingMachines: Number(statsRows[0].washing_machines) || 0,
            dryers: Number(statsRows[0].dryers) || 0,
            ironingMachines: Number(statsRows[0].ironing_machines) || 0
        };

        // ==================================================
        // FILTERS
        // ==================================================
        let whereClauses = [];
        let params = [];

        if (searchVal !== null) {
            whereClauses.push(`(
                o.name LIKE ?
                OR c.name LIKE ?
            )`);
            const s = `%${searchVal}%`;
            params.push(s, s);
        }

        if (campusIdVal !== null) {
            whereClauses.push(`o.campus_id = ?`);
            params.push(campusIdVal);
        }

        if (outletIdVal !== null) {
            whereClauses.push(`o.id = ?`);
            params.push(outletIdVal);
        }

        const whereSQL = whereClauses.length > 0
            ? ` AND ${whereClauses.join(' AND ')}`
            : '';

        // ==================================================
        // COUNT
        // ==================================================
        const [countRows] = await db.query(
            `
            SELECT COUNT(DISTINCT o.id) AS total
            FROM outlets o
            LEFT JOIN campuses c ON c.id = o.campus_id
            WHERE EXISTS (
                SELECT 1 FROM machines m WHERE m.outlet_id = o.id
            )
            ${whereSQL}
            `,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ==================================================
        // MAIN QUERY
        // ==================================================
        const [rows] = await db.query(
            `
            SELECT
                o.id AS outlet_id,
                o.name AS outlet_name,
                o.section AS outlet_section,
                o.campus_id,
                c.name AS campus_name,

                COUNT(m.id) AS total_machines,
                SUM(CASE WHEN UPPER(m.machine_type) LIKE '%WASH%' THEN 1 ELSE 0 END) AS washing_machines,
                SUM(CASE WHEN UPPER(m.machine_type) LIKE '%DRY%' THEN 1 ELSE 0 END) AS dryers,
                SUM(CASE WHEN UPPER(m.machine_type) LIKE '%IRON%' THEN 1 ELSE 0 END) AS ironing_machines

            FROM outlets o
            LEFT JOIN campuses c ON c.id = o.campus_id
            INNER JOIN machines m ON m.outlet_id = o.id
            WHERE 1=1
            ${whereSQL}
            GROUP BY o.id
            ORDER BY c.name ASC, o.name ASC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        const data = rows.map(r => ({
            outletId: r.outlet_id,
            outletName: r.outlet_name,
            outletSection: r.outlet_section,
            campusId: r.campus_id,
            campusName: r.campus_name,
            totalMachines: Number(r.total_machines) || 0,
            washingMachines: Number(r.washing_machines) || 0,
            dryers: Number(r.dryers) || 0,
            ironingMachines: Number(r.ironing_machines) || 0
        }));

        return res.status(200).json({
            status: true,
            message: 'Machine list fetched successfully',
            data: {
                stats,
                outlets: data,
                pagination: {
                    total: totalRecords,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        });

    } catch (error) {
        console.error('❌ Get Machine List Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch machine list',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    }
};

// ==================================================
// DETAIL MODE — Specific Outlet Machines (Screenshot 1)
// ==================================================
const getMachineDetail = async (req, res) => {
    try {
        const { outletId } = req.params;

        if (!outletId) {
            return res.status(400).json({
                status: false,
                message: 'outletId is required'
            });
        }

        // ---------- Outlet Info ----------
        const [outletRows] = await db.query(
            `
            SELECT
                o.id, o.name, o.section,
                o.campus_id, c.name AS campus_name
            FROM outlets o
            LEFT JOIN campuses c ON c.id = o.campus_id
            WHERE o.id = ?
            LIMIT 1
            `,
            [outletId]
        );

        if (outletRows.length === 0) {
            return res.status(404).json({
                status: false,
                message: 'Outlet not found'
            });
        }

        const outlet = outletRows[0];

        // ---------- Machine List ----------
        const [machines] = await db.query(
            `
            SELECT
                id,
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
            FROM machines
            WHERE outlet_id = ?
            ORDER BY id ASC
            `,
            [outletId]
        );

        const machineList = machines.map(m => ({
            id: m.id,
            machineCode: m.machine_code,
            machineName: m.machine_name,
            machineType: m.machine_type,
            category: m.category,
            brandName: m.brand_name,
            modelNumber: m.model_number,
            serialNumber: m.serial_number,
            capacity: {
                value: Number(m.capacity_value) || 0,
                unit: m.capacity_unit
            },
            outletId: m.outlet_id,
            status: m.status,
            statusName: m.status === 'ACTIVE'
                ? 'Active'
                : m.status === 'INACTIVE'
                    ? 'Inactive'
                    : m.status === 'MAINTENANCE'
                        ? 'Maintenance'
                        : m.status,
            installationDate: m.installation_date,
            image: buildMachineImageUrl(m.image),
            createdAt: m.created_at,
            updatedAt: m.updated_at
        }));

        // ---------- Counts ----------
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
            [outletId]
        );

        const counts = {
            total: Number(count[0].total) || 0,
            active: Number(count[0].active) || 0,
            inactive: Number(count[0].inactive) || 0,
            maintenance: Number(count[0].maintenance) || 0
        };

        return res.status(200).json({
            status: true,
            message: 'Machine details fetched successfully',
            data: {
                outlet: {
                    id: outlet.id,
                    name: outlet.name,
                    section: outlet.section,
                    campusId: outlet.campus_id,
                    campusName: outlet.campus_name
                },
                counts,
                machines: machineList
            }
        });

    } catch (error) {
        console.error('❌ Get Machine Detail Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to fetch machine details',
            debug: {
                errorMessage: error.message,
                sqlMessage: error.sqlMessage,
                sql: error.sql
            }
        });
    }
};

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
        case 'CANCELLED': return 'Cancelled';
        default: return status;
    }
};


// ==================================================
// 1. SUPER ADMIN: GET ORDER LIST
// ==================================================
const getAdminOrderList = async (req, res) => {
    try {
        const {
            search = '',
            from_date,
            to_date,
            campus_id,
            outlet_id,
            status,
            order_type,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        let params = [];

        // Search Filter
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

        // Date Filters
        if (from_date) {
            whereClauses.push(`DATE(o.order_date) >= ?`);
            params.push(from_date);
        }
        if (to_date) {
            whereClauses.push(`DATE(o.order_date) <= ?`);
            params.push(to_date);
        }

        // Dropdown Filters
        if (campus_id) {
            whereClauses.push(`o.campus_id = ?`);
            params.push(campus_id);
        }
        if (outlet_id) {
            whereClauses.push(`o.outlet_id = ?`);
            params.push(outlet_id);
        }
        if (status) {
            whereClauses.push(`o.status = ?`);
            params.push(status.toUpperCase().replace(/ /g, '_'));
        }
        
        // Order Type Logic
        if (order_type === 'Subscription') {
            whereClauses.push(`o.extra_payg_kg = 0 AND o.subscription_usage_kg > 0`);
        } else if (order_type === 'PAYG') {
            whereClauses.push(`o.subscription_usage_kg = 0 AND o.extra_payg_kg > 0`);
        } else if (order_type === 'Subscription + PAYG') {
            whereClauses.push(`o.subscription_usage_kg > 0 AND o.extra_payg_kg > 0`);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // FETCH STATS
        const [statsRows] = await db.query(
            `
            SELECT
                COUNT(*) AS total_orders,
                SUM(CASE WHEN status = 'RECEIVED' OR status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) AS in_wash,
                SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) AS ready,
                SUM(CASE WHEN status = 'COLLECTED' THEN 1 ELSE 0 END) AS collected
            FROM orders
            `
        );

        const stats = {
            total_orders: Number(statsRows[0].total_orders) || 0,
            pending: Number(statsRows[0].pending) || 0,
            in_wash: Number(statsRows[0].in_wash) || 0,
            ready: Number(statsRows[0].ready) || 0,
            collected: Number(statsRows[0].collected) || 0
        };

        // PAGINATION COUNT
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM orders o ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // FETCH DATA
        const [rows] = await db.query(
            `
            SELECT
                o.id, o.order_code, o.token_no, o.order_date,
                o.customer_name, o.customer_mobile, o.customer_type,
                o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
                o.final_amount, o.status,
                c.name AS campus_name,
                outl.name AS outlet_name,
                s.profile_image AS customer_image
            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN students s ON s.id = o.student_id
            ${whereSQL}
            ORDER BY o.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
            `,
            params
        );

        // Format Data
        const data = rows.map(r => {
            let orderType = 'PAYG';
            if (r.subscription_usage_kg > 0 && r.extra_payg_kg > 0) orderType = 'Subscription + PAYG';
            else if (r.subscription_usage_kg > 0) orderType = 'Subscription';

            return {
                id: r.id,
                order_id: r.order_code,
                token_no: r.token_no ? `#${r.token_no}` : null,
                customer: {
                    name: r.customer_name,
                    image: r.customer_image,
                    type: r.customer_type
                },
                campus_name: r.campus_name,
                outlet_name: r.outlet_name,
                weights: {
                    total_kg: Number(r.total_weight_kg),
                    subscription_kg: Number(r.subscription_usage_kg),
                    payg_kg: Number(r.extra_payg_kg)
                },
                total_amount: Number(r.final_amount),
                order_type: orderType,
                status: formatOrderStatus(r.status), // 🆕 Helper function used here
                raw_status: r.status
            };
        });

        return successResponse(res, 'Orders fetched successfully', {
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
        console.error('❌ Admin Order List Error:', error);
        return errorResponse(res, 'Failed to fetch orders', 500);
    }
};


// ==================================================
// 2. SUPER ADMIN: GET ORDER DETAILS
// ==================================================
const getAdminOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(
            `
            SELECT
                o.*,
                c.name AS campus_name,
                outl.name AS outlet_name,
                s.profile_image, s.full_name AS student_name, s.role AS student_role,
                
                -- Subscription Details
                ss.plan_id, ss.quota_kg_total, ss.quota_kg_used,
                sp.plan_name, sp.monthly_wash_limit_kg, sp.maximum_weight_per_order_kg,
                ss.end_date AS plan_end_date,
                
                -- Assigned Receptionist Name (from created_by)
                u.name AS receptionist_name

            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN students s ON s.id = o.student_id
            
            LEFT JOIN student_subscriptions ss ON ss.student_id = o.student_id AND ss.status = 'active'
            LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
            
            LEFT JOIN users u ON u.id = o.created_by

            WHERE o.id = ?
            LIMIT 1
            `,
            [id]
        );

        if (orders.length === 0) {
            return errorResponse(res, 'Order not found', 404);
        }

        const o = orders[0];

        // Timeline Logs
        const [logs] = await db.query(
            `
            SELECT osl.status, osl.remarks, osl.created_at, u.name AS changed_by_name
            FROM order_status_logs osl
            LEFT JOIN users u ON u.id = osl.changed_by
            WHERE osl.order_id = ?
            ORDER BY osl.created_at ASC
            `,
            [id]
        );

        let orderType = 'PAYG';
        if (o.subscription_usage_kg > 0 && o.extra_payg_kg > 0) orderType = 'Subscription + PAYG';
        else if (o.subscription_usage_kg > 0) orderType = 'Subscription';

        const timeline = logs.map(log => ({
            status: log.status,
            label: formatOrderStatus(log.status),
            timestamp: log.created_at,
            updated_by: log.changed_by_name || 'System',
            remarks: log.remarks
        }));

        const extraKg = Number(o.extra_payg_kg) || 0;
        const paygChargeableWeight = extraKg > 0 ? Math.max(5, extraKg) : 0; 
        const paygRate = extraKg > 0 ? (Number(o.extra_amount) / extraKg) : 0;

        const data = {
            id: o.id,
            order_id: o.order_code,
            token_no: o.token_no,
            placed_on: o.order_date,
            order_type: orderType,
            status: formatOrderStatus(o.status),
            raw_status: o.status,

            customer: {
                name: o.customer_name || o.student_name,
                image: o.profile_image,
                phone: o.customer_mobile,
                email: null,
                type: o.customer_type || o.student_role,
                campus: o.campus_name,
                outlet: o.outlet_name,
                plan_name: o.plan_name || 'No Active Plan'
            },

            subscription_info: {
                has_active_plan: !!o.plan_id,
                plan_name: o.plan_name,
                monthly_limit_kg: Number(o.monthly_wash_limit_kg) || 0,
                max_per_order_kg: Number(o.maximum_weight_per_order_kg) || 0,
                used_this_month_kg: Number(o.quota_kg_used) || 0,
                remaining_kg: (Number(o.quota_kg_total) - Number(o.quota_kg_used)) || 0,
                validity: o.plan_end_date ? `Valid till: ${new Date(o.plan_end_date).toLocaleDateString()}` : '-'
            },

            order_info: {
                order_date: o.order_date,
                order_type: orderType,
                order_source: 'Walk-in',
                assigned_to: o.receptionist_name ? `${o.receptionist_name} (Receptionist)` : 'Unassigned',
                campus: o.campus_name,
                outlet: o.outlet_name,
                notes: o.remarks
            },

            billing: {
                total_weight_kg: Number(o.total_weight_kg),
                covered_by_subscription_kg: Number(o.subscription_usage_kg),
                extra_weight_kg: extraKg,
                payg_chargeable_weight_kg: paygChargeableWeight,
                subscription_amount: Number(o.subscription_amount),
                payg_rate: paygRate,
                payg_amount: Number(o.extra_amount),
                total_amount: Number(o.final_amount)
            },

            payment: {
                status: o.payment_status,
                method: o.payment_method,
            },

            timeline: timeline
        };

        return successResponse(res, 'Order details fetched successfully', data);

    } catch (error) {
        console.error('❌ Admin Order Details Error:', error);
        return errorResponse(res, 'Failed to fetch order details', 500);
    }
};

// ==================================================
// 1. SUPER ADMIN: GET ORDER LIST
// ==================================================
// const getOrderList = async (req, res) => {
//     try {
//         // User ID aur Role (Token ya Query se)
//         const userId = req.user?.id || req.query.user_id;
//         const requestedRole = (req.user?.role || req.query.role || '').toUpperCase();

//         if (!userId || !requestedRole) {
//             return errorResponse(res, 'Please provide user_id and role', 401);
//         }

//         // Role Validation (Security)
//         const [userRows] = await db.query(`SELECT role, roles FROM users WHERE id = ? LIMIT 1`, [userId]);
//         if (userRows.length === 0) return errorResponse(res, 'User not found', 404);

//         let dbRoles = [];
//         try {
//             dbRoles = userRows[0].roles ? (typeof userRows[0].roles === 'string' ? JSON.parse(userRows[0].roles) : userRows[0].roles) : [];
//         } catch (e) { dbRoles = [userRows[0].role]; }

//         const hasAccess = dbRoles.includes(requestedRole) || userRows[0].role === requestedRole || userRows[0].role === 'BOTH' || requestedRole === 'SUPER_ADMIN';
//         if (!hasAccess) return errorResponse(res, `Access denied. You do not have ${requestedRole} privileges.`, 403);

//         // Query Params for Filters
//         const {
//             search = '',
//             status,
//             from_date,
//             to_date,
//             page = 1,
//             limit = 10,
//             targetOutletId, 
//             targetCampusId,
//             order_type // Subscription, PAYG, Subscription + PAYG
//         } = req.query;

//         const pageNum = Math.max(1, parseInt(page) || 1);
//         const limitNum = Math.max(1, parseInt(limit) || 10);
//         const offset = (pageNum - 1) * limitNum;

//         let whereClauses = [];
//         let params = [];

//         // --- Role-Based Access ---
//         if (requestedRole === 'STUDENT' || requestedRole === 'NON-STUDENT' || requestedRole === 'NON_STUDENT') {
//             whereClauses.push(`o.student_id = ?`);
//             params.push(Number(userId));
//         } else if (requestedRole === 'RECEPTIONIST') {
//             const [rec] = await db.query(`SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ?`, [userId]);
//             if (rec.length === 0) return successResponse(res, 'No outlets assigned', { stats: {}, data: [], pagination: {} });
//             whereClauses.push(`o.outlet_id IN (${rec.map(() => '?').join(',')})`);
//             params.push(...rec.map(r => r.outlet_id));
//         } else if (requestedRole === 'OUTLET_MANAGER') {
//             const [mgr] = await db.query(`SELECT outlet_id FROM user_outlets WHERE user_id = ?`, [userId]);
//             if (mgr.length === 0) return successResponse(res, 'No outlets assigned', { stats: {}, data: [], pagination: {} });
//             whereClauses.push(`o.outlet_id IN (${mgr.map(() => '?').join(',')})`);
//             params.push(...mgr.map(r => r.outlet_id));
//         } else if (requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN') {
//             if (targetOutletId) { whereClauses.push(`o.outlet_id = ?`); params.push(Number(targetOutletId)); }
//             if (targetCampusId) { whereClauses.push(`o.campus_id = ?`); params.push(Number(targetCampusId)); }
//         } else {
//             return errorResponse(res, 'Invalid role', 403);
//         }

//         // --- Common Filters ---
//         if (search && search.trim() !== '') {
//             whereClauses.push(`(o.order_code LIKE ? OR o.token_no LIKE ? OR o.customer_name LIKE ? OR o.customer_mobile LIKE ?)`);
//             const s = `%${search.trim()}%`;
//             params.push(s, s, s, s);
//         }

//         if (from_date) { whereClauses.push(`DATE(o.order_date) >= ?`); params.push(from_date); }
//         if (to_date) { whereClauses.push(`DATE(o.order_date) <= ?`); params.push(to_date); }

//         // 🆕 Order Type Filter (Subscription vs PAYG)
//         if (order_type) {
//             if (order_type === 'Subscription') {
//                 whereClauses.push(`o.subscription_usage_kg > 0 AND o.extra_payg_kg = 0`);
//             } else if (order_type === 'PAYG') {
//                 whereClauses.push(`o.subscription_usage_kg = 0 AND o.extra_payg_kg > 0`);
//             } else if (order_type === 'Subscription + PAYG') {
//                 whereClauses.push(`o.subscription_usage_kg > 0 AND o.extra_payg_kg > 0`);
//             }
//         }

//         const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

//         // --- Fetch Stats (Top 5 Boxes) ---
//         // Note: Stats me Search/Status filter nahi lagana chahiye, bas Role filter lagega
//         let statsWhere = whereClauses.filter(w => !w.includes('o.status') && !w.includes('o.order_code LIKE'));
//         let statsParams = params.filter((_, i) => i < statsWhere.length); // Simplification

//         const [statsRows] = await db.query(
//             `
//             SELECT
//                 COUNT(*) AS total_orders,
//                 SUM(CASE WHEN o.status IN ('RECEIVED', 'PENDING') THEN 1 ELSE 0 END) AS pending,
//                 SUM(CASE WHEN o.status = 'IN_WASH' THEN 1 ELSE 0 END) AS in_wash,
//                 SUM(CASE WHEN o.status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) AS ready,
//                 SUM(CASE WHEN o.status = 'COLLECTED' THEN 1 ELSE 0 END) AS collected
//             FROM orders o
//             ${statsWhere.length > 0 ? `WHERE ${statsWhere.join(' AND ')}` : ''}
//             `,
//             statsParams
//         );

//         const stats = {
//             total_orders: Number(statsRows[0].total_orders) || 0,
//             pending: Number(statsRows[0].pending) || 0,
//             in_wash: Number(statsRows[0].in_wash) || 0,
//             ready: Number(statsRows[0].ready) || 0,
//             collected: Number(statsRows[0].collected) || 0
//         };

//         // --- Apply Status Filter for Data ---
//         if (status) {
//             whereClauses.push(`o.status = ?`);
//             params.push(status.toUpperCase().replace(/ /g, '_'));
//         }
//         const finalWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

//         // --- Pagination Count ---
//         const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM orders o ${finalWhereSQL}`, params);
//         const totalRecords = countRows[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         // --- Fetch Data ---
//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id, o.order_code, o.token_no, o.order_date,
//                 o.customer_name, o.customer_mobile, o.customer_type,
//                 o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
//                 o.subscription_amount, o.extra_amount, o.discount_amount, o.final_amount,
//                 o.payment_status, o.status,
//                 c.name AS campus_name,
//                 outl.name AS outlet_name,
//                 s.profile_image AS customer_image
//             FROM orders o
//             LEFT JOIN campuses c ON c.id = o.campus_id
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             LEFT JOIN students s ON s.id = o.student_id
//             ${finalWhereSQL}
//             ORDER BY o.id DESC
//             LIMIT ${limitNum} OFFSET ${offset}
//             `,
//             params
//         );

//         const data = rows.map(r => {
//             // Image URL generation
//             const imageUrl = r.customer_image 
//                 ? `https://instawash.siberiancrane.tech/uploads/${r.customer_image}` 
//                 : null;

//             // Order Type Calculation
//             let orderType = 'PAYG';
//             if (r.subscription_usage_kg > 0 && r.extra_payg_kg > 0) orderType = 'Subscription + PAYG';
//             else if (r.subscription_usage_kg > 0) orderType = 'Subscription';

//             return {
//                 id: r.id,
//                 order_code: r.order_code,
//                 token_no: r.token_no ? `#${r.token_no}` : null, // Screenshot me #205 dikh raha hai
//                 customer: {
//                     name: r.customer_name,
//                     mobile: r.customer_mobile,
//                     type: r.customer_type,
//                     image: imageUrl 
//                 },
//                 campus_name: r.campus_name,
//                 outlet_name: r.outlet_name,
//                 weight: {
//                     total_kg: Number(r.total_weight_kg) || 0,
//                     subscription_kg: Number(r.subscription_usage_kg) || 0,
//                     payg_kg: Number(r.extra_payg_kg) || 0
//                 },
//                 total_amount: Number(r.final_amount) || 0,
//                 order_type: orderType,
//                 status: formatOrderStatus(r.status),
//                 raw_status: r.status
//             };
//         });

//         return successResponse(res, 'Orders fetched successfully', {
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
//         console.error('❌ Get Order List Error:', error);
//         return errorResponse(res, 'Failed to fetch order list', 500);
//     }
// };

// ==================================================
// 1. SUPER ADMIN: GET ORDER LIST
// ==================================================
const getOrderList = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.user_id;
        const requestedRole = (req.user?.role || req.query.role || '').toUpperCase();

        if (!userId || !requestedRole) {
            return errorResponse(res, 'Please provide user_id and role', 401);
        }

        // Role Validation (Security)
        const [userRows] = await db.query(`SELECT role, roles FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (userRows.length === 0) return errorResponse(res, 'User not found', 404);

        let dbRoles = [];
        try {
            dbRoles = userRows[0].roles ? (typeof userRows[0].roles === 'string' ? JSON.parse(userRows[0].roles) : userRows[0].roles) : [];
        } catch (e) { dbRoles = [userRows[0].role]; }

        const hasAccess = dbRoles.includes(requestedRole) || userRows[0].role === requestedRole || userRows[0].role === 'BOTH' || requestedRole === 'SUPER_ADMIN';
        if (!hasAccess) return errorResponse(res, `Access denied. You do not have ${requestedRole} privileges.`, 403);

        // Query Params for Filters
        const {
            search = '',
            status,
            from_date,
            to_date,
            page = 1,
            limit = 10,
            targetOutletId, 
            targetCampusId,
            order_type
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        let params = [];

        // --- Role-Based Access ---
        if (requestedRole === 'STUDENT' || requestedRole === 'NON-STUDENT' || requestedRole === 'NON_STUDENT') {
            whereClauses.push(`o.student_id = ?`);
            params.push(Number(userId));
        } else if (requestedRole === 'RECEPTIONIST') {
            const [rec] = await db.query(`SELECT outlet_id FROM user_outlets_receptionist WHERE user_id = ?`, [userId]);
            if (rec.length === 0) return successResponse(res, 'No outlets assigned', { stats: {}, data: [], pagination: {} });
            whereClauses.push(`o.outlet_id IN (${rec.map(() => '?').join(',')})`);
            params.push(...rec.map(r => r.outlet_id));
        } else if (requestedRole === 'OUTLET_MANAGER') {
            const [mgr] = await db.query(`SELECT outlet_id FROM user_outlets WHERE user_id = ?`, [userId]);
            if (mgr.length === 0) return successResponse(res, 'No outlets assigned', { stats: {}, data: [], pagination: {} });
            whereClauses.push(`o.outlet_id IN (${mgr.map(() => '?').join(',')})`);
            params.push(...mgr.map(r => r.outlet_id));
        } else if (requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN') {
            if (targetOutletId) { whereClauses.push(`o.outlet_id = ?`); params.push(Number(targetOutletId)); }
            if (targetCampusId) { whereClauses.push(`o.campus_id = ?`); params.push(Number(targetCampusId)); }
        } else {
            return errorResponse(res, 'Invalid role', 403);
        }

        // --- Common Filters ---
        if (search && search.trim() !== '') {
            whereClauses.push(`(o.order_code LIKE ? OR o.token_no LIKE ? OR o.customer_name LIKE ? OR o.customer_mobile LIKE ?)`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
        }

        if (from_date) { whereClauses.push(`DATE(o.order_date) >= ?`); params.push(from_date); }
        if (to_date) { whereClauses.push(`DATE(o.order_date) <= ?`); params.push(to_date); }

        // Order Type Filter
        if (order_type) {
            if (order_type === 'Subscription') {
                whereClauses.push(`o.subscription_usage_kg > 0 AND o.extra_payg_kg = 0`);
            } else if (order_type === 'PAYG') {
                whereClauses.push(`o.subscription_usage_kg = 0 AND o.extra_payg_kg > 0`);
            } else if (order_type === 'Subscription + PAYG') {
                whereClauses.push(`o.subscription_usage_kg > 0 AND o.extra_payg_kg > 0`);
            }
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Fetch Stats ---
        let statsWhere = whereClauses.filter(w => !w.includes('o.status') && !w.includes('o.order_code LIKE'));
        let statsParams = params.filter((_, i) => i < statsWhere.length); 

        const [statsRows] = await db.query(
            `
            SELECT
                COUNT(*) AS total_orders,
                SUM(CASE WHEN o.status IN ('RECEIVED', 'PENDING') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN o.status = 'IN_WASH' THEN 1 ELSE 0 END) AS in_wash,
                SUM(CASE WHEN o.status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) AS ready,
                SUM(CASE WHEN o.status = 'COLLECTED' THEN 1 ELSE 0 END) AS collected
            FROM orders o
            ${statsWhere.length > 0 ? `WHERE ${statsWhere.join(' AND ')}` : ''}
            `,
            statsParams
        );

        const stats = {
            total_orders: Number(statsRows[0].total_orders) || 0,
            pending: Number(statsRows[0].pending) || 0,
            in_wash: Number(statsRows[0].in_wash) || 0,
            ready: Number(statsRows[0].ready) || 0,
            collected: Number(statsRows[0].collected) || 0
        };

        // --- Apply Status Filter for Data ---
        if (status) {
            whereClauses.push(`o.status = ?`);
            params.push(status.toUpperCase().replace(/ /g, '_'));
        }
        const finalWhereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Pagination Count ---
        const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM orders o ${finalWhereSQL}`, params);
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // --- Fetch Data ---
        const [rows] = await db.query(
            `
            SELECT
                o.id, o.order_code, o.token_no, o.order_date, o.created_at, -- 🆕 created_at bhi fetch kiya
                o.customer_name, o.customer_mobile, o.customer_type,
                o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
                o.subscription_amount, o.extra_amount, o.discount_amount, o.final_amount,
                o.payment_status, o.status,
                c.name AS campus_name,
                outl.name AS outlet_name,
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

            let orderType = 'PAYG';
            if (r.subscription_usage_kg > 0 && r.extra_payg_kg > 0) orderType = 'Subscription + PAYG';
            else if (r.subscription_usage_kg > 0) orderType = 'Subscription';

            return {
                id: r.id,
                order_code: r.order_code,
                token_no: r.token_no ? `#${r.token_no}` : null, 
                
                // 🆕 Date fields added here
                order_date: r.order_date, 
                created_at: r.created_at,

                customer: {
                    name: r.customer_name,
                    mobile: r.customer_mobile,
                    type: r.customer_type,
                    image: imageUrl 
                },
                campus_name: r.campus_name,
                outlet_name: r.outlet_name,
                weight: {
                    total_kg: Number(r.total_weight_kg) || 0,
                    subscription_kg: Number(r.subscription_usage_kg) || 0,
                    payg_kg: Number(r.extra_payg_kg) || 0
                },
                total_amount: Number(r.final_amount) || 0,
                order_type: orderType,
                status: formatOrderStatus(r.status),
                raw_status: r.status
            };
        });

        return successResponse(res, 'Orders fetched successfully', {
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
// 2. SUPER ADMIN: GET ORDER DETAILS
// ==================================================
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) return errorResponse(res, 'Order ID is required', 400);

        // 1. Fetch Order + Student + Subscription + Receptionist Info
        const [orders] = await db.query(
            `
            SELECT
                o.*,
                c.name AS campus_name,
                outl.name AS outlet_name,
                outl.section AS outlet_section,
                s.profile_image, s.full_name AS student_name, s.role AS student_role, s.roll_number,
                ss.plan_id, ss.quota_kg_total, ss.quota_kg_used,
                sp.plan_name, sp.monthly_wash_limit_kg, sp.maximum_weight_per_order_kg,
                ss.end_date AS plan_end_date,
                u.name AS receptionist_name
            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            LEFT JOIN students s ON s.id = o.student_id
            LEFT JOIN student_subscriptions ss ON ss.student_id = o.student_id AND ss.status = 'active'
            LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
            LEFT JOIN users u ON u.id = o.created_by
            WHERE o.id = ?
            LIMIT 1
            `,
            [id]
        );

        if (orders.length === 0) return errorResponse(res, 'Order not found', 404);
        const o = orders[0];

        // 2. Fetch Timeline Logs
        const [logs] = await db.query(
            `
            SELECT osl.status, osl.remarks, osl.created_at, u.name AS changed_by_name, u.role AS changed_by_role
            FROM order_status_logs osl
            LEFT JOIN users u ON u.id = osl.changed_by
            WHERE osl.order_id = ?
            ORDER BY osl.created_at ASC
            `,
            [id]
        );

        // 3. Calculations
        const customerImage = o.profile_image ? `https://instawash.siberiancrane.tech/uploads/${o.profile_image}` : null;
        const extraKg = Number(o.extra_payg_kg) || 0;
        const paygRate = extraKg > 0 ? (Number(o.extra_amount) / extraKg) : 0;
        
        // Screenshot wala rule: Min 5 KG billable if PAYG > 0
        const paygChargeableWeight = extraKg > 0 ? Math.max(5, extraKg) : 0; 

        let orderType = 'PAYG';
        if (o.subscription_usage_kg > 0 && extraKg > 0) orderType = 'Subscription + PAYG';
        else if (o.subscription_usage_kg > 0) orderType = 'Subscription';

        // 4. Format Data
        const data = {
            id: o.id,
            orderCode: o.order_code,
            tokenNo: o.token_no,
            orderDate: o.order_date,
            status: o.status,
            statusLabel: formatOrderStatus(o.status),
            orderType: orderType,

            // Customer Info
            customer: {
                id: o.student_id,
                name: o.customer_name || o.student_name,
                image: customerImage,
                mobile: o.customer_mobile,
                type: o.customer_type || o.student_role,
                rollNumber: o.roll_number,
                campus: o.campus_name,
                outlet: o.outlet_name
            },

            // Subscription Info (Right top box)
            subscription: {
                hasActivePlan: !!o.plan_id,
                planName: o.plan_name || 'No Active Plan',
                monthlyWashLimit: Number(o.monthly_wash_limit_kg) || 0,
                maxPerOrder: Number(o.maximum_weight_per_order_kg) || 0,
                usedThisMonth: Number(o.quota_kg_used) || 0,
                remaining: (Number(o.quota_kg_total) - Number(o.quota_kg_used)) || 0,
                validity: o.plan_end_date ? `Valid till: ${new Date(o.plan_end_date).toLocaleDateString()}` : '-'
            },

            // Order Info (Left Box)
            orderInfo: {
                orderDate: o.order_date,
                orderType: orderType,
                orderSource: 'Walk-in', // DB me nahi hai to default
                assignedTo: o.receptionist_name ? `${o.receptionist_name} (Receptionist)` : 'Unassigned',
                campus: o.campus_name,
                outlet: o.outlet_name,
                notes: o.remarks || '-'
            },

            // Weight & Billing Breakdown (Middle Box)
            billing: {
                totalWeightKg: Number(o.total_weight_kg) || 0,
                coveredBySubscriptionKg: Number(o.subscription_usage_kg) || 0,
                extraWeightKg: extraKg,
                paygChargeableWeightKg: paygChargeableWeight,
                subscriptionAmount: Number(o.subscription_amount) || 0,
                paygRate: paygRate,
                paygAmount: Number(o.extra_amount) || 0,
                discountPercent: Number(o.discount_percent) || 0,
                discountAmount: Number(o.discount_amount) || 0,
                totalAmount: Number(o.final_amount) || 0
            },

            // Payment Details
            payment: {
                status: o.payment_status || 'PENDING',
                method: o.payment_method || 'N/A',
                transactionId: null, // Agar DB me hai to add karein
                paidAt: null
            },

            // Timeline Logs
            timeline: logs.map(log => ({
                status: log.status,
                label: formatOrderStatus(log.status),
                remarks: log.remarks,
                timestamp: log.created_at,
                updatedBy: log.changed_by_name || 'System',
                role: log.changed_by_role || 'System'
            }))
        };

        return successResponse(res, 'Order details fetched successfully', data);

    } catch (error) {
        console.error('❌ Get Order By ID Error:', error);
        return errorResponse(res, 'Failed to fetch order', 500);
    }
};

// ==================================================
// SUPER ADMIN: GET DASHBOARD (With 3 Separate Graph Filters)
// ==================================================

const getSuperAdminDashboard = async (req, res) => {
    try {
        // 1. Date Logic (Default: Aaj ka din)
        let startDate = req.query.start_date;
        let endDate = req.query.end_date;

        // Local date calculate karein
        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(today - offset)).toISOString().split('T')[0];

        if (!startDate) startDate = localISOTime;
        if (!endDate) endDate = localISOTime;

        // Time boundary fix (00:00:00 se 23:59:59 tak)
        const startDateTime = `${startDate} 00:00:00`;
        const endDateTime = `${endDate} 23:59:59`;

        // Graph Filters (Default 7 days)
        let ordersFilter = parseInt(req.query.orders_filter) || 7;
        let subsFilter = parseInt(req.query.subs_filter) || 7;
        let revenueFilter = parseInt(req.query.revenue_filter) || 7;

        const validDays = [7, 30, 90];
        if (!validDays.includes(ordersFilter)) ordersFilter = 7;
        if (!validDays.includes(subsFilter)) subsFilter = 7;
        if (!validDays.includes(revenueFilter)) revenueFilter = 7;

        // ==========================================
        // 2. TOP STATS CARDS (Date Filter Applied)
        // ==========================================
        
        const [[campuses]] = await db.query(
            `SELECT COUNT(*) as total FROM campuses WHERE is_active = 1 AND DATE(created_at) BETWEEN ? AND ?`, 
            [startDate, endDate]
        );
        
        const [[outlets]] = await db.query(
            `SELECT COUNT(*) as total FROM outlets WHERE is_active = 1 AND DATE(created_at) BETWEEN ? AND ?`, 
            [startDate, endDate]
        );
        
        // 🆕 UPDATED: Customers ab students table se count honge (is_active = 1)
        const [[customers]] = await db.query(
            `SELECT COUNT(*) as total FROM students WHERE is_active = 1 AND DATE(created_at) BETWEEN ? AND ?`, 
            [startDate, endDate]
        );
        
        // Active Subs jo is date range me start hui
        const [[activeSubs]] = await db.query(
            `SELECT COUNT(*) as total FROM student_subscriptions WHERE status = 'ACTIVE' AND DATE(start_date) BETWEEN ? AND ?`, 
            [startDate, endDate]
        );
        
        // Total Orders is date range ke
        const [[totalOrders]] = await db.query(
            `SELECT COUNT(*) as total FROM orders WHERE DATE(order_date) BETWEEN ? AND ?`, 
            [startDate, endDate]
        );

        // Revenue is date range ka
        const [[todayRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders 
            WHERE DATE(order_date) BETWEEN ? AND ? 
            AND payment_status = 'PAID'
        `, [startDate, endDate]);

        // ==========================================
        // 3. OPERATIONAL OVERVIEW (Date Filter Applied)
        // ==========================================
        const [opStats] = await db.query(`
            SELECT 
                COUNT(*) as orders_today,
                SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) as in_process,
                SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready,
                SUM(CASE WHEN status = 'COLLECTED' THEN 1 ELSE 0 END) as collected
            FROM orders
            WHERE DATE(order_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        const operationalOverview = {
            orders_today: Number(opStats[0].orders_today) || 0,
            in_process: Number(opStats[0].in_process) || 0,
            ready_for_collection: Number(opStats[0].ready) || 0,
            collected: Number(opStats[0].collected) || 0
        };

        // ==========================================
        // 4. GRAPHS (Ye apne filter (7, 30, 90) se chalenge)
        // ==========================================
        const [ordersTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m-%d') as date,
                COUNT(*) as count
            FROM orders
            WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(order_date)
            ORDER BY date ASC
        `, [ordersFilter]);

        const [subsTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(start_date, '%Y-%m-%d') as date,
                COUNT(*) as count
            FROM student_subscriptions
            WHERE start_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(start_date)
            ORDER BY date ASC
        `, [subsFilter]);

        const [revenueTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m-%d') as date,
                COALESCE(SUM(final_amount), 0) as amount
            FROM orders
            WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND payment_status = 'PAID'
            GROUP BY DATE(order_date)
            ORDER BY date ASC
        `, [revenueFilter]);

        // ==========================================
        // 7. BOTTOM STATS (Date Filter Applied)
        // ==========================================
        const [[rangeRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders WHERE DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
        `, [startDate, endDate]);

        const [[thisWeekRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders 
            WHERE DATE(order_date) BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND ? 
            AND payment_status = 'PAID'
        `, [endDate, endDate]);

        const [[thisMonthRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders 
            WHERE MONTH(order_date) = MONTH(?) AND YEAR(order_date) = YEAR(?) 
            AND payment_status = 'PAID'
        `, [endDate, endDate]);

        const [[totalRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders WHERE payment_status = 'PAID'
        `);


        // ==========================================
        // 8. FINAL RESPONSE
        // ==========================================
        const responseData = {
            filter_applied: {
                start_date: startDate,
                end_date: endDate,
                display: `${startDate} to ${endDate}`,
                orders_graph_days: ordersFilter,
                subscriptions_graph_days: subsFilter,
                revenue_graph_days: revenueFilter
            },
            
            top_stats: {
                total_campuses: campuses.total,
                total_outlets: outlets.total,
                total_customers: customers.total,
                active_subscriptions: activeSubs.total,
                total_orders: totalOrders.total,
                todays_revenue: Number(todayRevenue.total)
            },

            operational_overview: operationalOverview,

            charts: {
                orders_trend: ordersTrend.map(item => ({
                    date: item.date,
                    orders: Number(item.count)
                })),
                subscriptions_trend: subsTrend.map(item => ({
                    date: item.date,
                    subscriptions: Number(item.count)
                })),
                revenue_trend: revenueTrend.map(item => ({
                    date: item.date,
                    revenue: Number(item.amount)
                }))
            },

            bottom_stats: {
                selected_range_revenue: Number(rangeRevenue.total),
                revenue_this_week: Number(thisWeekRevenue.total),
                revenue_this_month: Number(thisMonthRevenue.total),
                total_revenue: Number(totalRevenue.total)
            }
        };

        return successResponse(res, 'Super Admin Dashboard fetched successfully', responseData);

    } catch (error) {
        console.error('❌ Super Admin Dashboard Error:', error);
        return errorResponse(res, 'Failed to fetch dashboard data', 500);
    }
};

/*const getSuperAdminDashboard = async (req, res) => {
    try {
        // 1. Date Logic for Top Stats (Start & End Date)
        let startDate = req.query.start_date;
        let endDate = req.query.end_date;

        const today = new Date().toISOString().split('T')[0];
        if (!startDate) startDate = today;
        if (!endDate) endDate = today;

        // 🆕 3 Separate Graph Filters (Default: 7 days)
        let ordersFilter = parseInt(req.query.orders_filter) || 7;
        let subsFilter = parseInt(req.query.subs_filter) || 7;
        let revenueFilter = parseInt(req.query.revenue_filter) || 7;

        // Validate filters (sirf 7, 30, 90 allow karenge)
        const validDays = [7, 30, 90];
        if (!validDays.includes(ordersFilter)) ordersFilter = 7;
        if (!validDays.includes(subsFilter)) subsFilter = 7;
        if (!validDays.includes(revenueFilter)) revenueFilter = 7;

        // ==========================================
        // 2. TOP STATS CARDS
        // ==========================================
        const [[campuses]] = await db.query(`SELECT COUNT(*) as total FROM campuses WHERE is_active = 1`);
        const [[outlets]] = await db.query(`SELECT COUNT(*) as total FROM outlets WHERE is_active = 1`);
        const [[customers]] = await db.query(`SELECT COUNT(DISTINCT student_id) as total FROM orders`);
        const [[activeSubs]] = await db.query(`SELECT COUNT(*) as total FROM student_subscriptions WHERE status = 'ACTIVE'`);
        const [[totalOrders]] = await db.query(`SELECT COUNT(*) as total FROM orders`);

        const [[todayRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders 
            WHERE DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'
        `, [startDate, endDate]);

        // ==========================================
        // 3. OPERATIONAL OVERVIEW
        // ==========================================
        const [opStats] = await db.query(`
            SELECT 
                COUNT(*) as orders_today,
                SUM(CASE WHEN status = 'IN_WASH' THEN 1 ELSE 0 END) as in_process,
                SUM(CASE WHEN status = 'READY_FOR_COLLECTION' THEN 1 ELSE 0 END) as ready,
                SUM(CASE WHEN status = 'COLLECTED' THEN 1 ELSE 0 END) as collected
            FROM orders
            WHERE DATE(order_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        const operationalOverview = {
            orders_today: Number(opStats[0].orders_today) || 0,
            in_process: Number(opStats[0].in_process) || 0,
            ready_for_collection: Number(opStats[0].ready) || 0,
            collected: Number(opStats[0].collected) || 0
        };

        // ==========================================
        // 4. GRAPH 1: Orders Trend (orders_filter)
        // ==========================================
        const [ordersTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m-%d') as date,
                COUNT(*) as count
            FROM orders
            WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(order_date)
            ORDER BY date ASC
        `, [ordersFilter]);

        // ==========================================
        // 5. GRAPH 2: Subscription Growth (subs_filter)
        // ==========================================
        const [subsTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(start_date, '%Y-%m-%d') as date,
                COUNT(*) as count
            FROM student_subscriptions
            WHERE start_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(start_date)
            ORDER BY date ASC
        `, [subsFilter]);

        // ==========================================
        // 6. GRAPH 3: Revenue Trend (revenue_filter)
        // ==========================================
        const [revenueTrend] = await db.query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m-%d') as date,
                COALESCE(SUM(final_amount), 0) as amount
            FROM orders
            WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND payment_status = 'PAID'
            GROUP BY DATE(order_date)
            ORDER BY date ASC
        `, [revenueFilter]);

        // ==========================================
        // 7. BOTTOM STATS (Graphs ke neeche wale boxes)
        // ==========================================
        const [[thisWeekRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND payment_status = 'PAID'
        `);

        const [[thisMonthRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders WHERE MONTH(order_date) = MONTH(CURDATE()) AND YEAR(order_date) = YEAR(CURDATE()) AND payment_status = 'PAID'
        `);

        const [[totalRevenue]] = await db.query(`
            SELECT COALESCE(SUM(final_amount), 0) as total 
            FROM orders WHERE payment_status = 'PAID'
        `);


        // ==========================================
        // 8. FINAL RESPONSE
        // ==========================================
        const responseData = {
            filter_applied: {
                // Top stats ka date
                start_date: startDate,
                end_date: endDate,
                display: `${startDate} to ${endDate}`,
                
                // 🆕 Graphs ke separate filters
                orders_graph_days: ordersFilter,
                subscriptions_graph_days: subsFilter,
                revenue_graph_days: revenueFilter
            },
            
            // Top 6 Boxes
            top_stats: {
                total_campuses: campuses.total,
                total_outlets: outlets.total,
                total_customers: customers.total,
                active_subscriptions: activeSubs.total,
                total_orders: totalOrders.total,
                todays_revenue: Number(todayRevenue.total)
            },

            // Operational Overview
            operational_overview: operationalOverview,

            // Graphs Data
            charts: {
                orders_trend: ordersTrend.map(item => ({
                    date: item.date,
                    orders: Number(item.count)
                })),
                subscriptions_trend: subsTrend.map(item => ({
                    date: item.date,
                    subscriptions: Number(item.count)
                })),
                revenue_trend: revenueTrend.map(item => ({
                    date: item.date,
                    revenue: Number(item.amount)
                }))
            },

            // Graph ke neeche wali summary
            bottom_stats: {
                revenue_this_week: Number(thisWeekRevenue.total),
                revenue_this_month: Number(thisMonthRevenue.total),
                total_revenue: Number(totalRevenue.total)
            }
        };

        return successResponse(res, 'Super Admin Dashboard fetched successfully', responseData);

    } catch (error) {
        console.error('❌ Super Admin Dashboard Error:', error);
        return errorResponse(res, 'Failed to fetch dashboard data', 500);
    }
};*/

// // ==================================================
// // 1. GET GENERAL SETTINGS
// // ==================================================
// const getGeneralSettings = async (req, res) => {
//     try {
//         const [settings] = await db.query(`SELECT * FROM general_settings WHERE id = 1 LIMIT 1`);
        
//         if (settings.length === 0) {
//             return successResponse(res, 'No settings found', { data: null });
//         }

//         const data = settings[0];

//         // Agar company_logo mein purana local path hai (bina http ke), toh null kar do
//         if (data.company_logo && !data.company_logo.startsWith('http')) {
//             data.company_logo = null;
//         }

//         return successResponse(res, 'Settings fetched successfully', data);

//     } catch (error) {
//         console.error('❌ Get Settings Error:', error);
//         return errorResponse(res, 'Failed to fetch settings', 500);
//     }
// };

// // ==================================================
// // 2. UPDATE GENERAL SETTINGS (Raw JSON body)
// // ==================================================
// const updateGeneralSettings = async (req, res) => {
//     try {
//         // ✅ Raw JSON se data lo
//         const {
//             companyName,
//             supportEmail,
//             supportPhone,
//             address,
//             companyLogo   // ✅ Logo ka URL frontend se JSON mein aayega
//         } = req.body;

//         // Basic validation (optional but recommended)
//         if (!companyName || !supportEmail) {
//             return errorResponse(res, 'companyName and supportEmail are required', 400);
//         }

//         // Check karo settings exist karti hain ya nahi
//         const [existing] = await db.query(`SELECT * FROM general_settings WHERE id = 1`);

//         if (existing.length === 0) {
//             // Insert
//             await db.query(
//                 `INSERT INTO general_settings 
//                  (id, company_logo, company_name, support_email, support_phone, address) 
//                  VALUES (1, ?, ?, ?, ?, ?)`,
//                 [companyLogo || null, companyName, supportEmail, supportPhone, address]
//             );
//         } else {
//             // Update
//             let updateQuery = `
//                 UPDATE general_settings 
//                 SET company_name = ?, support_email = ?, support_phone = ?, address = ?, updated_at = NOW()
//             `;
//             let params = [companyName, supportEmail, supportPhone, address];

//             // Agar naya logo URL bheja gaya hai toh use bhi update karo
//             if (companyLogo !== undefined && companyLogo !== null && companyLogo !== '') {
//                 updateQuery = `
//                     UPDATE general_settings 
//                     SET company_logo = ?, company_name = ?, support_email = ?, support_phone = ?, address = ?, updated_at = NOW()
//                 `;
//                 params = [companyLogo, companyName, supportEmail, supportPhone, address];
//             }

//             updateQuery += ` WHERE id = 1`;
//             await db.query(updateQuery, params);
//         }

//         // Updated data fetch karo
//         const [updatedSettings] = await db.query(`SELECT * FROM general_settings WHERE id = 1 LIMIT 1`);
//         let data = updatedSettings[0];

//         // Purana local path ho toh null kar do
//         if (data && data.company_logo && !data.company_logo.startsWith('http')) {
//             data.company_logo = null;
//         }

//         return successResponse(res, 'Settings updated successfully', data);

//     } catch (error) {
//         console.error('❌ Update Settings Error:', error);
//         return errorResponse(res, 'Failed to update settings', 500);
//     }
// };

// ==================================================
// Helper: normalize banner image (JSON string / array / single URL)
// ==================================================
const normalizeBannerImages = (value) => {
    if (value === null || value === undefined || value === '') return null;

    let arr = value;

    // Agar string aayi hai (DB JSON string ya single URL) to parse karo
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            arr = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            // Parse fail -> matlab plain URL string hai
            arr = [value];
        }
    }

    // Agar single string aa gayi to array bana do
    if (!Array.isArray(arr)) arr = [arr];

    // Filter valid entries (sirf strings, non-empty, http ya /uploads)
    const cleaned = arr
        .filter(v => typeof v === 'string' && v.trim() !== '')
        .filter(v => v.trim().startsWith('http') || v.trim().startsWith('/uploads/'))
        .map(v => v.trim());

    return cleaned.length > 0 ? cleaned : null;
};

// ==================================================
// 1. GET GENERAL SETTINGS
// ==================================================
const getGeneralSettings = async (req, res) => {
    try {
        const [settings] = await db.query(`SELECT * FROM general_settings WHERE id = 1 LIMIT 1`);

        if (settings.length === 0) {
            return successResponse(res, 'No settings found', { data: null });
        }

        const data = settings[0];

        // ✅ company_logo — purana local path ho toh null
        if (data.company_logo && !data.company_logo.startsWith('http')) {
            data.company_logo = null;
        }

        // ✅ banner_image — array of URLs return karo
        data.banner_image = normalizeBannerImages(data.banner_image);

        return successResponse(res, 'Settings fetched successfully', data);

    } catch (error) {
        console.error('❌ Get Settings Error:', error);
        return errorResponse(res, 'Failed to fetch settings', 500);
    }
};

// ==================================================
// 2. UPDATE GENERAL SETTINGS (Raw JSON body)
// ==================================================
const updateGeneralSettings = async (req, res) => {
    try {
        const {
            companyName,
            supportEmail,
            supportPhone,
            address,
            companyLogo,                 // string URL (optional)
            bannerImages,                // ✅ array of URLs (optional)
            banner_image: bannerAlias    // ✅ fallback name bhi accept karo
        } = req.body;

        // Basic validation
        if (!companyName || !supportEmail) {
            return errorResponse(res, 'companyName and supportEmail are required', 400);
        }

        // ✅ Banner input — dono keys allow (bannerImages ya banner_image)
        const bannerInput = bannerImages !== undefined ? bannerImages : bannerAlias;

        // ✅ Normalize banner images (filter valid URLs)
        const normalizedBanners = normalizeBannerImages(bannerInput);
        const bannerJson = normalizedBanners ? JSON.stringify(normalizedBanners) : null;

        // Check karo settings exist karti hain ya nahi
        const [existing] = await db.query(`SELECT * FROM general_settings WHERE id = 1`);

        if (existing.length === 0) {
            // ✅ Insert
            await db.query(
                `INSERT INTO general_settings 
                 (id, company_logo, banner_image, company_name, support_email, support_phone, address) 
                 VALUES (1, ?, ?, ?, ?, ?, ?)`,
                [
                    companyLogo || null,
                    bannerJson,          // ✅ JSON string ya null
                    companyName,
                    supportEmail,
                    supportPhone,
                    address
                ]
            );
        } else {
            // ✅ Dynamic update — sirf wahi fields jo bheje gaye hain
            let updateFields = [
                'company_name = ?',
                'support_email = ?',
                'support_phone = ?',
                'address = ?',
                'updated_at = NOW()'
            ];
            let params = [companyName, supportEmail, supportPhone, address];

            // ✅ company_logo update (agar bheja gaya ho)
            if (companyLogo !== undefined && companyLogo !== null && companyLogo !== '') {
                updateFields.push('company_logo = ?');
                params.push(companyLogo);
            }

            // ✅ banner_image update (agar banner key present ho)
            // Note: [] (empty array) bhejne se banner null ho jayega (clear)
            if (bannerInput !== undefined) {
                updateFields.push('banner_image = ?');
                params.push(bannerJson);   // null if empty / invalid
            }

            const updateQuery = `
                UPDATE general_settings 
                SET ${updateFields.join(', ')}
                WHERE id = 1
            `;
            await db.query(updateQuery, params);
        }

        // Updated data fetch karo
        const [updatedSettings] = await db.query(`SELECT * FROM general_settings WHERE id = 1 LIMIT 1`);
        let data = updatedSettings[0];

        // ✅ Formatting same as GET
        if (data && data.company_logo && !data.company_logo.startsWith('http')) {
            data.company_logo = null;
        }
        if (data) {
            data.banner_image = normalizeBannerImages(data.banner_image);
        }

        return successResponse(res, 'Settings updated successfully', data);

    } catch (error) {
        console.error('❌ Update Settings Error:', error);
        return errorResponse(res, 'Failed to update settings', 500);
    }
};



// ==================================================
// 3. CHANGE PASSWORD (Super Admin)
// ==================================================
const changePassword = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.user_id;
        if (!userId) return errorResponse(res, 'User ID not found', 401);

        const { currentPassword, newPassword, confirmPassword } = req.body;

        // 1. Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return errorResponse(res, 'All fields are required', 400);
        }

        if (newPassword.length < 8) {
            return errorResponse(res, 'Password must be at least 8 characters long', 400);
        }

        if (newPassword !== confirmPassword) {
            return errorResponse(res, 'New password and confirm password do not match', 400);
        }

        // 2. User fetch karo
        const [users] = await db.query(`SELECT id, password FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (users.length === 0) {
            return errorResponse(res, 'User not found', 404);
        }

        const user = users[0];

        // 3. Current Password verify karo
        const hashedCurrentPassword = await hashPassword(currentPassword); 
        
        if (hashedCurrentPassword !== user.password) {
            return errorResponse(res, 'Current password is incorrect', 400);
        }

        // 4. Naya password hash karo
        const hashedNewPassword = await hashPassword(newPassword);

        // 5. Update karo
        await db.query(`UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?`, [hashedNewPassword, userId]);

        // 🆕 Data pass karo response me
        return successResponse(res, 'Password updated successfully', {
            user_id: userId,
            message: 'Password has been changed successfully'
        });

    } catch (error) {
        console.error('❌ Change Password Error:', error);
        return errorResponse(res, 'Failed to change password', 500);
    }
};



 // ==================================================
// 3. CHANGE PASSWORD (Super Admin)
// ==================================================
const changeAdministratorPassword = async (req, res) => {
    try {
        // 🆕 Token hata diya, ab user_id query ya body se aayega
        const userId = req.query.user_id || req.body.user_id;

        if (!userId) {
            return errorResponse(res, 'User ID is required', 400);
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;

        // 1. Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return errorResponse(res, 'All fields are required', 400);
        }

        if (newPassword.length < 8) {
            return errorResponse(res, 'Password must be at least 8 characters long', 400);
        }

        if (newPassword !== confirmPassword) {
            return errorResponse(res, 'New password and confirm password do not match', 400);
        }

        // 2. User fetch karo
        const [users] = await db.query(`SELECT id, password FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (users.length === 0) {
            return errorResponse(res, 'User not found', 404);
        }

        const user = users[0];

        // 3. Current Password verify karo
        // NOTE: Agar aapke paas comparePassword (bcrypt) function hai toh usko use karein, 
        // hashPassword se compare karna galat ho sakta hai agar salt use ho raha hai.
        // Filhal maine aapka hi logic rakha hai.
        const hashedCurrentPassword = await hashPassword(currentPassword); 
        
        if (hashedCurrentPassword !== user.password) {
            return errorResponse(res, 'Current password is incorrect', 400);
        }

        // 4. Naya password hash karo
        const hashedNewPassword = await hashPassword(newPassword);

        // 5. Update karo
        await db.query(`UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?`, [hashedNewPassword, userId]);

        // Data pass karo response me
        return successResponse(res, 'Password updated successfully', {
            user_id: userId,
            message: 'Password has been changed successfully'
        });

    } catch (error) {
        console.error('❌ Change Password Error:', error);
        return errorResponse(res, 'Failed to change password', 500);
    }
};
// ==================================================
// 1. GET ALL COMPLAINTS (Super Admin List)
// ==================================================
const getAdminComplaints = async (req, res) => {
    try {
        const { search = '', status, category, page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        let params = [];

        // Filters
        if (search) {
            whereClauses.push(`(
                c.id LIKE ? 
                OR c.category LIKE ? 
                OR c.description LIKE ?
                OR s.full_name LIKE ? 
                OR o.order_code LIKE ?
            )`);
            const s = `%${search}%`;
            params.push(s, s, s, s, s);
        }
        if (status && status !== 'All') {
            whereClauses.push(`c.status = ?`);
            params.push(status.toUpperCase().replace(/ /g, '_'));
        }
        if (category && category !== 'All Categories') {
            whereClauses.push(`c.category = ?`);
            params.push(category);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 1. Stats
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed
            FROM complaints
        `);

        const stats = {
            total: Number(statsRows[0]?.total) || 0,
            open: Number(statsRows[0]?.open_count) || 0,
            in_progress: Number(statsRows[0]?.in_progress) || 0,
            resolved: Number(statsRows[0]?.resolved) || 0,
            closed: Number(statsRows[0]?.closed) || 0
        };

        // 2. Count
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total FROM complaints c 
             JOIN students s ON s.id = c.student_id 
             JOIN orders o ON o.id = c.order_id 
             ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // 3. Data Fetch
        const [complaints] = await db.query(`
            SELECT 
                c.id, c.category, c.description, c.status, c.created_at,
                s.full_name as student_name,
                o.outlet_id,
                outl.name as outlet_name
            FROM complaints c
            JOIN students s ON s.id = c.student_id
            JOIN orders o ON o.id = c.order_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            ${whereSQL}
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        const data = complaints.map(c => ({
            id: c.id,
            complaint_id: `CMP-${String(c.id).padStart(4, '0')}`,
            
            // 🆕 Subject ki jagah category ka use kar rahe hain
            subject: c.category, 
            
            student_name: c.student_name,
            outlet: c.outlet_name || 'N/A',
            category: c.category,
            created_at: c.created_at,
            status: c.status
        }));

        return successResponse(res, 'Complaints fetched successfully', {
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
        console.error('❌ Get Admin Complaints Error:', error);
        return errorResponse(res, 'Failed to fetch complaints', 500);
    }
};

// ==================================================
// 2. GET COMPLAINT DETAILS (Super Admin)
// ==================================================
const getAdminComplaintDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch Data
        const [rows] = await db.query(`
            SELECT 
                c.*, 
                s.full_name, s.phone, s.roll_number, s.hostel_name, s.room_number, s.profile_image, c_tbl.name as campus_name,
                o.order_code, 
                o.token_no as order_token, -- Token order table se aayega
                outl.name as outlet_name
            FROM complaints c
            JOIN students s ON s.id = c.student_id
            JOIN orders o ON o.id = c.order_id
            LEFT JOIN campuses c_tbl ON c_tbl.id = s.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            WHERE c.id = ?
        `, [id]);

        if (rows.length === 0) return errorResponse(res, 'Complaint not found', 404);
        const data = rows[0];

        // 2. Fetch Timeline (Using Status Logs + Notes)
        const [notes] = await db.query(`
            SELECT n.*, u.name as staff_name
            FROM complaint_notes n
            JOIN users u ON u.id = n.staff_id
            WHERE n.complaint_id = ?
            ORDER BY n.created_at ASC
        `, [id]);

        // Build Timeline
        let timeline = [
            { title: 'Complaint Created', date: data.created_at, desc: `Complaint submitted by ${data.full_name}` }
        ];
        
        if (data.status !== 'OPEN') {
            timeline.push({ title: `Status Updated to ${data.status}`, date: data.updated_at, desc: 'Assigned to outlet manager' });
        }

        notes.forEach(n => {
            timeline.push({ title: 'Staff Note Added', date: n.created_at, desc: n.note });
        });

        // 3. Format Response
        return successResponse(res, 'Complaint details fetched successfully', {
            id: data.id,
            complaint_id: `CMP-${String(data.id).padStart(4, '0')}`,
            
            // 🆕 Subject ki jagah category
            subject: data.category, 
            
            status: data.status,
            category: data.category,
            created_on: data.created_at,
            last_updated: data.updated_at,
            
            complaint_info: {
                token: data.order_token || 'N/A', 
                description: data.description,
                related_order_id: data.order_code
            },

            student_info: {
                name: data.full_name,
                customer_id: data.roll_number,
                phone: data.phone,
                email: 'N/A', 
                campus: data.campus_name,
                hostel: data.hostel_name,
                room: data.room_number,
                image: data.profile_image ? `https://instawash.siberiancrane.tech/uploads/${data.profile_image}` : null
            },

            outlet_info: {
                name: data.outlet_name,
                campus: data.campus_name,
                hostel: data.hostel_name
            },

            uploaded_photos: data.photo_url ? [data.photo_url] : [],

            timeline: timeline
        });

    } catch (error) {
        console.error('❌ Get Admin Complaint Details Error:', error);
        return errorResponse(res, 'Failed to fetch details', 500);
    }
};

// ==================================================
// 3. UPDATE COMPLAINT STATUS (Super Admin)
// ==================================================
const updateAdminComplaintStatus = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { status, remarks } = req.body;

        if (!status) {
            return errorResponse(res, 'Status is required', 400);
        }

        // 1. Update Status
        await connection.query(`
            UPDATE complaints 
            SET status = ?, updated_at = NOW() 
            WHERE id = ?
        `, [status.toUpperCase(), id]);

        // 2. Add Remark to Notes
        if (remarks) {
            await connection.query(`
                INSERT INTO complaint_notes (complaint_id, staff_id, note) 
                VALUES (?, ?, ?)
            `, [id, req.user.id, `[Admin] ${remarks}`]);
        }

        await connection.commit();

        return successResponse(res, 'Complaint status updated successfully', {
            complaint_id: id,
            new_status: status
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
// GET NOTIFICATION HISTORY (Super Admin)
// ==================================================
const getNotificationHistory = async (req, res) => {
    try {
        const {
            search = '',
            audience,       // 'Students' or 'Outlets'
            status,         // 'Delivered' or 'Failed'
            from_date,
            to_date,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        let params = [];

        // 1. Search Filter (Title, Body, ID)
        if (search && search.trim() !== '') {
            whereClauses.push(`(
                n.id LIKE ? 
                OR n.title LIKE ? 
                OR n.body LIKE ?
            )`);
            const s = `%${search.trim()}%`;
            params.push(s, s, s);
        }

        // 2. Audience Filter
        if (audience && audience !== 'All Audiences') {
            // Maan lo DB me recipient_type 'STUDENT' ya 'OUTLET' hai
            const typeMap = { 'Students': 'STUDENT', 'Outlets': 'OUTLET' };
            if (typeMap[audience]) {
                whereClauses.push(`n.recipient_type = ?`);
                params.push(typeMap[audience]);
            }
        }

        // 3. Status Filter
        if (status && status !== 'All Status') {
            // Delivered = 'DELIVERED' or 'SENT', Failed = 'FAILED'
            if (status === 'Delivered') {
                whereClauses.push(`n.status IN ('DELIVERED', 'SENT')`);
            } else if (status === 'Failed') {
                whereClauses.push(`n.status = 'FAILED'`);
            }
        }

        // 4. Date Filter
        if (from_date) {
            whereClauses.push(`DATE(n.created_at) >= ?`);
            params.push(from_date);
        }
        if (to_date) {
            whereClauses.push(`DATE(n.created_at) <= ?`);
            params.push(to_date);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // ==========================================
        // FETCH STATS (Top Cards)
        // ==========================================
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) AS total_sent,
                SUM(CASE WHEN status IN ('DELIVERED', 'SENT') THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
            FROM notifications
        `);

        const stats = {
            total_sent: Number(statsRows[0]?.total_sent) || 0,
            delivered: Number(statsRows[0]?.delivered) || 0,
            failed: Number(statsRows[0]?.failed) || 0
        };

        // ==========================================
        // PAGINATION COUNT
        // ==========================================
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM notifications n ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // ==========================================
        // FETCH DATA
        // ==========================================
        const [rows] = await db.query(`
            SELECT 
                n.id, n.title, n.recipient_type, n.status, n.created_at,
                n.recipient_id, n.body
            FROM notifications n
            ${whereSQL}
            ORDER BY n.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        // Format Data according to Screenshot
        const data = rows.map(n => {
            // Determine Audience Label
            let audienceLabel = n.recipient_type === 'STUDENT' ? 'Students' : 'Outlets';
            
            // Recipients Text (Yahan hum thoda logic laga sakte hain)
            // Agar recipient_id NULL hai to "All Students" dikhao
            let recipients = 'All Users';
            if (n.recipient_id) {
                recipients = `Specific User (ID: ${n.recipient_id})`;
            }

            // Status Label
            let statusLabel = 'Delivered';
            if (n.status === 'FAILED') statusLabel = 'Failed';

            return {
                id: n.id,
                notification_id: `NOT-${String(n.id).padStart(6, '0')}`,
                title: n.title,
                audience: audienceLabel,
                recipients: recipients,
                sent_on: n.created_at,
                status: statusLabel,
                body: n.body // For view modal
            };
        });

        // ==========================================
        // FINAL RESPONSE
        // ==========================================
        return successResponse(res, 'Notification history fetched successfully', {
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
        console.error('❌ Get Notifications Error:', error);
        return errorResponse(res, 'Failed to fetch notifications', 500);
    }
};

// ==================================================
// GET SUPER ADMIN REPORTS
// GET /api/superadmin/reports
// ==================================================
const getAdminReports = async (req, res) => {
    try {
        const { start_date, end_date, campus_id, outlet_id } = req.query;

        // 1. Default Date Filter (Agar frontend se nahi aaya to last 30 days)
        const today = new Date();
        const defaultStart = new Date(today);
        defaultStart.setDate(today.getDate() - 30);

        const startDate = start_date || defaultStart.toISOString().split('T')[0];
        const endDate = end_date || today.toISOString().split('T')[0];

        // 2. Build Dynamic WHERE clauses
        let orderWhere = `DATE(order_date) BETWEEN ? AND ? AND payment_status = 'PAID'`;
        let orderParams = [startDate, endDate];

        let subWhere = `DATE(created_at) BETWEEN ? AND ? AND payment_status = 'SUCCESS'`;
        let subParams = [startDate, endDate];

        if (campus_id) {
            orderWhere += ` AND campus_id = ?`;
            orderParams.push(campus_id);
            subWhere += ` AND campus_id = ?`;
            subParams.push(campus_id);
        }

        if (outlet_id) {
            orderWhere += ` AND outlet_id = ?`;
            orderParams.push(outlet_id);
            subWhere += ` AND outlet_id = ?`;
            subParams.push(outlet_id);
        }

        // ==========================================
        // 3. FETCH RAW DATA (Orders & Subscriptions)
        // ==========================================
        
        // A. Revenue & Transactions (Orders)
        const [orderRevenue] = await db.query(`
            SELECT 
                SUM(final_amount) as total_collection,
                SUM(subscription_amount) as sub_revenue,
                SUM(extra_amount) as payg_revenue,
                SUM(discount_amount) as total_discount,
                SUM(CASE WHEN discount_amount > 0 THEN 1 ELSE 0 END) as discounted_orders,
                COUNT(id) as total_orders
            FROM orders 
            WHERE ${orderWhere}
        `, orderParams);

        // B. Revenue & Transactions (Subscriptions)
        const [subRevenue] = await db.query(`
            SELECT 
                SUM(payable_amount) as total_collection,
                SUM(discount_amount) as total_discount,
                SUM(CASE WHEN discount_amount > 0 THEN 1 ELSE 0 END) as discounted_subs,
                COUNT(id) as total_subs
            FROM subscriptions_payments 
            WHERE ${subWhere}
        `, subParams);

        // C. Order Status Counts
        const [orderStatusCounts] = await db.query(`
            SELECT 
                COUNT(id) as total,
                SUM(CASE WHEN status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
            FROM orders
            WHERE DATE(order_date) BETWEEN ? AND ? ${campus_id ? 'AND campus_id = ?' : ''} ${outlet_id ? 'AND outlet_id = ?' : ''}
        `, orderParams.slice(0, 2).concat(campus_id ? [campus_id] : [], outlet_id ? [outlet_id] : [])); 
        // Note: Order counts me payment_status nahi lagaya taaki pending/cancelled bhi count hon

        // D. Payment Method Breakdown (Orders)
        const [orderPayments] = await db.query(`
            SELECT payment_method, SUM(final_amount) as amount
            FROM orders
            WHERE ${orderWhere}
            GROUP BY payment_method
        `, orderParams);

        // E. Payment Method Breakdown (Subscriptions)
        const [subPayments] = await db.query(`
            SELECT payment_method, SUM(payable_amount) as amount
            FROM subscriptions_payments
            WHERE ${subWhere}
            GROUP BY payment_method
        `, subParams);

        // F. Daily Trend (Orders)
        const [orderTrend] = await db.query(`
            SELECT DATE_FORMAT(order_date, '%Y-%m-%d') as date, 
                   SUM(final_amount) as revenue, 
                   COUNT(id) as orders
            FROM orders
            WHERE ${orderWhere}
            GROUP BY DATE_FORMAT(order_date, '%Y-%m-%d')
            ORDER BY date ASC
        `, orderParams);

        // G. Daily Trend (Subscriptions)
        const [subTrend] = await db.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, 
                   SUM(payable_amount) as revenue
            FROM subscriptions_payments
            WHERE ${subWhere}
            GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
            ORDER BY date ASC
        `, subParams);

        // H. Data by Campus & Outlet (Merged)
        const [orderByOutlet] = await db.query(`
            SELECT 
                o.campus_id, c.name as campus_name,
                o.outlet_id, outl.name as outlet_name,
                SUM(o.final_amount) as total_revenue,
                SUM(o.subscription_amount) as sub_revenue,
                SUM(o.extra_amount) as payg_revenue,
                SUM(o.discount_amount) as discount,
                SUM(CASE WHEN o.discount_amount > 0 THEN 1 ELSE 0 END) as discounted_orders,
                COUNT(o.id) as total_orders,
                SUM(CASE WHEN o.status IN ('COLLECTED', 'DELIVERED') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN o.status IN ('RECEIVED', 'IN_WASH', 'READY_FOR_COLLECTION') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN o.payment_method = 'CASH' THEN o.final_amount ELSE 0 END) as cash,
                SUM(CASE WHEN o.payment_method IN ('UPI', 'ONLINE') THEN o.final_amount ELSE 0 END) as upi,
                SUM(CASE WHEN o.payment_method = 'QR' THEN o.final_amount ELSE 0 END) as counter_qr
            FROM orders o
            LEFT JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN outlets outl ON outl.id = o.outlet_id
            WHERE ${orderWhere}
            GROUP BY o.campus_id, o.outlet_id
        `, orderParams);

        const [subByOutlet] = await db.query(`
            SELECT 
                campus_id, outlet_id, 
                SUM(payable_amount) as total_revenue,
                SUM(discount_amount) as discount,
                SUM(CASE WHEN discount_amount > 0 THEN 1 ELSE 0 END) as discounted_subs,
                COUNT(id) as total_subs,
                SUM(CASE WHEN payment_method = 'CASH' THEN payable_amount ELSE 0 END) as cash,
                SUM(CASE WHEN payment_method IN ('UPI', 'ONLINE') THEN payable_amount ELSE 0 END) as upi,
                SUM(CASE WHEN payment_method = 'QR' THEN payable_amount ELSE 0 END) as counter_qr
            FROM subscriptions_payments
            WHERE ${subWhere}
            GROUP BY campus_id, outlet_id
        `, subParams);


        // ==========================================
        // 4. CALCULATIONS & MERGING
        // ==========================================

        // --- Section 1: Revenue ---
        const totalRev = (Number(orderRevenue[0]?.total_collection) || 0) + (Number(subRevenue[0]?.total_collection) || 0);
        const subRev = (Number(orderRevenue[0]?.sub_revenue) || 0) + (Number(subRevenue[0]?.total_collection) || 0);
        const paygRev = Number(orderRevenue[0]?.payg_revenue) || 0;
        const totalTx = (Number(orderRevenue[0]?.total_orders) || 0) + (Number(subRevenue[0]?.total_subs) || 0);

        // --- Section 2: Orders ---
        const totalOrders = Number(orderStatusCounts[0]?.total) || 0;
        const completedOrders = Number(orderStatusCounts[0]?.completed) || 0;
        const pendingOrders = Number(orderStatusCounts[0]?.pending) || 0;
        const cancelledOrders = Number(orderStatusCounts[0]?.cancelled) || 0;

        // --- Section 3: Discounts ---
        const totalDiscount = (Number(orderRevenue[0]?.total_discount) || 0) + (Number(subRevenue[0]?.total_discount) || 0);
        const discountedTx = (Number(orderRevenue[0]?.discounted_orders) || 0) + (Number(subRevenue[0]?.discounted_subs) || 0);
        const avgDiscount = discountedTx > 0 ? (totalDiscount / discountedTx) : 0;
        const discountUsagePct = totalTx > 0 ? ((discountedTx / totalTx) * 100).toFixed(1) : 0;

        // --- Section 4: Financials ---
        const grossCollection = totalRev + totalDiscount; // Gross = Net + Discount
        const netCollection = totalRev;

        // Payment Methods Total
        let cashTotal = 0, upiTotal = 0, qrTotal = 0;
        [...orderPayments, ...subPayments].forEach(pm => {
            const amt = Number(pm.amount) || 0;
            const method = (pm.payment_method || '').toUpperCase();
            if (method === 'CASH') cashTotal += amt;
            else if (method === 'UPI' || method === 'ONLINE') upiTotal += amt;
            else if (method === 'QR' || method === 'COUNTER_QR') qrTotal += amt;
        });

        // --- Daily Trend Merge ---
        const trendMap = {};
        orderTrend.forEach(t => trendMap[t.date] = { date: t.date, revenue: Number(t.revenue), orders: Number(t.orders) });
        subTrend.forEach(t => {
            if (!trendMap[t.date]) trendMap[t.date] = { date: t.date, revenue: 0, orders: 0 };
            trendMap[t.date].revenue += Number(t.revenue);
        });
        const dailyTrend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

        // --- Campus/Outlet Merge ---
        const outletMap = {};
        orderByOutlet.forEach(o => {
            const key = `${o.campus_id}_${o.outlet_id}`;
            outletMap[key] = {
                campus: o.campus_name,
                outlet: o.outlet_name,
                total_revenue: Number(o.total_revenue),
                sub_revenue: Number(o.sub_revenue),
                payg_revenue: Number(o.payg_revenue),
                discount: Number(o.discount),
                total_orders: Number(o.total_orders),
                discounted_orders: Number(o.discounted_orders),
                completed: Number(o.completed),
                pending: Number(o.pending),
                cancelled: Number(o.cancelled),
                cash: Number(o.cash),
                upi: Number(o.upi),
                counter_qr: Number(o.counter_qr)
            };
        });

        subByOutlet.forEach(s => {
            const key = `${s.campus_id}_${s.outlet_id}`;
            if (!outletMap[key]) {
                // Agar outlet me sirf subscription hai aur koi order nahi
                outletMap[key] = {
                    campus: s.campus_name || 'Unknown Campus', 
                    outlet: s.outlet_name || 'Unknown Outlet',
                    total_revenue: 0, sub_revenue: 0, payg_revenue: 0,
                    discount: 0, total_orders: 0, discounted_orders: 0,
                    completed: 0, pending: 0, cancelled: 0,
                    cash: 0, upi: 0, counter_qr: 0
                };
            }
            outletMap[key].total_revenue += Number(s.total_revenue);
            outletMap[key].sub_revenue += Number(s.total_revenue); // Subscription payments pure sub revenue hain
            outletMap[key].discount += Number(s.discount);
            outletMap[key].discounted_orders += Number(s.discounted_subs);
            outletMap[key].total_orders += Number(s.total_subs);
            outletMap[key].cash += Number(s.cash);
            outletMap[key].upi += Number(s.upi);
            outletMap[key].counter_qr += Number(s.counter_qr);
        });

        const byOutlet = Object.values(outletMap).map((o, index) => {
            // Har outlet ke hisaab se % calculate karo
            const dPct = o.total_orders > 0 ? ((o.discounted_orders / o.total_orders) * 100).toFixed(1) : 0;
            return {
                s_no: index + 1,
                campus: o.campus,
                outlet: o.outlet,
                total_revenue: o.total_revenue,
                sub_revenue: o.sub_revenue,
                payg_revenue: o.payg_revenue,
                discount_amount: o.discount,
                total_orders: o.total_orders,
                discounted_orders: o.discounted_orders,
                discount_usage_pct: dPct,
                completed: o.completed,
                pending: o.pending,
                cancelled: o.cancelled,
                gross_collection: o.total_revenue + o.discount,
                net_collection: o.total_revenue,
                cash: o.cash,
                upi: o.upi,
                counter_qr: o.counter_qr
            };
        });

        // ==========================================
        // 5. FINAL RESPONSE
        // ==========================================
        return successResponse(res, 'Reports fetched successfully', {
            filters: { start_date: startDate, end_date: endDate, campus_id, outlet_id },
            
            // 1. Revenue Report
            revenue_report: {
                summary: {
                    total_revenue: totalRev,
                    subscription_revenue: subRev,
                    payg_revenue: paygRev,
                    total_transactions: totalTx
                },
                daily_trend: dailyTrend,
                by_outlet: byOutlet.map(o => ({
                    campus: o.campus, outlet: o.outlet,
                    total_revenue: o.total_revenue, subscription_revenue: o.sub_revenue,
                    payg_revenue: o.payg_revenue, transactions: o.total_orders
                }))
            },

            // 2. Order Report
            order_report: {
                summary: {
                    total_orders: totalOrders,
                    completed_orders: completedOrders,
                    pending_orders: pendingOrders,
                    cancelled_orders: cancelledOrders
                },
                daily_trend: dailyTrend.map(t => ({ date: t.date, orders: t.orders })),
                by_outlet: byOutlet.map(o => ({
                    campus: o.campus, outlet: o.outlet,
                    total_orders: o.total_orders, completed: o.completed,
                    pending: o.pending, cancelled: o.cancelled
                }))
            },

            // 3. Discount Usage Report
            discount_report: {
                summary: {
                    total_discount_given: totalDiscount,
                    discounted_transactions: discountedTx,
                    avg_discount_per_order: Number(avgDiscount.toFixed(2)),
                    discount_usage_percent: Number(discountUsagePct)
                },
                by_outlet: byOutlet.map(o => ({
                    campus: o.campus, outlet: o.outlet,
                    discount_amount: o.discount_amount,
                    discounted_orders: o.discounted_orders,
                    total_orders: o.total_orders,
                    discount_usage_pct: o.discount_usage_pct
                }))
            },

            // 4. Financial Summary
            financial_summary: {
                summary: {
                    gross_collection: grossCollection,
                    total_discount: totalDiscount,
                    net_collection: netCollection,
                    cash_collection: cashTotal,
                    upi_collection: upiTotal,
                    counter_qr: qrTotal
                },
                by_outlet: byOutlet.map(o => ({
                    campus: o.campus, outlet: o.outlet,
                    gross_collection: o.gross_collection, discount: o.discount_amount,
                    net_collection: o.net_collection, cash: o.cash,
                    upi: o.upi, counter_qr: o.counter_qr
                }))
            }
        });

    } catch (error) {
        console.error('❌ Get Reports Error:', error);
        return errorResponse(res, 'Failed to fetch reports', 500);
    }
};



// ==================================================
// 1. CREATE FAQ (Add New FAQ)
// ==================================================
const createFaq = async (req, res) => {
    try {
        const { question, answer, status } = req.body;

        // Validation
        if (!question || !answer) {
            return errorResponse(res, 'Question and Answer are required', 400);
        }

        const faqStatus = status === 0 || status === false ? 0 : 1;

        const [result] = await db.query(
            `INSERT INTO faqs (question, answer, status) VALUES (?, ?, ?)`,
            [question, answer, faqStatus]
        );

        return successResponse(res, 'FAQ created successfully', {
            id: result.insertId,
            question,
            answer,
            status: faqStatus
        }, 201);

    } catch (error) {
        console.error('❌ Create FAQ Error:', error);
        return errorResponse(res, 'Failed to create FAQ', 500);
    }
};


// ==================================================
// 2. GET ALL FAQs (List + Filters + Stats)
// ==================================================
const getFaqs = async (req, res) => {
    try {
        const {
            search = '',
            status,          // 'All', 1, 0
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // 1. Build Filters
        let whereClauses = [];
        let params = [];

        if (search && search.trim() !== '') {
            whereClauses.push(`(question LIKE ? OR answer LIKE ?)`);
            const s = `%${search.trim()}%`;
            params.push(s, s);
        }

        if (status !== undefined && status !== '' && status !== 'All') {
            whereClauses.push(`status = ?`);
            params.push(status === '1' || status === 1 ? 1 : 0);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 2. Fetch Stats (Top Cards)
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS inactive
            FROM faqs
        `);

        const stats = {
            total: Number(statsRows[0]?.total) || 0,
            active: Number(statsRows[0]?.active) || 0,
            inactive: Number(statsRows[0]?.inactive) || 0
        };

        // 3. Count for Pagination
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM faqs ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // 4. Fetch Data
        const [faqs] = await db.query(`
            SELECT id, question, answer, status, created_at 
            FROM faqs 
            ${whereSQL}
            ORDER BY id DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        // Format response
        const formattedData = faqs.map(faq => ({
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
            status: faq.status === 1 ? 'Active' : 'Inactive',
            raw_status: faq.status,
            date: faq.created_at
        }));

        return successResponse(res, 'FAQs fetched successfully', {
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
        console.error('❌ Get FAQs Error:', error);
        return errorResponse(res, 'Failed to fetch FAQs', 500);
    }
};


// ==================================================
// 3. UPDATE FAQ (Edit Existing)
// ==================================================
const updateFaq = async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, status } = req.body;

        // Check existence
        const [existing] = await db.query(`SELECT id FROM faqs WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return errorResponse(res, 'FAQ not found', 404);
        }

        // Build Dynamic Update
        let updates = [];
        let params = [];

        if (question !== undefined) { updates.push('question = ?'); params.push(question); }
        if (answer !== undefined) { updates.push('answer = ?'); params.push(answer); }
        if (status !== undefined) { 
            updates.push('status = ?'); 
            params.push(status === 0 || status === false || status === '0' ? 0 : 1); 
        }

        if (updates.length === 0) {
            return errorResponse(res, 'No fields provided to update', 400);
        }

        updates.push('updated_at = NOW()');
        params.push(id);

        // Update the FAQ
        await db.query(
            `UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        // 🆕 Fetch the updated FAQ to send back in response
        const [updatedFaqRows] = await db.query(
            `SELECT id, question, answer, status, created_at, updated_at FROM faqs WHERE id = ? LIMIT 1`,
            [id]
        );
        
        const updatedFaq = updatedFaqRows[0];

        return successResponse(res, 'FAQ updated successfully', {
            id: updatedFaq.id,
            question: updatedFaq.question,
            answer: updatedFaq.answer,
            status: updatedFaq.status === 1 ? 'Active' : 'Inactive',
            raw_status: updatedFaq.status,
            updated_at: updatedFaq.updated_at
        });

    } catch (error) {
        console.error('❌ Update FAQ Error:', error);
        return errorResponse(res, 'Failed to update FAQ', 500);
    }
};
// ==================================================
// 4. DELETE FAQ
// ==================================================
const deleteFaq = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(`DELETE FROM faqs WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return errorResponse(res, 'FAQ not found', 404);
        }

        return successResponse(res, 'FAQ deleted successfully', { id: Number(id) });

    } catch (error) {
        console.error('❌ Delete FAQ Error:', error);
        return errorResponse(res, 'Failed to delete FAQ', 500);
    }
};


const getAdminDailyCollectionList = async (req, res) => {
    try {
        const { 
            date, 
            campus_id, 
            outlet_id, 
            status, 
            search = '', 
            page = 1, 
            limit = 10 
        } = req.query;
        
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const offset = (pageNum - 1) * limitNum;

        // ==========================================
        // 1. DATE LOGIC
        // ==========================================
        let targetDate = date;
        
        if (!targetDate) {
            const [latestDateRows] = await db.query(
                `SELECT collection_date FROM daily_reconciliations ORDER BY collection_date DESC LIMIT 1`
            );
            
            if (latestDateRows.length > 0 && latestDateRows[0].collection_date) {
                const dbDate = new Date(latestDateRows[0].collection_date);
                const year = dbDate.getFullYear();
                const month = String(dbDate.getMonth() + 1).padStart(2, '0');
                const day = String(dbDate.getDate()).padStart(2, '0');
                targetDate = `${year}-${month}-${day}`;
            } else {
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                targetDate = `${year}-${month}-${day}`;
            }
        }

        // ==========================================
        // 2. STATS CALCULATION (Top Cards)
        // ==========================================
        const [statsRow] = await db.query(`
            SELECT 
                COUNT(*) as total_submitted,
                SUM(CASE WHEN UPPER(status) = 'APPROVED' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN UPPER(status) IN ('SUBMITTED', 'PENDING') THEN 1 ELSE 0 END) as pending_review
            FROM daily_reconciliations 
            WHERE DATE(collection_date) = ?
        `, [targetDate]);

        const totalSubmitted = Number(statsRow[0]?.total_submitted) || 0;
        const approved = Number(statsRow[0]?.approved) || 0;
        const pendingReview = Number(statsRow[0]?.pending_review) || 0;

        const [outletCountRow] = await db.query(`SELECT COUNT(*) as total FROM outlets WHERE is_active = 1`);
        const totalActiveOutlets = Number(outletCountRow[0]?.total) || 0;
        const notSubmitted = Math.max(0, totalActiveOutlets - totalSubmitted);

        // ==========================================
        // 3. MAIN LIST QUERY (Filters + Pagination)
        // ==========================================
        let whereClauses = [`DATE(dr.collection_date) = ?`];
        let params = [targetDate];

        // Filter: Campus
        if (campus_id) { 
            whereClauses.push(`o.campus_id = ?`); 
            params.push(campus_id); 
        }
        
        // Filter: Outlet
        if (outlet_id) { 
            whereClauses.push(`o.id = ?`); 
            params.push(outlet_id); 
        }
        
        // Filter: Status
        if (status) {
            if (status === 'Pending Review') {
                whereClauses.push(`UPPER(dr.status) IN ('SUBMITTED', 'PENDING')`);
            } else if (status === 'Approved') {
                whereClauses.push(`UPPER(dr.status) = 'APPROVED'`);
            }
            // Agar "Not Submitted" filter lagega to hum daily_reconciliations me nahi dhundhenge, isliye usko handle nahi kiya yahan.
        }

        // Filter: Search (Outlet Name)
        if (search) {
            whereClauses.push(`o.name LIKE ?`);
            params.push(`%${search}%`);
        }

        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

        // Count for Pagination
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total 
             FROM daily_reconciliations dr 
             JOIN outlets o ON o.id = dr.outlet_id 
             ${whereSQL}`,
            params
        );
        const totalRecords = countRows[0].total;
        const totalPages = Math.ceil(totalRecords / limitNum);

        // Fetch Data with Limit & Offset
        const [rows] = await db.query(`
            SELECT 
                dr.id as recon_id, 
                dr.collection_date, 
                dr.status, 
                dr.submitted_at,
                dr.actual_cash, 
                dr.actual_online, 
                dr.actual_qr,
                dr.expected_cash,
                dr.expected_online,
                dr.expected_qr,
                o.id as outlet_id, 
                o.name as outlet_name, 
                c.name as campus_name,
                u.name as submitted_by_name, 
                u.role as submitted_by_role,
                a.name as approved_by_name
            FROM daily_reconciliations dr
            JOIN outlets o ON o.id = dr.outlet_id
            JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN users u ON u.id = dr.manager_id
            LEFT JOIN users a ON a.id = dr.approved_by
            ${whereSQL}
            ORDER BY dr.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);

        // Format Data
        const data = rows.map(r => {
            const submittedTotal = (Number(r.actual_cash)||0) + (Number(r.actual_online)||0) + (Number(r.actual_qr)||0);
            const expectedTotal = (Number(r.expected_cash)||0) + (Number(r.expected_online)||0) + (Number(r.expected_qr)||0);
            const difference = submittedTotal - expectedTotal;

            let displayStatus = 'Pending Review';
            if (r.status && r.status.toUpperCase() === 'APPROVED') displayStatus = 'Approved';

            return {
                recon_id: r.recon_id,
                outlet_id: r.outlet_id,
                outlet_name: r.outlet_name,
                campus_name: r.campus_name,
                collection_date: r.collection_date,
                submitted_on: r.submitted_at,
                total_submitted: submittedTotal,
                total_expected: expectedTotal,
                difference: difference,
                status: displayStatus,
                submitted_by: r.submitted_by_name ? `${r.submitted_by_name} (${r.submitted_by_role})` : null,
                approved_by: r.approved_by_name || null
            };
        });

        return successResponse(res, 'Admin Daily Collection list fetched', {
            filters_applied: { 
                date: targetDate,
                campus_id: campus_id || 'All',
                outlet_id: outlet_id || 'All',
                status: status || 'All',
                search: search || null
            },
            stats: {
                total_outlets: totalActiveOutlets,
                approved: approved,
                pending_review: pendingReview,
                not_submitted: notSubmitted
            },
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
        console.error('❌ Admin Collection List Error:', error);
        return errorResponse(res, 'Failed to fetch collection list', 500);
    }
};
const getAdminCollectionDetails = async (req, res) => {
    try {
        const { recon_id } = req.params; // daily_reconciliations.id

        const [rows] = await db.query(`
            SELECT 
                dr.*, 
                o.name as outlet_name, o.address as outlet_address,
                c.name as campus_name,
                u.name as manager_name, u.phone as manager_phone, u.email as manager_email,
                a.name as approved_by_name
            FROM daily_reconciliations dr
            JOIN outlets o ON o.id = dr.outlet_id
            JOIN campuses c ON c.id = o.campus_id
            LEFT JOIN users u ON u.id = dr.manager_id
            LEFT JOIN users a ON a.id = dr.approved_by
            WHERE dr.id = ?
        `, [recon_id]);

        if (rows.length === 0) return errorResponse(res, 'Collection record not found', 404);
        const data = rows[0];

        // Reference: Us din ke actual orders ka count nikaalo
        const [orderStats] = await db.query(`
            SELECT 
                COUNT(id) as total_orders,
                SUM(CASE WHEN subscription_usage_kg > 0 OR subscription_amount > 0 THEN 1 ELSE 0 END) as sub_orders,
                SUM(CASE WHEN extra_payg_kg > 0 THEN 1 ELSE 0 END) as payg_orders
            FROM orders
            WHERE outlet_id = ? AND DATE(order_date) = ? AND payment_status = 'PAID'
        `, [data.outlet_id, data.collection_date]);

        // 🎯 ADMIN REVIEW DATA EXTRACT
        const adminReview = {
            admin_difference_cash: Number(data.admin_difference_cash || 0),
            admin_difference_online: Number(data.admin_difference_online || 0),
            admin_difference_qr: Number(data.admin_difference_qr || 0),
            admin_remarks: data.admin_remarks || null
        };

        // 🎯 TIMELINE BANAO (Agar approved hai toh admin details bhi add karo)
        let timeline = [
            { 
                title: 'Submitted by Manager', 
                timestamp: data.submitted_at,
                description: `Submitted by ${data.manager_name}`
            }
        ];

        if (data.status === 'APPROVED') {
            timeline.push({
                title: 'Approved by Admin',
                timestamp: data.approved_at,
                description: `Approved by ${data.approved_by_name}`
            });

            // Agar admin ne koi remarks ya difference dala hai, toh timeline me show karo
            if (adminReview.admin_remarks || adminReview.admin_difference_cash || adminReview.admin_difference_online || adminReview.admin_difference_qr) {
                let reviewDesc = '';
                if (adminReview.admin_difference_cash) reviewDesc += `Cash Diff: ₹${adminReview.admin_difference_cash}. `;
                if (adminReview.admin_difference_online) reviewDesc += `Online Diff: ₹${adminReview.admin_difference_online}. `;
                if (adminReview.admin_difference_qr) reviewDesc += `QR Diff: ₹${adminReview.admin_difference_qr}. `;
                if (adminReview.admin_remarks) reviewDesc += `Remarks: ${adminReview.admin_remarks}`;

                timeline.push({
                    title: 'Admin Review & Notes',
                    timestamp: data.approved_at, // Admin ne approve karte waqt ye dala
                    description: reviewDesc.trim()
                });
            }
        } else {
            timeline.push({
                title: 'Pending review by Admin',
                timestamp: null,
                description: null
            });
        }

        // Response Format
        return successResponse(res, 'Collection details fetched', {
            outlet_info: {
                name: data.outlet_name,
                address: data.outlet_address,
                campus: data.campus_name,
                status: 'Active'
            },
            collection_date: data.collection_date,
            status: data.status, // SUBMITTED, APPROVED
            
            submitted_details: {
                submitted_by: `${data.manager_name} (Outlet Manager)`,
                submitted_on: data.submitted_at,
                contact: data.manager_phone,
                email: data.manager_email
            },

            order_breakdown: {
                total_orders: Number(orderStats[0]?.total_orders) || 0,
                subscription_orders: Number(orderStats[0]?.sub_orders) || 0,
                payg_orders: Number(orderStats[0]?.payg_orders) || 0,
                expected_collection: (Number(data.expected_cash)||0) + (Number(data.expected_online)||0) + (Number(data.expected_qr)||0)
            },

            submitted_collection: {
                cash: Number(data.actual_cash),
                online: Number(data.actual_online),
                qr: Number(data.actual_qr)
            },

            expected_collection: {
                cash: Number(data.expected_cash),
                online: Number(data.expected_online),
                qr: Number(data.expected_qr)
            },

            // 🆕 ADMIN REVIEW SECTION
            admin_review: adminReview,

            timeline: timeline
        });

    } catch (error) {
        console.error('❌ Admin Collection Details Error:', error);
        return errorResponse(res, 'Failed to fetch details', 500);
    }
};
// ==================================================
// APPROVE DAILY COLLECTION (Super Admin)
// ==================================================
/*const approveCollection = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { recon_id } = req.params;
        const adminId = req.user?.id; // Token se Admin ID

        if (!adminId) {
            return errorResponse(res, 'Unauthorized: Admin ID not found', 401);
        }

        // 🆕 Frontend se differences aur remarks aa sakte hain (Screenshot 1 me hai)
        const { 
            admin_difference_cash, 
            admin_difference_online, 
            admin_difference_qr, 
            admin_remarks 
        } = req.body;

        // 1. Check karo ki record exist karta hai aur SUBMITTED state me hai
        const [existing] = await connection.query(
            `SELECT id, status FROM daily_reconciliations WHERE id = ? LIMIT 1`,
            [recon_id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return errorResponse(res, 'Reconciliation record not found', 404);
        }

        if (existing[0].status === 'APPROVED') {
            await connection.rollback();
            return errorResponse(res, 'Record is already approved', 400);
        }

        // 2. Update Query
        await connection.query(`
            UPDATE daily_reconciliations 
            SET 
                status = 'APPROVED', 
                approved_by = ?, 
                approved_at = NOW(),
                admin_difference_cash = ?,
                admin_difference_online = ?,
                admin_difference_qr = ?
            WHERE id = ?
        `, [
            adminId, 
            admin_difference_cash || 0,
            admin_difference_online || 0,
            admin_difference_qr || 0,
            recon_id
        ]);

        await connection.commit();

        // 3. Updated Data fetch karke response me bhejo
        const [updatedRows] = await connection.query(`
            SELECT dr.*, u.name as approved_by_name 
            FROM daily_reconciliations dr
            LEFT JOIN users u ON u.id = dr.approved_by
            WHERE dr.id = ?
        `, [recon_id]);

        return successResponse(res, 'Collection approved successfully', {
            recon_id: Number(recon_id),
            status: 'APPROVED',
            approved_by: updatedRows[0]?.approved_by_name,
            approved_at: updatedRows[0]?.approved_at,
            message: 'The daily collection has been verified and approved.'
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Approve Collection Error:', error);
        return errorResponse(res, 'Failed to approve collection', 500);
    } finally {
        connection.release();
    }
};*/

const approveCollection = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { recon_id } = req.params;
        const adminId = req.user?.id; // Token se Admin ID

        if (!adminId) {
            await connection.rollback(); // Transaction rollback on auth fail
            return errorResponse(res, 'Unauthorized: Admin ID not found', 401);
        }

        // 🆕 Frontend se differences aur remarks aa sakte hain
        const { 
            admin_difference_cash = 0, 
            admin_difference_online = 0, 
            admin_difference_qr = 0, 
            admin_remarks = null 
        } = req.body;

        // 1. Check karo ki record exist karta hai aur SUBMITTED state me hai
        const [existing] = await connection.query(
            `SELECT id, status FROM daily_reconciliations WHERE id = ? LIMIT 1`,
            [recon_id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return errorResponse(res, 'Reconciliation record not found', 404);
        }

        if (existing[0].status === 'APPROVED') {
            await connection.rollback();
            return errorResponse(res, 'Record is already approved', 400);
        }

        // 2. Update Query (Maine admin_remarks bhi add kar diya hai)
        await connection.query(`
            UPDATE daily_reconciliations 
            SET 
                status = 'APPROVED', 
                approved_by = ?, 
                approved_at = NOW(),
                admin_difference_cash = ?,
                admin_difference_online = ?,
                admin_difference_qr = ?,
                admin_remarks = ?
            WHERE id = ?
        `, [
            adminId, 
            admin_difference_cash,
            admin_difference_online,
            admin_difference_qr,
            admin_remarks,
            recon_id
        ]);

        await connection.commit();

        // 3. Updated Data fetch karke response me bhejo
        const [updatedRows] = await connection.query(`
            SELECT dr.*, u.name as approved_by_name 
            FROM daily_reconciliations dr
            LEFT JOIN users u ON u.id = dr.approved_by
            WHERE dr.id = ?
        `, [recon_id]);

        const updatedRecord = updatedRows[0];

        // 🎯 4. Response mein saari updated fields return karo
        return successResponse(res, 'Collection approved successfully', {
            recon_id: Number(recon_id),
            status: 'APPROVED',
            approved_by: updatedRecord?.approved_by_name || 'Admin',
            approved_at: updatedRecord?.approved_at,
            
            // 🆕 Ye wo fields hain jo frontend se aayi thi aur update hui hain
            admin_difference_cash: updatedRecord?.admin_difference_cash,
            admin_difference_online: updatedRecord?.admin_difference_online,
            admin_difference_qr: updatedRecord?.admin_difference_qr,
            admin_remarks: updatedRecord?.admin_remarks,
            
            message: 'The daily collection has been verified and approved.'
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Approve Collection Error:', error);
        return errorResponse(res, 'Failed to approve collection', 500);
    } finally {
        connection.release();
    }
};


// controllers/roleController.js

// ==========================================
// 1. CREATE ROLE (POST)
// ==========================================
const createRole = async (req, res) => {
    try {
        const { role_name, email, password, description, permissions, status } = req.body;

        if (!role_name || !email || !password) {
            return res.status(400).json({ status: false, message: 'Role Name, Email and Password are required' });
        }

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ status: false, message: 'Email already exists' });
        }

        const permissionsJson = JSON.stringify(permissions || {});
        const is_active = status !== undefined ? status : 1;
        const generatedStaffId = `ROLE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // 🔥 roles column ke liye array stringify kar rahe hain
        const rolesArrayJson = JSON.stringify(["Administrator"]);

        const [result] = await db.query(
            `INSERT INTO users 
            (staff_id, name, email, password, role_id, role, roles, permissions, remarks, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                generatedStaffId,
                role_name,
                email,
                password,
                'Administrator',      // role_id
                'Administrator',      // role
                rolesArrayJson,       // roles (ab ["Administrator"] format me jayega)
                permissionsJson,
                description,
                is_active
            ]
        );

        return res.status(201).json({
            status: true,
            message: 'Role created successfully',
            data: { 
                id: result.insertId, 
                staffId: generatedStaffId,
                roleName: role_name, 
                email 
            }
        });

    } catch (error) {
        console.error('Create Role Error:', error);
        return res.status(500).json({ status: false, message: 'Internal server error' });
    }
};
// ==========================================
// 2. GET ALL ROLES (GET) - With Stats & Full Details
// ==========================================
const getRoles = async (req, res) => {
    try {
        const { search, status } = req.query;

        let sql = `
            SELECT id, name AS role_name, email,password, remarks AS description, permissions, is_active AS status, created_at 
            FROM users 
            WHERE role = 'Administrator'
        `;
        const params = [];

        if (search) {
            sql += ` AND (name LIKE ? OR remarks LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (status !== undefined && status !== '') {
            sql += ` AND is_active = ?`;
            params.push(Number(status));
        }

        sql += ` ORDER BY id DESC`;

        const [roles] = await db.query(sql, params);

        // Format data (Har role ka pura data yahin mil jayega)
        const formattedRoles = roles.map(role => {
            const perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;
            
            let totalPermissionsCount = 0;
            if (perms) {
                Object.values(perms).forEach(module => {
                    if (module.view) totalPermissionsCount++;
                    if (module.add) totalPermissionsCount++;
                    if (module.edit) totalPermissionsCount++;
                    if (module.delete) totalPermissionsCount++;
                });
            }

            return {
                id: role.id,
                roleName: role.role_name,
                email: role.email,
				password:role.password,
                description: role.description,
                permissions: perms, // Frontend isko edit karte time use kar lega
                totalPermissionsCount: totalPermissionsCount,
                status: role.status,
                statusName: role.status === 1 ? 'Active' : 'Inactive',
                createdAt: role.created_at
            };
        });

        // Stats for Cards
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
            FROM users
            WHERE role = 'Administrator'
        `);

        return res.status(200).json({
            status: true,
            message: 'Roles fetched successfully',
            stats: {
                totalRoles: stats[0].total || 0,
                activeRoles: Number(stats[0].active) || 0,
                inactiveRoles: Number(stats[0].inactive) || 0
            },
            data: formattedRoles
        });

    } catch (error) {
        console.error('Get Roles Error:', error);
        return res.status(500).json({ status: false, message: 'Failed to fetch roles' });
    }
};

// ==========================================
// 3. UPDATE ROLE (PUT)
// ==========================================
const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role_name, email, password, description, permissions, status } = req.body;

        const [roles] = await db.query('SELECT * FROM users WHERE id = ? AND role = "Administrator"', [id]);
        if (roles.length === 0) {
            return res.status(404).json({ status: false, message: 'Role not found' });
        }

        const permissionsJson = JSON.stringify(permissions || {});
        const is_active = status !== undefined ? status : 1;
        
        // 🔥 roles column array format
        const rolesArrayJson = JSON.stringify(["Administrator"]);

        let sql = `UPDATE users SET name=?, role_id='Administrator', role='Administrator', roles=?, email=?, remarks=?, permissions=?, is_active=?`;
        let params = [role_name, rolesArrayJson, email, description, permissionsJson, is_active];

        if (password && password.trim() !== '') {
            sql += `, password=?`;
            params.push(password);
        }

        sql += ` WHERE id=?`;
        params.push(id);

        await db.query(sql, params);

        return res.status(200).json({
            status: true,
            message: 'Role updated successfully'
        });

    } catch (error) {
        console.error('Update Role Error:', error);
        return res.status(500).json({ status: false, message: 'Failed to update role' });
    }
};



module.exports = {
	getOrderList,
	getOrderById,
	getAdminOrderList,
	getAdminOrderDetails,
  getDashboardStats,
  
  getAllPermissions,
  getUserPermissions,
  updateUserPermissions,
  
  getNetworkReports,
  getAuditLogs,
  createNotice,
  addSubscriptionPlan,
    getSubscriptionPlanList,
    getSubscriptionPlanById,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    updateSubscriptionPlanStatus,
    addPayAsYouGoPlan,
    getPayAsYouGoPlanList,
    getPayAsYouGoPlanById,
    updatePayAsYouGoPlan,
    deletePayAsYouGoPlan,
    updatePayAsYouGoPlanStatus,
    getAllCampuses,
    getCampusById,
    createCampus, 
    updateCampus,
    toggleCampusStatus,
    getAllOutlets,
    getOutletById,
    createOutlet,
    updateOutlet,
    toggleOutletStatus,
    getCampusOutlets,
     createReceptionist,
    getReceptionist,       // 👈 ek hi export
    updateReceptionist,
    getCustomer,
    updateCustomerStatus,
    getStaff,
    getMachines,
    getSuperAdminDashboard,
    getGeneralSettings, 
    updateGeneralSettings, 
    changePassword,
	changeAdministratorPassword,
     getAdminComplaints,
    getAdminComplaintDetails,
    updateAdminComplaintStatus,
    getNotificationHistory,
    getAdminReports,
     createFaq,
    getFaqs,
    updateFaq,
    deleteFaq,
     getAdminDailyCollectionList,
    getAdminCollectionDetails,
    approveCollection,
    createRole,
    getRoles, 
    updateRole,
	getAllPayments
};
