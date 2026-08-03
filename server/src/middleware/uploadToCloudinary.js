const cloudinary = require('../config/cloudinary');
const fs = require('fs');

const uploadToCloudinary = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'danhee-cakes',
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });

    req.cloudinaryUrl = result.secure_url;
    req.cloudinaryPublicId = result.public_id;

    fs.unlinkSync(req.file.path);

    next();
  } catch (error) {
    console.error('[Cloudinary] Error al subir imagen:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen al servidor.'
    });
  }
};

module.exports = uploadToCloudinary;