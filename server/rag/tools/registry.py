"""
registry.py — Registro global de herramientas y esquemas JSON para Ollama en Danhee Cake.
"""

import re
import json

from tools.customer_tools import (
    consultar_catalogo_pasteles,
    consultar_todos_los_pasteles,
    consultar_reposteros_disponibles,
    verificar_disponibilidad_repostero,
    obtener_precios_por_categoria,
    registrar_solicitud_cita,
    consultar_categorias,
    buscar_pastel_por_nombre,
    obtener_info_repostero,
    calcular_precio_personalizado,
    consultar_politicas_pasteleria,
    recomendar_pastel,
    consultar_origen_pastel,
    buscar_pasteles_por_rango_precio,
    consultar_pasteles_por_categoria,
    consultar_tamanos_pasteles,
    recomendar_por_tamanio,
    consultar_detalle_pastel_por_id,
    mostrar_opciones,
    consultar_empresas_por_ubicacion,
    consultar_pasteles_por_empresa,
    consultar_mis_citas,
    consultar_mis_disenos,
)

from tools.baker_tools import (
    listar_mis_pasteles,
    agregar_nuevo_pastel,
    actualizar_mi_pastel,
    eliminar_mi_pastel,
    listar_categorias_disponibles,
)

from tools.common_tools import extraer_texto_pdf

FUNCTIONS_MAP = {
    "consultar_catalogo_pasteles": consultar_catalogo_pasteles,
    "consultar_todos_los_pasteles": consultar_todos_los_pasteles,
    "consultar_reposteros_disponibles": consultar_reposteros_disponibles,
    "verificar_disponibilidad_repostero": verificar_disponibilidad_repostero,
    "obtener_precios_por_categoria": obtener_precios_por_categoria,
    "registrar_solicitud_cita": registrar_solicitud_cita,
    "consultar_categorias": consultar_categorias,
    "buscar_pastel_por_nombre": buscar_pastel_por_nombre,
    "obtener_info_repostero": obtener_info_repostero,
    "calcular_precio_personalizado": calcular_precio_personalizado,
    "consultar_politicas_pasteleria": consultar_politicas_pasteleria,
    "recomendar_pastel": recomendar_pastel,
    "consultar_origen_pastel": consultar_origen_pastel,
    "extraer_texto_pdf": extraer_texto_pdf,
    "buscar_pasteles_por_rango_precio": buscar_pasteles_por_rango_precio,
    "consultar_pasteles_por_categoria": consultar_pasteles_por_categoria,
    "consultar_tamanos_pasteles": consultar_tamanos_pasteles,
    "recomendar_por_tamanio": recomendar_por_tamanio,
    "consultar_detalle_pastel_por_id": consultar_detalle_pastel_por_id,
    "mostrar_opciones": mostrar_opciones,
    "consultar_empresas_por_ubicacion": consultar_empresas_por_ubicacion,
    "consultar_pasteles_por_empresa": consultar_pasteles_por_empresa,
    
    # Herramientas de cliente
    "consultar_mis_citas": consultar_mis_citas,
    "consultar_mis_disenos": consultar_mis_disenos,
    
    # Herramientas de repostero
    "listar_mis_pasteles": listar_mis_pasteles,
    "agregar_nuevo_pastel": agregar_nuevo_pastel,
    "actualizar_mi_pastel": actualizar_mi_pastel,
    "eliminar_mi_pastel": eliminar_mi_pastel,
    "listar_categorias_disponibles": listar_categorias_disponibles,
    
    # Alias resilientes
    "obtener_precios": obtener_precios_por_categoria,
    "consultar_catalogo": consultar_catalogo_pasteles,
    "consultar_pasteles": consultar_catalogo_pasteles,
    "consultar_citas": consultar_mis_citas,
    "citas": consultar_mis_citas,
    "consultar_disenos": consultar_mis_disenos,
    "disenos": consultar_mis_disenos,
}

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "recomendar_pastel",
            "description": "Recomienda pasteles según ocasión (cumpleaños, boda, xv años, baby shower).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ocasion": {"type": "string"},
                    "presupuesto": {"type": "string"},
                    "estilo": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": ["ocasion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_pasteles_por_categoria",
            "description": "Consulta qué pasteles están disponibles para una categoría específica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_origen_pastel",
            "description": "Obtiene a qué empresa, pastelería o repostero pertenece un pastel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_pastel": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mostrar_opciones",
            "description": "Muestra las opciones de pasteles disponibles según el contexto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contexto": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "extraer_texto_pdf",
            "description": "Extrae y lee el contenido de un archivo PDF. Usa 'danhee_knowledge_base.pdf' para información de Danhee Cake, 'faq.pdf' para preguntas frecuentes, 'cake_sizes.pdf' para tamaños.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_archivo": {"type": "string"}
                },
                "required": ["nombre_archivo"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_detalle_pastel_por_id",
            "description": "Consulta el detalle completo de un pastel específico por su ID o por su nombre (nombre, empresa, precio, ubicación, calificación).",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer"},
                    "nombre_pastel": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_catalogo_pasteles",
            "description": "Consulta el catálogo de pasteles disponibles en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_pastel_por_nombre",
            "description": "Busca pasteles por nombre o ingrediente en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": ["nombre"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_precios_por_categoria",
            "description": "Obtiene los precios de los pasteles por categoría o filtro general.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "registrar_solicitud_cita",
            "description": "Registra una cita de degustación con un repostero de Danhee Cake. ÚSALA ÚNICAMENTE cuando el usuario te proporcione la fecha real (AAAA-MM-DD, ej: 2026-07-30) y la hora real (ej: 10:10 PM).",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {"type": "string"},
                    "baker_id": {"type": "integer"},
                    "fecha": {"type": "string", "description": "Fecha real en formato YYYY-MM-DD"},
                    "hora": {"type": "string", "description": "Hora real de la cita"},
                    "notas": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_mis_citas",
            "description": "Consulta las citas de degustación programadas del cliente actual.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_mis_disenos",
            "description": "Consulta los diseños de pasteles personalizados guardados del cliente.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

BAKER_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "listar_mis_pasteles",
            "description": "Muestra la lista de pasteles asociados a tu catálogo de repostería.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "agregar_nuevo_pastel",
            "description": "Registra un nuevo pastel en tu portafolio de repostería.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre": {"type": "string", "description": "Nombre del pastel"},
                    "precio": {"type": "number", "description": "Precio del pastel en MXN"},
                    "categoria": {"type": "string", "description": "Categoría a la que pertenece"},
                    "descripcion": {"type": "string", "description": "Descripción opcional"}
                },
                "required": ["nombre", "precio"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "actualizar_mi_pastel",
            "description": "Actualiza la información de uno de tus pasteles usando su ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer", "description": "ID numérico del pastel"},
                    "nombre": {"type": "string", "description": "Nuevo nombre"},
                    "precio": {"type": "number", "description": "Nuevo precio"},
                    "descripcion": {"type": "string", "description": "Nueva descripción"},
                    "categoria": {"type": "string", "description": "Nueva categoría"}
                },
                "required": ["pastel_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "eliminar_mi_pastel",
            "description": "Elimina un pastel de tu catálogo usando su ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer", "description": "ID numérico del pastel"}
                },
                "required": ["pastel_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "listar_categorias_disponibles",
            "description": "Muestra la lista de categorías activas en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_mis_citas",
            "description": "Consulta las citas de degustación agendadas con los clientes.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

def _normalize_tool_name(name: str) -> str:
    if not name:
        return ""
    return re.sub(r"[^a-z0-9_]", "", str(name).strip().lower())

def _resolve_tool_name(name: str) -> str:
    if not name:
        return ""
    normalized = _normalize_tool_name(name)
    if normalized in FUNCTIONS_MAP:
        return normalized

    normalized_no_underscore = normalized.replace("_", "")
    for key in FUNCTIONS_MAP:
        key_norm = _normalize_tool_name(key)
        if key_norm == normalized:
            return key
        if key_norm.replace("_", "") == normalized_no_underscore:
            return key
    for key in FUNCTIONS_MAP:
        key_norm = _normalize_tool_name(key).replace("_", "")
        if normalized_no_underscore in key_norm or key_norm in normalized_no_underscore:
            return key
    return normalized

def _parse_tool_call_from_text(raw_text: str):
    if not raw_text or "{" not in raw_text:
        return None
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed_json = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_json, dict):
        return None

    if "function" in parsed_json and isinstance(parsed_json["function"], dict):
        name = parsed_json["function"].get("name")
        args = parsed_json["function"].get("arguments") or parsed_json["function"].get("parameters") or parsed_json["function"].get("params") or {}
        if name:
            return {"function": {"name": name, "arguments": args}}

    if "name" in parsed_json:
        name = parsed_json["name"]
        args = parsed_json.get("params") or parsed_json.get("arguments") or parsed_json.get("parameters") or {}
        return {"function": {"name": name, "arguments": args}}

    return None
