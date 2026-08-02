/**
 * Utilidades de seguridad para prevenir ataques DOM-based XSS
 * Enfocado en proteger contra manipulación de atributos, propiedades y métodos del DOM
 */

/**
 * Whitelist de atributos seguros para elementos HTML
 */
const SAFE_ATTRIBUTES = {
  // Atributos globales seguros
  global: [
    'class', 'id', 'style', 'title', 'data-*',
    'aria-label', 'aria-hidden', 'role', 'tabindex'
  ],
  // Atributos específicos por etiqueta
  a: ['href', 'target', 'rel', 'download'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  input: ['type', 'value', 'placeholder', 'disabled', 'required'],
  button: ['type', 'disabled'],
  form: ['method', 'action'],
};

/**
 * Detecta intentos de DOM clobbering
 */
export const detectDOMClobbering = (element) => {
  if (!element || typeof element !== 'object') return false;

  const clobberingPatterns = [
    '__proto__',
    'constructor',
    'prototype',
    '__lookupGetter__',
    '__lookupSetter__',
    '__defineGetter__',
    '__defineSetter__',
  ];

  return clobberingPatterns.some(pattern => {
    return pattern in element || Object.prototype.hasOwnProperty.call(element, pattern);
  });
};

/**
 * Valida y sanitiza atributos de un elemento
 */
export const sanitizeElement = (element, tagName = 'div') => {
  if (!element || typeof element !== 'object') return {};

  const safeAttrs = {};
  const allowedAttrs = [
    ...(SAFE_ATTRIBUTES.global || []),
    ...(SAFE_ATTRIBUTES[tagName.toLowerCase()] || []),
  ];

  for (const attr of allowedAttrs) {
    if (attr.endsWith('*')) {
      // Wildcard attributes como data-*
      const prefix = attr.slice(0, -1);
      for (const key in element) {
        if (key.startsWith(prefix) && !key.includes('__') && !key.includes('constructor')) {
          const val = element[key];
          if (typeof val === 'string' || typeof val === 'number') {
            safeAttrs[key] = val;
          }
        }
      }
    } else if (attr in element) {
      const val = element[attr];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        safeAttrs[attr] = val;
      }
    }
  }

  return safeAttrs;
};

/**
 * Crea un elemento seguro sin riesgo de XSS
 */
export const createSafeElement = (tagName, attributes = {}, content = '') => {
  if (!tagName || typeof tagName !== 'string') return null;

  // Validar nombre de etiqueta
  const validTags = ['div', 'span', 'p', 'a', 'button', 'img', 'input', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'];
  if (!validTags.includes(tagName.toLowerCase())) {
    console.warn(`[Security] Intento de crear etiqueta no permitida: ${tagName}`);
    return null;
  }

  const element = document.createElement(tagName);

  // Aplicar atributos seguros
  const safeAttrs = sanitizeElement(attributes, tagName);
  for (const [key, value] of Object.entries(safeAttrs)) {
    if (typeof value === 'string' && value.length > 0) {
      // Sanitizar valor de atributo
      const cleanValue = sanitizeAttributeValue(value);
      element.setAttribute(key, cleanValue);
    }
  }

  // Agregar contenido de texto seguro (no HTML)
  if (content && typeof content === 'string') {
    element.textContent = content; // textContent no interpreta HTML
  }

  return element;
};

/**
 * Sanitiza valores de atributos para evitar inyecciones
 */
export const sanitizeAttributeValue = (value) => {
  if (!value || typeof value !== 'string') return '';

  // Remover protocolos peligrosos
  if (value.toLowerCase().startsWith('javascript:') ||
      value.toLowerCase().startsWith('data:') ||
      value.toLowerCase().startsWith('vbscript:')) {
    return '';
  }

  // Escapar comillas para evitar breakout de atributo
  return value
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Valida URLs antes de usarlas en href o src
 */
export const isValidURL = (url) => {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);
    // Solo permitir protocolos seguros
    return /^(https?|ftp):$/.test(parsed.protocol);
  } catch {
    // URL relativa es segura
    if (url.startsWith('/') || url.startsWith('.')) {
      return true;
    }
    return false;
  }
};

/**
 * Detecta intentos de inyección en URLs
 */
export const detectURLInjection = (url) => {
  if (!url || typeof url !== 'string') return false;

  const injectionPatterns = [
    /<script|javascript:|on\w+\s*=/gi,
    /data:text\/html|vbscript:/gi,
    /svg[^>]*on\w+/gi,
  ];

  return injectionPatterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(url);
  });
};

/**
 * Protege contra mutación de propiedades globales
 */
export const protectGlobalScope = () => {
  const dangerousGlobals = ['eval', 'Function', 'setTimeout', 'setInterval'];

  dangerousGlobals.forEach(globalName => {
    if (window[globalName]) {
      Object.defineProperty(window, globalName, {
        value: function() {
          console.warn(`[Security] Intento de usar ${globalName} bloqueado`);
          return undefined;
        },
        writable: false,
        configurable: false,
      });
    }
  });
};

/**
 * Sanitiza JSON de manera segura
 */
export const parseJSONSafely = (jsonString) => {
  if (!jsonString || typeof jsonString !== 'string') return null;

  try {
    const parsed = JSON.parse(jsonString);
    // Validar que no contiene referencias circulares peligrosas
    return validateJSONStructure(parsed) ? parsed : null;
  } catch (e) {
    console.error('[Security] Error parsing JSON:', e);
    return null;
  }
};

/**
 * Valida estructura de JSON para detectar payloads maliciosos
 */
export const validateJSONStructure = (obj, depth = 0, maxDepth = 10) => {
  if (depth > maxDepth) {
    console.warn('[Security] JSON depth exceeds maximum allowed');
    return false;
  }

  if (obj === null || obj === undefined) return true;

  if (typeof obj === 'object') {
    // Detectar propiedades peligrosas - solo si están en las propias propiedades (no heredadas)
    if (Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
        Object.prototype.hasOwnProperty.call(obj, 'constructor')) {
      console.warn('[Security] Detected prototype pollution attempt');
      return false;
    }

    if (Array.isArray(obj)) {
      return obj.every((item, index) => {
        if (index > 1000) { // Limitar tamaño de array
          console.warn('[Security] Array size exceeds maximum');
          return false;
        }
        return validateJSONStructure(item, depth + 1, maxDepth);
      });
    }

    return Object.entries(obj).every(([key, value]) => {
      // Validar que las claves no sean peligrosas (solo propiedades propias)
      if ((key.startsWith('__') || key === 'constructor') &&
          Object.prototype.hasOwnProperty.call(obj, key)) {
        return false;
      }
      return validateJSONStructure(value, depth + 1, maxDepth);
    });
  }

  return typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean';
};

/**
 * Crea un proxy para monitorear acceso a objeto sensible
 */
export const createSecureProxy = (target, handlers = {}) => {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop.toString().startsWith('__') || prop === 'constructor') {
        throw new Error(`[Security] Acceso a propiedad peligrosa denegado: ${prop}`);
      }
      return Reflect.get(obj, prop);
    },
    set(obj, prop, value) {
      if (prop.toString().startsWith('__') || prop === 'constructor') {
        console.warn(`[Security] Intento de asignación a propiedad peligrosa bloqueado: ${prop}`);
        return false;
      }
      return Reflect.set(obj, prop, value);
    },
    ...handlers,
  });
};

/**
 * Valida y desinfecta localStorage/sessionStorage antes de usar
 */
export const getSafeStorageValue = (storage, key, defaultValue = null) => {
  if (!storage || !key || typeof key !== 'string') return defaultValue;

  try {
    const value = storage.getItem(key);
    if (!value) return defaultValue;

    // Si es JSON, validarlo
    if (value.startsWith('{') || value.startsWith('[')) {
      return parseJSONSafely(value) || defaultValue;
    }

    return value;
  } catch (e) {
    console.error('[Security] Error accessing storage:', e);
    return defaultValue;
  }
};

/**
 * Event listener seguro que previene event delegation attacks
 */
export const addSecureEventListener = (element, eventType, handler, options = {}) => {
  if (!element || !eventType || !handler) return;

  const secureHandler = (event) => {
    // Validar que el evento no fue tampered
    if (!event || typeof event !== 'object') return;

    // Prevenir event delegation abuse
    if (event.target !== element && !element.contains(event.target)) {
      console.warn('[Security] Event target mismatch detected');
      return;
    }

    handler(event);
  };

  element.addEventListener(eventType, secureHandler, options);

  // Retornar función para remover listener
  return () => element.removeEventListener(eventType, secureHandler, options);
};

export default {
  detectDOMClobbering,
  sanitizeElement,
  createSafeElement,
  sanitizeAttributeValue,
  isValidURL,
  detectURLInjection,
  protectGlobalScope,
  parseJSONSafely,
  validateJSONStructure,
  createSecureProxy,
  getSafeStorageValue,
  addSecureEventListener,
};
