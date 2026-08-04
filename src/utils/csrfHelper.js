import { getApiUrl } from '../config/api';

let csrfTokenCache = null;
let csrfTokenExpiry = null;

export const getCsrfToken = async (forceRefresh = false) => {
  // Verificar si el token está en cache y no ha expirado (24 horas)
  if (!forceRefresh && csrfTokenCache && csrfTokenExpiry && Date.now() < csrfTokenExpiry) {
    return csrfTokenCache;
  }

  const fetchToken = async () => {
    const csrfUrl = getApiUrl('/api/auth/csrf-token');
    
    const response = await fetch(csrfUrl, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.csrf_token) {
      csrfTokenCache = data.csrf_token;
      csrfTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas para mayor durabilidad
      return csrfTokenCache;
    }
    return null;
  };

  try {
    const token = await fetchToken();
    if (token) return token;

    // Si falló el primer intento, reintentar una vez
    return await fetchToken();
  } catch (err) {
    csrfTokenCache = null;
    csrfTokenExpiry = null;
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

export const addCsrfToPayload = async (payload = {}) => {
  const csrfToken = await getCsrfToken();
  if (csrfToken) {
    return { ...payload, csrf_token: csrfToken };
  }
  return payload;
};

