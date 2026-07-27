const db = require('../config/db');
const { sanitizeString } = require('../middleware/inputValidator');

exports.getAll = async (req, res, next) => {
  try {
    const [categories] = await db.execute('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
    
    // Sanitizar datos de respuesta
    const sanitizedCategories = categories.map(cat => ({
      id: cat.id,
      name: sanitizeString(cat.name, 100),
      slug: sanitizeString(cat.slug, 100),
      sort_order: cat.sort_order,
      is_active: cat.is_active
    }));
    
    res.json({
      success: true,
      data: sanitizedCategories
    });
  } catch (err) {
    next(err);
  }
};
