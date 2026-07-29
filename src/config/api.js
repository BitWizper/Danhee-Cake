// Configuración de API URL
// Prioridad: VITE_BASE_URL (variable de entorno) > proxy relativo (desarrollo) > producción
const API_URL = import.meta.env.VITE_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '' // Usar rutas relativas para que Vite proxy funcione
    : 'https://api.danhee.com'; // URL del backend en producción (Cloudflare Tunnel con dominio fijo)

export const API_BASE_URL = API_URL;

export const getApiUrl = (endpoint) => {
  // Si el endpoint ya es una URL completa, retornarla tal cual
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  // Si el endpoint empieza con /api/, usar la URL base configurada
  if (endpoint.startsWith('/api/')) {
    return `${API_BASE_URL}${endpoint}`;
  }
  
  // Si no empieza con /api/, agregarlo
  return `${API_BASE_URL}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
