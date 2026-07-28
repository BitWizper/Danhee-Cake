const db = require('../config/db');
const { sanitizeString, validateNumber } = require('../middleware/inputValidator');

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith('/uploads/')) return imageUrl;
  if (imageUrl.includes('/uploads/')) {
    const filename = imageUrl.split('/uploads/').pop();
    return `/uploads/${filename}`;
  }
  return imageUrl;
};

/**
 * Obtener todos los pasteles, opcionalmente filtrados por categoría o repostero.
 */
exports.getAll = async (req, res, next) => {
  const { category, baker, featured } = req.query;
  let { limit, offset } = req.query;
  limit = parseInt(limit, 10);
  offset = parseInt(offset, 10);
  // Soporte `page` además de `offset`
  const pageParam = parseInt(req.query.page, 10);
  if (pageParam && pageParam > 0) {
    if (!limit || limit <= 0) limit = 20;
    offset = (pageParam - 1) * limit;
  }

  if (!limit || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  if (!offset || offset < 0) offset = 0;
  
  // Validar y sanitizar inputs
  const sanitizedCategory = sanitizeString(category, 100);
  const sanitizedBaker = sanitizeString(baker, 50);
  const sanitizedFeatured = sanitizeString(featured, 10);
  
  let query = `
    SELECT c.*, b.business_name, b.location, cat.name as category_name 
    FROM cakes c
    JOIN baker_profiles b ON c.baker_id = b.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE 1=1
  `;
  const params = [];

  if (sanitizedCategory) {
    query += ' AND cat.slug = ?';
    params.push(sanitizedCategory);
  }

  if (sanitizedBaker) {
    if (!validateNumber(sanitizedBaker)) {
      return res.status(400).json({ success: false, message: 'baker debe ser un número válido.' });
    }
    query += ' AND c.baker_id = ?';
    params.push(parseInt(sanitizedBaker, 10));
  }

  if (sanitizedFeatured === 'true') {
    query += ' AND c.is_featured = 1';
  }

  try {
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    const [cakes] = await db.execute(query, params);
    const normalizedCakes = cakes.map((cake) => ({
      ...cake,
      image_url: normalizeImageUrl(cake.image_url),
    }));
    res.json({
      success: true,
        data: normalizedCakes
    });
  } catch (err) {
    console.error('[Cakes] Error en getAll:', err && err.message ? err.message : err);
    // Responder amigablemente para evitar que el frontend reciba un 500 HTML
    return res.status(503).json({ success: false, message: 'No se pudieron obtener los pasteles. Intenta de nuevo más tarde.' });
  }
};

/**
 * Obtener un pastel por ID.
 */
exports.getById = async (req, res, next) => {
  const { id } = req.params;
  
  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);
  
  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({ success: false, message: 'ID debe ser un número válido.' });
  }
  
  try {
    const [cakes] = await db.execute(`
      SELECT c.*, b.business_name, b.location, b.bio, cat.name as category_name
      FROM cakes c
      JOIN baker_profiles b ON c.baker_id = b.id
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = ?
    `, [parseInt(sanitizedId, 10)]);

    if (cakes.length === 0) {
      return res.status(404).json({ success: false, message: 'Pastel no encontrado.' });
    }

    res.json({
      success: true,
        data: {
          ...cakes[0],
          image_url: normalizeImageUrl(cakes[0].image_url),
        }
    });
  } catch (err) {
    console.error('[Cakes] Error en getById:', err && err.message ? err.message : err);
    return res.status(503).json({ success: false, message: 'No se pudo obtener el pastel. Intenta de nuevo más tarde.' });
  }
};
