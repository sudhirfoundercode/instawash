const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'instawash_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
});

/**
 * Ensures database and schema exist on startup
 */
const initDb = async () => {
  try {
    // First connection without DB selected to ensure instawash_db exists
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });

    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'instawash_db'}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await tempConn.end();

    // Now run schema script if tables don't exist
    const [tables] = await pool.query(`SHOW TABLES LIKE 'users';`);
    if (tables.length === 0) {
      console.log('🔄 Initializing MySQL schema from database.sql...');
      const sqlFilePath = path.join(__dirname, '../../database.sql');
      if (fs.existsSync(sqlFilePath)) {
        const sql = fs.readFileSync(sqlFilePath, 'utf8');
        await pool.query(sql);
        console.log('✅ MySQL schema and initial seed data initialized successfully!');
      }
    }
  } catch (err) {
    console.error('⚠️ Database Auto-Init Warning:', err.message);
  }
};

// Initialize DB on file load
initDb();

module.exports = pool;
