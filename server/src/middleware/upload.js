const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

// Magic numbers para validar tipos de archivo reales
const FILE_SIGNATURES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46]
};

// Función para verificar magic numbers del archivo
const verifyFileSignature = (filePath, mimetype) => {
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);
  
  const signature = FILE_SIGNATURES[mimetype];
  if (!signature) return false;
  
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  
  return true;
};

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync('uploads', { recursive: true });
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

// Filtro de archivos (solo imágenes con validación de magic numbers)
const fileFilter = (req, file, cb) => {
  const originalName = (file.originalname || '').toLowerCase();
  const ext = path.extname(originalName);
  const safeName = path.basename(originalName, ext).replace(/[^a-z0-9._-]/g, '');

  if (!file.mimetype || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Solo se permiten archivos de imagen válidos.'), false);
  }

  if (!ALLOWED_EXTENSIONS.includes(ext) || !safeName) {
    return cb(new Error('Extensión de archivo no permitida.'), false);
  }

  if (file.originalname && file.originalname !== path.basename(file.originalname)) {
    return cb(new Error('Nombre de archivo inválido.'), false);
  }

  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1
  }
});

// Wrapper para verificar magic numbers después de guardar
const uploadWithSignatureCheck = (fieldName = 'file') => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error_code: 'UPLOAD_BLOCKED',
          message: err.message || 'Carga de archivo bloqueada.'
        });
      }
      
      if (req.file) {
        const isValid = verifyFileSignature(req.file.path, req.file.mimetype);
        if (!isValid) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            error_code: 'UPLOAD_BLOCKED',
            message: 'Tipo de archivo inválido.'
          });
        }
      }
      
      next();
    });
  };
};

module.exports = upload;
module.exports.uploadWithSignatureCheck = uploadWithSignatureCheck;
