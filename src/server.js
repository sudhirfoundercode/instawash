
const path = require('path');

// ======================================================
// LOAD ENVIRONMENT VARIABLES
// ======================================================
const dotenvPath = path.resolve(__dirname, '../.env');

const dotenvResult = require('dotenv').config({
    path: dotenvPath
});

if (dotenvResult.error) {
    console.error('❌ ENV FILE LOAD ERROR:', dotenvResult.error.message);
} else {
    console.log('✅ Environment file loaded successfully');
}

console.log('ENV FILE PATH:', dotenvPath);

// ======================================================
// PAYTM CONFIG CHECK
// ======================================================
console.log('PAYTM CONFIG:', {
    MID: process.env.PAYTM_MID ? 'LOADED' : 'MISSING',
    MERCHANT_KEY: process.env.PAYTM_MERCHANT_KEY ? 'LOADED' : 'MISSING',
    ENV: process.env.PAYTM_ENV || 'NOT SET',
    WEBSITE: process.env.PAYTM_WEBSITE || 'NOT SET',
    CALLBACK_URL: process.env.PAYTM_CALLBACK_URL ? 'LOADED' : 'MISSING'
});

// ======================================================
// LOAD APP
// ======================================================
const app = require('./app');

// ======================================================
// SERVER CONFIGURATION
// ======================================================
const PORT = process.env.PORT || 5034;

// ======================================================
// START SERVER
// ======================================================
const server = app.listen(PORT, () => {
    console.log('=======================================================');
    console.log('🚀 INSTAWASH LAUNDRY - CAMPUS ECOSYSTEM BACKEND RUNNING');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📊 Interactive API Tester UI: http://localhost:${PORT}`);
    console.log(`🔐 Paytm Environment: ${process.env.PAYTM_ENV || 'NOT CONFIGURED'}`);
    console.log('=======================================================');
});

// ======================================================
// SERVER ERROR HANDLING
// ======================================================
server.on('error', (error) => {
    console.error('❌ SERVER ERROR:', error.message);

    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
    }
});

// Keep process active
setInterval(() => {}, 60000);


// try {
//   require('dotenv').config();
// } catch (e) {
//   // dotenv optional fallback
// }
// const app = require('./app');

// const PORT = process.env.PORT || 5034;

// const server = app.listen(PORT, () => {
//   console.log(`=======================================================`);
//   console.log(`🚀 INSTAWASH LAUNDRY - CAMPUS ECOSYSTEM BACKEND RUNNING`);
//   console.log(`🌐 Server URL: http://localhost:${PORT}`);
//   console.log(`📊 Interactive API Tester UI: http://localhost:${PORT}`);
//   console.log(`=======================================================`);
// });

// // Keep process active
// setInterval(() => {}, 60000);
