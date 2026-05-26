const express = require('express');
const cors = require('cors');
require('dotenv').config();
const errorHandler = require('./middleware/errorHandler');
const { askChatbot } = require('./controllers/chat.controller');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Rutas
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/cakes', require('./routes/cakes.routes'));
app.use('/api/bakers', require('./routes/bakers.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.post('/api/chat', askChatbot);

// Ruta base
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Danhee' });
});

// Manejo de errores
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
