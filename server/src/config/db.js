const mysql2 = require('mysql2/promise');
require('dotenv').config();

// Configuración para Clever Cloud (prioridad cuando hay credenciales)
const cleverCloudConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ssl: { 
    rejectUnauthorized: false
  }
};

// Configuración para base de datos local (fallback para Docker)
const localDbConfig = {
  host: 'database', // Nombre del servicio en docker-compose
  port: 3306,
  database: process.env.DB_NAME || 'danhee_db',
  user: process.env.DB_USER || 'usuario',
  password: process.env.DB_PASSWORD || 'password',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

// Determinar qué configuración usar: Clever Cloud si hay credenciales, sino local
const hasCleverCloudCredentials = process.env.DB_HOST && 
                                   process.env.DB_HOST.includes('clever-cloud.com');
const config = hasCleverCloudCredentials ? cleverCloudConfig : localDbConfig;

console.log(`🔗 Usando configuración: ${hasCleverCloudCredentials ? 'Clever Cloud' : 'Base de datos local (Docker)'}`);

const pool = mysql2.createPool(config);

// Test de conexión
pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL conectado – ${hasCleverCloudCredentials ? 'Clever Cloud' : 'Base de datos local'}`);
    conn.release();
  })
  .catch(err => {
    console.error('❌  Error de conexión MySQL:', err.message);
    console.error('⚠️  El servidor continuará ejecutándose pero la base de datos no estará disponible');
  });

module.exports = pool;
