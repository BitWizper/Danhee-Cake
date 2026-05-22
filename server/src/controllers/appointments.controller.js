const db = require('../config/db');

/**
 * Crear una nueva cita.
 */
exports.create = async (req, res, next) => {
  const { baker_id, date, time_slot, notes } = req.body;
  const client_id = req.user.id;

  try {
    const [result] = await db.execute(
      'INSERT INTO appointments (client_id, baker_id, date, time_slot, notes) VALUES (?, ?, ?, ?, ?)',
      [client_id, baker_id, date, time_slot, notes || null]
    );

    res.status(201).json({
      success: true,
      message: 'Cita solicitada exitosamente.',
      data: { id: result.insertId }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtener las citas del cliente logueado.
 */
exports.getUserAppointments = async (req, res, next) => {
  const client_id = req.user.id;
  try {
    const [appointments] = await db.execute(`
      SELECT a.*, b.business_name, b.location
      FROM appointments a
      JOIN baker_profiles b ON a.baker_id = b.id
      WHERE a.client_id = ?
      ORDER BY a.date DESC
    `, [client_id]);

    res.json({
      success: true,
      data: appointments
    });
  } catch (err) {
    next(err);
  }
};
