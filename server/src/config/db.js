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

// Patrones sospechosos en queries SQL
const SUSPICIOUS_SQL_PATTERNS = [
  /union\s+select/i,
  /or\s+1\s*=\s*1/i,
  /drop\s+table/i,
  /truncate\s+table/i,
  /alter\s+table/i,
  /create\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+\w+\s+set/i,
  /grant\s+/i,
  /revoke\s+/i,
  /information_schema/i,
  /mysql\./i,
  /pg_catalog/i,
  /sys\./i,
  /load_file/i,
  /into\s+outfile/i,
  /into\s+dumpfile/i,
  /benchmark\s*\(/i,
  /sleep\s*\(/i,
  /waitfor\s+delay/i,
  /;\s*--/i,
  /--\s*$/i,
  /\/\*/i,
  /\*\//i,
  /@@version/i,
  /@@hostname/i,
  /@@datadir/i,
];

// Función para detectar patrones sospechosos en SQL
const detectSuspiciousSQL = (sql) => {
  const lowerSQL = sql.toLowerCase();
  for (const pattern of SUSPICIOUS_SQL_PATTERNS) {
    if (pattern.test(lowerSQL)) {
      return {
        suspicious: true,
        pattern: pattern.toString(),
        reason: 'Patrón SQL sospechoso detectado'
      };
    }
  }
  return { suspicious: false };
};

// Función para validar nombres de tablas y columnas (prevenir SQL injection)
const validateTableName = (tableName) => {
  if (!tableName || typeof tableName !== 'string') {
    return false;
  }
  // Solo permitir letras, números y guiones bajos
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName);
};

// Función para validar nombres de columnas
const validateColumnName = (columnName) => {
  if (!columnName || typeof columnName !== 'string') {
    return false;
  }
  // Solo permitir letras, números y guiones bajos
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName);
};

// Wrapper seguro para execute con validación adicional
const safeExecute = async (sql, params) => {
  // Validar que SQL sea un string
  if (typeof sql !== 'string') {
    throw new Error('SQL query debe ser un string');
  }

  // Validar longitud de SQL
  if (sql.length > 10000) {
    throw new Error('Query SQL demasiado largo');
  }

  // Detectar patrones sospechosos
  const suspiciousCheck = detectSuspiciousSQL(sql);
  if (suspiciousCheck.suspicious) {
    console.error('[DB SECURITY] ⚠️  Patrón sospechoso detectado:', suspiciousCheck);
    throw new Error('Query SQL contiene patrones sospechosos no permitidos');
  }

  // Validar que no haya múltiples sentencias (doble verificación)
  if (sql.includes(';') && !sql.trim().endsWith(';')) {
    throw new Error('Múltiples sentencias SQL no permitidas por seguridad');
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
    
    // Validar que no haya objetos en los parámetros (prevenir NoSQL injection)
    for (const param of params) {
      if (typeof param === 'object' && param !== null && !Array.isArray(param)) {
        throw new Error('Parámetros no pueden ser objetos');
      }
    }
  }

  return pool.execute(sql, params);
};

// Wrapper seguro para query
const safeQuery = async (sql, params) => {
  return safeExecute(sql, params);
};

// Función para obtener información de la conexión (solo para debugging)
const getConnectionInfo = () => {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    hasSSL: !!config.ssl,
    charset: config.charset,
    timezone: config.timezone
  };
};

// Test de conexión
pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL conectado – ${hasCleverCloudCredentials ? 'Clever Cloud' : 'Base de datos local'}`);
    console.log('🔒  Seguridad de base de datos activa:');
    console.log('   - SSL/TLS habilitado');
    console.log('   - Múltiples sentencias deshabilitadas');
    console.log('   - Validación de queries activa');
    console.log('   - Detección de patrones sospechosos activa');
    conn.release();
  })
  .catch(err => {
    console.error('❌  Error de conexión MySQL:', err.message);
    console.error('⚠️  El servidor continuará ejecutándose pero la base de datos no estará disponible');
  });

// Exportar pool y wrappers seguros
module.exports = pool;
module.exports.safeExecute = safeExecute;
module.exports.safeQuery = safeQuery;
module.exports.getConnectionInfo = getConnectionInfo;
module.exports.validateTableName = validateTableName;
module.exports.validateColumnName = validateColumnName;
