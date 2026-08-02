import { getApiUrl } from '../config/api';

let csrfTokenCache = null;
let csrfTokenExpiry = null;

export const getCsrfToken = async () => {
  // Verificar si el token está en cache y no ha expirado (1 hora)
  if (csrfTokenCache && csrfTokenExpiry && Date.now() < csrfTokenExpiry) {
    return csrfTokenCache;
  }

  try {
    const response = await fetch(getApiUrl('/api/auth/csrf-token'), {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      console.error('Error obteniendo CSRF token:', response.status);
      return null;
    }
    
    const data = await response.json();
    csrfTokenCache = data.csrf_token;
    csrfTokenExpiry = Date.now() + (60 * 60 * 1000); // 1 hora
    return csrfTokenCache;
  } catch (err) {
    console.error('Error obteniendo CSRF token:', err);
    return null;
  }
};

export const addCsrfToHeaders = async (headers = {}) => {
  const csrfToken = await getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
};
