const mysql2 = require('mysql2/promise');
require('dotenv').config();

const pool = mysql2.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }, // Clever Cloud requiere SSL
});

// Test de conexión al arrancar
pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL conectado – Clever Cloud');
    conn.release();
  })
  .catch(err => {
    console.error('❌  Error de conexión MySQL:', err.message);
  });

module.exports = pool;
