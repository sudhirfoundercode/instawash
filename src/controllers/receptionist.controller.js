const db = require('../config/db');
const { calculatePaygBilling } = require('../utils/payg.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { sendPushNotification} = require('./notification.controller');
const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

// ==================================================
// Helper: Generate Order Code (ORD + 6 digits)
// ==================================================
const generateOrderCode = async (connection) => {
    const MAX_ATTEMPTS = 20;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        const orderCode = `ORD${randomNum}`;

        const [existing] = await connection.query(
            `SELECT id FROM orders WHERE order_code = ? LIMIT 1`,
            [orderCode]
        );

        if (existing.length === 0) return orderCode;
        attempts++;
    }

    return `ORD${Date.now().toString().slice(-6)}`;
};


// ==================================================
// Helper: Generate Token No (A001, A002...)
// ==================================================
const generateTokenNo = async (connection, outletId) => {
    const [rows] = await connection.query(
        `
        SELECT token_no FROM orders
        WHERE outlet_id = ?
          AND DATE(order_date) = CURDATE()
        ORDER BY id DESC
        LIMIT 1
        `,
        [outletId]
    );

    let nextNumber = 1;
    if (rows.length > 0 && rows[0].token_no) {
        const numPart = parseInt(rows[0].token_no.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numPart)) nextNumber = numPart + 1;
    }

    return `A${String(nextNumber).padStart(3, '0')}`;
};


// ==================================================
// Helper: Fetch & Auto-Reset Subscription
// ==================================================
const getActiveSubscription = async (connection, studentId) => {
    const [subs] = await connection.query(
        `
        SELECT
            ss.*,
            sp.plan_name,
            sp.plan_code,
            sp.monthly_wash_limit_kg,
            sp.wash_per_month,
            sp.maximum_weight_per_order_kg
        FROM student_subscriptions ss
        INNER JOIN subscription_plans sp ON sp.id = ss.plan_id
        WHERE ss.student_id = ?
          AND ss.status = 'active'
          AND CURDATE() BETWEEN ss.start_date AND ss.end_date
        ORDER BY ss.id DESC
        LIMIT 1
        `,
        [studentId]
    );

    if (subs.length === 0) return null;

    const sub = subs[0];

    // Monthly auto-reset
    const lastReset = sub.last_reset_date ? new Date(sub.last_reset_date) : null;
    const now = new Date();

    const shouldReset =
        !lastReset ||
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear();

    if (shouldReset) {
        await connection.query(
            `
            UPDATE student_subscriptions
            SET
                quota_kg_used = 0,
                washes_used = 0,
                washes_limit = ?,
                last_reset_date = CURDATE(),
                updated_at = NOW()
            WHERE id = ?
            `,
            [sub.wash_per_month, sub.id]
        );

        sub.quota_kg_used = 0;
        sub.washes_used = 0;
        sub.washes_limit = sub.wash_per_month;
        sub.last_reset_date = now;
    }

    return sub;
};


// ==================================================
// CREATE ORDER
// ==================================================
// const createOrder = async (req, res) => {
//     const connection = await db.getConnection();

//     try {
//         await connection.beginTransaction();

//         const {
//             studentId,
//             campusId,
//             outletId,
//             tokenNo,                    // frontend se (optional)
//             totalWeightKg,
//             subscriptionUsageKg,        // frontend ne calculate kiya
//             extraPaygKg,
//             subscriptionAmount,
//             extraAmount,
//             discountPercent,
//             discountAmount,
//             finalAmount,
//             paymentStatus,
//             paymentMethod,
//             services,
//             remarks,
//             createdBy
//         } = req.body;
// console.log("order api hit");
//         // ---------- Validation ----------
//         if (!studentId) {
//             await connection.rollback();
//             return errorResponse(res, 'studentId is required', 400);
//         }

//         if (!outletId) {
//             await connection.rollback();
//             return errorResponse(res, 'outletId is required', 400);
//         }

//         if (!totalWeightKg || parseFloat(totalWeightKg) <= 0) {
//             await connection.rollback();
//             return errorResponse(res, 'totalWeightKg must be greater than 0', 400);
//         }

//         // ---------- Customer Info ----------
//         const [studentRows] = await connection.query(
//             `SELECT id, full_name, phone, campus_id,  fcm_token FROM students WHERE id = ? LIMIT 1`,
//             [studentId]
//         );

//         if (studentRows.length === 0) {
//             await connection.rollback();
//             return errorResponse(res, 'Student not found', 404);
//         }

//         const student = studentRows[0];
//         const customerType = student.type || 'Student';
//         const finalCampusId = campusId || student.campus_id;

//         // ---------- Generate Codes ----------
//         const orderCode = await generateOrderCode(connection);

//         let finalTokenNo = tokenNo;
//         if (!finalTokenNo) {
//             finalTokenNo = await generateTokenNo(connection, outletId);
//         }

//         // ---------- Values ----------
//         const totalWeight = parseFloat(totalWeightKg);
//         const subUsage = parseFloat(subscriptionUsageKg || 0);
//         const extraKg = parseFloat(extraPaygKg || 0);
//         const subAmt = parseFloat(subscriptionAmount || 0);
//         const extraAmt = parseFloat(extraAmount || 0);
//         const discPct = parseFloat(discountPercent || 0);
//         const discAmt = parseFloat(discountAmount || 0);
//         const finalAmt = parseFloat(finalAmount || 0);

//         // ---------- Insert Order ----------
//         const [insertResult] = await connection.query(
//             `
//             INSERT INTO orders
//             (
//                 order_code,
//                 student_id, customer_name, customer_mobile, customer_type,
//                 campus_id, outlet_id,
//                 token_no, order_date,
//                 total_weight_kg, subscription_usage_kg, extra_payg_kg,
//                 subscription_amount, extra_amount,
//                 discount_percent, discount_amount, final_amount,
//                 payment_status, payment_method,
//                 status, services, remarks, created_by,
//                 created_at, updated_at
//             )
//             VALUES
//             (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?, NOW(), NOW())
//             `,
//             [
//                 orderCode,
//                 studentId,
//                 student.name,
//                 student.phone,
//                 customerType,
//                 finalCampusId,
//                 outletId,
//                 finalTokenNo,
//                 totalWeight,
//                 subUsage,
//                 extraKg,
//                 subAmt,
//                 extraAmt,
//                 discPct,
//                 discAmt,
//                 finalAmt,
//                 paymentStatus || 'TO_BE_PAID_AT_COLLECTION',
//                 paymentMethod || null,
//                 JSON.stringify(Array.isArray(services) ? services : []),
//                 remarks || null,
//                 createdBy || null
//             ]
//         );

//         const orderId = insertResult.insertId;

//         // ---------- Subscription Update (agar usage hua) ----------
//         let subscriptionInfo = null;

//         if (subUsage > 0) {
//             const subscription = await getActiveSubscription(connection, studentId);

//             if (subscription) {
//                 await connection.query(
//                     `
//                     UPDATE student_subscriptions
//                     SET
//                         quota_kg_used = quota_kg_used + ?,
//                         washes_used = washes_used + 1,
//                         updated_at = NOW()
//                     WHERE id = ?
//                     `,
//                     [subUsage, subscription.id]
//                 );

//                 await connection.query(
//                     `
//                     INSERT INTO subscription_usage_logs
//                     (subscription_id, order_id, student_id, quota_used_kg, extra_paid_kg, order_date)
//                     VALUES (?, ?, ?, ?, ?, NOW())
//                     `,
//                     [subscription.id, orderId, studentId, subUsage, extraKg]
//                 );

//                 const quotaTotal = Number(subscription.quota_kg_total);
//                 const newQuotaUsed = Number(subscription.quota_kg_used) + subUsage;
//                 const washesLimit = Number(subscription.wash_per_month);
//                 const newWashesUsed = Number(subscription.washes_used) + 1;

//                 subscriptionInfo = {
//                     hasActivePlan: true,
//                     subscriptionId: subscription.id,
//                     planName: subscription.plan_name,
//                     planCode: subscription.plan_code,
//                     quotaTotalKg: quotaTotal,
//                     quotaUsedKg: newQuotaUsed,
//                     quotaLeftKg: quotaTotal - newQuotaUsed,
//                     washesLimit: washesLimit,
//                     washesUsed: newWashesUsed,
//                     washesLeft: washesLimit - newWashesUsed,
//                     maxPerOrderKg: Number(subscription.maximum_weight_per_order_kg)
//                 };
//             }
//         }

//         // ---------- Status Log ----------
//         await connection.query(
//             `
//             INSERT INTO order_status_logs (order_id, status, remarks, changed_by, created_at)
//             VALUES (?, 'RECEIVED', 'Order created', ?, NOW())
//             `,
//             [orderId, createdBy || null]
//         );
        
//         	try {
//         		console.log("notification Send");
// 	    await sendPushNotification({
// 	    	id: student.id,
// 	    	type:"students",
// 	        token: student.fcm_token,
// 	        title: 'Order Create Successfully 🎁🎉',
// 	        body: 'Your order status has been confirm.',
// 	        data: {
// 	            type: 'order',
// 	            order_id: String(orderId)
// 	        }
// 	    });
// 	} catch (error) {
// 	    console.error('Notification failed:', error.message);
// 	}

//         await connection.commit();
        


        

//         // ---------- Response ----------
//         return successResponse(
//             res,
//             'Order created successfully',
//             {
//                 id: orderId,
//                 orderCode,
//                 tokenNo: finalTokenNo,
//                 status: 'RECEIVED',
//                 orderDate: new Date(),

//                 customer: {
//                     id: studentId,
//                     name: student.name,
//                     mobile: student.phone,
//                     type: customerType
//                 },

//                 campusId: finalCampusId,
//                 outletId,

//                 weight: {
//                     totalWeightKg: totalWeight,
//                     subscriptionUsageKg: subUsage,
//                     extraPaygKg: extraKg
//                 },

//                 amount: {
//                     subscriptionAmount: subAmt,
//                     extraAmount: extraAmt,
//                     discountPercent: discPct,
//                     discountAmount: discAmt,
//                     finalAmount: finalAmt
//                 },

//                 paymentStatus: paymentStatus || 'TO_BE_PAID_AT_COLLECTION',
//                 paymentMethod: paymentMethod || null,

//                 subscription: subscriptionInfo,

//                 services: Array.isArray(services) ? services : []
//             },
//             201
//         );

//     } catch (error) {
//         await connection.rollback();
//         console.error('❌ Create Order Error:', error);
//         console.error('❌ SQL:', error.sqlMessage);
//         return errorResponse(res, 'Failed to create order', 500);
//     } finally {
//         connection.release();
//     }
// };

const createOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            studentId,
            campusId,
            outletId,
            tokenNo,                    // frontend se (optional)
            totalWeightKg,
            subscriptionUsageKg,        // frontend ne calculate kiya
            extraPaygKg,
            subscriptionAmount,
            extraAmount,
            discountPercent,
            discountAmount,
            finalAmount,
            paymentStatus,
            paymentMethod,
            services,
            remarks,
            createdBy
        } = req.body;
        console.log("order api hit");

        // ---------- Validation ----------
        if (!studentId) {
            await connection.rollback();
            return errorResponse(res, 'studentId is required', 400);
        }

        if (!outletId) {
            await connection.rollback();
            return errorResponse(res, 'outletId is required', 400);
        }

        if (!totalWeightKg || parseFloat(totalWeightKg) <= 0) {
            await connection.rollback();
            return errorResponse(res, 'totalWeightKg must be greater than 0', 400);
        }

        // ---------- Customer Info ----------
        const [studentRows] = await connection.query(
            `SELECT id, full_name, phone, campus_id, fcm_token FROM students WHERE id = ? LIMIT 1`,
            [studentId]
        );

        if (studentRows.length === 0) {
            await connection.rollback();
            return errorResponse(res, 'Student not found', 404);
        }

        const student = studentRows[0];
        const customerType = student.type || 'Student';
        const finalCampusId = campusId || student.campus_id;

        // ---------- Fetch Campus & Outlet Names ----------  ✅ NEW
        const [[campusRow]] = await connection.query(
            `SELECT name FROM campuses WHERE id = ? LIMIT 1`,
            [finalCampusId]
        );
        const [[outletRow]] = await connection.query(
            `SELECT name FROM outlets WHERE id = ? LIMIT 1`,
            [outletId]
        );
        const campusName = campusRow?.name || null;
        const outletName = outletRow?.name || null;
        // ----------------------------------------------------

        // ---------- Generate Codes ----------
        const orderCode = await generateOrderCode(connection);

        let finalTokenNo = tokenNo;
        if (!finalTokenNo) {
            finalTokenNo = await generateTokenNo(connection, outletId);
        }

        // ---------- Values ----------
        const totalWeight = parseFloat(totalWeightKg);
        const subUsage = parseFloat(subscriptionUsageKg || 0);
        const extraKg = parseFloat(extraPaygKg || 0);
        const subAmt = parseFloat(subscriptionAmount || 0);
        const extraAmt = parseFloat(extraAmount || 0);
        const discPct = parseFloat(discountPercent || 0);
        const discAmt = parseFloat(discountAmount || 0);
        const finalAmt = parseFloat(finalAmount || 0);

        // ---------- Insert Order ----------
        const [insertResult] = await connection.query(
            `
            INSERT INTO orders
            (
                order_code,
                student_id, customer_name, customer_mobile, customer_type,
                campus_id, outlet_id,
                token_no, order_date,
                total_weight_kg, subscription_usage_kg, extra_payg_kg,
                subscription_amount, extra_amount,
                discount_percent, discount_amount, final_amount,
                payment_status, payment_method,
                status, services, remarks, created_by,
                created_at, updated_at
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?, NOW(), NOW())
            `,
            [
                orderCode,
                studentId,
                student.name,
                student.phone,
                customerType,
                finalCampusId,
                outletId,
                finalTokenNo,
                totalWeight,
                subUsage,
                extraKg,
                subAmt,
                extraAmt,
                discPct,
                discAmt,
                finalAmt,
                paymentStatus || 'TO_BE_PAID_AT_COLLECTION',
                paymentMethod || null,
                JSON.stringify(Array.isArray(services) ? services : []),
                remarks || null,
                createdBy || null
            ]
        );

        const orderId = insertResult.insertId;

        // ---------- Subscription Update (agar usage hua) ----------
        let subscriptionInfo = null;

        if (subUsage > 0) {
            const subscription = await getActiveSubscription(connection, studentId);

            if (subscription) {
                await connection.query(
                    `
                    UPDATE student_subscriptions
                    SET
                        quota_kg_used = quota_kg_used + ?,
                        washes_used = washes_used + 1,
                        updated_at = NOW()
                    WHERE id = ?
                    `,
                    [subUsage, subscription.id]
                );

                await connection.query(
                    `
                    INSERT INTO subscription_usage_logs
                    (subscription_id, order_id, student_id, quota_used_kg, extra_paid_kg, order_date)
                    VALUES (?, ?, ?, ?, ?, NOW())
                    `,
                    [subscription.id, orderId, studentId, subUsage, extraKg]
                );

                const quotaTotal = Number(subscription.quota_kg_total);
                const newQuotaUsed = Number(subscription.quota_kg_used) + subUsage;
                const washesLimit = Number(subscription.wash_per_month);
                const newWashesUsed = Number(subscription.washes_used) + 1;

                subscriptionInfo = {
                    hasActivePlan: true,
                    subscriptionId: subscription.id,
                    planName: subscription.plan_name,
                    planCode: subscription.plan_code,
                    quotaTotalKg: quotaTotal,
                    quotaUsedKg: newQuotaUsed,
                    quotaLeftKg: quotaTotal - newQuotaUsed,
                    washesLimit: washesLimit,
                    washesUsed: newWashesUsed,
                    washesLeft: washesLimit - newWashesUsed,
                    maxPerOrderKg: Number(subscription.maximum_weight_per_order_kg)
                };
            }
        }

        // ---------- Status Log ----------
        await connection.query(
            `
            INSERT INTO order_status_logs (order_id, status, remarks, changed_by, created_at)
            VALUES (?, 'RECEIVED', 'Order created', ?, NOW())
            `,
            [orderId, createdBy || null]
        );

        try {
            console.log("notification Send");
            await sendPushNotification({
                id: student.id,
                type: "students",
                token: student.fcm_token,
                title: 'Order Create Successfully 🎁🎉',
                body: 'Your order status has been confirm.',
                data: {
                    type: 'order',
                    order_id: String(orderId)
                }
            });
        } catch (error) {
            console.error('Notification failed:', error.message);
        }

        await connection.commit();

        // ---------- Response ----------
        return successResponse(
            res,
            'Order created successfully',
            {
                id: orderId,
                orderCode,
                tokenNo: finalTokenNo,
                status: 'RECEIVED',
                orderDate: new Date(),

                customer: {
                    id: studentId,
                    name: student.name,
                    mobile: student.phone,
                    type: customerType
                },

                campusId: finalCampusId,
                campusName: campusName,           // ✅ NEW
                outletId,
                outletName: outletName,           // ✅ NEW

                weight: {
                    totalWeightKg: totalWeight,
                    subscriptionUsageKg: subUsage,
                    extraPaygKg: extraKg
                },

                amount: {
                    subscriptionAmount: subAmt,
                    extraAmount: extraAmt,
                    discountPercent: discPct,
                    discountAmount: discAmt,
                    finalAmount: finalAmt
                },

                paymentStatus: paymentStatus || 'TO_BE_PAID_AT_COLLECTION',
                paymentMethod: paymentMethod || null,

                subscription: subscriptionInfo,

                services: Array.isArray(services) ? services : []
            },
            201
        );

    } catch (error) {
        await connection.rollback();
        console.error('❌ Create Order Error:', error);
        console.error('❌ SQL:', error.sqlMessage);
        return errorResponse(res, 'Failed to create order', 500);
    } finally {
        connection.release();
    }
};


// // ==================================================
// // GET ORDER BY ID
// // ==================================================
// const getOrderById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         if (!id) {
//             return errorResponse(res, 'Order ID is required', 400);
//         }

//         const [orders] = await db.query(
//             `
//             SELECT
//                 o.*,
//                 c.name AS campus_name,
//                 outl.name AS outlet_name,
//                 outl.section AS outlet_section
//             FROM orders o
//             LEFT JOIN campuses c ON c.id = o.campus_id
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             WHERE o.id = ?
//             LIMIT 1
//             `,
//             [id]
//         );

//         if (orders.length === 0) {
//             return errorResponse(res, 'Order not found', 404);
//         }

//         const o = orders[0];

//         const [logs] = await db.query(
//             `SELECT * FROM order_status_logs WHERE order_id = ? ORDER BY created_at ASC`,
//             [id]
//         );

//         const [usageLogs] = await db.query(
//             `SELECT * FROM subscription_usage_logs WHERE order_id = ? LIMIT 1`,
//             [id]
//         );

//         let servicesArr = [];
//         try {
//             servicesArr = o.services
//                 ? (typeof o.services === 'string' ? JSON.parse(o.services) : o.services)
//                 : [];
//         } catch (e) {
//             servicesArr = [];
//         }

//         const data = {
//             id: o.id,
//             orderCode: o.order_code,
//             tokenNo: o.token_no,
//             orderDate: o.order_date,
//             status: o.status,

//             customer: {
//                 id: o.student_id,
//                 name: o.customer_name,
//                 mobile: o.customer_mobile,
//                 type: o.customer_type
//             },

//             campus: {
//                 id: o.campus_id,
//                 name: o.campus_name
//             },

//             outlet: {
//                 id: o.outlet_id,
//                 name: o.outlet_name,
//                 section: o.outlet_section
//             },

//             weight: {
//                 totalWeightKg: Number(o.total_weight_kg),
//                 subscriptionUsageKg: Number(o.subscription_usage_kg),
//                 extraPaygKg: Number(o.extra_payg_kg)
//             },

//             amount: {
//                 subscriptionAmount: Number(o.subscription_amount),
//                 extraAmount: Number(o.extra_amount),
//                 discountPercent: Number(o.discount_percent),
//                 discountAmount: Number(o.discount_amount),
//                 finalAmount: Number(o.final_amount)
//             },

//             payment: {
//                 status: o.payment_status,
//                 method: o.payment_method
//             },

//             services: servicesArr,
//             statusLogs: logs,

//             subscriptionUsage: usageLogs.length > 0
//                 ? {
//                     subscriptionId: usageLogs[0].subscription_id,
//                     quotaUsedKg: Number(usageLogs[0].quota_used_kg),
//                     extraPaidKg: Number(usageLogs[0].extra_paid_kg),
//                     orderDate: usageLogs[0].order_date
//                 }
//                 : null,

//             remarks: o.remarks,
//             createdAt: o.created_at,
//             updatedAt: o.updated_at
//         };

//         return successResponse(res, 'Order fetched successfully', data);

//     } catch (error) {
//         console.error('❌ Get Order By ID Error:', error);
//         return errorResponse(res, 'Failed to fetch order', 500);
//     }
// };


// // ==================================================
// // GET ORDER LIST
// // ==================================================
// const getOrderList = async (req, res) => {
//     try {
//         const {
//             search = '',
//             status,
//             campus_id,
//             outlet_id,
//             student_id,
//             from_date,
//             to_date,
//             page = 1,
//             limit = 10
//         } = req.query;

//         const pageNum = Math.max(1, parseInt(page) || 1);
//         const limitNum = Math.max(1, parseInt(limit) || 10);
//         const offset = (pageNum - 1) * limitNum;

//         let whereClauses = [];
//         let params = [];

//         if (search && search.trim() !== '') {
//             whereClauses.push(`(
//                 o.order_code LIKE ?
//                 OR o.token_no LIKE ?
//                 OR o.customer_name LIKE ?
//                 OR o.customer_mobile LIKE ?
//             )`);
//             const s = `%${search.trim()}%`;
//             params.push(s, s, s, s);
//         }

//         if (status) {
//             whereClauses.push(`o.status = ?`);
//             params.push(status);
//         }

//         if (campus_id) {
//             whereClauses.push(`o.campus_id = ?`);
//             params.push(Number(campus_id));
//         }

//         if (outlet_id) {
//             whereClauses.push(`o.outlet_id = ?`);
//             params.push(Number(outlet_id));
//         }

//         if (student_id) {
//             whereClauses.push(`o.student_id = ?`);
//             params.push(Number(student_id));
//         }

//         if (from_date) {
//             whereClauses.push(`DATE(o.order_date) >= ?`);
//             params.push(from_date);
//         }

//         if (to_date) {
//             whereClauses.push(`DATE(o.order_date) <= ?`);
//             params.push(to_date);
//         }

//         const whereSQL = whereClauses.length > 0
//             ? `WHERE ${whereClauses.join(' AND ')}`
//             : '';

//         const [countRows] = await db.query(
//             `SELECT COUNT(*) AS total FROM orders o ${whereSQL}`,
//             params
//         );
//         const totalRecords = countRows[0].total;
//         const totalPages = Math.ceil(totalRecords / limitNum);

//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id, o.order_code, o.token_no, o.order_date,
//                 o.customer_name, o.customer_mobile, o.customer_type,
//                 o.total_weight_kg, o.subscription_usage_kg, o.extra_payg_kg,
//                 o.final_amount,
//                 o.payment_status, o.status,
//                 c.name AS campus_name,
//                 outl.name AS outlet_name
//             FROM orders o
//             LEFT JOIN campuses c ON c.id = o.campus_id
//             LEFT JOIN outlets outl ON outl.id = o.outlet_id
//             ${whereSQL}
//             ORDER BY o.id DESC
//             LIMIT ${limitNum} OFFSET ${offset}
//             `,
//             params
//         );

//         return successResponse(res, 'Orders fetched successfully', {
//             data: rows.map(r => ({
//                 id: r.id,
//                 orderCode: r.order_code,
//                 tokenNo: r.token_no,
//                 orderDate: r.order_date,
//                 customerName: r.customer_name,
//                 customerMobile: r.customer_mobile,
//                 customerType: r.customer_type,
//                 totalWeightKg: Number(r.total_weight_kg),
//                 subscriptionUsageKg: Number(r.subscription_usage_kg),
//                 extraPaygKg: Number(r.extra_payg_kg),
//                 finalAmount: Number(r.final_amount),
//                 paymentStatus: r.payment_status,
//                 status: r.status,
//                 campusName: r.campus_name,
//                 outletName: r.outlet_name
//             })),
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
// GET STUDENT SUBSCRIPTION STATUS
// ==================================================
const getStudentSubscriptionStatus = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { studentId } = req.params;

        if (!studentId) {
            return errorResponse(res, 'studentId is required', 400);
        }

        const subscription = await getActiveSubscription(connection, studentId);

        if (!subscription) {
            return successResponse(res, 'No active subscription', {
                hasActivePlan: false,
                message: 'No active subscription'
            });
        }

        const quotaTotal = Number(subscription.quota_kg_total);
        const quotaUsed = Number(subscription.quota_kg_used);
        const washesLimit = Number(subscription.wash_per_month);
        const washesUsed = Number(subscription.washes_used);

        return successResponse(res, 'Subscription status fetched', {
            hasActivePlan: true,
            subscriptionId: subscription.id,
            planName: subscription.plan_name,
            planCode: subscription.plan_code,

            startDate: subscription.start_date,
            endDate: subscription.end_date,

            quotaTotalKg: quotaTotal,
            quotaUsedKg: quotaUsed,
            quotaLeftKg: quotaTotal - quotaUsed,

            washesLimit,
            washesUsed,
            washesLeft: washesLimit - washesUsed,

            maxPerOrderKg: Number(subscription.maximum_weight_per_order_kg),

            canUseNow: washesUsed < washesLimit && quotaUsed < quotaTotal
        });

    } catch (error) {
        console.error('❌ Get Subscription Status Error:', error);
        return errorResponse(res, 'Failed to fetch subscription status', 500);
    } finally {
        connection.release();
    }
};




const getNotificationList = async (req, res) => {
    try {
        let {
            user_id,
            type,
            page = 1,
            limit = 10
        } = req.query;

        // Required validation
        if (!user_id || !type) {
            return res.status(400).json({
                success: false,
                message: 'user_id and type are required'
            });
        }

        const userId = Number(user_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid user_id is required'
            });
        }

        // Validate pagination
        page = Number(page);
        limit = Number(limit);

        if (
            !Number.isInteger(page) ||
            !Number.isInteger(limit) ||
            page < 1 ||
            limit < 1
        ) {
            return res.status(400).json({
                success: false,
                message: 'page and limit must be positive integers'
            });
        }

        // Maximum 100 records per page
        limit = Math.min(limit, 100);

        const offset = (page - 1) * limit;

        // Match both user_id and type
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM notifications
             WHERE recipient_id = ?
               AND recipient_type = ?`,
            [userId, type]
        );

        const totalRecords = Number(countRows[0].total);
        const totalPages = Math.ceil(totalRecords / limit);

        // Fetch only matching user's notifications
        const [notifications] = await db.query(
            `SELECT
                id,
                recipient_id AS user_id,
                recipient_type AS type,
                title,
                body,
                notification_type,
                data,
                status,
                fcm_message_id,
                created_at,
                updated_at
             FROM notifications
             WHERE recipient_id = ?
               AND recipient_type = ?
             ORDER BY id DESC
             LIMIT ? OFFSET ?`,
            [userId, type, limit, offset]
        );

        return res.status(200).json({
            success: true,
            message: 'Notification list fetched successfully',
            user_id: userId,
            type,
            pagination: {
                currentPage: page,
                limit,
                totalRecords,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },
            data: notifications
        });

    } catch (error) {
        console.error('Get notification list error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch notification list',
            error: error.message
        });
    }
};


module.exports = {
    createOrder,
    // getOrderById,
    // getOrderList,
    getStudentSubscriptionStatus,
    getNotificationList
};