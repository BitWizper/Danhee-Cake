import { getApiUrl } from '../config/api';

let csrfTokenCache = null;
let csrfTokenExpiry = null;

export const getCsrfToken = async (forceRefresh = false) => {
  // Verificar si el token está en cache y no ha expirado (24 horas)
  if (!forceRefresh && csrfTokenCache && csrfTokenExpiry && Date.now() < csrfTokenExpiry) {
    return csrfTokenCache;
  }

  const fetchToken = async () => {
    const response = await fetch(getApiUrl('/api/auth/csrf-token'), {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      console.error('[CSRF Helper] Error obteniendo CSRF token - Status:', response.status);
      return null;
    }
    
    const data = await response.json();
    if (data && data.csrf_token) {
      csrfTokenCache = data.csrf_token;
      csrfTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas para mayor durabilidad
      console.log('[CSRF Helper] CSRF token actualizado:', csrfTokenCache.substring(0, 8) + '...');
      return csrfTokenCache;
    }
    return null;
  };

  try {
    const token = await fetchToken();
    if (token) return token;

    // Si falló el primer intento, reintentar una vez
    console.warn('[CSRF Helper] Reintentando obtención de CSRF token...');
    return await fetchToken();
  } catch (err) {
    console.error('[CSRF Helper] Excepción obteniendo CSRF token:', err);
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

