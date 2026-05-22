const db = require('../config/db');

/**
 * Obtener todos los pasteles, opcionalmente filtrados por categoría o repostero.
 */
exports.getAll = async (req, res, next) => {
  const { category, baker, featured } = req.query;
  
  let query = `
    SELECT c.*, b.business_name, b.location, cat.name as category_name 
    FROM cakes c
    JOIN baker_profiles b ON c.baker_id = b.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    query += ' AND cat.slug = ?';
    params.push(category);
  }

  if (baker) {
    query += ' AND c.baker_id = ?';
    params.push(baker);
  }

  if (featured === 'true') {
    query += ' AND c.is_featured = 1';
  }

  try {
    const [cakes] = await db.execute(query, params);
    res.json({
      success: true,
      data: cakes
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener un pastel por ID.
 */
exports.getById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [cakes] = await db.execute(`
      SELECT c.*, b.business_name, b.location, b.bio, cat.name as category_name
      FROM cakes c
      JOIN baker_profiles b ON c.baker_id = b.id
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = ?
    `, [id]);

    if (cakes.length === 0) {
      return res.status(404).json({ success: false, message: 'Pastel no encontrado.' });
    }

    res.json({
      success: true,
      data: cakes[0]
    });
  } catch (err) {
    next(err);
  }
};
