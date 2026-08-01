/**
 * setup-dev.js - Script de configuración para desarrollo local
 * Genera automáticamente secretos si no existen en el archivo .env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecret() {
  return crypto.randomBytes(64).toString('base64');
}

function setupEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');

  // Si .env ya existe, verificar si tiene los secretos necesarios
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const hasJwtSecret = envContent.includes('JWT_SECRET=') && !envContent.includes('JWT_SECRET=change-me-in-production');
    const hasRefreshSecret = envContent.includes('REFRESH_TOKEN_SECRET=');

    if (hasJwtSecret && hasRefreshSecret) {
      console.log('✅ .env ya existe con secretos configurados. No se requiere acción.');
      return;
    }

    console.log('⚠️ .env existe pero le faltan secretos. Actualizando...');
  }

  // Leer .env.example como base
  let envContent = '';
  if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  } else {
    // Crear un .env.example básico si no existe
    envContent = `# Configuración de desarrollo local
# Genera secretos automáticamente ejecutando: node setup-dev.js

JWT_SECRET=change-me-in-production
REFRESH_TOKEN_SECRET=
DB_HOST=localhost
DB_PORT=3306
DB_NAME=danhee_cake
DB_USER=root
DB_PASSWORD=
NODE_ENV=development
`;
  }

  // Generar nuevos secretos
  const jwtSecret = generateSecret();
  const refreshSecret = generateSecret();

  // Reemplazar placeholders con secretos generados
  envContent = envContent.replace(/JWT_SECRET=change-me-in-production/g, `JWT_SECRET=${jwtSecret}`);
  envContent = envContent.replace(/REFRESH_TOKEN_SECRET=$/g, `REFRESH_TOKEN_SECRET=${refreshSecret}`);

  // Escribir el archivo .env
  fs.writeFileSync(envPath, envContent);

  console.log('✅ Archivo .env configurado con secretos generados automáticamente');
  console.log('🔒 JWT_SECRET y REFRESH_TOKEN_SECRET han sido generados para desarrollo local');
  console.log('⚠️  NOTA: Estos secretos son solo para desarrollo local.');
  console.log('   Para producción, configura las variables de entorno en tu proveedor de hosting.');
}

// Ejecutar configuración
setupEnvFile();
