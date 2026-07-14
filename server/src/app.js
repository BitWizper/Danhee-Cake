const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();
const errorHandler = require('./middleware/errorHandler');
const { askChatbot, streamChatbot } = require('./controllers/chat.controller');
const chatRoutes = require('./routes/chat.routes');


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
app.post('/api/chat/stream', streamChatbot);

// Ruta base
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Danhee' });
});

// Manejo de errores
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  // Control opcional del microservicio Python RAG (deshabilitado por defecto)
  let pythonProcess = null;
  if (process.env.START_RAG === 'true') {
    console.log("🐍 Iniciando microservicio Python RAG en app.py...");
    pythonProcess = spawn("python", ["rag/app.py"], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("❌ Error al iniciar el microservicio Python RAG:", err.message);
      console.error("Asegúrate de tener Python instalado y en tu variable de entorno PATH.");
    });

    pythonProcess.on("close", (code) => {
      console.log(`🐍 Microservicio Python RAG finalizó con código: ${code}`);
    });
  } else {
    console.log("🐍 Microservicio Python RAG deshabilitado (START_RAG !== 'true')");
  }

  // Limpieza de procesos huérfanos al apagar la aplicación
  const cleanup = () => {
    console.log("🧹 Cerrando microservicio Python RAG...");
    if (pythonProcess) {
      pythonProcess.kill("SIGINT");
    }
    process.exit();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
});
