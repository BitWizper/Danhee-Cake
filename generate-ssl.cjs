const fs = require('fs');
const path = require('path');
const pem = require('pem');

const sslDir = path.join(__dirname, 'ssl');

// Crear directorio SSL si no existe
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir, { recursive: true });
}

// Generar certificados SSL autofirmados válidos
pem.createCertificate({ days: 365, selfSigned: true }, function(err, keys) {
  if (err) {
    console.error('❌ Error generando certificados:', err.message);
    process.exit(1);
  }
  
  fs.writeFileSync(path.join(sslDir, 'key.pem'), keys.clientKey);
  fs.writeFileSync(path.join(sslDir, 'cert.pem'), keys.certificate);
  
  console.log('✅ Certificados SSL generados en directorio ssl/');
  console.log('cert.pem: Certificado público');
  console.log('key.pem: Clave privada');
  console.log('⚠️  Estos son certificados autofirmados para desarrollo solamente.');
  console.log('💡 El navegador mostrará una advertencia de seguridad - esto es normal para certificados autofirmados.');
});
