/**
 * customer-tools.js — Herramientas y funciones especializadas para el Agente de Clientes en Danhee Cake.
 * Versión JavaScript/Node.js equivalente a customer_tools.py
 */

const db = require('../db-config');
const { quitarAcentos, extraerTextoPdf, getCurrentClientId } = require('./common-tools');

let lastSearchResult = {};
let lastContext = {};

function coincideNombre(busqueda, targetName) {
    if (!busqueda || !targetName) return false;
    const bLimpio = quitarAcentos(busqueda.toLowerCase().trim());
    const tLimpio = quitarAcentos(targetName.toLowerCase().trim());
    
    if (bLimpio === tLimpio) return true;
    
    const palabrasIgnorar = new Set(['pastel', 'pasteles', 'del', 'de', 'el', 'la', 'un', 'una', 'con', 'para',
        'sabor', 'mas', 'informacion', 'dame', 'quiero', 'saber', 'sobre',
        'detalle', 'detalles', 'favor', 'quieres', 'tienes', 'algun', 'alguna']);
    
    const tokensB = bLimpio.split(/\s+/).filter(w => !palabrasIgnorar.has(w) && w.length > 2);
    const tokensT = tLimpio.split(/\s+/).filter(w => !palabrasIgnorar.has(w) && w.length > 2);
    
    if (tokensB.length === 0 || tokensT.length === 0) return false;
    
    if (tokensB.every(w => tLimpio.includes(w))) return true;
    if (tokensT.every(w => bLimpio.includes(w))) return true;
    
    const coincidencias = tokensB.filter(w => tokensT.includes(w)).length;
    if (tokensB.length >= 2 && coincidencias >= 2) return true;
    
    return false;
}

function parseFechaRelativa(texto, baseDate = null) {
    if (!texto) return '';
    const base = baseDate || new Date();
    const t = quitarAcentos(String(texto).toLowerCase().trim());
    
    const isoMatch = t.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return `${parseInt(y)}-${parseInt(m).toString().padStart(2, '0')}-${parseInt(d).toString().padStart(2, '0')}`;
    }
    
    const dmyMatch = t.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        return `${parseInt(y)}-${parseInt(m).toString().padStart(2, '0')}-${parseInt(d).toString().padStart(2, '0')}`;
    }
    
    const meses = { 'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12 };
    const textoMatch = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
    if (textoMatch) {
        const [, dStr, mStr, yStr] = textoMatch;
        if (meses[mStr]) {
            const y = yStr ? parseInt(yStr) : base.getFullYear();
            return `${y}-${meses[mStr].toString().padStart(2, '0')}-${parseInt(dStr).toString().padStart(2, '0')}`;
        }
    }
    
    if (t.includes('hoy')) return base.toISOString().split('T')[0];
    if (t.includes('pasado manana')) {
        const date = new Date(base);
        date.setDate(date.getDate() + 2);
        return date.toISOString().split('T')[0];
    }
    if (t.includes('manana')) {
        const date = new Date(base);
        date.setDate(date.getDate() + 1);
        return date.toISOString().split('T')[0];
    }
    
    const diasMatch = t.match(/\ben\s+(\d+)\s+dias?\b/);
    if (diasMatch) {
        const date = new Date(base);
        date.setDate(date.getDate() + parseInt(diasMatch[1]));
        return date.toISOString().split('T')[0];
    }
    
    const diasSemana = { 'lunes': 1, 'martes': 2, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sabado': 6, 'domingo': 0 };
    for (const [dia, num] of Object.entries(diasSemana)) {
        if (t.includes(dia)) {
            const date = new Date(base);
            const currentDay = date.getDay();
            let diasHasta = (num - currentDay + 7) % 7;
            if (diasHasta === 0 && (t.includes('siguiente') || t.includes('proximo') || t.includes('proxima'))) {
                diasHasta = 7;
            } else if (t.includes('siguiente semana') || t.includes('proxima semana')) {
                if (diasHasta === 0) diasHasta = 7;
                else diasHasta += 7;
            }
            date.setDate(date.getDate() + diasHasta);
            return date.toISOString().split('T')[0];
        }
    }
    
    return '';
}

function parseHoraMinutos(horaStr) {
    if (!horaStr) return null;
    const hLimpia = quitarAcentos(String(horaStr).toLowerCase().trim());
    
    const isPm = /pm|tarde|noche/.test(hLimpia);
    const isAm = /am|manana/.test(hLimpia);
    
    const numbers = hLimpia.match(/\d+/g);
    if (!numbers || numbers.length === 0) return null;
    
    let h = parseInt(numbers[0]);
    const m = numbers.length > 1 ? parseInt(numbers[1]) : 0;
    
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    
    return [h, m];
}

function parseHorarioTexto(horarioStr) {
    if (!horarioStr) return [8, 18];
    const hStr = quitarAcentos(horarioStr.toLowerCase());
    const match = hStr.match(/(\d{1,2})(?::\d{2})?\s*[-–]\s*(\d{1,2})(?::\d{2})?/);
    if (match) {
        const apertura = parseInt(match[1]);
        const cierre = Math.min(parseInt(match[2]), 24);
        return [apertura, cierre];
    }
    return [8, 18];
}

function validarHorarioRepostero(horaStr, bakerObj = null) {
    const parsed = parseHoraMinutos(horaStr);
    if (!parsed) return [true, ''];
    
    const [h, m] = parsed;
    const bakerName = bakerObj?.business_name || 'la repostería';
    const businessHoursStr = bakerObj?.business_hours || '';
    
    const [apertura, cierre] = parseHorarioTexto(businessHoursStr);
    const horarioDisplay = businessHoursStr || `${apertura}:00 AM - ${cierre}:00`;
    
    if (h < apertura || h >= cierre) {
        return [false, `⏰ Lo siento, el horario de las **${horaStr}** está fuera del horario de atención de **${bakerName}**.\n\n📍 Su horario de atención es: *${horarioDisplay}*.\n\n¿Te gustaría elegir un horario dentro de ese rango? 😊`];
    }
    
    return [true, ''];
}

function convertToMysqlTime(horaStr) {
    const parsed = parseHoraMinutos(horaStr);
    if (!parsed) return '10:00:00';
    const [h, m] = parsed;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

/**
 * Consulta el catálogo de pasteles de Danhee Cake, opcionalmente filtrado por categoría.
 * 
 * @param {string} categoria - Categoría opcional para filtrar (ej. "Cumpleaños", "Bodas", "XV Años")
 * @param {string} contextoAnterior - Contexto de conversación previa para mantener coherencia
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, pasteles: Array, total: number }
 * @throws {Error} Si falla la conexión a la base de datos
 */
async function consultarCatalogoPasteles(categoria = '', contextoAnterior = '') {
    const pasteles = await db.getCakes();
    console.error(`[DEBUG] Total pasteles en BD: ${pasteles.length}`);
    
    let filtrados = pasteles;
    if (categoria && categoria.trim()) {
        const categoriaLower = categoria.toLowerCase();
        const categoriaNormalizada = quitarAcentos(categoriaLower);
        filtrados = pasteles.filter(p => 
            categoriaNormalizada in quitarAcentos(String(p.category_name || '').toLowerCase()) ||
            categoriaLower in String(p.name || '').toLowerCase()
        );
        console.error(`[DEBUG] Pasteles filtrados por '${categoria}': ${filtrados.length}`);
    } else if (contextoAnterior) {
        const contextoNormalizado = quitarAcentos(contextoAnterior.toLowerCase());
        filtrados = pasteles.filter(p => 
            contextoNormalizado in quitarAcentos(String(p.category_name || '').toLowerCase()) ||
            contextoNormalizado in quitarAcentos(String(p.name || '').toLowerCase())
        );
    }
    
    if (filtrados.length === 0) {
        return { mensaje: `No encontré pasteles en Danhee Cake para la categoría '${categoria || contextoAnterior}'.` };
    }
    
    const pastelesOrdenados = filtrados.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    const resultado = pastelesOrdenados.slice(0, 4).map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        calificacion: p.rating || 0,
        categoria: p.category_name || 'Sin categoría',
        empresa: p.business_name || 'Danhee Cake',
        repostero: p.baker_name || 'No especificado'
    }));
    
    lastSearchResult = { pasteles: resultado, categoria: categoria || contextoAnterior };
    lastContext.ultimaCategoria = categoria || contextoAnterior;
    
    return { 
        pasteles: resultado, 
        total: filtrados.length, 
        categoriaFiltro: categoria || contextoAnterior || 'todos',
        hayMas: filtrados.length > 4 
    };
}

/**
 * Consulta todos los pasteles disponibles en Danhee Cake sin filtros.
 * 
 * @param {string} contextoAnterior - Contexto de conversación previa para mantener coherencia
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, pasteles: Array, total: number }
 */
async function consultarTodosLosPasteles(contextoAnterior = '') {
    const pasteles = await db.getCakes();
    
    if (pasteles.length === 0) {
        return { mensaje: 'No hay pasteles registrados en Danhee Cake.' };
    }
    
    const resultado = pasteles.map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        calificacion: p.rating || 0,
        categoria: p.category_name || 'Sin categoría',
        descripcion: p.description || '',
        empresa: p.business_name || 'Danhee Cake',
        repostero: p.baker_name || 'No especificado'
    }));
    
    return { 
        pasteles: resultado, 
        total: resultado.length, 
        mensaje: `🍰 Catálogo completo de Danhee Cake: ${resultado.length} pasteles disponibles.` 
    };
}

/**
 * Consulta los pasteles más destacados de Danhee Cake según calificación y reseñas.
 * 
 * @param {number} top - Número de pasteles a mostrar (opcional, default 5)
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, destacados: Array, total: number }
 */
async function consultarMasDestacados(top = 5) {
    const pasteles = await db.getCakes();
    if (pasteles.length === 0) {
        return { mensaje: 'No hay pasteles registrados en Danhee Cake.' };
    }
    
    const pastelesOrdenados = pasteles.sort((a, b) => {
        const ratingA = parseFloat(a.rating) || 0;
        const ratingB = parseFloat(b.rating) || 0;
        const reviewsA = parseInt(a.review_count) || 0;
        const reviewsB = parseInt(b.review_count) || 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return reviewsB - reviewsA;
    });
    
    const resultado = pastelesOrdenados.slice(0, top).map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        calificacion: parseFloat(p.rating) || 0,
        reseñas: parseInt(p.review_count) || 0,
        categoria: p.category_name || 'Sin categoría',
        empresa: p.business_name || 'Danhee Cake'
    }));
    
    const lineas = resultado.map((p, i) => {
        const estrellas = '★'.repeat(Math.floor(p.calificacion)) + '☆'.repeat(5 - Math.floor(p.calificacion));
        return `${i + 1}. **${p.nombre}** — $${p.precio.toFixed(0)} MXN  ${estrellas} ${p.calificacion.toFixed(1)} (${p.reseñas} reseñas)`;
    });
    
    return {
        pasteles: resultado,
        total: resultado.length,
        mensaje: `⭐ Aquí están los pasteles más destacados de Danhee Cake:\n\n${lineas.join('\n')}\n\n¿Te gustaría saber más sobre alguno de ellos?`
    };
}

/**
 * Consulta los reposteros disponibles en Danhee Cake.
 * 
 * @param {string} contextoAnterior - Contexto de conversación previa para mantener coherencia
 * @returns {Promise<Object>} Objeto con resultados: { reposteros: Array, total: number }
 */
async function consultarReposterosDisponibles(contextoAnterior = '') {
    const reposteros = await db.getBakers();
    
    const resultado = reposteros.map(r => ({
        id: r.id,
        nombreNegocio: r.business_name,
        especialidad: r.specialty,
        calificacion: parseFloat(r.rating_avg) || 0,
        ubicacion: r.location,
        verificado: Boolean(r.is_verified)
    }));
    
    return { reposteros: resultado, total: resultado.length };
}

/**
 * Verifica la disponibilidad de un repostero específico en una fecha.
 * 
 * @param {number} bakerId - ID del repostero
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {Promise<Object>} Objeto con disponibilidad: { disponible: boolean, mensaje: string }
 */
async function verificarDisponibilidadRepostero(bakerId, fecha) {
    const citas = await db.getAppointmentsByBakerDate(bakerId, fecha);
    const disponible = citas.length < 5;
    
    return {
        bakerId,
        fecha,
        disponible,
        citasAgendadas: citas.length,
        mensaje: `El repostero #${bakerId} de Danhee Cake ${disponible ? 'sí' : 'no'} tiene disponibilidad para ${fecha}. ${!disponible ? 'Prueba otra fecha.' : ''}`
    };
}

/**
 * Obtiene los precios de pasteles por categoría específica.
 * 
 * @param {string} categoria - Categoría de pasteles
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con precios: { categoria: string, mensaje: string }
 */
async function obtenerPreciosPorCategoria(categoria = '', contextoAnterior = '') {
    const todos = await db.getCakes();
    const categoriaBuscar = categoria || contextoAnterior;
    
    if (!categoriaBuscar) {
        const precios = todos.filter(p => p.price).map(p => parseFloat(p.price));
        if (precios.length === 0) {
            return { mensaje: 'Aún no hay precios registrados en Danhee Cake.' };
        }
        const categorias = [...new Set(todos.map(p => (p.category_name || 'General').trim()))];
        return {
            mensaje: `En Danhee Cake tenemos precios para varias categorías de pasteles. El rango general va de $${Math.min(...precios).toFixed(2)} a $${Math.max(...precios).toFixed(2)} MXN, con un promedio de $${(precios.reduce((a, b) => a + b, 0) / precios.length).toFixed(2)}. Las categorías disponibles incluyen: ${categorias.slice(0, 8).join(', ')}. Si quieres, dime una categoría específica para ver los precios detallados.`,
            precioMin: Math.min(...precios),
            precioMax: Math.max(...precios),
            precioPromedio: precios.reduce((a, b) => a + b, 0) / precios.length,
            categoriasDisponibles: categorias.slice(0, 20),
            cantidadPasteles: todos.length
        };
    }
    
    const filtrados = todos.filter(p => 
        categoriaBuscar.toLowerCase() in String(p.category_name || '').toLowerCase() ||
        categoriaBuscar.toLowerCase() in String(p.name || '').toLowerCase()
    );
    
    if (filtrados.length === 0) {
        return { mensaje: `No encontré pasteles en Danhee Cake para '${categoriaBuscar}'. Los pasteles disponibles son: ${todos.slice(0, 5).map(p => p.name).join(', ')}` };
    }
    
    const precios = filtrados.filter(p => p.price).map(p => parseFloat(p.price));
    if (precios.length === 0) {
        return { mensaje: `No hay precios registrados en Danhee Cake para '${categoriaBuscar}'.` };
    }
    
    const listaPasteles = filtrados.slice(0, 4).map(p => `• ${p.name} - $${parseFloat(p.price)} MXN`).join('\n');
    const notaMas = filtrados.length > 4 ? `\n\n*Mostrando 4 de ${filtrados.length} pasteles. Pregúntame si quieres ver más.*` : '';
    
    return {
        categoria: categoriaBuscar,
        precioMin: Math.min(...precios),
        precioMax: Math.max(...precios),
        precioPromedio: precios.reduce((a, b) => a + b, 0) / precios.length,
        cantidadPasteles: filtrados.length,
        pasteles: filtrados.slice(0, 4).map(p => ({ nombre: p.name, precio: parseFloat(p.price) })),
        mensaje: `🍰 Pasteles en la categoría '${categoriaBuscar}':\n${listaPasteles}${notaMas}\n\n💰 Rango de precios: $${Math.min(...precios)} - $${Math.max(...precios)} MXN`
    };
}

function baseDateFromIso(clientDatetimeStr) {
    if (!clientDatetimeStr) return new Date();
    try {
        const clean = String(clientDatetimeStr).replace('Z', '').split('+')[0].trim();
        const dt = new Date(clean);
        return dt;
    } catch (e) {
        return new Date();
    }
}

/**
 * Registra una solicitud de cita de degustación con un repostero.
 * 
 * @param {string} clientName - Nombre del cliente (opcional)
 * @param {number|null} bakerId - ID del repostero (opcional)
 * @param {string} fecha - Fecha deseada (puede ser relativa)
 * @param {string} hora - Hora deseada
 * @param {string} notas - Notas adicionales
 * @param {string} clientDatetime - Fecha/hora actual del cliente (opcional)
 * @returns {Promise<Object>} Objeto con结果: { mensaje: string, cita: Object|null }
 */
async function registrarSolicitudCita(clientName = '', bakerId = null, fecha = '', hora = '', notas = '', clientDatetime = '') {
    const baseDate = baseDateFromIso(clientDatetime);
    const fechaConvertida = parseFechaRelativa(fecha, baseDate);
    
    const allBakers = await db.getBakers();
    if (allBakers.length === 0) {
        return {
            exito: false,
            mensaje: '📋 En este momento no hay reposteros registrados para agendar citas en Danhee Cake.'
        };
    }
    
    const validBakerMap = {};
    allBakers.forEach(b => validBakerMap[b.id] = b);
    
    let bakerObj = null;
    let targetBakerId = null;
    
    if (bakerId) {
        const bid = parseInt(bakerId);
        if (validBakerMap[bid]) {
            targetBakerId = bid;
            bakerObj = validBakerMap[bid];
        }
    }
    
    if (!targetBakerId) {
        const allCakes = await db.getCakes();
        const termSearch = notas ? notas.toLowerCase() : '';
        if (termSearch) {
            for (const c of allCakes) {
                if (c.name && c.name.toLowerCase() in termSearch) {
                    const cakeBakerId = c.baker_id;
                    if (validBakerMap[cakeBakerId]) {
                        targetBakerId = cakeBakerId;
                        bakerObj = validBakerMap[cakeBakerId];
                        break;
                    }
                }
            }
        }
    }
    
    if (!targetBakerId) {
        bakerObj = allBakers[0];
        targetBakerId = bakerObj.id;
    }
    
    bakerId = targetBakerId;
    const bakerName = bakerObj?.business_name || 'nuestra repostería';
    const bakerHours = bakerObj?.business_hours || 'Lunes a Viernes: 8:00 - 18:00';
    
    if (!fechaConvertida) {
        return {
            exito: false,
            necesitaDatos: true,
            mensaje: `📅 ¡Excelente elección! Con gusto te agendo tu cita de degustación con **${bakerName}**.\n\n📍 Horario de atención de **${bakerName}**: *${bakerHours}*\n\n¿Para qué día y hora te gustaría agendar tu cita? Puedes decirme algo como *"el próximo viernes a las 10 AM"* o la fecha que prefieras. 🎂`
        };
    }
    
    const [esHorarioValido, msgErrorHorario] = validarHorarioRepostero(hora, bakerObj);
    if (!esHorarioValido) {
        return {
            exito: false,
            necesitaDatos: true,
            mensaje: msgErrorHorario
        };
    }
    
    const horaLimpia = hora ? String(hora).trim() : '10:00 AM';
    const clientId = getCurrentClientId();
    
    if (clientId) {
        const userInfo = await db.getUserById(clientId);
        if (userInfo && userInfo.name) {
            clientName = userInfo.name;
        }
    }
    
    if (!clientName || /CLIENTE/i.test(String(clientName)) || /\[/.test(String(clientName))) {
        clientName = 'Cliente';
    }
    
    const notasFinal = `Cliente: ${clientName}. ${notas}`.trim();
    const timeSlotMysql = convertToMysqlTime(horaLimpia);
    
    let exito;
    if (clientId) {
        exito = await db.insertAppointment(clientId, bakerId, fechaConvertida, timeSlotMysql, notasFinal);
        if (exito) {
            return {
                exito: true,
                mensaje: `✅ ¡Cita registrada exitosamente! Estimado/a **${clientName}**, tu cita de degustación con **${bakerName}** ha sido agendada para el **${fechaConvertida}** a las **${horaLimpia}**.\n\n📱 Podrás revisar y gestionar tu cita en cualquier momento desde la sección **'Mis Citas'** en tu cuenta. 🎂✨`
            };
        }
    } else {
        exito = await db.insertGuestAppointment(bakerId, fechaConvertida, timeSlotMysql, notasFinal);
        if (exito) {
            return {
                exito: true,
                mensaje: `✅ ¡Solicitud de cita recibida! Tu cita con **${bakerName}** para el **${fechaConvertida}** a las **${horaLimpia}** fue agendada correctamente. 🎂`
            };
        }
    }
    
    return {
        exito: false,
        mensaje: '📋 Hubo un problema al registrar la cita en Danhee Cake. Por favor intenta más tarde.'
    };
}

/**
 * Consulta las categorías de pasteles disponibles en Danhee Cake.
 * 
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con categorías: { categorias: Array }
 */
async function consultarCategorias(contextoAnterior = '') {
    const cats = await db.getCategories();
    if (cats.length === 0) {
        const categoriasInfo = [
            { nombre: 'XV Años', icono: '👑', descripcion: 'Pasteles elegantes para XV años' },
            { nombre: 'Boda', icono: '💍', descripcion: 'Pasteles nupciales de lujo' },
            { nombre: 'Baby Shower', icono: '🍼', descripcion: 'Diseños tiernos para baby shower' },
            { nombre: 'Cumpleaños', icono: '🎂', descripcion: 'Pasteles personalizados para cumpleaños' },
            { nombre: 'Aniversario', icono: '💑', descripcion: 'Pasteles románticos para aniversarios' },
            { nombre: 'Graduación', icono: '🎓', descripcion: 'Celebra tu graduación con estilo' }
        ];
        if (contextoAnterior) {
            const contextoNorm = quitarAcentos(contextoAnterior.toLowerCase());
            const categoriasFiltradas = categoriasInfo.filter(c => 
                contextoNorm in quitarAcentos(c.nombre.toLowerCase())
            );
            if (categoriasFiltradas.length > 0) return { categorias: categoriasFiltradas };
        }
        return { categorias: categoriasInfo };
    }
    return { categorias: cats.map(c => ({ nombre: c.name, icono: c.icon })) };
}

/**
 * Busca pasteles por nombre o parte del nombre.
 * 
 * @param {string} nombre - Nombre o parte del nombre del pastel
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, pasteles: Array, total: number }
 */
async function buscarPastelPorNombre(nombre, contextoAnterior = '') {
    const todos = await db.getCakes();
    const nombreLimpio = quitarAcentos(nombre.toLowerCase());
    let encontrados = [];
    
    for (const p of todos) {
        const nombrePastel = quitarAcentos(String(p.name || '').toLowerCase());
        if (nombreLimpio in nombrePastel) {
            encontrados.push(p);
        }
    }
    
    if (encontrados.length === 0 && contextoAnterior) {
        const contextoLimpio = quitarAcentos(contextoAnterior.toLowerCase());
        for (const p of todos) {
            const nombrePastel = quitarAcentos(String(p.name || '').toLowerCase());
            if (contextoLimpio in nombrePastel && nombreLimpio in nombrePastel) {
                encontrados.push(p);
            }
        }
    }
    
    if (encontrados.length === 0) {
        return { mensaje: `No encontré pasteles en Danhee Cake con el nombre que contiene '${nombre}'.` };
    }
    
    const resultado = encontrados.slice(0, 10).map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        categoria: p.category_name || 'Sin categoría',
        empresa: p.business_name || 'Danhee Cake',
        calificacion: p.rating || 0
    }));
    
    lastContext.ultimosPasteles = resultado;
    lastContext.ultimaBusquedaNombre = nombre;
    
    const lista = resultado.map(r => 
        `• **${r.nombre}** - $${r.precio.toFixed(2)} MXN\n  🏢 Empresa: ${r.empresa}\n  📂 Categoría: ${r.categoria}\n  ⭐ Calificación: ${r.calificacion}`
    ).join('\n');
    
    return {
        encontrados: resultado,
        cantidad: resultado.length,
        mensaje: `🍰 Encontré ${resultado.length} pasteles que coinciden con '${nombre}':\n\n${lista}`
    };
}

/**
 * Obtiene información detallada de un repostero específico.
 * 
 * @param {number} bakerId - ID del repostero
 * @returns {Promise<Object>} Objeto con información del repostero
 */
async function obtenerInfoRepostero(bakerId) {
    const repostero = await db.getBakerById(bakerId);
    if (!repostero) {
        return { error: `No se encontró el repostero de Danhee Cake con ID ${bakerId}.` };
    }
    
    const todosPasteles = await db.getCakes();
    const pastelesRepostero = todosPasteles
        .filter(p => p.baker_id === bakerId)
        .map(p => ({
            nombre: p.name,
            precio: parseFloat(p.price) || 0,
            categoria: p.category_name || 'Sin categoría'
        }));
    
    return {
        id: repostero.id,
        nombreNegocio: repostero.business_name,
        especialidad: repostero.specialty,
        bio: repostero.bio,
        horarioAtencion: repostero.business_hours || 'Lunes a Viernes: 8:00 - 18:00',
        calificacion: parseFloat(repostero.rating_avg) || 0,
        ubicacion: repostero.location,
        verificado: Boolean(repostero.is_verified),
        pasteles: pastelesRepostero,
        totalPasteles: pastelesRepostero.length
    };
}

/**
 * Consulta los horarios de atención de un repostero.
 * 
 * @param {number|null} bakerId - ID del repostero (opcional)
 * @param {string} nombrePastel - Nombre de un pastel para inferir repostero (opcional)
 * @param {string} nombreEmpresa - Nombre de empresa para inferir repostero (opcional)
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con horarios: { mensaje: string }
 */
async function consultarHorariosRepostero(bakerId = null, nombrePastel = '', nombreEmpresa = '', contextoAnterior = '') {
    const allBakers = await db.getBakers();
    if (allBakers.length === 0) {
        return { mensaje: 'No hay reposteros registrados actualmente.' };
    }
    
    let bakerObj = null;
    
    if (bakerId) {
        const bid = parseInt(bakerId);
        bakerObj = allBakers.find(b => b.id === bid);
    }
    
    const termSearch = nombrePastel || nombreEmpresa || contextoAnterior;
    if (!bakerObj && termSearch) {
        const termClean = quitarAcentos(termSearch).toLowerCase();
        const allCakes = await db.getCakes();
        for (const c of allCakes) {
            if (c.name && termClean in quitarAcentos(c.name).toLowerCase()) {
                const cakeBakerId = c.baker_id;
                bakerObj = allBakers.find(b => b.id === cakeBakerId);
                if (bakerObj) break;
            }
        }
        
        if (!bakerObj) {
            bakerObj = allBakers.find(b => {
                const bname = quitarAcentos(String(b.business_name || '')).toLowerCase();
                return termClean in bname || bname in termClean;
            });
        }
    }
    
    if (!bakerObj) {
        bakerObj = allBakers[0];
    }
    
    const empresa = bakerObj.business_name || 'la repostería';
    const horario = bakerObj.business_hours || 'Lunes a Viernes: 8:00 - 18:00';
    
    return {
        bakerId: bakerObj.id,
        empresa,
        horarioAtencion: horario,
        mensaje: `📅 **Horario de Atención de ${empresa}**:\n\n📍 *${horario}*\n\n¿En qué día y hora te gustaría agendar tu cita de degustación dentro de este horario? 😊`
    };
}

function calcularPrecioPersonalizado(tamanio, relleno, decoracion) {
    const preciosBase = { 'pequeño': 350, 'mediano': 550, 'grande': 850 };
    const extraRelleno = { 'vainilla': 0, 'chocolate': 50, 'fresas': 80, 'dulce de leche': 70 };
    const extraDecoracion = { 'fondant': 150, 'buttercream': 80, 'flores': 120, 'minimalista': 50 };
    
    const base = preciosBase[tamanio.toLowerCase()] || 550;
    const extraR = extraRelleno[relleno.toLowerCase()] || 60;
    const extraD = extraDecoracion[decoracion.toLowerCase()] || 100;
    
    return {
        tamanio,
        relleno,
        decoracion,
        precioEstimado: base + extraR + extraD,
        moneda: 'MXN',
        nota: 'Precio estimado en Danhee Cake. El final puede variar según complejidad.'
    };
}

/**
 * Consulta las políticas de la pastelería (entrega, pago, cancelación, etc.).
 * 
 * @param {string} tema - Tema de la política: entrega, pago, cancelacion, personalizacion, general
 * @returns {Promise<string>} Texto con las políticas solicitadas
 */
async function consultarPoliticasPasteleria(tema) {
    const temaKey = tema.toLowerCase().trim();
    if (temaKey === 'danhee') {
        const resultadoPdf = extraerTextoPdf('danhee_knowledge_base.pdf');
        if (resultadoPdf.mensaje) {
            return { tema: 'Información de Danhee Cake', info: resultadoPdf.mensaje };
        }
        return { tema: 'Información de Danhee Cake', info: '🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales.' };
    }
    
    const politicas = {
        'entrega': {
            tema: 'Política de Entrega - Danhee Cake',
            info: '📦 En Danhee Cake: Pedidos estándar requieren 5 días de anticipación. Pasteles de boda o XV Años: mínimo 15 días de anticipación. Entrega a domicilio disponible.'
        },
        'pago': {
            tema: 'Métodos de Pago - Danhee Cake',
            info: '💳 En Danhee Cake aceptamos: Transferencia bancaria, tarjeta de débito/crédito y efectivo. Se requiere anticipo del 50% para confirmar el pedido.'
        },
        'cancelacion': {
            tema: 'Política de Cancelación - Danhee Cake',
            info: '❌ En Danhee Cake: Cancelaciones con más de 7 días: reembolso del 80%. Entre 3-7 días: reembolso del 50%. Menos de 72 horas: sin reembolso.'
        },
        'personalizacion': {
            tema: 'Personalización - Danhee Cake',
            info: '🎨 En Danhee Cake cada pastel es 100% personalizable: puedes elegir sabor, relleno, tamaño, decoración y temática.'
        },
        'general': {
            tema: 'Información General - Danhee Cake',
            info: '🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales.'
        }
    };
    
    return politicas[temaKey] || politicas.general;
}

/**
 * Recomienda pasteles según ocasión, presupuesto y estilo.
 * 
 * @param {string} ocasion - Ocasión del pastel
 * @param {string} presupuesto - Nivel de presupuesto: bajo, medio, alto (opcional)
 * @param {string} estilo - Estilo preferido (opcional)
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con recomendaciones: { mensaje: string, recomendaciones: Array }
 */
async function recomendarPastel(ocasion, presupuesto = '', estilo = '', contextoAnterior = '') {
    const todosPasteles = await db.getCakes();
    const ocasionBuscar = ocasion || contextoAnterior;
    
    if (!ocasionBuscar) {
        return { mensaje: 'Por favor especifica qué tipo de pastel te gustaría que te recomiende (cumpleaños, boda, etc.)' };
    }
    
    const ocasionLower = ocasionBuscar.toLowerCase();
    const ocasionNormalizada = quitarAcentos(ocasionLower);
    
    let pastelesFiltrados = todosPasteles.filter(p => 
        ocasionNormalizada in quitarAcentos(String(p.category_name || '').toLowerCase()) ||
        ocasionLower in String(p.name || '').toLowerCase()
    );
    
    if (presupuesto && pastelesFiltrados.length > 0) {
        if (/bajo/i.test(presupuesto)) {
            pastelesFiltrados = pastelesFiltrados.filter(p => parseFloat(p.price) < 500);
        } else if (/medio/i.test(presupuesto)) {
            pastelesFiltrados = pastelesFiltrados.filter(p => {
                const price = parseFloat(p.price);
                return price >= 500 && price <= 800;
            });
        } else if (/alto/i.test(presupuesto)) {
            pastelesFiltrados = pastelesFiltrados.filter(p => parseFloat(p.price) > 800);
        }
    }
    
    if (pastelesFiltrados.length > 0) {
        const recomendacionesReales = pastelesFiltrados.slice(0, 5).map(p => ({
            nombre: p.name,
            precio: parseFloat(p.price) || 0,
            empresa: p.business_name || 'Danhee Cake',
            repostero: p.baker_name || 'No especificado',
            categoria: p.category_name
        }));
        const lista = recomendacionesReales.map(r => 
            `• ${r.nombre} - $${r.precio} MXN (Empresa: ${r.empresa})`
        ).join('\n');
        return {
            recomendacion: `🎂 Para ${ocasionBuscar}, te recomiendo estos pasteles de Danhee Cake:\n${lista}\n\n¿Te gustaría saber más detalles de alguno?`,
            pasteles: recomendacionesReales,
            plataforma: 'Danhee Cake'
        };
    }
    
    if (todosPasteles.length > 0) {
        const pastelesDisponibles = todosPasteles.slice(0, 5).map(p => 
            `• ${p.name} - $${parseFloat(p.price)} MXN`
        ).join('\n');
        return {
            recomendacion: `No encontré pasteles específicos para '${ocasionBuscar}', pero estos son algunos pasteles disponibles en Danhee Cake:\n${pastelesDisponibles}\n\n¿Te gustaría que te muestre más opciones?`,
            plataforma: 'Danhee Cake'
        };
    }
    
    return {
        recomendacion: `En Danhee Cake tenemos pasteles para todas las ocasiones. Para ${ocasionBuscar}, podemos ayudarte a diseñar un pastel personalizado.`,
        plataforma: 'Danhee Cake'
    };
}

/**
 * Obtiene información de origen de un pastel (empresa, repostero, categoría, precio).
 * 
 * @param {string} nombrePastel - Nombre del pastel
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con información de origen
 */
async function consultarOrigenPastel(nombrePastel, contextoAnterior = '') {
    const todos = await db.getCakes();
    const nombreBuscar = nombrePastel || contextoAnterior;
    
    if (!nombreBuscar) {
        return { mensaje: 'Por favor especifica el nombre del pastel o la pastelería que quieres consultar.' };
    }
    
    const nombreLimpio = quitarAcentos(nombreBuscar).toLowerCase();
    let encontrados = todos.filter(p => 
        nombreLimpio in quitarAcentos(String(p.name || '')).toLowerCase()
    );
    
    if (encontrados.length === 0) {
        encontrados = todos.filter(p => 
            p.business_name && (
                nombreLimpio in quitarAcentos(String(p.business_name)).toLowerCase() ||
                quitarAcentos(String(p.business_name)).toLowerCase() in nombreLimpio
            )
        );
    }
    
    if (encontrados.length === 0) {
        return { mensaje: `No encontré ningún pastel o pastelería llamada '${nombreBuscar}' en Danhee Cake.` };
    }
    
    if (encontrados.length > 1) {
        const resultados = encontrados.slice(0, 5).map(p => {
            const businessName = p.business_name || 'Empresa no especificada';
            const precio = parseFloat(p.price) || 0;
            return `• ${p.name} - $${precio} MXN (Empresa: ${businessName})`;
        });
        return {
            mensaje: `Encontré varios resultados para '${nombreBuscar}':\n${resultados.join('\n')}`,
            resultados: encontrados.slice(0, 5)
        };
    }
    
    const pastel = encontrados[0];
    const bakerId = pastel.baker_id;
    const businessName = pastel.business_name || 'Empresa no especificada';
    const categoryName = pastel.category_name || 'Categoría no especificada';
    const precio = parseFloat(pastel.price) || 0;
    
    let bakerName = 'Repostero no especificado';
    if (bakerId) {
        const repostero = await db.getBakerById(bakerId);
        if (repostero) {
            bakerName = repostero.name || bakerName;
        }
    }
    
    const mensaje = `🍰 El pastel '${pastel.name}':\n📋 Categoría: ${categoryName}\n💰 Precio: $${precio} MXN\n🏢 Empresa: ${businessName}\n👨‍🍳 Repostero: ${bakerName}`;
    
    return {
        pastel: pastel.name,
        empresa: businessName,
        repostero: bakerName,
        categoria: categoryName,
        precio,
        mensaje
    };
}

/**
 * Busca pasteles por rango de precio (menor o mayor a un valor).
 * 
 * @param {number} precio - Precio límite
 * @param {string} condicion - Condición: menor o mayor
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, pasteles: Array }
 */
async function buscarPastelesPorRangoPrecio(precio, condicion, contextoAnterior = '') {
    const todos = await db.getCakes();
    let precioLimite;
    try {
        precioLimite = parseFloat(precio);
    } catch (e) {
        return { mensaje: 'El precio debe ser un número válido.' };
    }
    
    const cond = condicion.toLowerCase().trim();
    let filtrados, mensajeCondicion, ordenAscendente;
    
    if (/menor|menos|abajo|debajo|inferior|</.test(cond)) {
        filtrados = todos.filter(p => p.price !== null && parseFloat(p.price) < precioLimite);
        mensajeCondicion = `menor a $${precioLimite}`;
        ordenAscendente = true;
    } else if (/mayor|mas|arriba|superior|encima|>/.test(cond)) {
        filtrados = todos.filter(p => p.price !== null && parseFloat(p.price) > precioLimite);
        mensajeCondicion = `mayor a $${precioLimite}`;
        ordenAscendente = false;
    } else {
        return { mensaje: 'La condición debe ser \'menor\' o \'mayor\'.' };
    }
    
    if (filtrados.length === 0) {
        return { mensaje: `No encontré pasteles con un precio ${mensajeCondicion} en Danhee Cake.` };
    }
    
    filtrados.sort((a, b) => ordenAscendente ? 
        parseFloat(a.price) - parseFloat(b.price) : 
        parseFloat(b.price) - parseFloat(a.price)
    );
    
    const pastelesMostrados = filtrados.slice(0, 15).map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price),
        empresa: p.business_name || 'Danhee Cake'
    }));
    
    const lista = pastelesMostrados.slice(0, 10).map(p => 
        `• ${p.nombre} - $${p.precision} MXN (Empresa: ${p.empresa})`
    ).join('\n');
    
    return {
        condicion: cond,
        precioLimite,
        encontrados: pastelesMostrados,
        cantidad: filtrados.length,
        mensaje: `Encontré ${filtrados.length} pasteles con precio ${mensajeCondicion} en Danhee Cake:\n${lista}`
    };
}

/**
 * Consulta pasteles específicos de una categoría.
 * 
 * @param {string} categoria - Categoría de pasteles
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con resultados: { mensaje: string, pasteles: Array, total: number }
 */
async function consultarPastelesPorCategoria(categoria = '', contextoAnterior = '') {
    const todos = await db.getCakes();
    const categoriaBuscar = categoria || contextoAnterior;
    
    if (!categoriaBuscar) {
        categoriaBuscar = 'todas las ocasiones';
    }
    
    const categoriaNormalizada = quitarAcentos(categoriaBuscar.toLowerCase().trim());
    
    let filtrados = todos.filter(p => 
        categoriaNormalizada in quitarAcentos(String(p.category_name || '').toLowerCase())
    );
    
    if (filtrados.length === 0) {
        filtrados = todos.filter(p => 
            categoriaNormalizada in quitarAcentos(String(p.name || '').toLowerCase()) ||
            categoriaNormalizada in quitarAcentos(String(p.description || '').toLowerCase())
        );
    }
    
    if (filtrados.length === 0) {
        return {
            categoria: categoriaBuscar,
            encontrados: [],
            cantidad: 0,
            mensaje: `🍰 Actualmente no encontré pasteles específicos registrados para **${categoriaBuscar.trim().charAt(0).toUpperCase() + categoriaBuscar.trim().slice(1)}** en Danhee Cake. ¿Te gustaría consultar otra categoría o diseñar un pastel personalizado? ✨`
        };
    }
    
    const filtradosOrdenados = filtrados.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    const resultado = filtradosOrdenados.slice(0, 4).map(p => ({
        id: p.id,
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        empresa: p.business_name || 'Danhee Cake',
        repostero: p.baker_name || 'No especificado',
        categoria: p.category_name || 'Sin categoría'
    }));
    
    lastSearchResult = { encontrados: resultado, categoria: categoriaBuscar };
    lastContext.ultimaCategoria = categoriaBuscar;
    
    const lista = resultado.map(p => 
        `• **${p.nombre}** - $${p.precio.toFixed(0)} MXN (Empresa: ${p.empresa})`
    ).join('\n');
    
    const total = filtrados.length;
    const notaMas = total > 4 ? `\n\n*Mostrando 4 de ${total} opciones disponibles. Pregúntame si quieres ver detalles de alguno o agendar cita de degustación?*` : '';
    
    return {
        categoria: categoriaBuscar,
        encontrados: resultado,
        cantidad: total,
        mensaje: `🍰 Para **${categoriaBuscar.trim().charAt(0).toUpperCase() + categoriaBuscar.trim().slice(1)}**, aquí tienes algunas opciones deliciosas disponibles en Danhee Cake (ordenadas del precio más accesible al mayor):\n\n${lista}${notaMas}`
    };
}

/**
 * Consulta los tamaños de pasteles disponibles en Danhee Cake.
 * 
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con tamaños: { mensaje: string }
 */
async function consultarTamanosPasteles(contextoAnterior = '') {
    const resPdf = extraerTextoPdf('cake_sizes.pdf');
    if (resPdf.contenido || resPdf.mensaje) {
        const msg = resPdf.mensaje || resPdf.contenido;
        return { mensaje: `📏 Información de tamaños de pasteles:\n\n${msg.substring(0, 2000)}`, fuente: 'cake_sizes.pdf' };
    }
    
    return {
        mensaje: '📏 En Danhee Cake ofrecemos pasteles en los siguientes tamaños:\n\n• Pequeño: 6-8 personas (desde $350 MXN)\n• Mediano: 10-15 personas (desde $550 MXN)\n• Grande: 20-30 personas (desde $850 MXN)'
    };
}

/**
 * Recomienda pasteles según el tamaño deseado.
 * 
 * @param {string} tamanioDeseado - Tamaño: pequeño, mediano o grande
 * @returns {Promise<Object>} Objeto con recomendaciones: { tamanio: string, recomendaciones: Array, mensaje: string }
 */
async function recomendarPorTamanio(tamanioDeseado) {
    const todos = await db.getCakes();
    const tamanioLower = tamanioDeseado.toLowerCase();
    const rangosTamanios = { 'pequeño': [0, 450], 'mediano': [451, 700], 'grande': [701, 10000] };
    const rango = rangosTamanios[tamanioLower] || [0, 10000];
    
    const filtrados = todos.filter(p => p.price && rango[0] <= parseFloat(p.price) <= rango[1]);
    if (filtrados.length === 0) {
        return { mensaje: `No encontré pasteles de tamaño ${tamanioDeseado} en Danhee Cake actualmente.` };
    }
    
    const resultado = filtrados.slice(0, 10).map(p => ({
        nombre: p.name,
        precio: parseFloat(p.price),
        empresa: p.business_name || 'Danhee Cake'
    }));
    
    const lista = resultado.map(r => 
        `• ${r.nombre} - $${r.precio} MXN (Empresa: ${r.empresa})`
    ).join('\n');
    
    return { tamanio: tamanioDeseado, recomendaciones: resultado, mensaje: `🎂 Para un pastel ${tamanioDeseado}:\n${lista}` };
}

/**
 * Consulta el detalle completo de un pastel específico por ID o nombre.
 * 
 * @param {number|null} pastelId - ID del pastel (opcional)
 * @param {string|null} nombrePastel - Nombre del pastel (opcional)
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con detalle del pastel
 */
async function consultarDetallePastelPorId(pastelId = null, nombrePastel = null, contextoAnterior = '') {
    const todos = await db.getCakes();
    let pastelEncontrado = null;

    if (contextoAnterior && ['<nil>', 'null', 'none'].includes(contextoAnterior.toLowerCase())) {
        contextoAnterior = '';
    }

    if (pastelId === null || (typeof pastelId === 'string' && !/^\d+$/.test(pastelId))) {
        const nombreBuscar = nombrePastel || (typeof pastelId === 'string' ? pastelId.trim() : contextoAnterior);
        if (!nombreBuscar) {
            return { mensaje: 'No especificaste qué pastel deseas consultar.' };
        }
        
        for (const p of todos) {
            if (coincideNombre(nombreBuscar, p.name || '')) {
                pastelEncontrado = p;
                break;
            }
        }
        
        if (!pastelEncontrado) {
            return { mensaje: `No encontré un pastel con el nombre '${nombreBuscar}' en Danhee Cake.` };
        }
    } else {
        const pid = parseInt(pastelId);
        pastelEncontrado = todos.find(p => p.id === pid);
        if (!pastelEncontrado) {
            return { mensaje: `No encontré el pastel con ID ${pid} en Danhee Cake.` };
        }
    }

    const bakerId = pastelEncontrado.baker_id;
    const businessName = pastelEncontrado.business_name || 'Danhee Cake';
    const nombrePastelFinal = pastelEncontrado.name;
    const precio = parseFloat(pastelEncontrado.price) || 0;
    const rating = pastelEncontrado.rating || 0;
    const reseñas = pastelEncontrado.review_count || 0;

    let ubicacion = 'No especificada';
    if (bakerId) {
        const repostero = await db.getBakerById(bakerId);
        if (repostero) {
            ubicacion = repostero.location || 'No especificada';
        }
    }

    const estrellas = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    const mensaje = `🍰 **${nombrePastelFinal}**\n🏢 Empresa: ${businessName}\n💰 Precio: $${precio.toFixed(2)} MXN\n📍 Ubicación: ${ubicacion}\n⭐ Calificación: ${estrellas} ${rating.toFixed(1)} (${reseñas} reseñas)\n`;
    
    return { pastel: nombrePastelFinal, empresa: businessName, precio, ubicacion, calificacion: rating, mensaje };
}

/**
 * Muestra las opciones disponibles según el contexto de la conversación.
 * 
 * @param {string} contexto - Contexto actual
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con opciones disponibles
 */
async function mostrarOpciones(contexto = '', contextoAnterior = '') {
    const contextoBuscar = contexto || contextoAnterior;
    
    if (lastSearchResult.encontrados && lastSearchResult.encontrados.length > 0) {
        const lista = lastSearchResult.encontrados.slice(0, 10).map(p => 
            `• **${p.nombre}** - $${p.precio} MXN (Empresa: ${p.empresa})`
        ).join('\n');
        return {
            mensaje: `Aquí están las opciones que tenemos disponibles:\n\n${lista}`,
            opciones: lastSearchResult.encontrados
        };
    }
    
    if (contextoBuscar) {
        return consultarPastelesPorCategoria(contextoBuscar);
    }
    
    const categorias = await consultarCategorias();
    const listaCats = categorias.categorias.map(c => 
        `• ${c.nombre} ${c.icono || ''}`
    ).join('\n');
    
    return { mensaje: `Estas son las categorías disponibles en Danhee Cake:\n${listaCats}` };
}

/**
 * Consulta empresas de repostería por ubicación.
 * 
 * @param {string} ubicacion - Ciudad o región
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con empresas: { ubicacion: string, empresas: Array, mensaje: string }
 */
async function consultarEmpresasPorUbicacion(ubicacion, contextoAnterior = '') {
    const reposteros = await db.getBakers();
    const ubicacionBuscar = ubicacion || contextoAnterior;
    if (!ubicacionBuscar) {
        return { mensaje: 'Por favor especifica una ubicación para buscar empresas.' };
    }
    
    const ubicacionNormalizada = quitarAcentos(ubicacionBuscar.toLowerCase());
    const filtrados = reposteros.filter(r => 
        r.location && (ubicacionNormalizada in quitarAcentos(r.location.toLowerCase()))
    );
    
    if (filtrados.length === 0) {
        return { mensaje: `No encontré empresas en '${ubicacionBuscar}' en Danhee Cake.` };
    }
    
    const resultado = filtrados.map(r => ({
        nombreNegocio: r.business_name,
        especialidad: r.specialty,
        ubicacion: r.location
    }));
    
    lastContext.ultimasEmpresas = resultado;
    const lista = resultado.map(emp => 
        `• **${emp.nombreNegocio}** - ${emp.ubicacion}`
    ).join('\n');
    
    return { ubicacion: ubicacionBuscar, empresas: resultado, mensaje: `🏢 Empresas en ${ubicacionBuscar}:\n${lista}` };
}

/**
 * Consulta todos los pasteles de una empresa específica.
 * 
 * @param {string} empresa - Nombre de la empresa
 * @param {string} contextoAnterior - Contexto de conversación previa
 * @returns {Promise<Object>} Objeto con pasteles: { empresa: string, pasteles: Array, mensaje: string }
 */
async function consultarPastelesPorEmpresa(empresa, contextoAnterior = '') {
    const todosPasteles = await db.getCakes();
    const empresaBuscar = empresa || contextoAnterior;
    if (!empresaBuscar) {
        return { mensaje: 'Por favor especifica el nombre de la empresa para ver sus pasteles.' };
    }
    
    const empresaNormalizada = quitarAcentos(empresaBuscar.toLowerCase());
    const filtrados = todosPasteles.filter(p => 
        p.business_name && (empresaNormalizada in quitarAcentos(p.business_name.toLowerCase()))
    );
    
    if (filtrados.length === 0) {
        return { mensaje: `No encontré pasteles de la empresa '${empresaBuscar}' en Danhee Cake.` };
    }
    
    const resultado = filtrados.map(p => ({
        nombre: p.name,
        precio: parseFloat(p.price) || 0,
        categoria: p.category_name || 'Sin categoría'
    }));
    
    lastContext.ultimosPasteles = resultado;
    const lista = resultado.map(pastel => 
        `• **${pastel.nombre}** - $${pastel.precio} MXN - ${pastel.categoria}`
    ).join('\n');
    
    return { empresa: empresaBuscar, pasteles: resultado, mensaje: `🍰 Pasteles de ${empresaBuscar}:\n${lista}` };
}

/**
 * Consulta las citas programadas del usuario actual (cliente o repostero).
 * 
 * @returns {Promise<Object>} Objeto con citas del usuario
 */
async function consultarMisCitas() {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión. Por favor inicia sesión para consultar tus citas. 🍰' };
    }
    
    const user = await db.getUserById(clientId);
    if (!user) {
        return { mensaje: 'Usuario no encontrado.' };
    }
    
    const role = user.role || 'cliente';
    if (role === 'repostero') {
        const citas = await db.getBakerAppointments(clientId);
        if (citas.length === 0) {
            return { mensaje: '👨‍🍳 No tienes citas de degustación o asesoría programadas actualmente.' };
        }
        const listaCitas = citas.map(c => 
            `• 📅 ${c.date} a las ${c.time_slot} con cliente **${c.client_name}** - Estado: ${c.status}`
        );
        return { citas, mensaje: '📅 **Tus citas programadas como repostero:**\n\n' + listaCitas.join('\n') };
    } else {
        const citas = await db.getClientAppointments(clientId);
        if (citas.length === 0) {
            return { mensaje: '🧁 No tienes ninguna cita programada actualmente en Danhee Cake.' };
        }
        const listaCitas = citas.map(c => 
            `• 📅 ${c.date} a las ${c.time_slot} con la pastelería **${c.baker_business_name}** - Estado: ${c.status}`
        );
        return { citas, mensaje: '📅 **Tus citas de degustación programadas:**\n\n' + listaCitas.join('\n') };
    }
}

/**
 * Consulta los diseños de pasteles personalizados del cliente actual.
 * 
 * @returns {Promise<Object>} Objeto con diseños del cliente
 */
async function consultarMisDisenos() {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión. Por favor inicia sesión para consultar tus diseños. 🎨' };
    }
    
    const user = await db.getUserById(clientId);
    if (!user) {
        return { mensaje: 'Usuario no encontrado.' };
    }
    
    const role = user.role || 'cliente';
    if (role === 'repostero') {
        return { mensaje: 'Los reposteros no diseñan pasteles propios, sino que gestionan los pasteles de su catálogo.' };
    }
    
    const disenos = await db.getClientDesigns(clientId);
    if (disenos.length === 0) {
        return { mensaje: '🎨 Aún no tienes diseños personalizados guardados en Danhee Cake.' };
    }
    
    const tamanioMap = { 'sm': 'Pequeño', 'md': 'Mediano', 'lg': 'Grande' };
    const listaDisenos = disenos.map(d => {
        const tamanio = tamanioMap[d.size] || d.size;
        return `• **ID: ${d.id}** - Pastel ${tamanio} (Bizcocho: ${d.sponge}, Relleno: ${d.filling}, Decoración: ${d.decoration}) - Estado: ${d.status}`;
    });
    
    return { disenos, mensaje: '🎨 **Tus diseños de pasteles personalizados:**\n\n' + listaDisenos.join('\n') };
}

module.exports = {
    consultarCatalogoPasteles,
    consultarTodosLosPasteles,
    consultarMasDestacados,
    consultarReposterosDisponibles,
    verificarDisponibilidadRepostero,
    obtenerPreciosPorCategoria,
    registrarSolicitudCita,
    consultarCategorias,
    buscarPastelPorNombre,
    obtenerInfoRepostero,
    consultarHorariosRepostero,
    calcularPrecioPersonalizado,
    consultarPoliticasPasteleria,
    recomendarPastel,
    consultarOrigenPastel,
    buscarPastelesPorRangoPrecio,
    consultarPastelesPorCategoria,
    consultarTamanosPasteles,
    recomendarPorTamanio,
    consultarDetallePastelPorId,
    mostrarOpciones,
    consultarEmpresasPorUbicacion,
    consultarPastelesPorEmpresa,
    consultarMisCitas,
    consultarMisDisenos,
    lastSearchResult,
    lastContext
};
