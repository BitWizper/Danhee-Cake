// Configuración de API URL
// Prioridad: VITE_BASE_URL (variable de entorno) > proxy relativo (desarrollo) > producción
const API_URL = import.meta.env.VITE_BASE_URL ||
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : window.location.origin);

export const API_BASE_URL = API_URL;

export const getApiUrl = (endpoint) => {
  // Si el endpoint ya es una URL completa, retornarla tal cual
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  const baseUrl = API_BASE_URL || baseOrigin;

  // Si el endpoint empieza con /api/, usar la URL base configurada o el origen actual
  if (endpoint.startsWith('/api/')) {
    return baseUrl ? `${baseUrl}${endpoint}` : endpoint;
  }

  // Si no empieza con /api/, agregarlo
  return baseUrl ? `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}` : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
