// Configuración de API URL
const API_URL = import.meta.env.VITE_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : 'https://punk-actually-corners-twiki.trycloudflare.com';

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
