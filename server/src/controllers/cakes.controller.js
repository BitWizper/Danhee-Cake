const db = require('../config/db');
const { sanitizeString, validateNumber } = require('../middleware/inputValidator');
const crypto = require('crypto');

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return imageUrl;
  
  // Si ya es una URL completa (http/https), retornarla tal cual
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Si es una ruta relativa de uploads, construir URL segura con token temporal
  let filename = imageUrl;
  if (imageUrl.includes('/uploads/')) {
    filename = imageUrl.split('/uploads/').pop();
  } else if (imageUrl.startsWith('/uploads/')) {
    filename = imageUrl.replace('/uploads/', '');
  }
  
  // Generar token temporal firmado para acceso seguro a la imagen
  const timestamp = Date.now() + (3600 * 1000); // Token válido por 1 hora
  const tokenData = `${filename}|${timestamp}`;
  
  if (!process.env.JWT_SECRET) {
    console.error('[Security] JWT_SECRET no está definido para generar token de imagen');
    throw new Error('JWT_SECRET no está definido');
  }
  
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(tokenData)
    .digest('hex');
  
  // Retornar URL relativa que el frontend completará con su API base
  return `/api/images/${filename}?token=${signature}&expires=${timestamp}`;
};

const buildCakeForClient = (cake) => ({
  id: cake.id,
  name: cake.name,
  category_name: cake.category_name,
  image_url: normalizeImageUrl(cake.image_url),
  is_featured: cake.is_featured,
  baker_id: cake.baker_id,
  user_id: cake.user_id,
  business_name: cake.business_name,
  location: cake.location,
  price: cake.price,
  rating: cake.rating || 0,
  reviews_count: cake.reviews_count || 0
});

const buildCakeForPrivilegedUser = (cake) => ({
  ...cake,
  image_url: normalizeImageUrl(cake.image_url)
});

const buildCakeResponse = (cake, role) => {
  const privilegedRoles = ['repostero', 'admin'];
  if (privilegedRoles.includes(role)) {
    return buildCakeForPrivilegedUser(cake);
  }
  return buildCakeForClient(cake);
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
    SELECT c.*, b.business_name, b.location, b.user_id, cat.name as category_name 
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
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    // console.log('[Cakes] Ejecutando query:', query, 'con params:', params);
    const [cakes] = await db.execute(query, params);
    // console.log('[Cakes] Query exitoso, pasteles encontrados:', cakes.length);
    const normalizedCakes = cakes.map((cake) => buildCakeResponse(cake, req.user?.role));
    res.json({
      success: true,
      data: normalizedCakes
    });
  } catch (err) {
    console.error('[Cakes] Error en getAll:', err && err.message ? err.message : err);
    console.error('[Cakes] Stack:', err.stack);
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
      SELECT c.*, b.business_name, b.location, b.bio, b.user_id, cat.name as category_name
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
      data: buildCakeResponse(cakes[0], req.user?.role)
    });
  } catch (err) {
    console.error('[Cakes] Error en getById:', err && err.message ? err.message : err);
    return res.status(503).json({ success: false, message: 'No se pudo obtener el pastel. Intenta de nuevo más tarde.' });
  }
};
