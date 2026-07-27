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
    rejectUnauthorized: true // Más seguro: solo aceptar certificados válidos
  },
  // Seguridad adicional
  charset: 'utf8mb4',
  timezone: '+00:00',
  multipleStatements: false, // Prevenir SQL injection por múltiples sentencias
  namedPlaceholders: true
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
  keepAliveInitialDelay: 10000,
  // Seguridad adicional
  charset: 'utf8mb4',
  timezone: '+00:00',
  multipleStatements: false, // Prevenir SQL injection por múltiples sentencias
  namedPlaceholders: true
};

// Determinar qué configuración usar: Clever Cloud si hay credenciales, sino local
const hasCleverCloudCredentials = process.env.DB_HOST && 
                                   process.env.DB_HOST.includes('clever-cloud.com');
const config = hasCleverCloudCredentials ? cleverCloudConfig : localDbConfig;

console.log(`🔗 Usando configuración: ${hasCleverCloudCredentials ? 'Clever Cloud' : 'Base de datos local (Docker)'}`);

const pool = mysql2.createPool(config);

// Wrapper seguro para execute con validación adicional
const safeExecute = async (sql, params) => {
  // Validar que SQL sea un string
  if (typeof sql !== 'string') {
    throw new Error('SQL query debe ser un string');
  }

  // Validar que no haya múltiples sentencias (doble verificación)
  if (sql.includes(';') && !sql.trim().endsWith(';')) {
    throw new Error('Múltiples sentencias SQL no permitidas por seguridad');
  }

  // Validar longitud de SQL
  if (sql.length > 10000) {
    throw new Error('Query SQL demasiado largo');
  }

  // Validar parámetros
  if (params) {
    if (!Array.isArray(params)) {
      throw new Error('Parámetros deben ser un array');
    }
    // Limitar cantidad de parámetros
    if (params.length > 100) {
      throw new Error('Demasiados parámetros en la consulta');
    }
  }

  return pool.execute(sql, params);
};

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

// Exportar pool y wrapper seguro
module.exports = pool;
module.exports.safeExecute = safeExecute;
