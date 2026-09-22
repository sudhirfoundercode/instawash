require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 INSTAWASH LAUNDRY - CAMPUS ECOSYSTEM BACKEND RUNNING`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📊 Interactive API Tester UI: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

// Keep process active
setInterval(() => {}, 60000);
