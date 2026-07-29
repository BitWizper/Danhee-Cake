/**
 * baker-tools.js — Herramientas y funciones especializadas para el Agente de Reposteros en Danhee Cake.
 * Versión JavaScript/Node.js equivalente a baker_tools.py
 */

const db = require('../db-config');
const { getCurrentClientId } = require('./common-tools');

async function listarMisPasteles() {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero. Por favor inicia sesión para ver tus pasteles.' };
    }
    
    const bakerProfile = await db.getBakerProfileByUserId(clientId);
    if (!bakerProfile) {
        return { mensaje: 'No tienes un perfil de repostero registrado en Danhee Cake.' };
    }
    
    const bakerId = bakerProfile.id;
    const pasteles = await db.getBakerCakes(bakerId);
    
    if (pasteles.length === 0) {
        return { mensaje: '👨‍🍳 Aún no tienes pasteles registrados en tu catálogo de Danhee Cake. ¿Te gustaría agregar uno?' };
    }
    
    const lista = pasteles.map(p => {
        const precio = parseFloat(p.price) || 0;
        const destacado = p.is_featured ? '⭐' : '';
        return `• **${p.name}** - $${precio.toFixed(2)} MXN ${destacado}`;
    }).join('\n');
    
    return {
        pasteles,
        total: pasteles.length,
        mensaje: `🍰 **Tu catálogo de pasteles (${pasteles.length} pasteles):**\n\n${lista}`
    };
}

async function agregarNuevoPastel(nombre, descripcion, precio, categoriaId, isFeatured = false) {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero. Por favor inicia sesión para agregar pasteles.' };
    }
    
    const bakerProfile = await db.getBakerProfileByUserId(clientId);
    if (!bakerProfile) {
        return { mensaje: 'No tienes un perfil de repostero registrado en Danhee Cake.' };
    }
    
    const bakerId = bakerProfile.id;
    const precioNum = parseFloat(precio);
    
    if (!nombre || !descripcion || isNaN(precioNum) || !categoriaId) {
        return { mensaje: 'Por favor proporciona nombre, descripción, precio y categoría válidos para el pastel.' };
    }
    
    const cakeId = await db.addBakerCake(bakerId, categoriaId, nombre, descripcion, precioNum, null, isFeatured ? 1 : 0);
    
    if (cakeId) {
        return {
            exito: true,
            cakeId,
            mensaje: `✅ Pastel "${nombre}" agregado exitosamente a tu catálogo de Danhee Cake.`
        };
    }
    
    return { mensaje: 'Hubo un error al agregar el pastel. Por favor intenta de nuevo.' };
}

async function actualizarMiPastel(cakeId, nombre, descripcion, precio, categoriaId, isFeatured = false) {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero. Por favor inicia sesión para actualizar pasteles.' };
    }
    
    const bakerProfile = await db.getBakerProfileByUserId(clientId);
    if (!bakerProfile) {
        return { mensaje: 'No tienes un perfil de repostero registrado en Danhee Cake.' };
    }
    
    const bakerId = bakerProfile.id;
    const precioNum = parseFloat(precio);
    
    if (!cakeId || !nombre || !descripcion || isNaN(precioNum) || !categoriaId) {
        return { mensaje: 'Por favor proporciona ID, nombre, descripción, precio y categoría válidos.' };
    }
    
    const exito = await db.updateBakerCake(bakerId, cakeId, nombre, descripcion, precioNum, categoriaId, isFeatured ? 1 : 0);
    
    if (exito) {
        return {
            exito: true,
            mensaje: `✅ Pastel "${nombre}" actualizado exitosamente en tu catálogo de Danhee Cake.`
        };
    }
    
    return { mensaje: 'No se pudo actualizar el pastel. Verifica que el ID sea correcto y que el pastel te pertenezca.' };
}

async function eliminarMiPastel(cakeId) {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero. Por favor inicia sesión para eliminar pasteles.' };
    }
    
    const bakerProfile = await db.getBakerProfileByUserId(clientId);
    if (!bakerProfile) {
        return { mensaje: 'No tienes un perfil de repostero registrado en Danhee Cake.' };
    }
    
    const bakerId = bakerProfile.id;
    
    if (!cakeId) {
        return { mensaje: 'Por favor proporciona el ID del pastel que deseas eliminar.' };
    }
    
    const exito = await db.deleteBakerCake(bakerId, cakeId);
    
    if (exito) {
        return {
            exito: true,
            mensaje: '✅ Pastel eliminado exitosamente de tu catálogo de Danhee Cake.'
        };
    }
    
    return { mensaje: 'No se pudo eliminar el pastel. Verifica que el ID sea correcto y que el pastel te pertenezca.' };
}

async function listarCategoriasDisponibles() {
    const categorias = await db.getCategories();
    
    if (categorias.length === 0) {
        return { mensaje: 'No hay categorías registradas en Danhee Cake.' };
    }
    
    const lista = categorias.map(c => `• **${c.name}** (ID: ${c.id})`).join('\n');
    
    return {
        categorias,
        total: categorias.length,
        mensaje: `📂 **Categorías disponibles en Danhee Cake:**\n\n${lista}`
    };
}

async function consultarMisCitas() {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero. Por favor inicia sesión para ver tus citas.' };
    }
    
    const citas = await db.getBakerAppointments(clientId);
    
    if (citas.length === 0) {
        return { mensaje: '👨‍🍳 No tienes citas de degustación o asesoría programadas actualmente.' };
    }
    
    const listaCitas = citas.map(c => 
        `• 📅 ${c.date} a las ${c.time_slot} con cliente **${c.client_name}** - Estado: ${c.status}`
    ).join('\n');
    
    return {
        citas,
        total: citas.length,
        mensaje: `📅 **Tus citas programadas como repostero:**\n\n${listaCitas}`
    };
}

async function obtenerContextoRepostero() {
    const clientId = getCurrentClientId();
    if (!clientId) {
        return { mensaje: 'No has iniciado sesión como repostero.' };
    }
    
    const bakerProfile = await db.getBakerProfileByUserId(clientId);
    if (!bakerProfile) {
        return { mensaje: 'No tienes un perfil de repostero registrado.' };
    }
    
    const bakerId = bakerProfile.id;
    const pasteles = await db.getBakerCakes(bakerId);
    const citas = await db.getBakerAppointments(clientId);
    
    return {
        bakerId,
        nombreNegocio: bakerProfile.business_name,
        especialidad: bakerProfile.specialty,
        ubicacion: bakerProfile.location,
        horario: bakerProfile.business_hours,
        totalPasteles: pasteles.length,
        totalCitas: citas.length,
        mensaje: `👨‍🍳 **Tu perfil de repostero en Danhee Cake:**\n\n🏢 Negocio: ${bakerProfile.business_name}\n🎂 Especialidad: ${bakerProfile.specialty}\n📍 Ubicación: ${bakerProfile.location}\n📅 Horario: ${bakerProfile.business_hours}\n🍰 Pasteles en catálogo: ${pasteles.length}\n📋 Citas programadas: ${citas.length}`
    };
}

module.exports = {
    listarMisPasteles,
    agregarNuevoPastel,
    actualizarMiPastel,
    eliminarMiPastel,
    listarCategoriasDisponibles,
    consultarMisCitas,
    obtenerContextoRepostero
};
