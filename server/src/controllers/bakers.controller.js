const db = require('../config/db');

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
        bp.business_hours,
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
        baker_id: bakerId,
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
      SELECT a.*, u.name as client_name, u.email as client_email, u.phone as client_phone
      FROM appointments a
      LEFT JOIN users u ON a.client_id = u.id
      WHERE a.baker_id = ?
      ORDER BY a.date DESC, a.time_slot ASC
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
 * Actualizar el estado de una cita asignada al repostero.
 * PUT /api/bakers/appointments/:id/status
 */
exports.updateAppointmentStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;

  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Estado no válido.' });
  }

  try {
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    const bakerId = profiles[0].id;

    const [result] = await db.execute(
      'UPDATE appointments SET status = ? WHERE id = ? AND baker_id = ?',
      [status, id, bakerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Cita no encontrada o sin permiso.' });
    }

    res.json({ success: true, message: `Estado de cita actualizado a ${status}.` });
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

    const [cakes] = await db.execute(`
      SELECT c.*, cat.name as category_name 
      FROM cakes c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.baker_id = ?
      ORDER BY c.created_at DESC
    `, [bakerId]);

    const normalizedCakes = cakes.map((cake) => ({
      ...cake,
      image_url: normalizeImageUrl(cake.image_url),
    }));
    res.json({ success: true, data: normalizedCakes });
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

    let imageUrl = normalizeImageUrl(cakes[0].image_url);
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
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
  const { business_name, location, specialty, bio, business_hours } = req.body;
  const userId = req.user.id;

  try {
    try {
      await db.execute(
        'UPDATE baker_profiles SET business_name = ?, location = ?, specialty = ?, bio = ?, business_hours = ? WHERE user_id = ?',
        [business_name, location, specialty, bio, business_hours || null, userId]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR' || dbErr.message.includes('business_hours')) {
        await db.execute('ALTER TABLE baker_profiles ADD COLUMN business_hours VARCHAR(255) DEFAULT "Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00"');
        await db.execute(
          'UPDATE baker_profiles SET business_name = ?, location = ?, specialty = ?, bio = ?, business_hours = ? WHERE user_id = ?',
          [business_name, location, specialty, bio, business_hours || null, userId]
        );
      } else {
        throw dbErr;
      }
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