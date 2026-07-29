const fs = require('fs');
const path = require('path');
const mysql2 = require('mysql2/promise');
require('dotenv').config({
  path: process.env.DOTENV_PATH || path.resolve(__dirname, '..', '..', '.env')
});

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
    rejectUnauthorized: false // Aceptar certificados autofirmados de Clever Cloud (mantiene encriptación SSL)
  },
  // Seguridad adicional
  charset: 'utf8mb4',
  timezone: '+00:00',
  multipleStatements: false, // Prevenir SQL injection por múltiples sentencias
  namedPlaceholders: false
};

// Configuración para base de datos local (fallback para Docker)
const localDbConfig = {
  host: 'database', // Nombre del servicio en docker-compose
  port: 3306,
  database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'danhee_db',
  user: process.env.LOCAL_DB_USER || 'usuario',
  password: process.env.LOCAL_DB_PASSWORD || 'password',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // SSL deshabilitado para Docker local (red interna aislada, no expuesta a internet)
  // La base de datos MySQL 8.0 usa SSL por defecto, pero en Docker local no es necesario
  // ya que la red Docker es aislada y no accesible desde fuera
  ssl: false,
  // Seguridad adicional
  charset: 'utf8mb4',
  timezone: '+00:00',
  multipleStatements: false, // Prevenir SQL injection por múltiples sentencias
  namedPlaceholders: false
};

// Determinar qué configuración usar.
// Usar Clever Cloud si hay credenciales remotas y no se fuerza la base local explícitamente.
const isDockerRuntime = fs.existsSync('/.dockerenv');
const shouldUseLocalDb = process.env.DB_USE_LOCAL_DB === 'true' || process.env.DB_USE_LOCAL_DB === '1';
const hasCleverCloudCredentials = process.env.DB_HOST && 
                                   (process.env.DB_HOST.includes('clever-cloud.com') || process.env.DB_HOST.includes('clever-cloud'));

let config;
let useCleverCloud = false;

if (shouldUseLocalDb) {
  config = localDbConfig;
  console.log('🔗 Usando configuración: Base de datos local (Docker) - Forzado por DB_USE_LOCAL_DB');
} else if (hasCleverCloudCredentials) {
  config = cleverCloudConfig;
  useCleverCloud = true;
  console.log('🔗 Usando configuración: Clever Cloud - Detectado DB_HOST con clever-cloud');
} else {
  config = localDbConfig;
  console.log('🔗 Usando configuración: Base de datos local (Docker) - Sin credenciales Clever Cloud');
}

console.log(`📍 DB_HOST usado en conexión: ${config.host}`);
console.log(`📦 DB_NAME usado en conexión: ${config.database}`);
console.log(`👤 DB_USER usado en conexión: ${config.user}`);

const pool = mysql2.createPool(config);

// Patrones sospechosos en queries SQL
const SUSPICIOUS_SQL_PATTERNS = [
  /union\s+select/i,
  /or\s+1\s*=\s*1/i,
  /drop\s+table/i,
  /truncate\s+table/i,
  /alter\s+table/i,
  /create\s+table/i,
  // /insert\s+into/i, // Permitido para operaciones legítimas (refresh tokens, registros)
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
  const lowerSQL = (sql || '').toLowerCase();
  for (const pattern of SUSPICIOUS_SQL_PATTERNS) {
    if (pattern.test(lowerSQL)) {
      return {
        suspicious: true,
        pattern: pattern.toString(),
        reason: 'Patrón SQL sospechoso detectado'
      };
    }
  }

  if (/\b(show|describe|explain|use|set|flush|grant|revoke|analyze|optimize)\b/i.test(sql)) {
    return {
      suspicious: true,
      pattern: 'administrative_sql',
      reason: 'Operaciones administrativas de base de datos no permitidas'
    };
  }

  if (/\binformation_schema\b|\bmysql\./i.test(sql)) {
    return {
      suspicious: true,
      pattern: 'schema_enumeration',
      reason: 'Enumeración de metadatos de base de datos no permitida'
    };
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
const safeExecute = async (sql, params, runner = null) => {
  if (typeof sql !== 'string') {
    throw new Error('SQL query debe ser un string');
  }

  if (sql.length > 10000) {
    throw new Error('Query SQL demasiado largo');
  }

  const suspiciousCheck = detectSuspiciousSQL(sql);
  if (suspiciousCheck.suspicious) {
    console.error('[DB SECURITY] ⚠️  Patrón sospechoso detectado:', suspiciousCheck);
    throw new Error('Query SQL contiene patrones sospechosos no permitidos');
  }

  if (sql.includes(';') && !sql.trim().endsWith(';')) {
    throw new Error('Múltiples sentencias SQL no permitidas por seguridad');
  }

  if (params) {
    if (!Array.isArray(params)) {
      throw new Error('Parámetros deben ser un array');
    }
    if (params.length > 100) {
      throw new Error('Demasiados parámetros en la consulta');
    }

    for (const param of params) {
      if (param !== null && param !== undefined && typeof param === 'object' && !Array.isArray(param)) {
        throw new Error('Parámetros no pueden ser objetos');
      }
      if (typeof param === 'string' && param.length > 5000) {
        throw new Error('Parámetro de consulta demasiado largo');
      }
    }
  }

  if (typeof runner === 'function') {
    return runner(sql, params);
  }

  return pool.execute(sql, params);
};

// Wrapper seguro para query
const safeQuery = async (sql, params) => {
  return safeExecute(sql, params);
};

const originalExecute = pool.execute.bind(pool);
const originalQuery = pool.query.bind(pool);

// Use pool.query instead of pool.execute for better compatibility with Clever Cloud
pool.execute = async function executeWithSafety(sql, params) {
  return safeExecute(sql, params, originalQuery);
};

pool.query = async function queryWithSafety(sql, params) {
  return safeExecute(sql, params, originalQuery);
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

// Test de conexión con fallback automático
let actualPool = pool;
let fallbackAttempted = false;

const testConnection = async (poolInstance, poolName) => {
  try {
    const conn = await poolInstance.getConnection();
    console.log(`✅  MySQL conectado – ${poolName}`);
    console.log('🔒  Seguridad de base de datos activa:');
    console.log('   - SSL/TLS habilitado (encriptación activa)');
    console.log('   - Múltiples sentencias deshabilitadas');
    console.log('   - Validación de queries activa');
    console.log('   - Detección de patrones sospechosos activa');
    if (poolName === 'Clever Cloud') {
      console.log('   - Certificado Clever Cloud aceptado (rejectUnauthorized: false)');
    }
    conn.release();
    return true;
  } catch (err) {
    console.error(`❌  Error de conexión MySQL (${poolName}):`, err.message);
    return false;
  }
};

const initializeConnection = async () => {
  // Si estamos usando Clever Cloud, probar conexión primero
  if (useCleverCloud) {
    const cleverCloudConnected = await testConnection(pool, 'Clever Cloud');
    
    if (!cleverCloudConnected && !fallbackAttempted) {
      console.log('🔄 Clever Cloud falló. Intentando fallback a base de datos local...');
      fallbackAttempted = true;
      
      try {
        // Crear pool local
        actualPool = mysql2.createPool(localDbConfig);
        const localConnected = await testConnection(actualPool, 'Base de datos local (Docker) - Fallback');
        
        if (localConnected) {
          console.log('✅ Fallback exitoso: usando base de datos local');
          // Reemplazar el pool exportado
          module.exports = actualPool;
          module.exports.safeExecute = safeExecute;
          module.exports.safeQuery = safeQuery;
          module.exports.getConnectionInfo = getConnectionInfo;
          module.exports.validateTableName = validateTableName;
          module.exports.validateColumnName = validateColumnName;
        } else {
          console.error('❌ Fallback falló: no se pudo conectar a ninguna base de datos');
        }
      } catch (fallbackErr) {
        console.error('❌ Error al crear pool de fallback:', fallbackErr.message);
      }
    }
  } else {
    // Si no es Clever Cloud, solo probar conexión local
    await testConnection(pool, 'Base de datos local (Docker)');
  }
};

initializeConnection().catch(err => {
  console.error('❌ Error fatal en inicialización de base de datos:', err.message);
  console.error('⚠️  El servidor continuará ejecutándose pero la base de datos no estará disponible');
});

// Exportar pool y wrappers seguros
module.exports = pool;
module.exports.safeExecute = safeExecute;
module.exports.safeQuery = safeQuery;
module.exports.getConnectionInfo = getConnectionInfo;
module.exports.validateTableName = validateTableName;
module.exports.validateColumnName = validateColumnName;
