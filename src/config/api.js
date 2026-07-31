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
  
  // Si el endpoint empieza con /api/, usar la URL base configurada
  if (endpoint.startsWith('/api/')) {
    return `${API_BASE_URL}${endpoint}`;
  }
  
  // Si no empieza con /api/, agregarlo
  return `${API_BASE_URL}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};

// Función específica para URLs de imágenes que deben apuntar al backend
export const getImageUrl = (imageUrl) => {
  if (!imageUrl) return imageUrl;
  
  // Si ya es una URL completa, retornarla tal cual
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Si es una ruta de /api/images/, usar la URL base del backend
  if (imageUrl.startsWith('/api/images/')) {
    return `${API_BASE_URL}${imageUrl}`;
  }
  
  // Para otras rutas relativas, usar getApiUrl
  return getApiUrl(imageUrl);
};
