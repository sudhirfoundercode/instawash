const db = require('../config/db');
const axios = require('axios');
const PaytmChecksum = require('paytmchecksum');

const {
    successResponse,
    errorResponse
} = require('../utils/response.utils');

// ======================================================
// GENERATE UNIQUE ORDER ID (Short Alphanumeric)
// ======================================================
const generateId = (prefix) => {
    const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `${prefix}${randomStr}`;
};

// ======================================================
// GET USER ID FROM REQUEST BODY
// ======================================================
const getUserIdFromBody = (req) => {
    const userId =
        req.body?.user_id ??
        req.body?.userId ??
        req.body?.userid ??
        null;

    return userId !== null && userId !== undefined && String(userId).trim() !== ''
        ? String(userId).trim()
        : null;
};

// ======================================================
// GET BUSINESS ORDER ID FROM REQUEST BODY
// ======================================================
const getBusinessOrderIdFromBody = (req) => {
    const raw =
        req.body?.order_id ??
        req.body?.orderId ??
        req.body?.business_order_id ??
        null;

    return raw !== null && raw !== undefined && String(raw).trim() !== ''
        ? String(raw).trim()
        : null;
};

// ======================================================
// PAYTM CONFIGURATION (Common for Wallet & Subscription)
// ======================================================
const getPaytmConfig = () => {
    const isProduction =
        String(process.env.PAYTM_ENV || 'staging').toLowerCase() === 'production';

    return {
        MID: process.env.PAYTM_MID,
        MERCHANT_KEY: process.env.PAYTM_MERCHANT_KEY,
        WEBSITE: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
        HOST: isProduction
            ? 'https://secure.paytmpayments.com'
            : 'https://securestage.paytmpayments.com'
    };
};

// ======================================================
// 1. CREATE WALLET ORDER (Order Payment)
// POST /api/student/create_wallet_order
// ======================================================
const createWalletOrder = async (req, res) => {
    try {
        const user_id = getUserIdFromBody(req);

        console.log('PAYTM USER ID =>', user_id);

        if (!user_id) {
            return errorResponse(res, 'user_id is required', 400);
        }

        const business_order_id = getBusinessOrderIdFromBody(req);

        if (!business_order_id) {
            return errorResponse(res, 'order_id is required', 400);
        }

        const { amount } = req.body;

        if (
            amount === undefined ||
            amount === null ||
            amount === '' ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) < 1
        ) {
            return errorResponse(res, 'Minimum amount is ₹1', 400);
        }

        const config = getPaytmConfig();

        if (!config.MID || !config.MERCHANT_KEY) {
            return errorResponse(res, 'Paytm configuration is missing', 500);
        }

        if (!process.env.PAYTM_CALLBACK_URL) {
            return errorResponse(res, 'Paytm callback URL is missing', 500);
        }

        const [orderRows] = await db.query(
            `SELECT id, student_id, final_amount, payment_status
             FROM orders
             WHERE id = ? AND student_id = ?
             LIMIT 1`,
            [business_order_id, user_id]
        );

        if (!orderRows.length) {
            return errorResponse(res, 'Order not found for this user', 404);
        }

        if (String(orderRows[0].payment_status || '').toLowerCase() === 'paid') {
            return errorResponse(res, 'Order is already paid', 400);
        }

        const paymentAmount = Number(amount).toFixed(2);

        if (
            orderRows[0].final_amount !== null &&
            orderRows[0].final_amount !== undefined &&
            Number(orderRows[0].final_amount).toFixed(2) !== paymentAmount
        ) {
            return errorResponse(res, 'Amount does not match order amount', 400);
        }

        const paytm_order_id = generateId('WALLET');

        const paytmBody = {
            requestType: 'Payment',
            mid: config.MID,
            websiteName: config.WEBSITE,
            orderId: paytm_order_id,
            callbackUrl: process.env.PAYTM_CALLBACK_URL,
            txnAmount: {
                value: paymentAmount,
                currency: 'INR'
            },
            userInfo: {
                custId: String(user_id)
            }
        };

        const checksum = await PaytmChecksum.generateSignature(
            JSON.stringify(paytmBody),
            config.MERCHANT_KEY
        );

        const paytmResponse = await axios.post(
            `${config.HOST}/theia/api/v1/initiateTransaction?mid=${config.MID}&orderId=${paytm_order_id}`,
            {
                body: paytmBody,
                head: { signature: checksum }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );

        const responseData = paytmResponse.data;
        const txnToken = responseData?.body?.txnToken;

        if (!txnToken) {
            console.log('PAYTM INITIATE RESPONSE =>', responseData);
            return errorResponse(
                res,
                responseData?.body?.resultInfo?.resultMsg || 'Unable to initiate Paytm payment',
                400
            );
        }

        await db.query(
            `INSERT INTO wallet_transactions
            (
                user_id,
                business_order_id,
                paytm_order_id,
                reference_id,
                amount,
                payment_gateway,
                status
            )
            VALUES (?, ?, ?, NULL, ?, 'PAYTM', 'pending')`,
            [
                user_id,
                business_order_id,
                paytm_order_id,
                paymentAmount
            ]
        );

        return successResponse(
            res,
            'Paytm order created successfully',
            {
                order_id: business_order_id,
                paytm_order_id: paytm_order_id,
                amount: paymentAmount,
                txnToken: txnToken,
                mid: config.MID,
                callbackUrl: process.env.PAYTM_CALLBACK_URL,
                paymentUrl: `${config.HOST}/theia/api/v1/showPaymentPage`
            }
        );

    } catch (error) {
        console.log('PAYTM CREATE ERROR =>', error.response?.data || error.message);
        return errorResponse(res, 'Unable to create wallet order', 500);
    }
};

// ======================================================
// 2. VERIFY WALLET PAYMENT
// POST /api/student/verify_wallet_payment
// ======================================================
const verifyWalletPayment = async (req, res) => {
    let connection;

    try {
        const user_id = getUserIdFromBody(req);
        if (!user_id) return errorResponse(res, 'user_id is required', 400);

        const business_order_id = getBusinessOrderIdFromBody(req);
        if (!business_order_id) return errorResponse(res, 'order_id is required', 400);

        const config = getPaytmConfig();
        if (!config.MID || !config.MERCHANT_KEY) return errorResponse(res, 'Paytm configuration is missing', 500);

        const [transactions] = await db.query(
            `SELECT * FROM wallet_transactions 
             WHERE business_order_id = ? AND user_id = ? AND payment_gateway = 'PAYTM' 
             ORDER BY id DESC LIMIT 1`,
            [business_order_id, user_id]
        );

        if (!transactions.length) return errorResponse(res, 'Transaction not found', 404);

        const transaction = transactions[0];
        const paytm_order_id = transaction.paytm_order_id;

        if (transaction.status === 'success') {
            return successResponse(res, 'Payment already verified', {
                order_id: business_order_id, status: 'success'
            });
        }

        const statusBody = { mid: config.MID, orderId: paytm_order_id };
        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(statusBody), config.MERCHANT_KEY);

        const statusResponse = await axios.post(
            `${config.HOST}/v3/order/status`,
            { body: statusBody, head: { signature: checksum } },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const paytmData = statusResponse.data?.body;
        if (!paytmData) return errorResponse(res, 'Invalid Paytm response', 400);

        const resultStatus = paytmData.resultInfo?.resultStatus;
        const txnId = paytmData.txnId || null;
        const paidAmount = Number(paytmData.txnAmount);

        if (resultStatus !== 'TXN_SUCCESS') {
            await db.query(
                `UPDATE wallet_transactions SET status = 'failed', transaction_id = ?, payment_response = ? 
                 WHERE paytm_order_id = ? AND user_id = ?`,
                [txnId, JSON.stringify(statusResponse.data), paytm_order_id, user_id]
            );
            return errorResponse(res, paytmData.resultInfo?.resultMsg || 'Payment failed', 400);
        }

        if (paidAmount.toFixed(2) !== Number(transaction.amount).toFixed(2)) {
            return errorResponse(res, 'Payment amount mismatch', 400);
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [lockedTransactions] = await connection.query(
            `SELECT * FROM wallet_transactions WHERE paytm_order_id = ? AND user_id = ? FOR UPDATE`,
            [paytm_order_id, user_id]
        );

        if (lockedTransactions[0].status === 'success') {
            await connection.commit();
            return successResponse(res, 'Payment already verified', { order_id: business_order_id, status: 'success' });
        }

        await connection.query(
            `UPDATE wallet_transactions 
             SET status = 'success', transaction_id = ?, payment_response = ? 
             WHERE paytm_order_id = ? AND user_id = ?`,
            [txnId, JSON.stringify(statusResponse.data), paytm_order_id, user_id]
        );

        // ✅ Yaha orders table me payment_status ke sath status bhi 'COLLECTED' update ho raha hai
        await connection.query(
            `UPDATE orders 
             SET payment_status = 'paid', 
                 payment_method = 'online',
                 updated_at = NOW()
             WHERE id = ? AND student_id = ?`,
            [business_order_id, user_id]
        );

        await connection.commit();

        return successResponse(res, 'Order payment verified and marked as paid', {
            order_id: business_order_id,
            transactionId: txnId,
            amount: transaction.amount,
            status: 'success'
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (e) { console.log(e.message); }
        }
        console.log('PAYTM VERIFY ERROR =>', error.response?.data || error.message);
        return errorResponse(res, 'Unable to verify Paytm payment', 500);
    } finally {
        if (connection) connection.release();
    }
};
// ======================================================
// SUBSCRIPTION PAYMENTS
// ======================================================

const generateTransactionId = () => {
    const prefix = 'TXN';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${timestamp}${random}`;
};

// @desc    Initiate Subscription Payment + Paytm Gateway
// @route   POST /api/payment/initiate
const initiatePayment = async (req, res) => {
    try {
        const {
            student_id,
            plan_id,
            campus_id,
            outlet_id,
            plan_name,
            original_price,
            discount_amount,
            payable_amount,
            purchase_month,
            validity_start,
            validity_end
        } = req.body;

        if (!student_id || !outlet_id || !payable_amount) {
            return res.status(400).json({
                success: false,
                message: 'Required fields missing (student_id, outlet_id, payable_amount)'
            });
        }

        const transaction_id = generateTransactionId();

        const query = `
            INSERT INTO subscriptions_payments 
            (transaction_id, plan_id, student_id, campus_id, outlet_id, plan_name, original_price, discount_amount, payable_amount, purchase_month, validity_start, validity_end, payment_status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())
        `;

        const [result] = await db.execute(query, [
            transaction_id,
            plan_id,
            student_id,
            campus_id,
            outlet_id,
            plan_name ,
            original_price ,
            discount_amount ,
            payable_amount,
            purchase_month ,
            validity_start ,
            validity_end 
        ]);

        const config = getPaytmConfig();
        const paymentAmount = Number(payable_amount).toFixed(2);
        const paytm_order_id = generateId('SUB'); 

        const paytmBody = {
            requestType: 'Payment',
            mid: config.MID,
            websiteName: config.WEBSITE,
            orderId: paytm_order_id,
            callbackUrl: process.env.PAYTM_CALLBACK_URL,
            txnAmount: { value: paymentAmount, currency: 'INR' },
            userInfo: { custId: String(student_id) }
        };

        const checksum = await PaytmChecksum.generateSignature(
            JSON.stringify(paytmBody),
            config.MERCHANT_KEY
        );

        const paytmResponse = await axios.post(
            `${config.HOST}/theia/api/v1/initiateTransaction?mid=${config.MID}&orderId=${paytm_order_id}`,
            { body: paytmBody, head: { signature: checksum } },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const txnToken = paytmResponse.data?.body?.txnToken;

        if (!txnToken) {
            console.log('PAYTM INITIATE ERROR =>', paytmResponse.data);
            await db.execute(`UPDATE subscriptions_payments SET payment_status = 'Failed' WHERE transaction_id = ?`, [transaction_id]);
            
            return res.status(400).json({
                success: false,
                message: 'Unable to initiate Paytm payment'
            });
        }

        await db.execute(
            `UPDATE subscriptions_payments SET remarks = CONCAT(COALESCE(remarks, ''), ' | Paytm_ID: ', ?) WHERE transaction_id = ?`,
            [paytm_order_id, transaction_id]
        );

        // 👇 Yaha status: "Pending" add kiya gaya hai
        res.status(201).json({
            success: true,
            message: 'Payment initiated successfully. Please complete payment.',
            data: {
                subscription_id: result.insertId,
                transaction_id: transaction_id,
                paytm_order_id: paytm_order_id,
                amount: paymentAmount,
                status: 'Pending', 
                txnToken: txnToken,
                mid: config.MID,
                callbackUrl: process.env.PAYTM_CALLBACK_URL,
                paymentUrl: `${config.HOST}/theia/api/v1/showPaymentPage`
            }
        });

    } catch (error) {
        console.error('INITIATE PAYMENT ERROR =>', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Verify Subscription Payment
// @route   POST /api/payment/verify
const verifySubscriptionPayment = async (req, res) => {
    let connection;
    try {
        const { transaction_id, student_id, paytm_order_id } = req.body;

        if (!transaction_id || !student_id || !paytm_order_id) {
            return res.status(400).json({
                success: false,
                message: 'transaction_id, student_id and paytm_order_id are required'
            });
        }

        const config = getPaytmConfig();

        const statusBody = { mid: config.MID, orderId: paytm_order_id };
        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(statusBody), config.MERCHANT_KEY);

        const statusResponse = await axios.post(
            `${config.HOST}/v3/order/status`,
            { body: statusBody, head: { signature: checksum } },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const paytmData = statusResponse.data?.body;
        if (!paytmData) {
            return res.status(400).json({ success: false, message: 'Invalid Paytm response' });
        }

        const resultStatus = paytmData.resultInfo?.resultStatus;
        const txnId = paytmData.txnId || null;
        const paidAmount = Number(paytmData.txnAmount);

        if (resultStatus !== 'TXN_SUCCESS') {
            await db.execute(
                `UPDATE subscriptions_payments SET payment_status = 'Failed' WHERE transaction_id = ? AND student_id = ?`,
                [transaction_id, student_id]
            );
            return res.status(400).json({ success: false, message: paytmData.resultInfo?.resultMsg || 'Payment failed' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [lockedSubs] = await connection.query(
            `SELECT id, payment_status, payable_amount FROM subscriptions_payments WHERE transaction_id = ? AND student_id = ? FOR UPDATE`,
            [transaction_id, student_id]
        );

        if (!lockedSubs.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        if (lockedSubs[0].payment_status === 'Success') {
            await connection.commit();
            return res.status(200).json({ success: true, message: 'Payment already verified', data: { transaction_id, status: 'Success' } });
        }

        if (paidAmount.toFixed(2) !== Number(lockedSubs[0].payable_amount).toFixed(2)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
        }

        // Remarks wali query hata di gayi hai (column missing error se bachne ke liye)
        await connection.query(
            `UPDATE subscriptions_payments 
             SET payment_status = 'Success' 
             WHERE transaction_id = ? AND student_id = ?`,
            [transaction_id, student_id]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Subscription payment verified successfully',
            data: {
                transaction_id: transaction_id,
                transactionId: txnId,
                amount: paidAmount,
                status: 'Success',
                subscription_status: 'Pending' // 👈 Ye add kiya gaya hai
            }
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (e) { console.log(e.message); }
        }
        console.error('VERIFY SUB ERROR =>', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Unable to verify payment' });
    } finally {
        if (connection) connection.release();
    }
};
// ======================================================
// EXPORT CONTROLLERS
// ======================================================
module.exports = {
    createWalletOrder,
    verifyWalletPayment,
    initiatePayment, 
    verifySubscriptionPayment 
};