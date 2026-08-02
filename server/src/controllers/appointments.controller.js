// controllers/appointments.controller.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sanitizeString, validateNumber } = require('../middleware/inputValidator');

const normalizeAppointmentDate = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const directMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  if (directMatch) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
};

// Ofuscar PII en notas (teléfonos, emails, nombres)
const obfuscatePII = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  return text
    // Ofuscar teléfonos (formatos comunes)
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.slice(0, 3) + '***' + digits.slice(-2);
    })
    // Ofuscar emails
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (match) => {
      const [local, domain] = match.split('@');
      return local.slice(0, 2) + '***@' + domain;
    })
    // Ofuscar nombres completos (palabras con mayúscula inicial)
    .replace(/\b[A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)+\b/g, (match) => {
      const parts = match.split(' ');
      return parts.map(p => p.slice(0, 2) + '***').join(' ');
    });
};

/**
 * Crear una nueva cita (requiere autenticación).
 * Endpoint: POST /api/appointments
 * Headers: Authorization: Bearer <token>
 */
exports.create = async (req, res, next) => {
  const { baker_id, date, time_slot, notes } = req.body;
  const client_id = req.user.id;

  // Validar y sanitizar inputs
  const sanitizedBakerId = sanitizeString(baker_id, 50);
  const sanitizedDate = sanitizeString(date, 50);
  const normalizedDate = normalizeAppointmentDate(sanitizedDate);
  const sanitizedTimeSlot = sanitizeString(time_slot, 50);
  const sanitizedNotes = sanitizeString(notes, 500);

  // Validaciones
  if (!sanitizedBakerId || !normalizedDate || !sanitizedTimeSlot) {
    return res.status(400).json({
      success: false,
      message: 'Se requieren baker_id, date y time_slot.'
    });
  }

  if (!validateNumber(sanitizedBakerId)) {
    return res.status(400).json({
      success: false,
      message: 'baker_id debe ser un número válido.'
    });
  }

  try {
    // Iniciar transacción para prevenir race condition
    await db.execute('START TRANSACTION');

    try {
      // Verificar solapamiento de citas con bloqueo FOR UPDATE para prevenir race condition
      const [existingAppointments] = await db.execute(
        'SELECT id FROM appointments WHERE baker_id = ? AND date = ? AND time_slot = ? AND status != ? FOR UPDATE',
        [sanitizedBakerId, normalizedDate, sanitizedTimeSlot, 'cancelled']
      );

      if (existingAppointments.length > 0) {
        await db.execute('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El repostero ya tiene una cita agendada en esta fecha y hora. Por favor, selecciona otro horario.'
        });
      }

      const [result] = await db.execute(
        'INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [client_id, sanitizedBakerId, normalizedDate, sanitizedTimeSlot, sanitizedNotes || null, 'pending']
      );

      await db.execute('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Cita solicitada exitosamente.',
        data: { id: result.insertId }
      });
    } catch (transactionErr) {
      await db.execute('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('[Appointment] Error en create:', err);
    next(err);
  }
};

/**
 * Endpoint interno para que el chatbot IA registre citas de usuarios autenticados.
 * Solo acepta peticiones desde localhost (127.0.0.1) — no expuesto al exterior.
 * Endpoint: POST /api/appointments/internal
 */
exports.createInternal = async (req, res, next) => {
  // Seguridad: solo permitir desde loopback (el propio servidor Node/Python)
  const remoteIp = req.ip || req.socket?.remoteAddress || '';
  const isLocalhost = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    console.log(`[Appointment] ⚠️ Acceso denegado desde IP: ${remoteIp}`);
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado. Este endpoint solo es accesible desde localhost.'
    });
  }

  const { client_id, baker_id, date, time_slot, notes } = req.body;

  // Validar y sanitizar inputs
  const sanitizedClientId = sanitizeString(client_id, 50);
  const sanitizedBakerId = sanitizeString(baker_id, 50);
  const sanitizedDate = sanitizeString(date, 50);
  const normalizedDate = normalizeAppointmentDate(sanitizedDate);
  const sanitizedTimeSlot = sanitizeString(time_slot, 50);
  const sanitizedNotes = sanitizeString(notes, 500);

  // Validaciones
  if (!sanitizedClientId || !sanitizedBakerId || !normalizedDate || !sanitizedTimeSlot) {
    console.log('[Appointment] ❌ Faltan campos requeridos:', { client_id, baker_id, date, time_slot });
    return res.status(400).json({
      success: false,
      message: 'Se requieren client_id, baker_id, date y time_slot.'
    });
  }

  if (!validateNumber(sanitizedClientId) || !validateNumber(sanitizedBakerId)) {
    return res.status(400).json({
      success: false,
      message: 'client_id y baker_id deben ser números válidos.'
    });
  }

  console.log(`[Appointment] 📝 Creando cita interna desde chatbot:`);
  console.log(`   Cliente ID: ${sanitizedClientId}`);
  console.log(`   Repostero ID: ${sanitizedBakerId}`);
  console.log(`   Fecha: ${sanitizedDate}`);
  console.log(`   Hora: ${sanitizedTimeSlot}`);
  console.log(`   Notas: ${sanitizedNotes || 'Sin notas'}`);

  try {
    // Iniciar transacción para prevenir race condition
    await db.execute('START TRANSACTION');

    try {
      // Verificar solapamiento de citas con bloqueo FOR UPDATE para prevenir race condition
      const [existingAppointments] = await db.execute(
        'SELECT id FROM appointments WHERE baker_id = ? AND date = ? AND time_slot = ? AND status != ? FOR UPDATE',
        [sanitizedBakerId, normalizedDate, sanitizedTimeSlot, 'cancelled']
      );

      if (existingAppointments.length > 0) {
        await db.execute('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El repostero ya tiene una cita agendada en esta fecha y hora. Por favor, selecciona otro horario.'
        });
      }

      const [result] = await db.execute(
        'INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [sanitizedClientId, sanitizedBakerId, normalizedDate, sanitizedTimeSlot, sanitizedNotes || null, 'pending']
      );

      await db.execute('COMMIT');

      console.log(`[Appointment] ✅ Cita creada exitosamente con ID: ${result.insertId}`);

      return res.status(201).json({
        success: true,
        message: 'Cita agendada exitosamente desde el chatbot.',
        data: {
          id: result.insertId,
          client_id: sanitizedClientId,
          baker_id: sanitizedBakerId,
          date: sanitizedDate,
          time_slot: sanitizedTimeSlot
        }
      });
    } catch (transactionErr) {
      await db.execute('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('[Appointment] ❌ Error creando cita interna:', err);
    next(err);
  }
};

/**
 * Endpoint para solicitudes de cita de usuarios NO autenticados (guest)
 * Endpoint: POST /api/appointments/guest
 */
exports.createGuest = async (req, res, next) => {
  const { baker_id, date, time_slot, notes, client_id } = req.body;

  // Validar y sanitizar inputs
  const sanitizedBakerId = sanitizeString(baker_id, 50);
  const sanitizedDate = sanitizeString(date, 50);
  const normalizedDate = normalizeAppointmentDate(sanitizedDate);
  const sanitizedTimeSlot = sanitizeString(time_slot, 50);
  const sanitizedNotes = sanitizeString(notes, 500);
  const sanitizedClientId = sanitizeString(client_id, 50);

  // Validaciones
  if (!sanitizedBakerId || !normalizedDate || !sanitizedTimeSlot) {
    return res.status(400).json({
      success: false,
      message: 'Se requieren baker_id, date y time_slot.'
    });
  }

  if (!validateNumber(sanitizedBakerId)) {
    return res.status(400).json({
      success: false,
      message: 'baker_id debe ser un número válido.'
    });
  }

  // Si se proporciona client_id, verificar que pertenezca al usuario autenticado
  let authenticatedUserId = null;
  if (req.user && req.user.id) {
    authenticatedUserId = req.user.id;
  }

  if (sanitizedClientId && authenticatedUserId) {
    if (sanitizedClientId !== authenticatedUserId.toString()) {
      console.log(`[Appointment Guest] ❌ Intento de acceso no autorizado: user ${authenticatedUserId} intentando usar client_id ${sanitizedClientId}`);
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para crear citas para este cliente.'
      });
    }
  }

  console.log(`[Appointment] 👤 Solicitud guest desde chatbot:`);
  console.log(`   Repostero ID: ${sanitizedBakerId}`);
  console.log(`   Fecha: ${sanitizedDate}`);
  console.log(`   Hora: ${sanitizedTimeSlot}`);
  console.log(`   Notas: ${sanitizedNotes || 'Sin notas'}`);

  try {
    // Iniciar transacción para prevenir race condition
    await db.execute('START TRANSACTION');

    try {
      // Verificar solapamiento de citas con bloqueo FOR UPDATE para prevenir race condition
      const [existingAppointments] = await db.execute(
        'SELECT id FROM appointments WHERE baker_id = ? AND date = ? AND time_slot = ? AND status != ? FOR UPDATE',
        [sanitizedBakerId, normalizedDate, sanitizedTimeSlot, 'cancelled']
      );

      if (existingAppointments.length > 0) {
        await db.execute('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El repostero ya tiene una cita agendada en esta fecha y hora. Por favor, selecciona otro horario.'
        });
      }

      // Si hay usuario autenticado, usar su ID; si no, crear usuario temporal
      let finalClientId;
      if (authenticatedUserId) {
        finalClientId = authenticatedUserId;
        console.log(`[Appointment] ✅ Usando ID de usuario autenticado: ${finalClientId}`);
      } else {
        // Crear un usuario temporal de tipo invitado para mantener la integridad referencial
        const guestEmail = `guest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@local.invalid`;
        const guestPassword = `Guest${Date.now()}A1!`;
        const guestName = 'Invitado';
        const hashedGuestPassword = await bcrypt.hash(guestPassword, 10);

        const [guestUser] = await db.execute(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [guestName, guestEmail, hashedGuestPassword, 'cliente']
        );

        finalClientId = guestUser.insertId;
        console.log(`[Appointment] ✅ Creado cliente temporal: ${finalClientId}`);
      }

      const [result] = await db.execute(
        'INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [finalClientId, sanitizedBakerId, normalizedDate, sanitizedTimeSlot, sanitizedNotes || null, 'pending']
      );

      await db.execute('COMMIT');

      console.log(`[Appointment] ✅ Solicitud guest creada con ID: ${result.insertId} para cliente ${finalClientId}`);

      return res.status(201).json({
        success: true,
        message: 'Solicitud de cita recibida. Te contactaremos pronto para confirmar.',
        data: { id: result.insertId, client_id: finalClientId }
      });
    } catch (transactionErr) {
      await db.execute('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('[Appointment] ❌ Error creando cita guest:', err);
    next(err);
  }
};

/**
 * Obtener las citas del cliente logueado.
 * Endpoint: GET /api/appointments/my-appointments
 * Headers: Authorization: Bearer <token>
 */
exports.getUserAppointments = async (req, res, next) => {
  const client_id = req.user.id;

  try {
    const [appointments] = await db.execute(`
      SELECT a.*, b.business_name, b.location, b.specialty
      FROM appointments a
      JOIN baker_profiles b ON a.baker_id = b.id
      WHERE a.client_id = ?
      ORDER BY a.date DESC, a.time_slot ASC
    `, [client_id]);

    // Ofuscar PII en notas antes de devolver
    const sanitizedAppointments = appointments.map(apt => ({
      ...apt,
      notes: obfuscatePII(apt.notes)
    }));

    res.json({
      success: true,
      data: sanitizedAppointments,
      total: sanitizedAppointments.length
    });
  } catch (err) {
    console.error('[Appointment] Error obteniendo citas:', err);
    next(err);
  }
};

/**
 * Obtener disponibilidad de un repostero en una fecha específica
 * Endpoint: GET /api/appointments/baker/:baker_id/date/:date
 */
exports.getBakerAvailability = async (req, res, next) => {
  const { baker_id, date } = req.params;

  // Validar y sanitizar inputs
  const sanitizedBakerId = sanitizeString(baker_id, 50);
  const sanitizedDate = sanitizeString(date, 50);

  if (!validateNumber(sanitizedBakerId)) {
    return res.status(400).json({
      success: false,
      message: 'baker_id debe ser un número válido.'
    });
  }

  try {
    const [appointments] = await db.execute(
      'SELECT time_slot FROM appointments WHERE baker_id = ? AND date = ?',
      [sanitizedBakerId, sanitizedDate]
    );

    const horarios_ocupados = appointments.map(a => a.time_slot);

    res.json({
      success: true,
      data: appointments,
      horarios_ocupados,
      disponibles: horarios_ocupados.length < 5
    });
  } catch (err) {
    console.error('[Appointment] Error verificando disponibilidad:', err);
    next(err);
  }
};

/**
 * Cancelar una cita (solo el dueño puede cancelarla).
 * Endpoint: DELETE /api/appointments/:id
 * Headers: Authorization: Bearer <token>
 */
exports.cancelAppointment = async (req, res, next) => {
  const client_id = req.user.id;
  const { id } = req.params;

  // Validar y sanitizar inputs
  const sanitizedId = sanitizeString(id, 50);

  if (!validateNumber(sanitizedId)) {
    return res.status(400).json({
      success: false,
      message: 'ID debe ser un número válido.'
    });
  }

  try {
    // Verificar que la cita existe y pertenece al cliente
    const [rows] = await db.execute(
      'SELECT id, status FROM appointments WHERE id = ? AND client_id = ?',
      [sanitizedId, client_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no tienes permiso para cancelarla.'
      });
    }

    // Actualizar estado a 'cancelled'
    await db.execute(
      'UPDATE appointments SET status = ? WHERE id = ?',
      ['cancelled', sanitizedId]
    );

    res.json({
      success: true,
      message: 'Cita cancelada exitosamente.'
    });
  } catch (err) {
    console.error('[Appointment] Error cancelando cita:', err);
    next(err);
  }
};