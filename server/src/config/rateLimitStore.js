/**
 * rateLimitStore.js - Almacenamiento persistente para rate limits usando SQLite
 * Permite que los contadores de rate limit sobrevivan reinicios del servidor
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../logs');
const dbPath = path.join(dataDir, 'rate-limits.db');

// Asegurar que el directorio existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Crear tabla si no existe
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[RateLimitStore] Error abriendo base de datos:', err);
  } else {
    db.run(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_time INTEGER NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('[RateLimitStore] Error creando tabla:', err);
      } else {
        console.log('[RateLimitStore] Base de datos inicializada correctamente');
        // Limpiar entradas expiradas al iniciar
        cleanExpired();
      }
    });
  }
});

// Limpiar entradas expiradas
function cleanExpired() {
  const now = Date.now();
  db.run('DELETE FROM rate_limits WHERE reset_time < ?', [now], (err) => {
    if (err) {
      console.error('[RateLimitStore] Error limpiando entradas expiradas:', err);
    } else {
      console.log('[RateLimitStore] Entradas expiradas limpiadas');
    }
  });
}

// Obtener contador para una key
function getCounter(key, callback) {
  db.get('SELECT count, reset_time FROM rate_limits WHERE key = ?', [key], (err, row) => {
    if (err) {
      console.error('[RateLimitStore] Error obteniendo contador:', err);
      return callback(err, null);
    }
    
    if (!row) {
      return callback(null, null);
    }
    
    // Verificar si expiró
    if (row.reset_time < Date.now()) {
      db.run('DELETE FROM rate_limits WHERE key = ?', [key], (err) => {
        if (err) console.error('[RateLimitStore] Error borrando entrada expirada:', err);
      });
      return callback(null, null);
    }
    
    callback(null, { count: row.count, reset_time: row.reset_time });
  });
}

// Incrementar contador
function incrementCounter(key, windowMs, callback) {
  const now = Date.now();
  const resetTime = now + windowMs;
  
  db.run(`
    INSERT INTO rate_limits (key, count, reset_time)
    VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = count + 1,
      reset_time = ?
  `, [key, resetTime, resetTime], function(err) {
    if (err) {
      console.error('[RateLimitStore] Error incrementando contador:', err);
      return callback(err);
    }
    
    // Obtener el nuevo valor
    db.get('SELECT count FROM rate_limits WHERE key = ?', [key], (err, row) => {
      if (err) {
        console.error('[RateLimitStore] Error obteniendo nuevo contador:', err);
        return callback(err);
      }
      callback(null, row ? row.count : 1);
    });
  });
}

// Decrementar contador (para solicitudes exitosas si está configurado)
function decrementCounter(key, callback) {
  db.run(`
    UPDATE rate_limits
    SET count = count - 1
    WHERE key = ? AND count > 0
  `, [key], (err) => {
    if (err) {
      console.error('[RateLimitStore] Error decrementando contador:', err);
      return callback(err);
    }
    callback(null);
  });
}

// Resetear contador para una key
function resetCounter(key, callback) {
  db.run('DELETE FROM rate_limits WHERE key = ?', [key], (err) => {
    if (err) {
      console.error('[RateLimitStore] Error reseteando contador:', err);
      return callback(err);
    }
    callback(null);
  });
}

// Obtener estadísticas
function getStats(callback) {
  db.all('SELECT key, count, reset_time FROM rate_limits', [], (err, rows) => {
    if (err) {
      console.error('[RateLimitStore] Error obteniendo estadísticas:', err);
      return callback(err, null);
    }
    
    const now = Date.now();
    const active = rows.filter(row => row.reset_time > now);
    
    callback(null, {
      total: rows.length,
      active: active.length,
      entries: active
    });
  });
}

// Cerrar conexión al cerrar el proceso
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('[RateLimitStore] Error cerrando base de datos:', err);
    } else {
      console.log('[RateLimitStore] Base de datos cerrada');
    }
    process.exit(0);
  });
});

module.exports = {
  getCounter,
  incrementCounter,
  decrementCounter,
  resetCounter,
  getStats,
  cleanExpired
};
