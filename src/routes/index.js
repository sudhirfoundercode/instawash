const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const superadminRoutes = require('./superadmin.routes');
const managerRoutes = require('./manager.routes');
const receptionistRoutes = require('./receptionist.routes');
const accountantRoutes = require('./accountant.routes');
const studentRoutes = require('./student.routes');

router.use('/auth', authRoutes);
router.use('/superadmin', superadminRoutes);
router.use('/manager', managerRoutes);
router.use('/receptionist', receptionistRoutes);
router.use('/accountant', accountantRoutes);
router.use('/student', studentRoutes);

module.exports = router;
