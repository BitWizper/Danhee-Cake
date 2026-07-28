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

const isPrivilegedRole = (role) => ['repostero', 'admin'].includes(role);

const buildPublicBaker = (baker) => ({
  id: baker.id,
  business_name: baker.business_name,
  location: baker.location,
  specialty: baker.specialty,
  bio: baker.bio,
  portfolio_url: normalizeImageUrl(baker.portfolio_url),
  business_hours: baker.business_hours,
  is_verified: Boolean(baker.is_verified),
  rating_avg: baker.rating_avg,
  total_reviews: baker.total_reviews,
  avatar_url: normalizeImageUrl(baker.avatar_url)
});

const buildBakerForPrivilegedUser = (baker) => ({
  ...buildPublicBaker(baker),
  email: baker.email || null,
  phone: baker.phone || null,
  is_active: Boolean(baker.is_active),
  user_id: baker.user_id || null
});

const buildBakerResponse = (baker, role) => {
  if (isPrivilegedRole(role)) {
    return buildBakerForPrivilegedUser(baker);
  }
  return buildPublicBaker(baker);
};

/**
 * Obtener todos los reposteros (PÚBLICO - sin autenticación)
 * GET /api/bakers
 */
exports.getAllPublic = async (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    // Soportar parámetro `page` usado por el frontend (page=1 => offset=0)
    const pageParam = parseInt(req.query.page, 10);
    if (pageParam && pageParam > 0) {
      if (!limit || limit <= 0) limit = 20;
      offset = (pageParam - 1) * limit;
    }

    if (!limit || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    if (!offset || offset < 0) offset = 0;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM baker_profiles bp
      JOIN users u ON bp.user_id = u.id
      WHERE u.is_active = 1
    `;
    const [countRows] = await db.execute(countQuery);
    const total = countRows[0]?.total || 0;

    const extraFields = isPrivilegedRole(req.user?.role)
      ? 'u.email, u.phone, u.is_active, bp.user_id,'
      : '';

    const [bakers] = await db.execute(`
      SELECT 
        ${extraFields}
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
        u.avatar_url
      FROM baker_profiles bp
      JOIN users u ON bp.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY bp.rating_avg DESC, bp.is_verified DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const responseBakers = bakers.map((baker) => buildBakerResponse(baker, req.user?.role));
    res.json({
      success: true,
      data: responseBakers,
      total
    });
  } catch (err) {
    console.error('[Bakers] Error en getAllPublic:', err && err.message ? err.message : err);
    return res.status(503).json({ success: false, message: 'No se pudieron obtener los reposteros. Intenta de nuevo más tarde.' });
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

    // Admins pueden solicitar appointments de cualquier baker mediante ?baker_id=ID
    // Si se proporciona baker_id y el usuario es admin, se usa ese bakerId
    let bakerId = null;
    const full = req.query.full === 'true';
    const requestedBakerId = req.query.baker_id;

    if (requestedBakerId && req.user.role === 'admin') {
      if (!validateNumber(requestedBakerId)) return res.status(400).json({ success: false, message: 'baker_id inválido.' });
      bakerId = Number(requestedBakerId);
    } else {
      const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
      if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
      bakerId = profiles[0].id;
    }

    const [appointments] = await db.execute(`
      SELECT a.*, u.name as client_name, u.email as client_email, u.phone as client_phone
      FROM appointments a
      LEFT JOIN users u ON a.client_id = u.id
      WHERE a.baker_id = ?
      ORDER BY a.date DESC, a.time_slot ASC
    `, [bakerId]);

    // Si se solicitó full y el usuario es admin o es el repostero dueño, devolver datos completos
    // Determinar si el usuario que realiza la petición es realmente el dueño del perfil
    let myBakerId = null;
    try {
      const [myProfiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
      myBakerId = myProfiles.length ? myProfiles[0].id : null;
    } catch (e) {
      // ignore - no es crítico para el enmascaramiento
      myBakerId = null;
    }

    const isOwner = req.user.role === 'admin' || (req.user.role === 'repostero' && myBakerId && myBakerId === bakerId);
    if (full && isOwner) {
      return res.json({ success: true, data: appointments });
    }

    // Enmascarar datos sensibles (PII) antes de devolver
    const masked = appointments.map((a) => ({
      ...a,
      client_name: maskName(a.client_name),
      client_email: maskEmail(a.client_email),
      client_phone: maskPhone(a.client_phone)
    }));

    res.json({ success: true, data: masked });
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

  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);
  const sanitizedStatus = sanitizeString(status, 50);

  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!sanitizedStatus || !validStatuses.includes(sanitizedStatus)) {
    return res.status(400).json({ success: false, message: 'Estado no válido.' });
  }

  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({ success: false, message: 'ID inválido.' });
  }

  try {
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil no encontrado.' });
    const bakerId = profiles[0].id;

    const [result] = await db.execute(
      'UPDATE appointments SET status = ? WHERE id = ? AND baker_id = ?',
      [sanitizedStatus, sanitizedId, bakerId]
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

  // Validar y sanitizar inputs
  const sanitizedName = sanitizeString(name, 200);
  const sanitizedDescription = sanitizeString(description, 1000);
  const sanitizedPrice = sanitizeString(price, 50);
  const sanitizedCategoryId = sanitizeString(category_id, 50);

  if (!sanitizedName || sanitizedName.trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre es requerido.' });
  }

  if (!validateNumber(sanitizedPrice, 0)) {
    return res.status(400).json({ success: false, message: 'El precio debe ser un número positivo.' });
  }

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
      [bakerId, sanitizedCategoryId || null, sanitizedName, sanitizedDescription || null, sanitizedPrice || 0, imageUrl, is_featured === 'true' || is_featured === true ? 1 : 0]
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

  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);
  const sanitizedName = sanitizeString(name, 200);
  const sanitizedDescription = sanitizeString(description, 1000);
  const sanitizedPrice = sanitizeString(price, 50);
  const sanitizedCategoryId = sanitizeString(category_id, 50);

  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({ success: false, message: 'ID inválido.' });
  }

  if (sanitizedName && sanitizedName.trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre no puede estar vacío.' });
  }

  if (sanitizedPrice && !validateNumber(sanitizedPrice, 0)) {
    return res.status(400).json({ success: false, message: 'El precio debe ser un número positivo.' });
  }

  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil de repostero no encontrado.' });
    const bakerId = profiles[0].id;

    // Verificar propiedad
    const [cakes] = await db.execute('SELECT image_url FROM cakes WHERE id = ? AND baker_id = ?', [sanitizedId, bakerId]);
    if (cakes.length === 0) return res.status(403).json({ success: false, message: 'No tienes permiso o el pastel no existe.' });

    let imageUrl = normalizeImageUrl(cakes[0].image_url);
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    await db.execute(
      'UPDATE cakes SET name = ?, description = ?, price = ?, category_id = ?, image_url = ?, is_featured = ? WHERE id = ?',
      [sanitizedName, sanitizedDescription, sanitizedPrice, sanitizedCategoryId || null, imageUrl, is_featured === 'true' || is_featured === true ? 1 : 0, sanitizedId]
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

  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);

  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({ success: false, message: 'ID inválido.' });
  }

  try {
    const userId = req.user.id;
    const [profiles] = await db.execute('SELECT id FROM baker_profiles WHERE user_id = ?', [userId]);
    if (profiles.length === 0) return res.status(404).json({ success: false, message: 'Perfil de repostero no encontrado.' });
    const bakerId = profiles[0].id;

    const [result] = await db.execute('DELETE FROM cakes WHERE id = ? AND baker_id = ?', [sanitizedId, bakerId]);
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

  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);

  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({ success: false, message: 'ID inválido.' });
  }

  try {
    const extraFields = isPrivilegedRole(req.user?.role)
      ? 'u.email, u.phone, u.is_active, bp.user_id,'
      : '';

    const [profiles] = await db.execute(`
      SELECT 
        ${extraFields}
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
        u.avatar_url
      FROM baker_profiles bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.id = ?
    `, [sanitizedId]);

    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Repostero no encontrado.' });
    }

    res.json({
      success: true,
      data: buildBakerResponse(profiles[0], req.user?.role)
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

  // Validar y sanitizar inputs
  const sanitizedBusinessName = sanitizeString(business_name, 200);
  const sanitizedLocation = sanitizeString(location, 200);
  const sanitizedSpecialty = sanitizeString(specialty, 200);
  const sanitizedBio = sanitizeString(bio, 1000);
  const sanitizedBusinessHours = sanitizeString(business_hours, 255);

  try {
    try {
      await db.execute(
        'UPDATE baker_profiles SET business_name = ?, location = ?, specialty = ?, bio = ?, business_hours = ? WHERE user_id = ?',
        [sanitizedBusinessName, sanitizedLocation, sanitizedSpecialty, sanitizedBio, sanitizedBusinessHours || null, userId]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR' || dbErr.message.includes('business_hours')) {
        await db.execute('ALTER TABLE baker_profiles ADD COLUMN business_hours VARCHAR(255) DEFAULT "Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00"');
        await db.execute(
          'UPDATE baker_profiles SET business_name = ?, location = ?, specialty = ?, bio = ?, business_hours = ? WHERE user_id = ?',
          [sanitizedBusinessName, sanitizedLocation, sanitizedSpecialty, sanitizedBio, sanitizedBusinessHours || null, userId]
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

// Helpers de enmascaramiento de PII
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  const visible = name.length > 2 ? 2 : 1;
  return `${name.substring(0, visible)}***@${domain}`;
};

const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return null;
  // Keep last 2-3 digits visible
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 3) return '***';
  const visible = digits.slice(-3);
  return `***-***-${visible}`;
};

const maskName = (name) => {
  if (!name || typeof name !== 'string') return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const n = parts[0];
    return n.length <= 2 ? n[0] + '*' : n[0] + '*'.repeat(Math.min(3, n.length - 1));
  }
  // Show first name and initial of last name
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] || '';
  return `${first} ${lastInitial}.`;
};