// Configuración de API URL
// Prioridad: VITE_BASE_URL (variable de entorno) > proxy relativo (desarrollo) > producción
const API_URL = import.meta.env.VITE_BASE_URL ||
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : window.location.origin);

export const API_BASE_URL = API_URL;

export const getApiUrl = (endpoint) => {
  // Permitir URLs absolutas de dominios de imágenes legítimos
  const allowedImageDomains = [
    'i.pinimg.com',
    'images.unsplash.com',
    'imgur.com',
    'i.imgur.com',
    'cdn.shopify.com',
    'res.cloudinary.com',
    'cloudinary.com'
  ];

  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    try {
      const url = new URL(endpoint);
      const isAllowedDomain = allowedImageDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
      
      if (isAllowedDomain) {
        return endpoint;
      }
    } catch (e) {
      // Si no es URL válida, continuar con el flujo normal
    }
    
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const baseUrl = API_BASE_URL || baseOrigin;
    
    if (baseUrl && endpoint.startsWith(baseUrl)) {
      return endpoint;
    }
    
    console.warn('[Security] Bloqueada solicitud a URL externa:', endpoint);
    try {
      const url = new URL(endpoint);
      endpoint = url.pathname + url.search;
    } catch (e) {
      return '/';
    }
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
