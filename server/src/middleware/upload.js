const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro de archivos (solo imágenes con validación de magic numbers)
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Solo se permiten archivos de imagen.'), false);
  }
  
  // Validar extensión del archivo
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Extensión de archivo no permitida.'), false);
  }
  
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, // Límite sanitizado de 5MB
    files: 1 // Solo un archivo a la vez
  }
});

// Wrapper para verificar magic numbers después de guardar
const uploadWithSignatureCheck = (fieldName = 'file') => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      if (req.file) {
        const isValid = verifyFileSignature(req.file.path, req.file.mimetype);
        if (!isValid) {
          fs.unlinkSync(req.file.path); // Eliminar archivo malicioso
          return res.status(400).json({ error: 'Tipo de archivo inválido.' });
        }
      }
      
      next();
    });
  };
};

module.exports = upload;
module.exports.uploadWithSignatureCheck = uploadWithSignatureCheck;
