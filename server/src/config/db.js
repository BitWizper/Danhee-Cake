const mysql2 = require('mysql2/promise');
require('dotenv').config();

// Configuración para Clever Cloud (producción)
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
  },
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  multipleStatements: false,
  namedPlaceholders: false
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
  multipleStatements: false,
  namedPlaceholders: false
};

let pool = null;

// Función para intentar conectar con fallback a base de datos local
const createPoolWithFallback = async () => {
  // Primero intentar conectar a Clever Cloud
  try {
    console.log('🔗 Intentando conectar a Clever Cloud MySQL...');
    const cleverCloudPool = mysql2.createPool(cleverCloudConfig);
    const conn = await cleverCloudPool.getConnection();
    console.log('✅  MySQL conectado – Clever Cloud');
    conn.release();
    return cleverCloudPool;
  } catch (cleverError) {
    console.error('❌  No se pudo conectar a Clever Cloud:', cleverError.message);
    console.log('🔄 Intentando conectar a base de datos local (fallback)...');
    
    // Fallback a base de datos local
    try {
      const localPool = mysql2.createPool(localDbConfig);
      const conn = await localPool.getConnection();
      console.log('✅  MySQL conectado – Base de datos local (Docker)');
      conn.release();
      return localPool;
    } catch (localError) {
      console.error('❌  No se pudo conectar a base de datos local:', localError.message);
      console.error('⚠️  El servidor continuará ejecutándose pero la base de datos no estará disponible');
      
      // Retornar pool de Clever Cloud de todas formas (fallará en las queries)
      return mysql2.createPool(cleverCloudConfig);
    }
  }
};

// Inicializar pool con fallback
createPoolWithFallback().then(createdPool => {
  pool = createdPool;
}).catch(err => {
  console.error('❌  Error crítico inicializando pool de conexiones:', err.message);
  pool = mysql2.createPool(cleverCloudConfig);
});

module.exports = pool;
