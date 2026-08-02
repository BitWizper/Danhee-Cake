/**
 * apiHelper.js - Helper centralizado para peticiones al API con manejo de errores
 * Maneja errores de red, timeouts y respuestas del servidor de forma consistente
 */

import { getApiUrl } from '../config/api';

/**
 * Wrapper de fetch con manejo de errores y timeout
 * @param {string} url - URL relativa (ej: '/api/cakes')
 * @param {Object} options - Opciones de fetch
 * @param {number} timeout - Timeout en ms (default: 10000)
 * @returns {Promise<Response>} Response de fetch
 */
export async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(getApiUrl(url), {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Verifica tu conexión.');
    }
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('No se pudo conectar con el servidor. El servicio puede estar temporalmente unavailable.');
    }
    
    throw error;
  }
}

/**
 * Maneja errores de respuesta del API
 * @param {Response} response - Response de fetch
 * @returns {Promise<Object>} Datos parseados o error
 */
export async function handleApiResponse(response) {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
    }
    
    if (response.status === 403) {
      throw new Error('No tienes permiso para realizar esta acción.');
    }
    
    if (response.status === 404) {
      throw new Error('El recurso solicitado no existe.');
    }
    
    if (response.status === 429) {
      throw new Error('Has excedido el límite de solicitudes. Por favor espera unos momentos.');
    }
    
    if (response.status >= 500) {
      throw new Error('Error del servidor. Por favor intenta nuevamente más tarde.');
    }
    
    try {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Error desconocido');
    } catch {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Wrapper completo: fetch + timeout + manejo de errores
 * @param {string} url - URL relativa
 * @param {Object} options - Opciones de fetch
 * @param {number} timeout - Timeout en ms
 * @returns {Promise<Object>} Datos parseados
 */
export async function apiFetch(url, options = {}, timeout = 10000) {
  const response = await fetchWithTimeout(url, options, timeout);
  return handleApiResponse(response);
}

/**
 * Obtiene el mensaje de error amigable para mostrar al usuario
 * @param {Error} error - Error capturado
 * @returns {string} Mensaje amigable
 */
export function getErrorMessage(error) {
  if (!error) return 'Ocurrió un error inesperado.';
  
  const message = error.message || error.toString();
  
  // Mensajes ya amigables
  if (message.includes('sesión ha expirado')) return message;
  if (message.includes('No se pudo conectar')) return message;
  if (message.includes('tardó demasiado')) return message;
  if (message.includes('límite de solicitudes')) return message;
  
  // Errores técnicos -> mensaje genérico
  return 'Ocurrió un error. Por favor intenta nuevamente.';
}
