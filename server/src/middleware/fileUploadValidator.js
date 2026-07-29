/**
 * Middleware de Validación de Archivos Subidos
 * Valida tipos MIME, tamaños y extensiones de archivos
 */

const fs = require('fs');
const path = require('path');

// Configuración de límites
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg'
];

// Extensiones peligrosas bloqueadas
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
  '.js',
  '.vbs',
  '.ps1',
  '.py',
  '.rb',
  '.pl',
  '.cgi'
];

/**
 * Validar tipo MIME real del archivo
 */
const validateMimeType = (filePath, declaredMimeType) => {
  try {
    const fileSignature = fs.readFileSync(filePath, { encoding: 'hex', start: 0, end: 20 });
    
    // Firmas de archivos comunes
    const signatures = {
      'ffd8ffe0': 'image/jpeg',
      'ffd8ffe1': 'image/jpeg',
      'ffd8ffe2': 'image/jpeg',
      '89504e47': 'image/png',
      '47494638': 'image/gif',
      '5244464c': 'image/webp',
      '3c3f786d': 'image/svg+xml'
    };
    
    const signature = fileSignature.substring(0, 8);
    const detectedType = signatures[signature];
    
    // Si el tipo declarado no coincide con el tipo detectado
    if (detectedType && detectedType !== declaredMimeType) {
      return {
        valid: false,
        error: 'MIME type mismatch: declared type does not match file signature',
        declared: declaredMimeType,
        detected: detectedType
      };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to validate file signature' };
  }
};

/**
 * Validar extensión del archivo
 */
const validateExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  
  // Verificar si es una extensión peligrosa
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: 'Dangerous file extension detected',
      extension: ext
    };
  }
  
  // Verificar si es una extensión permitida
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: 'File extension not allowed',
      extension: ext,
      allowed: ALLOWED_EXTENSIONS
    };
  }
  
  return { valid: true };
};

/**
 * Validar tamaño del archivo
 */
const validateFileSize = (fileSize) => {
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'File size exceeds maximum limit',
      size: fileSize,
      maxSize: MAX_FILE_SIZE
    };
  }
  
  return { valid: true };
};

/**
 * Validar nombre del archivo (evitar path traversal)
 */
const validateFileName = (filename) => {
  // Detectar path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid filename: path traversal detected'
    };
  }
  
  // Detectar caracteres peligrosos
  const dangerousChars = /[<>:"|?*\x00-\x1F]/;
  if (dangerousChars.test(filename)) {
    return {
      valid: false,
      error: 'Invalid filename: contains dangerous characters'
    };
  }
  
  // Limitar longitud del nombre
  if (filename.length > 255) {
    return {
      valid: false,
      error: 'Filename too long (max 255 characters)'
    };
  }
  
  return { valid: true };
};

/**
 * Middleware de validación de archivos
 */
const fileUploadValidator = (req, res, next) => {
  if (!req.file) {
    return next();
  }
  
  const file = req.file;
  
  // Validar nombre del archivo
  const nameValidation = validateFileName(file.originalname);
  if (!nameValidation.valid) {
    fs.unlinkSync(file.path); // Eliminar archivo
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_FILENAME',
      message: nameValidation.error
    });
  }
  
  // Validar tamaño
  const sizeValidation = validateFileSize(file.size);
  if (!sizeValidation.valid) {
    fs.unlinkSync(file.path); // Eliminar archivo
    return res.status(400).json({
      success: false,
      error_code: 'FILE_TOO_LARGE',
      message: sizeValidation.error
    });
  }
  
  // Validar extensión
  const extValidation = validateExtension(file.originalname);
  if (!extValidation.valid) {
    fs.unlinkSync(file.path); // Eliminar archivo
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_EXTENSION',
      message: extValidation.error
    });
  }
  
  // Validar tipo MIME
  const mimeValidation = validateMimeType(file.path, file.mimetype);
  if (!mimeValidation.valid) {
    fs.unlinkSync(file.path); // Eliminar archivo
    return res.status(400).json({
      success: false,
      error_code: 'MIME_TYPE_MISMATCH',
      message: mimeValidation.error
    });
  }
  
  // Si pasa todas las validaciones, continuar
  next();
};

/**
 * Middleware para validación de múltiples archivos
 */
const multiFileValidator = (fieldName, maxFiles = 5) => {
  return (req, res, next) => {
    if (!req.files || !req.files[fieldName]) {
      return next();
    }
    
    const files = Array.isArray(req.files[fieldName]) 
      ? req.files[fieldName] 
      : [req.files[fieldName]];
    
    // Validar cantidad de archivos
    if (files.length > maxFiles) {
      // Eliminar todos los archivos
      files.forEach(file => {
        if (file.path) fs.unlinkSync(file.path);
      });
      
      return res.status(400).json({
        success: false,
        error_code: 'TOO_MANY_FILES',
        message: `Maximum ${maxFiles} files allowed`
      });
    }
    
    // Validar cada archivo
    for (const file of files) {
      const nameValidation = validateFileName(file.originalname);
      if (!nameValidation.valid) {
        files.forEach(f => {
          if (f.path) fs.unlinkSync(f.path);
        });
        
        return res.status(400).json({
          success: false,
          error_code: 'INVALID_FILENAME',
          message: nameValidation.error
        });
      }
      
      const sizeValidation = validateFileSize(file.size);
      if (!sizeValidation.valid) {
        files.forEach(f => {
          if (f.path) fs.unlinkSync(f.path);
        });
        
        return res.status(400).json({
          success: false,
          error_code: 'FILE_TOO_LARGE',
          message: sizeValidation.error
        });
      }
      
      const extValidation = validateExtension(file.originalname);
      if (!extValidation.valid) {
        files.forEach(f => {
          if (f.path) fs.unlinkSync(f.path);
        });
        
        return res.status(400).json({
          success: false,
          error_code: 'INVALID_EXTENSION',
          message: extValidation.error
        });
      }
      
      const mimeValidation = validateMimeType(file.path, file.mimetype);
      if (!mimeValidation.valid) {
        files.forEach(f => {
          if (f.path) fs.unlinkSync(f.path);
        });
        
        return res.status(400).json({
          success: false,
          error_code: 'MIME_TYPE_MISMATCH',
          message: mimeValidation.error
        });
      }
    }
    
    next();
  };
};

module.exports = {
  fileUploadValidator,
  multiFileValidator,
  validateMimeType,
  validateExtension,
  validateFileSize,
  validateFileName,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS
};
