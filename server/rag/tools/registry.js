/**
 * registry.js — Registro central de herramientas (tools) disponibles para los agentes de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a registry.py
 */

const customerTools = require('./customer-tools');
const bakerTools = require('./baker-tools');

const FUNCTIONS_MAP = {
    'consultar_catalogo_pasteles': customerTools.consultarCatalogoPasteles,
    'consultar_todos_los_pasteles': customerTools.consultarTodosLosPasteles,
    'consultar_mas_destacados': customerTools.consultarMasDestacados,
    'consultar_reposteros_disponibles': customerTools.consultarReposterosDisponibles,
    'verificar_disponibilidad_repostero': customerTools.verificarDisponibilidadRepostero,
    'obtener_precios_por_categoria': customerTools.obtenerPreciosPorCategoria,
    'registrar_solicitud_cita': customerTools.registrarSolicitudCita,
    'consultar_categorias': customerTools.consultarCategorias,
    'buscar_pastel_por_nombre': customerTools.buscarPastelPorNombre,
    'obtener_info_repostero': customerTools.obtenerInfoRepostero,
    'consultar_horarios_repostero': customerTools.consultarHorariosRepostero,
    'calcular_precio_personalizado': customerTools.calcularPrecioPersonalizado,
    'consultar_politicas_pasteleria': customerTools.consultarPoliticasPasteleria,
    'recomendar_pastel': customerTools.recomendarPastel,
    'consultar_origen_pastel': customerTools.consultarOrigenPastel,
    'buscar_pasteles_por_rango_precio': customerTools.buscarPastelesPorRangoPrecio,
    'consultar_pasteles_por_categoria': customerTools.consultarPastelesPorCategoria,
    'consultar_tamanos_pasteles': customerTools.consultarTamanosPasteles,
    'recomendar_por_tamanio': customerTools.recomendarPorTamanio,
    'consultar_detalle_pastel_por_id': customerTools.consultarDetallePastelPorId,
    'mostrar_opciones': customerTools.mostrarOpciones,
    'consultar_empresas_por_ubicacion': customerTools.consultarEmpresasPorUbicacion,
    'consultar_pasteles_por_empresa': customerTools.consultarPastelesPorEmpresa,
    'consultar_mis_citas': customerTools.consultarMisCitas,
    'consultar_mis_disenos': customerTools.consultarMisDisenos,
    'listar_mis_pasteles': bakerTools.listarMisPasteles,
    'agregar_nuevo_pastel': bakerTools.agregarNuevoPastel,
    'actualizar_mi_pastel': bakerTools.actualizarMiPastel,
    'eliminar_mi_pastel': bakerTools.eliminarMiPastel,
    'listar_categorias_disponibles': bakerTools.listarCategoriasDisponibles,
    'consultar_mis_citas_repostero': bakerTools.consultarMisCitasRepostero,
    'obtener_contexto_repostero': bakerTools.obtenerContextoRepostero
};

const TOOLS_SCHEMA = [
    {
        type: 'function',
        function: {
            name: 'consultar_catalogo_pasteles',
            description: 'Consulta el catálogo de pasteles de Danhee Cake, opcionalmente filtrado por categoría.',
            parameters: {
                type: 'object',
                properties: {
                    categoria: { type: 'string', description: 'Categoría para filtrar (opcional)' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_todos_los_pasteles',
            description: 'Consulta todos los pasteles disponibles en Danhee Cake sin filtros.',
            parameters: {
                type: 'object',
                properties: {
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_mas_destacados',
            description: 'Consulta los pasteles más destacados de Danhee Cake según calificación y reseñas.',
            parameters: {
                type: 'object',
                properties: {
                    top: { type: 'integer', description: 'Número de pasteles a mostrar (opcional, default 5)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_reposteros_disponibles',
            description: 'Consulta los reposteros disponibles en Danhee Cake.',
            parameters: {
                type: 'object',
                properties: {
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'verificar_disponibilidad_repostero',
            description: 'Verifica la disponibilidad de un repostero específico en una fecha.',
            parameters: {
                type: 'object',
                properties: {
                    baker_id: { type: 'integer', description: 'ID del repostero' },
                    fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' }
                },
                required: ['baker_id', 'fecha']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'obtener_precios_por_categoria',
            description: 'Obtiene los precios de pasteles por categoría específica.',
            parameters: {
                type: 'object',
                properties: {
                    categoria: { type: 'string', description: 'Categoría de pasteles' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'registrar_solicitud_cita',
            description: 'Registra una solicitud de cita de degustación con un repostero.',
            parameters: {
                type: 'object',
                properties: {
                    client_name: { type: 'string', description: 'Nombre del cliente (opcional)' },
                    baker_id: { type: 'integer', description: 'ID del repostero (opcional)' },
                    fecha: { type: 'string', description: 'Fecha deseada (puede ser relativa)' },
                    hora: { type: 'string', description: 'Hora deseada' },
                    notas: { type: 'string', description: 'Notas adicionales' },
                    client_datetime: { type: 'string', description: 'Fecha/hora actual del cliente (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_categorias',
            description: 'Consulta las categorías de pasteles disponibles en Danhee Cake.',
            parameters: {
                type: 'object',
                properties: {
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'buscar_pastel_por_nombre',
            description: 'Busca pasteles por nombre o parte del nombre.',
            parameters: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', description: 'Nombre o parte del nombre del pastel' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: ['nombre']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'obtener_info_repostero',
            description: 'Obtiene información detallada de un repostero específico.',
            parameters: {
                type: 'object',
                properties: {
                    baker_id: { type: 'integer', description: 'ID del repostero' }
                },
                required: ['baker_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_horarios_repostero',
            description: 'Consulta los horarios de atención de un repostero.',
            parameters: {
                type: 'object',
                properties: {
                    baker_id: { type: 'integer', description: 'ID del repostero (opcional)' },
                    nombre_pastel: { type: 'string', description: 'Nombre de un pastel para inferir repostero (opcional)' },
                    nombre_empresa: { type: 'string', description: 'Nombre de empresa para inferir repostero (opcional)' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcular_precio_personalizado',
            description: 'Calcula el precio estimado de un pastel personalizado según tamaño, relleno y decoración.',
            parameters: {
                type: 'object',
                properties: {
                    tamanio: { type: 'string', description: 'Tamaño: pequeño, mediano o grande' },
                    relleno: { type: 'string', description: 'Tipo de relleno' },
                    decoracion: { type: 'string', description: 'Tipo de decoración' }
                },
                required: ['tamanio', 'relleno', 'decoracion']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_politicas_pasteleria',
            description: 'Consulta las políticas de la pastelería (entrega, pago, cancelación, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    tema: { type: 'string', description: 'Tema de la política: entrega, pago, cancelacion, personalizacion, general' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'recomendar_pastel',
            description: 'Recomienda pasteles según ocasión, presupuesto y estilo.',
            parameters: {
                type: 'object',
                properties: {
                    ocasion: { type: 'string', description: 'Ocasión del pastel' },
                    presupuesto: { type: 'string', description: 'Nivel de presupuesto: bajo, medio, alto (opcional)' },
                    estilo: { type: 'string', description: 'Estilo preferido (opcional)' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_origen_pastel',
            description: 'Obtiene información de origen de un pastel (empresa, repostero, categoría, precio).',
            parameters: {
                type: 'object',
                properties: {
                    nombre_pastel: { type: 'string', description: 'Nombre del pastel' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'buscar_pasteles_por_rango_precio',
            description: 'Busca pasteles por rango de precio (menor o mayor a un valor).',
            parameters: {
                type: 'object',
                properties: {
                    precio: { type: 'number', description: 'Precio límite' },
                    condicion: { type: 'string', description: 'Condición: menor o mayor' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: ['precio', 'condicion']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_pasteles_por_categoria',
            description: 'Consulta pasteles específicos de una categoría.',
            parameters: {
                type: 'object',
                properties: {
                    categoria: { type: 'string', description: 'Categoría de pasteles' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_tamanos_pasteles',
            description: 'Consulta los tamaños de pasteles disponibles en Danhee Cake.',
            parameters: {
                type: 'object',
                properties: {
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'recomendar_por_tamanio',
            description: 'Recomienda pasteles según el tamaño deseado.',
            parameters: {
                type: 'object',
                properties: {
                    tamanio_deseado: { type: 'string', description: 'Tamaño: pequeño, mediano o grande' }
                },
                required: ['tamanio_deseado']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_detalle_pastel_por_id',
            description: 'Consulta el detalle completo de un pastel específico por ID o nombre.',
            parameters: {
                type: 'object',
                properties: {
                    pastel_id: { type: 'integer', description: 'ID del pastel (opcional)' },
                    nombre_pastel: { type: 'string', description: 'Nombre del pastel (opcional)' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'mostrar_opciones',
            description: 'Muestra las opciones disponibles según el contexto de la conversación.',
            parameters: {
                type: 'object',
                properties: {
                    contexto: { type: 'string', description: 'Contexto actual' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_empresas_por_ubicacion',
            description: 'Consulta empresas de repostería por ubicación.',
            parameters: {
                type: 'object',
                properties: {
                    ubicacion: { type: 'string', description: 'Ciudad o región' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_pasteles_por_empresa',
            description: 'Consulta todos los pasteles de una empresa específica.',
            parameters: {
                type: 'object',
                properties: {
                    empresa: { type: 'string', description: 'Nombre de la empresa' },
                    contexto_anterior: { type: 'string', description: 'Contexto anterior de la conversación (opcional)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_mis_citas',
            description: 'Consulta las citas programadas del usuario actual (cliente o repostero).',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_mis_disenos',
            description: 'Consulta los diseños de pasteles personalizados del cliente actual.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

const BAKER_TOOLS_SCHEMA = [
    {
        type: 'function',
        function: {
            name: 'listar_mis_pasteles',
            description: 'Lista todos los pasteles del repostero actual en su catálogo.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'agregar_nuevo_pastel',
            description: 'Agrega un nuevo pastel al catálogo del repostero.',
            parameters: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', description: 'Nombre del pastel' },
                    descripcion: { type: 'string', description: 'Descripción del pastel' },
                    precio: { type: 'number', description: 'Precio del pastel' },
                    categoria_id: { type: 'integer', description: 'ID de la categoría' },
                    is_featured: { type: 'boolean', description: 'Si es destacado (opcional)' }
                },
                required: ['nombre', 'descripcion', 'precio', 'categoria_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'actualizar_mi_pastel',
            description: 'Actualiza un pastel existente del repostero.',
            parameters: {
                type: 'object',
                properties: {
                    cake_id: { type: 'integer', description: 'ID del pastel a actualizar' },
                    nombre: { type: 'string', description: 'Nuevo nombre del pastel' },
                    descripcion: { type: 'string', description: 'Nueva descripción del pastel' },
                    precio: { type: 'number', description: 'Nuevo precio del pastel' },
                    categoria_id: { type: 'integer', description: 'Nueva categoría del pastel' },
                    is_featured: { type: 'boolean', description: 'Si es destacado (opcional)' }
                },
                required: ['cake_id', 'nombre', 'descripcion', 'precio', 'categoria_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'eliminar_mi_pastel',
            description: 'Elimina un pastel del catálogo del repostero.',
            parameters: {
                type: 'object',
                properties: {
                    cake_id: { type: 'integer', description: 'ID del pastel a eliminar' }
                },
                required: ['cake_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listar_categorias_disponibles',
            description: 'Lista todas las categorías disponibles para asignar a pasteles.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_mis_citas_repostero',
            description: 'Consulta las citas de degustación programadas para el repostero.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'obtener_contexto_repostero',
            description: 'Obtiene el contexto actual del repostero (negocio, especialidad, ubicación, etc.).',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

function resolveToolName(llmOutput) {
    if (!llmOutput) return null;
    
    const outputStr = String(llmOutput);
    const toolNames = Object.keys(FUNCTIONS_MAP);
    
    for (const name of toolNames) {
        if (outputStr.includes(name)) {
            return name;
        }
    }
    
    const normalized = outputStr.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    for (const name of toolNames) {
        if (normalized === name.toLowerCase()) {
            return name;
        }
    }
    
    return null;
}

async function executeTool(toolName, args) {
    const func = FUNCTIONS_MAP[toolName];
    if (!func) {
        throw new Error(`Herramienta no encontrada: ${toolName}`);
    }
    
    const result = await func(args.categoria, args.contexto_anterior, args.baker_id, args.fecha, args.hora, 
        args.notas, args.client_datetime, args.client_name, args.top, args.nombre, args.precio, 
        args.condicion, args.tamanio, args.relleno, args.decoracion, args.presupuesto, args.estilo, 
        args.ocasion, args.tema, args.pastel_id, args.nombre_pastel, args.contexto, args.ubicacion, 
        args.empresa, args.nombre_empresa, args.tamanio_deseado, args.cake_id, args.descripcion, 
        args.categoria_id, args.is_featured);
    
    return result;
}

module.exports = {
    FUNCTIONS_MAP,
    TOOLS_SCHEMA,
    BAKER_TOOLS_SCHEMA,
    resolveToolName,
    executeTool
};
