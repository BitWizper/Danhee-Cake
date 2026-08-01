const db = require('../config/db');
const { sanitizeString } = require('../middleware/inputValidator');

exports.getAll = async (req, res, next) => {
  try {
    // Soporte de paginación público
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    // Soportar parámetro page
    const pageParam = parseInt(req.query.page, 10);
    if (pageParam && pageParam > 0) {
      if (!limit || limit <= 0) limit = 50;
      offset = (pageParam - 1) * limit;
    }
    if (!limit || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;
    if (!offset || offset < 0) offset = 0;

    console.log('[Categories] Ejecutando query con limit:', limit, 'offset:', offset);
    const [categories] = await db.execute(`SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC LIMIT ? OFFSET ?`, [limit, offset]);
    console.log('[Categories] Query exitoso, categorías encontradas:', categories.length);
    
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
    console.error('[Categories] Error en getAll:', err && err.message ? err.message : err);
    console.error('[Categories] Stack:', err.stack);
    return res.status(503).json({ success: false, message: 'No se pudieron obtener las categorías. Intenta de nuevo más tarde.' });
  }
};
