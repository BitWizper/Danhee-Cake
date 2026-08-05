const db = require('../config/db');
const { sanitizeString, validateNumber } = require('../middleware/inputValidator');
const crypto = require('crypto');

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return imageUrl;
  
  if (imageUrl.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i)) {
    const urlPath = imageUrl.replace(/^https?:\/\/[^/]+/i, '');
    let filename = urlPath;
    if (urlPath.includes('/uploads/')) {
      filename = urlPath.split('/uploads/').pop();
    } else if (urlPath.startsWith('/uploads/')) {
      filename = urlPath.replace('/uploads/', '');
    } else {
      return imageUrl;
    }
    const timestamp = Date.now() + (3600 * 1000);
    const tokenData = `${filename}|${timestamp}`;
    if (!process.env.JWT_SECRET) {
      console.error('[Security] JWT_SECRET no está definido para generar token de imagen');
      throw new Error('JWT_SECRET no está definido');
    }
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(tokenData)
      .digest('hex');
    return `/api/images/${filename}?token=${signature}&expires=${timestamp}`;
  }
  
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  let filename = imageUrl;
  if (imageUrl.includes('/uploads/')) {
    filename = imageUrl.split('/uploads/').pop();
  } else if (imageUrl.startsWith('/uploads/')) {
    filename = imageUrl.replace('/uploads/', '');
  } else {
    return imageUrl;
  }
  
  const timestamp = Date.now() + (3600 * 1000);
  const tokenData = `${filename}|${timestamp}`;
  
  if (!process.env.JWT_SECRET) {
    console.error('[Security] JWT_SECRET no está definido para generar token de imagen');
    throw new Error('JWT_SECRET no está definido');
  }
  
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(tokenData)
    .digest('hex');
  
  return `/api/images/${filename}?token=${signature}&expires=${timestamp}`;
};

const buildCakeForClient = (cake) => ({
  id: cake.id,
  name: cake.name,
  category_name: cake.category_name,
  image_url: normalizeImageUrl(cake.image_url),
  is_featured: cake.is_featured,
  baker_id: cake.baker_id,
  business_name: cake.business_name,
  location: cake.location,
  price: cake.price,
  rating: cake.rating || 0,
  reviews_count: cake.reviews_count || 0
});

const buildCakeForPrivilegedUser = (cake) => ({
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
  const { category, baker, featured, search, location } = req.query;
  let { limit, offset } = req.query;
  limit = parseInt(limit, 10);
  offset = parseInt(offset, 10);
  const pageParam = parseInt(req.query.page, 10);
  if (pageParam && pageParam > 0) {
    if (!limit || limit <= 0) limit = 20;
    offset = (pageParam - 1) * limit;
  }

  if (!limit || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  if (!offset || offset < 0) offset = 0;
  
  const sanitizedCategory = sanitizeString(category, 100);
  const sanitizedBaker = sanitizeString(baker, 50);
  const sanitizedFeatured = sanitizeString(featured, 10);
  const sanitizedSearch = sanitizeString(search, 200);
  const sanitizedLocation = sanitizeString(location, 200);
  
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

  if (sanitizedSearch) {
    query += ' AND (c.name LIKE ? OR b.business_name LIKE ?)';
    const searchPattern = `%${sanitizedSearch}%`;
    params.push(searchPattern, searchPattern);
  }

  if (sanitizedLocation) {
    query += ' AND b.location LIKE ?';
    params.push(`%${sanitizedLocation}%`);
  }

  try {
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [cakes] = await db.execute(query, params);
    const normalizedCakes = cakes.map((cake) => buildCakeResponse(cake, req.user?.role));
    res.json({
      success: true,
      data: normalizedCakes
    });
  } catch (err) {
    console.error('[Cakes] Error en getAll:', err && err.message ? err.message : err);
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
