// Middleware para manejar errores de validación de express-validator

const { validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    
    console.error('[Validation] Errores de validación:', formattedErrors);
    console.error('[Validation] Path:', req.path);
    console.error('[Validation] IP:', req.ip);
    
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_REQUEST',
      message: 'Solicitud inválida.'
    });
  }
  
  next();
};

module.exports = handleValidationErrors;
