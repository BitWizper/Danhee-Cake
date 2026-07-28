const db = require('../config/db');
const { sanitizeString } = require('../middleware/inputValidator');

exports.getAll = async (req, res, next) => {
  try {
    // Soporte de paginación público
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    if (!limit || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;
    if (!offset || offset < 0) offset = 0;

    const [categories] = await db.execute('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC LIMIT ? OFFSET ?', [limit, offset]);
    
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
