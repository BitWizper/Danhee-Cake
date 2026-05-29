const db = require('../config/db');

/**
 * Obtener todos los reposteros (PÚBLICO - sin autenticación)
 * GET /api/bakers
 */
exports.getAllPublic = async (req, res, next) => {
  try {
    const [bakers] = await db.execute(`
      SELECT 
        bp.id,
        bp.business_name,
        bp.location,
        bp.specialty,
        bp.bio,
        bp.portfolio_url,
        bp.is_verified,
        bp.rating_avg,
        bp.total_reviews,
        u.name as owner_name,
        u.avatar_url,
        u.phone,
        u.email
      FROM baker_profiles bp
      JOIN users u ON bp.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY bp.rating_avg DESC, bp.is_verified DESC
    `);

    res.json({
      success: true,
      data: bakers,
      total: bakers.length
    });
  } catch (err) {
    console.error('[Bakers] Error en getAllPublic:', err);
    next(err);
  }
};

/**
 * Obtener estadísticas del repostero logueado.
 */
exports.getStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Obtener ID del perfil de repostero
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Perfil de repostero no encontrado.' });
    }
    const bakerId = profiles[0].id;

    // Contar pasteles
    const [cakesCount] = await db.execute('SELECT COUNT(*) as total FROM cakes WHERE baker_id = ?', [bakerId]);

    // Contar citas pendientes
    const [appCount] = await db.execute('SELECT COUNT(*) as total FROM appointments WHERE baker_id = ? AND status = "pending"', [bakerId]);

    // Obtener rating
    const [ratingData] = await db.execute('SELECT rating_avg FROM baker_profiles WHERE id = ?', [bakerId]);

    res.json({
      success: true,
      data: {
        cakes: cakesCount[0].total,
        appointments: appCount[0].total,
        rating: ratingData[0].rating_avg
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener citas exclusivas del repostero logueado.
 */
exports.getAppointments = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    const bakerId = profiles[0].id;

    const [appointments] = await db.execute(`
      SELECT a.*, u.name as client_name, u.email as client_email
      FROM appointments a
      JOIN users u ON a.client_id = u.id
      WHERE a.baker_id = ?
      ORDER BY a.date ASC, a.time_slot ASC
    `, [bakerId]);

    res.json({
      success: true,
      data: appointments
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Añadir un nuevo pastel al portafolio.
 */
exports.addCake = async (req, res, next) => {
  const { name, description, price, category_id, is_featured } = req.body;

  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    const bakerId = profiles[0].id;

    // Obtener la ruta de la imagen si se subió un archivo
    let imageUrl = null;
    if (req.file) {
      imageUrl = `http://localhost:4000/uploads/${req.file.filename}`;
    }

    const [result] = await db.execute(
      'INSERT INTO cakes (baker_id, category_id, name, description, price, image_url, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [bakerId, category_id || null, name, description || null, price || 0, imageUrl, is_featured === 'true' || is_featured === true ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: 'Pastel añadido exitosamente.',
      data: { id: result.insertId, image_url: imageUrl }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener todos los pasteles del repostero logueado.
 */
exports.getMyCakes = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    const bakerId = profiles[0].id;
    console.log('DEBUG: Obteniendo pasteles para bakerId:', bakerId);

    const [cakes] = await db.execute(`
      SELECT c.*, cat.name as category_name 
      FROM cakes c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.baker_id = ?
      ORDER BY c.created_at DESC
    `, [bakerId]);

    console.log('DEBUG: Pasteles encontrados:', cakes.length);
    res.json({ success: true, data: cakes });
  } catch (err) {
    next(err);
  }
};

/**
 * Actualizar un pastel existente.
 */
exports.updateCake = async (req, res, next) => {
  const { id } = req.params;
  const { name, description, price, category_id, is_featured } = req.body;

  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil de repostero no encontrado.' });
    const bakerId = profiles[0].id;

    // Verificar propiedad
    const [cakes] = await db.execute('SELECT image_url FROM cakes WHERE id = ? AND baker_id = ?', [id, bakerId]);
    if (cakes.length === 0) return res.status(403).json({ success: false, message: 'No tienes permiso o el pastel no existe.' });

    let imageUrl = cakes[0].image_url;
    if (req.file) {
      imageUrl = `http://localhost:4000/uploads/${req.file.filename}`;
    }

    await db.execute(
      'UPDATE cakes SET name = ?, description = ?, price = ?, category_id = ?, image_url = ?, is_featured = ? WHERE id = ?',
      [name, description, price, category_id || null, imageUrl, is_featured === 'true' || is_featured === true ? 1 : 0, id]
    );

    res.json({ success: true, message: 'Pastel actualizado correctamente.' });
  } catch (err) {
    next(err);
  }
};

/**
 * Eliminar un pastel.
 */
exports.deleteCake = async (req, res, next) => {
  const { id } = req.params;
  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil de repostero no encontrado.' });
    const bakerId = profiles[0].id;

    const [result] = await db.execute('DELETE FROM cakes WHERE id = ? AND baker_id = ?', [id, bakerId]);
    if (result.affectedRows === 0) return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar este pastel.' });

    res.json({ success: true, message: 'Pastel eliminado del portafolio.' });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener perfil público de un repostero por ID.
 */
exports.getProfile = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [profiles] = await db.execute(`
      SELECT b.*, u.name, u.avatar_url, u.email
      FROM baker_profiles b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [id]);

    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Repostero no encontrado.' });
    }

    res.json({
      success: true,
      data: profiles[0]
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Actualizar perfil de negocio del repostero logueado.
 */
exports.updateProfile = async (req, res, next) => {
  const { business_name, location, specialty, bio } = req.body;
  const userId = req.user.id;

  try {
    const [result] = await db.execute(
      'UPDATE baker_profiles SET business_name = ?, location = ?, specialty = ?, bio = ? WHERE user_id = ?',
      [business_name, location, specialty, bio, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    }

    res.json({ success: true, message: 'Perfil actualizado correctamente.' });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener los datos del perfil del repostero logueado.
 */
exports.getMyProfile = async (req, res, next) => {
  const userId = req.user.id;
  try {
    const [profiles] = await db.execute('SELECT * FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    }
    res.json({ success: true, data: profiles[0] });
  } catch (err) {
    next(err);
  }
};