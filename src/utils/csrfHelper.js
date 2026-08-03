import { getApiUrl } from '../config/api';

let csrfTokenCache = null;
let csrfTokenExpiry = null;

export const getCsrfToken = async (forceRefresh = false) => {
  console.log('[CSRF Helper] getCsrfToken() llamado. forceRefresh:', forceRefresh);
  console.log('[CSRF Helper] Token en cache:', csrfTokenCache ? `${csrfTokenCache.substring(0, 8)}...` : 'N/A');
  console.log('[CSRF Helper] Cache expiry:', csrfTokenExpiry ? new Date(csrfTokenExpiry).toISOString() : 'N/A');
  
  // Verificar si el token está en cache y no ha expirado (24 horas)
  if (!forceRefresh && csrfTokenCache && csrfTokenExpiry && Date.now() < csrfTokenExpiry) {
    console.log('[CSRF Helper] Usando token de cache ✅');
    return csrfTokenCache;
  }

  const fetchToken = async () => {
    const csrfUrl = getApiUrl('/api/auth/csrf-token');
    console.log('[CSRF Helper] Fetching CSRF token from:', csrfUrl);
    console.log('[CSRF Helper] Cookies antes de fetch:', document.cookie);
    
    const response = await fetch(csrfUrl, {
      method: 'GET',
      credentials: 'include',
    });
    
    console.log('[CSRF Helper] CSRF response status:', response.status);
    console.log('[CSRF Helper] CSRF response headers:', response.headers);
    
    if (!response.ok) {
      console.error('[CSRF Helper] ❌ Error obteniendo CSRF token - Status:', response.status);
      const errorText = await response.text();
      console.error('[CSRF Helper] Error body:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('[CSRF Helper] CSRF response data:', data);
    
    if (data && data.csrf_token) {
      csrfTokenCache = data.csrf_token;
      csrfTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas para mayor durabilidad
      console.log('[CSRF Helper] ✅ CSRF token actualizado:', csrfTokenCache.substring(0, 8) + '...');
      console.log('[CSRF Helper] Cookies después de fetch:', document.cookie);
      return csrfTokenCache;
    }
    console.warn('[CSRF Helper] ️ No se encontró csrf_token en response');
    return null;
  };

  try {
    const token = await fetchToken();
    if (token) return token;

    // Si falló el primer intento, reintentar una vez
    console.warn('[CSRF Helper] Reintentando obtención de CSRF token...');
    return await fetchToken();
  } catch (err) {
    console.error('[CSRF Helper] ❌ Excepción obteniendo CSRF token:', err);
    console.error('[CSRF Helper] Error stack:', err.stack);
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

