// Controlador sencillo para generar comprobantes OXXO mock
const { sanitizeString, validateNumber } = require('../middleware/inputValidator');

const generateOxxoTicket = (req, res) => {
  try {
    const { orderId, amount } = req.body;
    
    // Validar y sanitizar inputs
    const sanitizedOrderId = sanitizeString(orderId, 100);
    const sanitizedAmount = sanitizeString(amount, 50);
    
    if (!sanitizedOrderId || !sanitizedAmount) {
      return res.status(400).json({ success: false, message: 'orderId y amount son requeridos' });
    }
    
    // Validar que amount sea un número válido
    if (!validateNumber(sanitizedAmount, 0)) {
      return res.status(400).json({ success: false, message: 'amount debe ser un número positivo válido' });
    }

    // Generar referencia simulada (12 dígitos)
    const reference = Math.floor(100000000000 + Math.random() * 899999999999).toString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 horas

    const ticket = {
      reference,
      amount: parseFloat(sanitizedAmount),
      expiresAt,
      instructions: 'Presenta este código en cualquier tienda OXXO y paga en efectivo. Conserva el comprobante hasta confirmar tu pago.',
      printUrl: `https://example.com/print/oxxo/${reference}`,
    };

    // En un sistema real guardaríamos en la base de datos con estado 'pending'
    return res.json({ success: true, data: ticket });
  } catch (err) {
    console.error('Error generando ticket OXXO:', err);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

module.exports = { generateOxxoTicket };
