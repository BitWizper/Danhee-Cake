// Configuración de API URL
// Prioridad: VITE_BASE_URL (variable de entorno) > proxy relativo (desarrollo) > producción
const API_URL = import.meta.env.VITE_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '' // Usar rutas relativas para que Vite proxy funcione
    : window.location.origin; // Fallback a origin actual

export const API_BASE_URL = API_URL;

// Debug: Mostrar URL base en consola
console.log('[API Config] VITE_BASE_URL:', import.meta.env.VITE_BASE_URL);
console.log('[API Config] API_BASE_URL final:', API_BASE_URL);
console.log('[API Config] Hostname:', window.location.hostname);

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
