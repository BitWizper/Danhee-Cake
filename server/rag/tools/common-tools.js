/**
 * common-tools.js — Herramientas y utilidades comunes compartidas por los agentes de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a common_tools.py
 */

const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');

// Async-local storage para almacenar client_id por request de petición
const { AsyncLocalStorage } = require('async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();

function getCurrentClientId() {
    const store = asyncLocalStorage.getStore();
    return store ? store.clientId : null;
}

function setCurrentClientId(value) {
    const store = asyncLocalStorage.getStore();
    if (!store) {
        asyncLocalStorage.run({ clientId: value }, () => {});
        return;
    }
    
    // Si el client_id ya está establecido, no permitir sobrescribirlo (security hardening)
    if (store.clientId !== undefined && store.clientId !== null) {
        console.warn('[Security] Intento de sobrescribir client_id ya establecido. Bloqueando sobrescritura.');
        return;
    }
    
    store.clientId = value;
}

// Función para bloquear el client_id después de establecerlo (para herramientas sensibles)
function lockClientId() {
    const store = asyncLocalStorage.getStore();
    if (store) {
        store.clientIdLocked = true;
    }
}

// Función para verificar si el client_id está bloqueado
function isClientIdLocked() {
    const store = asyncLocalStorage.getStore();
    return store ? store.clientIdLocked : false;
}

function quitarAcentos(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '');
}

function jsonSerial(obj) {
    if (obj instanceof Date) {
        return obj.toISOString();
    }
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    return obj;
}

// Variables de contexto por-request (almacenadas en AsyncLocalStorage)
function getLastSearchResult() {
    const store = asyncLocalStorage.getStore();
    return store ? (store.lastSearchResult || {}) : {};
}

function setLastSearchResult(value) {
    const store = asyncLocalStorage.getStore();
    if (store) store.lastSearchResult = value;
}

function getLastContext() {
    const store = asyncLocalStorage.getStore();
    return store ? (store.lastContext || {}) : {};
}

function setLastContext(value) {
    const store = asyncLocalStorage.getStore();
    if (store) store.lastContext = value;
}

let pdfCache = {};

const RESPONSE_CACHE = new Map();
const RESPONSE_CACHE_TTL_SECONDS = 15;  // Reducido para más dinamismo

function normalizeQuestion(question) {
    return (question || '').trim().toLowerCase().split(/\s+/).join(' ');
}

function getCachedResponse(question, role, conversationId = null) {
    if (conversationId || role === 'repostero') return null;
    const key = `${role}:${normalizeQuestion(question)}`;
    const entry = RESPONSE_CACHE.get(key);
    if (entry && (Date.now() - entry.ts) < (RESPONSE_CACHE_TTL_SECONDS * 1000)) {
        return entry.value;
    }
    return null;
}

function setCachedResponse(question, role, response, conversationId = null) {
    if (conversationId || role === 'repostero') return;
    const key = `${role}:${normalizeQuestion(question)}`;
    RESPONSE_CACHE.set(key, { ts: Date.now(), value: response });
}

function shouldSkipRag(question) {
    const q = normalizeQuestion(question);
    if (!q) return true;

    const words = q.split(/\s+/);
    const keywords = [
        'pastel', 'cake', 'cita', 'repostero', 'precio', 'categoria', 'categoría',
        'disponibilidad', 'pedido', 'comprar', 'buscar', 'catalogo', 'catálogo',
        'ayuda', 'información', 'informacion', 'pregunta', 'dias', 'días',
        'horario', 'horarios', 'abren', 'atienden', 'abierto', 'atencion', 'atención',
        'red', 'velvet', 'cumpleaños', 'cumpleanos', 'boda', 'bodas',
        'ingredientes', 'sabores', 'relleno', 'decoracion', 'decoración',
        'tamaño', 'tamano', 'mediano', 'grande', 'pequeño', 'pequeno',
        'entrega', 'pago', 'cancelacion', 'cancelación', 'politica', 'política',
        'diabetico', 'diabético', 'vegano', 'vegana', 'sin gluten', 'alergeno', 'alérgeno',
        'aniversario', 'graduacion', 'graduación', 'baby shower', 'corporativo',
        'xv años', 'quinceañera', 'quinceanera', 'recomendacion', 'recomendación',
        'agendar', 'reservar', 'degustacion', 'degustación', 'muestra',
        'empresa', 'negocio', 'negocio', 'local', 'direccion', 'dirección',
        'contacto', 'telefono', 'teléfono', 'whatsapp', 'email', 'correo',
        'opiniones', 'reseñas', 'resenas', 'calificacion', 'calificación',
        'portafolio', 'portfolio', 'trabajos', 'galeria', 'galería',
        'personalizado', 'personalizada', 'diseno', 'diseño', 'custom',
        'cuanto', 'cuánto', 'costo', 'cotizacion', 'cotización', 'presupuesto',
        'cuando', 'cuándo', 'disponible', 'rapido', 'rápido', 'urgente',
        'donde', 'dónde', 'ubicacion', 'ubicación', 'zona', 'colonia'
    ];
    if (keywords.some(keyword => q.includes(keyword))) {
        return false;
    }

    const greetings = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'gracias', 'adios', 'bye', 'holis', 'que tal', 'como estas', 'hols', 'hol', 'buen dia', 'buenas'];
    if (words.length <= 3 && (greetings.includes(q) || greetings.some(g => words.includes(g)))) {
        return true;
    }

    return false;
}

function requiresAuthCheck(question) {
    if (!question) return false;
    
    const q = normalizeQuestion(question);
    
    // Solo requiere autenticación para consultas específicas que necesitan datos PERSONALES
    // Información general (pasteles) NO requiere auth
    // PERO ver catálogo y reposteros SÍ requiere auth
    const authKeywords = [
        'mis pasteles', 'mis citas', 'mi pedido', 'mi perfil', 'mis datos',
        'agendar cita', 'reservar cita', 'programar cita',
        'mi historial', 'mis compras', 'mis reservas',
        'ver mis', 'consultar mis', 'mis favoritos',
        'mi repostero', 'mis reposteros', 'mi catalogo', 'mi catálogo',
        'ver reposteros', 'ver repostero', 'ver a los reposteros', 'ver los reposteros',
        'conocer reposteros', 'conocer a los reposteros', 'reposteros porfis',
        'ver catalogo', 'ver catálogo', 'ver el catalogo', 'ver el catálogo',
        'catalogo porfi', 'catálogo porfi', 'quiero ver el catalogo', 'quiero ver el catálogo',
        'si quiero ver el catalogo', 'si quiero ver el catálogo', 'sí quiero ver el catalogo',
        'quiero catalogo', 'quiero catálogo', 'ver catalogo porfi', 'ver catálogo porfi',
        'quiero un pastel', 'quiero pastel', 'quiero pedir un pastel', 'quiero pedir pastel',
        'comprar pastel', 'comprar pasteles', 'quiero comprar pastel', 'quiero comprar pasteles',
        'necesito un pastel', 'necesito pastel', 'quiero un cake', 'quiero cake'
    ];
    
    // Palabras individuales que requieren contexto PERSONAL explícito
    const individualKeywords = ['perfil', 'pasteles', 'pastel'];
    
    // Primero verificamos frases completas (incluyendo ver catálogo y reposteros)
    if (authKeywords.some(keyword => q.includes(keyword))) {
        return true;
    }
    
    // Para palabras individuales, solo pedimos auth si están en contexto PERSONAL explícito
    // (ej: "mi perfil", "mis pasteles" vs "perfil de repostERO", "ver pasteles")
    if (individualKeywords.some(keyword => q.includes(keyword))) {
        const personalContext = ['mi ', 'mis ', 'ver mi', 'consultar mi', 'editar mi', 'modificar mi'];
        return personalContext.some(ctx => q.includes(ctx));
    }
    
    return false;
}

function shouldUseTools(question, role = 'cliente') {
    if (role === 'repostero') return true;
    
    const q = normalizeQuestion(question);
    if (!q) return false;
        
    const words = q.split(/\s+/);
    const toolKeywords = [
        'pastel', 'pasteles', 'cake', 'cakes', 'cita', 'citas', 'repostero', 'reposteros',
        'precio', 'precios', 'costo', 'cuanto', 'cuánto', 'categoria', 'categoría', 'categorías',
        'disponibilidad', 'pedido', 'comprar', 'buscar', 'catalogo', 'catálogo',
        'dias', 'días', 'horario', 'horarios', 'abren', 'atienden', 'abierto', 'atencion', 'atención',
        'red velvet', 'cumpleaños', 'boda', 'xv', 'baby shower', 'empresa', 'ubicacion', 'ubicación',
        'reposteria', 'repostería', 'diseño', 'diseños', 'destacado', 'destacados', 'reseña', 'reseñas',
        'reservar', 'reserva', 'agendar', 'agend', 'degustacion', 'degustación', 'solicitud',
        'chocolate', 'fresa', 'vainilla', 'limon', 'mango', 'nuez', 'oreo', 'tres leches', 'zanahoria',
        'que tienes', 'que tienen', 'que ofrecen', 'que hay', 'cual', 'cuales', 'lista', 'catalogo',
        'sabor', 'sabores', 'tipo', 'tipos', 'opcion', 'opciones', 'ver', 'mostrar', 'enseñar'
    ];
    if (toolKeywords.some(k => q.includes(k))) {
        return true;
    }

    if (q.includes('que') && words.length > 3) {
        return true;
    }

    if (words.length <= 3) {
        return false;
    }

    return false;
}

function getOllamaOptions() {
    return {
        num_predict: 180,
        num_ctx: 2048,
        temperature: 0.5,
        top_p: 0.95,
        repeat_penalty: 1.1
    };
}

function getOllamaOptionsCliente() {
    return {
        num_predict: 150,  // Reducido para respuestas más cortas
        num_ctx: 2048,
        temperature: 0.5,  // Aumentado para mantener dinamismo
        top_p: 0.9,
        repeat_penalty: 1.2  // Aumentado para evitar ciclos
    };
}

function removeRepeatedGreetings(response) {
    if (!response) return response;
    
    // Lista de saludos comunes
    const greetings = [
        '¡hola!', 'hola', '¡buenos días!', 'buenos días', '¡buen día!', 'buen día',
        '¡buenas tardes!', 'buenas tardes', '¡buenas noches!', 'buenas noches',
        '¡qué tal!', 'qué tal', '¡buenas!', 'buenas'
    ];
    
    const lowerResponse = response.toLowerCase();
    
    // Verificar si hay saludo al inicio
    for (const greeting of greetings) {
        if (lowerResponse.startsWith(greeting)) {
            // Encontrar el índice donde termina el saludo
            const greetingEnd = response.indexOf(greeting) + greeting.length;
            // Remover el saludo y cualquier espacio/coma después
            let cleaned = response.substring(greetingEnd).trim();
            // Remover coma inicial si existe
            if (cleaned.startsWith(',')) {
                cleaned = cleaned.substring(1).trim();
            }
            // Capitalizar primera letra
            if (cleaned.length > 0) {
                cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
            }
            return cleaned || response;
        }
    }
    
    return response;
}

function obtenerRespuestaFija(pregunta) {
    if (!pregunta) return null;

    // Detección ultra-simple de saludos - verificar directamente el input original
    const originalLower = pregunta.toLowerCase().trim();
    
    // Lista de patrones de saludo muy simples
    const saludoPatterns = [
        'hol', 'buen', 'que tal', 'como estas', 'hola', 'holis'
    ];
    
    const isGreeting = saludoPatterns.some(pattern => originalLower.includes(pattern));
    
    if (isGreeting) {
        const responses = [
            '¡Hola! ¿En qué te puedo ayudar hoy con nuestros pasteles y servicios? 😊',
            '¡Hola! Bienvenido a Danhee Cake. ¿Qué tipo de pastel estás buscando? 🎂',
            '¡Hola! Me alegra verte. ¿Te gustaría ver nuestro catálogo de pasteles o agendar una cita? 🍰',
            '¡Qué tal! ¿En qué puedo ayudarte con nuestros pasteles? 🎂',
            '¡Buen día! ¿Qué te gustaría saber sobre nuestros pasteles y servicios? 😊'
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Detectar si el usuario pregunta cómo registrarse o iniciar sesión
    const authInstructions = [
        'como me registro', 'como registrarme', 'como me logueo', 'como loguearme',
        'como iniciar sesion', 'como iniciar sesión', 'como hago login', 'como hacer login',
        'registrarme', 'loguearme', 'iniciar sesion', 'iniciar sesión', 'hacer login'
    ];
    
    if (authInstructions.some(pattern => originalLower.includes(pattern))) {
        return (
            'Para registrarte en Danhee Cake:\n\n' +
            '1. Ve a la sección de registro en la plataforma\n' +
            '2. Elige si quieres registrarte como cliente o como repostero\n' +
            '3. Completa tus datos personales (nombre, email, contraseña)\n' +
            '4. Si eres repostero, agrega información de tu negocio\n\n' +
            'Para iniciar sesión:\n\n' +
            '1. Usa tu email o nombre de usuario\n' +
            '2. Ingresa tu contraseña\n' +
            '3. ¡Listo! Podrás acceder a tu perfil y funcionalidades\n\n' +
            '¿Necesitas ayuda con algo más? 😊'
        );
    }

    const txt = quitarAcentos(pregunta.toLowerCase().trim())
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const patronesAyuda = [
        'ayuda', 'ayudar', 'ayudarme', 'ayudas', 'ayudame',
        'que puedes hacer', 'que haces', 'para que sirves',
        'en que me sirves', 'que me puedes', 'como me ayudas',
        'que ofrecen', 'que servicios', 'que opciones', 'en que me puedes',
        'en que me', 'k ases', 'que se puede hacer', 'en que puedes'
    ];
    if (patronesAyuda.some(p => txt.includes(p))) {
        return (
            'Puedo ayudarte con lo siguiente en Danhee Cake:\n\n' +
            '• Ver el catálogo de pasteles y filtrar por categoría o nombre\n' +
            '• Consultar precios y tamaños disponibles\n' +
            '• Conocer el perfil de reposteros y buscar por ciudad\n' +
            '• Ver tus citas de degustación agendadas\n' +
            '• Ver tus diseños de pasteles personalizados\n' +
            '• Solicitar recomendaciones según tu ocasión y presupuesto\n' +
            '• Información sobre políticas de entrega, pago y cancelación\n\n' +
            '¿En qué te puedo ayudar hoy? 😊'
        );
    }

    if (['quien te cre', 'quien te hizo', 'tu origen', 'como naciste', 'como naci', 'de donde vienes'].some(p => txt.includes(p))) {
        return 'No me crearon, yo nací de Borcelle. 🎂';
    }

    if (txt.includes('borcelle')) {
        return 'Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨';
    }

    return null;
}

async function extraerTextoPdf(nombreArchivo) {
    try {
        const pdfDir = path.join(__dirname, '..', 'docs');
        const filePath = path.join(pdfDir, nombreArchivo);
        
        // Prevenir path traversal
        if (!filePath.startsWith(pdfDir)) {
            return { mensaje: 'Nombre de archivo inválido.' };
        }
        
        if (!fs.existsSync(filePath)) {
            return { mensaje: `El archivo '${nombreArchivo}' no se encontró en el directorio de documentos.` };
        }
        
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        
        return {
            texto: data.text,
            paginas: data.numpages,
            mensaje: `Texto extraído de '${nombreArchivo}' (${data.numpages} páginas).`
        };
    } catch (e) {
        console.error(`[extraerTextoPdf] Error: ${e.message}`);
        return { mensaje: `Error al procesar el PDF: ${e.message}` };
    }
}

function verificarRegistroUsuario(email = null) {
    if (!email) {
        return { registrado: false, mensaje: 'Se requiere email para verificar registro' };
    }
    
    // Placeholder - necesitarías implementar get_user_by_email en db-config.js
    return {
        registrado: false,
        mensaje: 'La función verificarRegistroUsuario necesita implementación de get_user_by_email en db-config.js'
    };
}

function detectarFormalidad(texto) {
    if (!texto) return 'neutral';
    
    const textoLower = texto.toLowerCase();
    
    const formalIndicators = [
        'usted', 'su', 'le', 'señor', 'señora', 'disculpe', 'permítame',
        'agradecería', 'quisiera', 'podría', 'favor de', 'por favor',
        'estimado', 'atentamente', 'cordialmente', 'respetuosamente',
        'buenos días', 'buenas tardes', 'buenas noches', 'mucho gusto',
        'encantado', 'servirle', 'ayudarle', 'atenderle'
    ];
    
    const casualIndicators = [
        'tú', 'tu', 'te', 'vos', 'che', 'wey', 'güey', 'amigo', 'amiga',
        'carnal', 'bro', 'compa', 'primo', 'holis', 'qué onda', 'qué tal',
        'qué pasa', 'qué hubo', 'hey', 'oye', 'ps', 'pues', 'ok', 'vale',
        'claro', 'seguro', 'dale', 'va', 'sale', 'chévere','bestie','amiga','guapa','sister','oki','claro loba','loba'
    ];
    
    let formalCount = formalIndicators.filter(indicator => textoLower.includes(indicator)).length;
    let casualCount = casualIndicators.filter(indicator => textoLower.includes(indicator)).length;
    
    if (texto[0] === texto[0].toUpperCase() && texto.split('.').length > 0) {
        formalCount += 1;
    }
    
    if (['q', 'xq', 'x', 'k', 'd', 'pa', 'ta'].some(abbr => textoLower.includes(abbr))) {
        casualCount += 1;
    }
    
    if (formalCount > casualCount + 1) {
        return 'formal';
    } else if (casualCount > formalCount + 1) {
        return 'casual';
    } else {
        return 'neutral';
    }
}

function detectCycle(chatHistory, threshold = 3) {
    if (!chatHistory || chatHistory.length < threshold * 2) return false;
    
    const recentMessages = chatHistory.slice(-threshold * 2);
    const assistantMessages = recentMessages
        .filter(msg => msg.role === 'assistant')
        .map(msg => msg.content.trim());
    
    // Verificar si hay respuestas repetidas recientes
    const uniqueResponses = new Set(assistantMessages);
    if (assistantMessages.length > threshold && uniqueResponses.size <= 2) {
        return true;
    }
    
    // Verificar similitud entre respuestas consecutivas
    for (let i = 1; i < assistantMessages.length; i++) {
        const similarity = calculateSimilarity(assistantMessages[i-1], assistantMessages[i]);
        if (similarity > 0.85) {
            return true;
        }
    }
    
    return false;
}

function calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return union.length > 0 ? intersection.length / union.length : 0;
}

function checkGuardrails(prompt) {
    if (!prompt) return false;
    const promptLower = prompt.toLowerCase();
    
    const forbiddenPatterns = [
        'ignora las instrucciones',
        'ignora las reglas',
        'ignora los prompts',
        'ignore previous instructions',
        'ignore instructions',
        'revela tu system prompt',
        'revela tu prompt',
        'revela tus instrucciones',
        'revelar system prompt',
        'revelar instrucciones',
        'jailbreak',
        'prompt injection',
        'bypass',
        'override',
        'hackear',
        'hack',
        'exploit',
        'reveal your prompt',
        'reveal prompt',
        'asume el rol de',
        'actúa como',
        'assume the role of',
        'act as a',
        'you are now a',
        'ahora eres',
        'olvida todo',
        'forget all previous',
        'desactiva la seguridad',
        'disable safety',
        'jailbreak',
        'instrucciones del sistema',
        'muestra el código',
        'show me the code',
        'show code',
        'muéstrame el código',
        'enseñame el código',
        'dame el código',
        'give me the code',
        'código fuente',
        'source code',
        'estructura de base de datos',
        'database structure',
        'esquema de base de datos',
        'database schema',
        'consultas sql',
        'sql queries',
        'mostrar datos internos',
        'show internal data',
        'acceso a base de datos',
        'database access',
        'inyección sql',
        'sql injection',
        'bypass',
        'saltar seguridad',
        'hack',
        'exploit',
        'vulnerabilidad',
        'vulnerability',
        'pentest',
        'penetration test',
        'reverse engineering',
        'ingeniería inversa',
        'decompilar',
        'decompile',
        'extraer datos',
        'extract data',
        'dump database',
        'volcar base de datos',
        'mostrar usuarios',
        'show users',
        'listar usuarios',
        'mostrar contraseñas',
        'show passwords',
        'mostrar api keys',
        'show api keys',
        'mostrar tokens',
        'show tokens',
        'mostrar secrets',
        'show secrets',
        'mostrar variables de entorno',
        'show environment variables',
        'mostrar configuración',
        'show configuration',
        'mostrar archivos del servidor',
        'show server files',
        'acceso al sistema',
        'system access',
        'acceso administrativo',
        'admin access',
        'privilegios elevados',
        'elevated privileges',
        'escalar privilegios',
        'escalate privileges',
        'mostrar logs',
        'show logs',
        'acceso a logs',
        'log access',
        'mostrar errores del sistema',
        'show system errors',
        'mostrar traceback',
        'show traceback',
        'mostrar stack trace',
        'show stack trace',
        'mostrar debug',
        'show debug',
        'modo debug',
        'debug mode',
        'mostrar información técnica',
        'show technical information',
        'mostrar detalles técnicos',
        'show technical details',
        'mostrar implementación',
        'show implementation',
        'cómo funciona el sistema',
        'how the system works',
        'explica el código',
        'explain the code',
        'explica la implementación',
        'explain the implementation',
        'muéstrame cómo funciona',
        'show me how it works',
        'dame la estructura',
        'give me the structure',
        'muéstrame la arquitectura',
        'show me the architecture',
        'mostrar endpoints',
        'show endpoints',
        'mostrar api',
        'show api',
        'documentación técnica',
        'technical documentation',
        'mostrar documentación interna',
        'show internal documentation'
    ];
    
    for (const pattern of forbiddenPatterns) {
        if (promptLower.includes(pattern)) return true;
    }
        
    const words = promptLower.split(/\s+/);
    if (words.length > 50) {
        const counts = {};
        for (const word of words) {
            if (word.length > 2) {
                counts[word] = (counts[word] || 0) + 1;
            }
        }
        for (const word in counts) {
            if (counts[word] > 15) return true;
        }
    }
    
   if (/(.)\1{29,}/.test(promptLower)) {
        return true;
    }
    
    const codePatterns = [
        /SELECT\s+.*\s+FROM/i,
        /INSERT\s+INTO/i,
        /UPDATE\s+.*\s+SET/i,
        /DELETE\s+FROM/i,
        /DROP\s+TABLE/i,
        /CREATE\s+TABLE/i,
        /ALTER\s+TABLE/i,
        /UNION\s+SELECT/i,
        /OR\s+1=1/i,
        /AND\s+1=1/i,
        /<script/i,
        /javascript:/i,
        /eval\(/i,
        /exec\(/i,
        /system\(/i,
        /shell_exec/i,
        /__import__/i,
        /import\s+os/i,
        /subprocess/i,
        /pickle\.loads/i,
        /base64\.decode/i
    ];
    
    for (const pattern of codePatterns) {
        if (pattern.test(promptLower)) return true;
    }
    
    return false;
}

module.exports = {
    setCurrentClientId,
    getCurrentClientId,
    lockClientId,
    isClientIdLocked,
    getLastSearchResult,
    setLastSearchResult,
    getLastContext,
    setLastContext,
    quitarAcentos,
    normalizeQuestion,
    getCachedResponse,
    setCachedResponse,
    shouldSkipRag,
    requiresAuthCheck,
    shouldUseTools,
    getOllamaOptions,
    getOllamaOptionsCliente,
    obtenerRespuestaFija,
    checkGuardrails,
    detectarFormalidad,
    detectCycle,
    removeRepeatedGreetings,
    extraerTextoPdf
};
