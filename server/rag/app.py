import sys
import json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request

# Configurar encoding a UTF-8 para consola Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Cargar las librerías necesarias de LangChain y Chroma
try:
    from langchain_community.vectorstores import Chroma
    from langchain_ollama import OllamaEmbeddings
    from langchain_ollama import ChatOllama
    import ollama as ollama_sdk
except ImportError as e:
    print(f"Error al importar librerías: {e}", file=sys.stderr)
    sys.exit(1)

# Módulo de acceso a datos vía Node REST API
from db_config import _http_get, _http_post

base_dir = Path(__file__).resolve().parent

# Variable global para almacenar client_id del usuario actual (por turno)
_current_client_id = None

# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 1: FUNCIONES LOCALES DE LA PASTELERÍA (Herramientas del LLM)
# ─────────────────────────────────────────────────────────────────────────────

def consultar_catalogo_pasteles(categoria: str = "") -> dict:
    """
    Consulta el catálogo de pasteles disponibles en Danhee Cake.
    Puede filtrar por categoría (XV Años, Boda, Baby Shower, Cumpleaños, etc.).
    """
    data = _http_get("/cakes")
    if data is None:
        return {"error": "No se pudo obtener el catálogo. Intenta más tarde."}
    pasteles = data if isinstance(data, list) else data.get("data", data.get("cakes", []))
    if categoria:
        pasteles = [
            p for p in pasteles
            if categoria.lower() in str(p.get("category_name", "")).lower()
            or categoria.lower() in str(p.get("name", "")).lower()
        ]
    if not pasteles:
        return {"mensaje": f"No encontré pasteles para la categoría '{categoria}'. Prueba con: Boda, XV Años, Cumpleaños, Baby Shower, Aniversario, Graduación, Corporativo."}
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": p.get("price"),
            "calificacion": p.get("rating"),
            "categoria": p.get("category_name", "Sin categoría"),
        }
        for p in pasteles[:8]
    ]
    return {"pasteles": resultado, "total": len(resultado)}


def consultar_reposteros_disponibles() -> dict:
    """
    Lista todos los reposteros verificados de Danhee Cake con su nombre,
    especialidad, calificación promedio y ubicación.
    """
    data = _http_get("/bakers")
    if data is None:
        return {"error": "No se pudo obtener la lista de reposteros."}
    reposteros = data if isinstance(data, list) else data.get("data", data.get("bakers", []))
    resultado = [
        {
            "id": r.get("id"),
            "nombre_negocio": r.get("business_name"),
            "especialidad": r.get("specialty"),
            "calificacion": r.get("rating_avg"),
            "ubicacion": r.get("location"),
            "verificado": bool(r.get("is_verified")),
        }
        for r in reposteros
    ]
    return {"reposteros": resultado, "total": len(resultado)}


def verificar_disponibilidad_repostero(baker_id: int, fecha: str) -> dict:
    """
    Verifica si un repostero tiene disponibilidad en una fecha específica.
    """
    data = _http_get(f"/appointments/baker/{baker_id}/date/{fecha}")
    if data is None:
        return {
            "baker_id": baker_id,
            "fecha": fecha,
            "disponible": True,
            "mensaje": "El repostero parece tener disponibilidad para esa fecha. Te recomendamos confirmar al agendar.",
            "horarios_ocupados": []
        }
    citas = data if isinstance(data, list) else data.get("data", [])
    horarios_ocupados = [c.get("time_slot") for c in citas if c.get("time_slot")]
    return {
        "baker_id": baker_id,
        "fecha": fecha,
        "disponible": len(citas) < 5,
        "horarios_ocupados": horarios_ocupados,
        "citas_del_dia": len(citas),
        "mensaje": "Hay disponibilidad." if len(citas) < 5 else "El repostero está muy ocupado ese día, prueba otra fecha."
    }


def obtener_precios_por_categoria(categoria: str) -> dict:
    """
    Obtiene el rango de precios de los pasteles de una categoría específica.
    """
    data = _http_get("/cakes")
    if data is None:
        return {"error": "No se pudo consultar los precios en este momento."}
    todos = data if isinstance(data, list) else data.get("data", data.get("cakes", []))
    filtrados = [
        p for p in todos
        if categoria.lower() in str(p.get("category_name", "")).lower()
        or categoria.lower() in str(p.get("name", "")).lower()
    ]
    if not filtrados:
        return {"mensaje": f"No encontré pasteles en la categoría '{categoria}'."}
    precios = [float(p.get("price", 0)) for p in filtrados if p.get("price")]
    if not precios:
        return {"mensaje": f"Los pasteles de '{categoria}' no tienen precios registrados aún."}
    return {
        "categoria": categoria,
        "precio_min": min(precios),
        "precio_max": max(precios),
        "precio_promedio": round(sum(precios) / len(precios), 2),
        "cantidad_pasteles": len(filtrados)
    }


def registrar_solicitud_cita(
    client_name: str,
    baker_id: int,
    fecha: str,
    hora: str,
    notas: str = ""
) -> dict:
    """
    Registra una solicitud de cita con un repostero de Danhee Cake.
    Para usuarios autenticados usa /appointments/internal, para guest usa /appointments/guest.
    """
    global _current_client_id
    
    print(f"[RAG Tools] ========================================", file=sys.stderr)
    print(f"[RAG Tools] Registrando cita:", file=sys.stderr)
    print(f"[RAG Tools]   Cliente: {client_name}", file=sys.stderr)
    print(f"[RAG Tools]   Repostero ID: {baker_id}", file=sys.stderr)
    print(f"[RAG Tools]   Fecha: {fecha}", file=sys.stderr)
    print(f"[RAG Tools]   Hora: {hora}", file=sys.stderr)
    print(f"[RAG Tools]   Notas: {notas}", file=sys.stderr)
    print(f"[RAG Tools]   _current_client_id: {_current_client_id}", file=sys.stderr)
    print(f"[RAG Tools] ========================================", file=sys.stderr)
    
    # CASO 1: Usuario autenticado (tiene client_id)
    if _current_client_id:
        print(f"[RAG Tools] ✅ Usuario AUTENTICADO con ID: {_current_client_id}", file=sys.stderr)
        payload = {
            "client_id": _current_client_id,
            "baker_id": baker_id,
            "date": fecha,
            "time_slot": hora,
            "notes": f"Cliente: {client_name}. {notas}".strip()
        }
        print(f"[RAG Tools] Enviando a /appointments/internal: {payload}", file=sys.stderr)
        result = _http_post("/appointments/internal", payload)
        print(f"[RAG Tools] Respuesta: {result}", file=sys.stderr)
        
        if result and result.get("success"):
            return {
                "exito": True,
                "mensaje": f"¡Cita registrada exitosamente! {client_name}, tu cita con el repostero #{baker_id} ha sido agendada para el {fecha} a las {hora}. 🎉",
                "datos": {"baker_id": baker_id, "fecha": fecha, "hora": hora}
            }
        else:
            error_msg = result.get("message", "Error desconocido") if result else "No se pudo conectar con el servidor"
            print(f"[RAG Tools] ❌ Error en cita autenticada: {error_msg}", file=sys.stderr)
    
    # CASO 2: Usuario NO autenticado (visitante)
    else:
        print(f"[RAG Tools] 👤 Usuario NO AUTENTICADO (visitante)", file=sys.stderr)
        payload = {
            "baker_id": baker_id,
            "date": fecha,
            "time_slot": hora,
            "notes": f"Solicitud de {client_name}. {notas}".strip()
        }
        print(f"[RAG Tools] Enviando a /appointments/guest: {payload}", file=sys.stderr)
        result = _http_post("/appointments/guest", payload)
        print(f"[RAG Tools] Respuesta: {result}", file=sys.stderr)
        
        if result and result.get("success"):
            return {
                "exito": True,
                "mensaje": f"¡Solicitud recibida! {client_name}, pronto recibirás confirmación para tu cita del {fecha} a las {hora}. 🎂",
                "datos": {"baker_id": baker_id, "fecha": fecha, "hora": hora}
            }
    
    # Fallback genérico si algo falla
    print(f"[RAG Tools] ⚠️ Usando mensaje de fallback", file=sys.stderr)
    return {
        "exito": False,
        "mensaje": f"Tu solicitud fue recibida para {client_name} con el repostero #{baker_id} el {fecha} a las {hora}. Un asesor de Danhee Cake te contactará para confirmar. 🎂",
        "nota": "Guarda esta información para tu seguimiento."
    }


def consultar_categorias() -> dict:
    """Lista todas las categorías de pasteles disponibles."""
    data = _http_get("/categories")
    if data is None:
        categorias_default = [
            {"nombre": "XV Años", "icono": "👑", "descripcion": "Pasteles elegantes para la gran celebración"},
            {"nombre": "Boda", "icono": "💍", "descripcion": "Pasteles nupciales de lujo"},
            {"nombre": "Baby Shower", "icono": "🍼", "descripcion": "Diseños tiernos y coloridos"},
            {"nombre": "Cumpleaños", "icono": "🎂", "descripcion": "Pasteles personalizados para cada año"},
            {"nombre": "Aniversario", "icono": "💑", "descripcion": "Pasteles románticos y sofisticados"},
            {"nombre": "Graduación", "icono": "🎓", "descripcion": "Celebra tu logro con estilo"},
            {"nombre": "Corporativo", "icono": "🏢", "descripcion": "Para eventos empresariales"},
            {"nombre": "Sin Ocasión", "icono": "✨", "descripcion": "Cualquier día es bueno para un pastel"},
        ]
        return {"categorias": categorias_default, "fuente": "datos_locales"}
    cats = data if isinstance(data, list) else data.get("data", data.get("categories", []))
    resultado = [
        {"nombre": c.get("name"), "icono": c.get("icon"), "descripcion": c.get("description")}
        for c in cats if c.get("is_active", 1)
    ]
    return {"categorias": resultado, "total": len(resultado)}


def buscar_pastel_por_nombre(nombre: str) -> dict:
    """Busca pasteles en el catálogo por nombre parcial."""
    data = _http_get("/cakes")
    if data is None:
        return {"error": "No se pudo buscar el pastel en este momento."}
    todos = data if isinstance(data, list) else data.get("data", data.get("cakes", []))
    encontrados = [
        p for p in todos
        if nombre.lower() in str(p.get("name", "")).lower()
        or nombre.lower() in str(p.get("description", "")).lower()
    ]
    if not encontrados:
        return {"mensaje": f"No encontré pasteles con el nombre '{nombre}'. ¿Quieres ver el catálogo completo o una categoría específica?"}
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "descripcion": p.get("description"),
            "precio": p.get("price"),
            "calificacion": p.get("rating"),
        }
        for p in encontrados[:5]
    ]
    return {"encontrados": resultado, "cantidad": len(resultado)}


def obtener_info_repostero(baker_id: int) -> dict:
    """Obtiene información completa de un repostero específico."""
    data = _http_get(f"/bakers/{baker_id}")
    if data is None:
        return {"error": f"No se encontró el repostero con ID {baker_id}."}
    repostero = data if isinstance(data, dict) and "id" in data else data.get("data", data)
    if isinstance(repostero, list):
        repostero = repostero[0] if repostero else {}
    return {
        "id": repostero.get("id"),
        "nombre_negocio": repostero.get("business_name"),
        "especialidad": repostero.get("specialty"),
        "bio": repostero.get("bio"),
        "calificacion": repostero.get("rating_avg"),
        "total_resenas": repostero.get("total_reviews"),
        "ubicacion": repostero.get("location"),
        "portafolio": repostero.get("portfolio_url"),
        "verificado": bool(repostero.get("is_verified")),
    }


def calcular_precio_personalizado(tamanio: str, relleno: str, decoracion: str) -> dict:
    """Calcula el precio estimado de un pastel personalizado."""
    precios_base = {"pequeño": 350, "sm": 350, "mediano": 550, "md": 550, "grande": 850, "lg": 850}
    extra_relleno = {
        "vainilla": 0, "vanilla": 0, "chocolate": 50, "fresas": 80,
        "dulce de leche": 70, "cream": 0, "nutella": 100, "maracuya": 90
    }
    extra_decoracion = {
        "fondant": 150, "buttercream": 80, "flores": 120, "minimalista": 50,
        "flores 3D": 200, "flores3d": 200, "naked": 60, "liso": 30
    }
    tam_key = tamanio.lower().replace("ñ", "n")
    base = precios_base.get(tam_key, 550)
    extra_r = extra_relleno.get(relleno.lower(), 60)
    extra_d = extra_decoracion.get(decoracion.lower(), 100)
    total = base + extra_r + extra_d
    return {
        "tamanio": tamanio,
        "relleno": relleno,
        "decoracion": decoracion,
        "precio_estimado": total,
        "desglose": {
            "base_tamanio": base,
            "extra_relleno": extra_r,
            "extra_decoracion": extra_d
        },
        "nota": "Precio estimado en MXN. El precio final puede variar según complejidad.",
        "moneda": "MXN"
    }


def consultar_politicas_pasteleria(tema: str) -> dict:
    """Proporciona las políticas oficiales de Danhee Cake."""
    politicas = {
        "entrega": {
            "tema": "Tiempos de Entrega",
            "info": [
                "📦 Los pedidos estándar requieren mínimo 5 días hábiles de anticipación.",
                "💍 Pasteles de boda o XV Años: mínimo 15 días de anticipación.",
                "🚗 Ofrecemos entrega a domicilio en zona metropolitana (cargo adicional de $80-$150 MXN según distancia).",
                "📍 También puedes recoger en el taller del repostero sin costo adicional.",
                "⏰ Horario de entregas: Lunes a Sábado de 9:00 AM a 7:00 PM."
            ]
        },
        "pago": {
            "tema": "Métodos de Pago",
            "info": [
                "💳 Aceptamos: Transferencia bancaria, tarjeta de débito/crédito y efectivo.",
                "💰 Se requiere un anticipo del 50% para confirmar el pedido.",
                "✅ El saldo restante se liquida al momento de la entrega o recogida.",
                "🧾 Emitimos factura electrónica (CFDI) si la necesitas.",
                "⚠️ No se inicia producción sin anticipo confirmado."
            ]
        },
        "cancelacion": {
            "tema": "Política de Cancelación",
            "info": [
                "❌ Cancelaciones con más de 7 días de anticipación: reembolso del 80% del anticipo.",
                "⚠️ Cancelaciones entre 3-7 días: reembolso del 50% del anticipo.",
                "🚫 Cancelaciones con menos de 72 horas: sin reembolso (materiales ya adquiridos).",
                "🔄 Puedes cambiar la fecha de entrega con 5 días de anticipación sin costo.",
                "📞 Todas las cancelaciones deben hacerse vía WhatsApp o correo oficial."
            ]
        },
        "personalizacion": {
            "tema": "Personalización de Pasteles",
            "info": [
                "🎨 Cada pastel es 100% personalizado: elige sabor, relleno, tamaño y decoración.",
                "📸 Podemos replicar diseños de referencia (mándanos foto por WhatsApp).",
                "🌸 Flores naturales comestibles disponibles con cargo adicional.",
                "💬 El diseño final se confirma vía conversación con tu repostero asignado.",
                "✏️ Cambios al diseño: permitidos hasta 5 días antes de la entrega."
            ]
        },
        "pedido": {
            "tema": "Cómo Hacer un Pedido",
            "info": [
                "1️⃣ Elige tu repostero favorito en la plataforma Danhee Cake.",
                "2️⃣ Agenda una cita para discutir tu diseño personalizado.",
                "3️⃣ Confirma el pedido con el anticipo del 50%.",
                "4️⃣ Sigue el progreso de tu pastel por WhatsApp.",
                "5️⃣ Recibe tu pastel en la fecha acordada. 🎂"
            ]
        },
        "garantia": {
            "tema": "Garantía de Calidad",
            "info": [
                "✅ Todos nuestros reposteros están verificados y certificados.",
                "🌡️ Garantizamos la calidad de ingredientes frescos y de primera.",
                "📷 Enviamos foto del pastel terminado antes de la entrega.",
                "🔄 Si el pastel no coincide con el diseño acordado, lo corregimos sin costo.",
                "⭐ Sistema de reseñas para mantener altos estándares de calidad."
            ]
        },
        "general": {
            "tema": "Información General",
            "info": [
                "🎂 Danhee Cake — Pastelería personalizada premium.",
                "📱 Síguenos en redes sociales: @DanheeCake",
                "📞 WhatsApp: Disponible en el perfil de cada repostero.",
                "🌟 Más de 8 categorías: XV Años, Boda, Baby Shower, Cumpleaños y más.",
                "💝 Hacemos realidad el pastel de tus sueños."
            ]
        }
    }
    tema_key = tema.lower().strip()
    politica = politicas.get(tema_key, politicas["general"])
    return politica


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 2: MAPA DE FUNCIONES
# ─────────────────────────────────────────────────────────────────────────────

FUNCTIONS_MAP = {
    "consultar_catalogo_pasteles": consultar_catalogo_pasteles,
    "consultar_reposteros_disponibles": consultar_reposteros_disponibles,
    "verificar_disponibilidad_repostero": verificar_disponibilidad_repostero,
    "obtener_precios_por_categoria": obtener_precios_por_categoria,
    "registrar_solicitud_cita": registrar_solicitud_cita,
    "consultar_categorias": consultar_categorias,
    "buscar_pastel_por_nombre": buscar_pastel_por_nombre,
    "obtener_info_repostero": obtener_info_repostero,
    "calcular_precio_personalizado": calcular_precio_personalizado,
    "consultar_politicas_pasteleria": consultar_politicas_pasteleria,
}


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 3: ESQUEMAS JSON DE HERRAMIENTAS
# ─────────────────────────────────────────────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "consultar_catalogo_pasteles",
            "description": "Consulta el catálogo de pasteles disponibles en Danhee Cake. Puede filtrar por categoría como Boda, XV Años, Cumpleaños, Baby Shower, Aniversario, Graduación, Corporativo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {
                        "type": "string",
                        "description": "Categoría a filtrar. Ej: 'Boda', 'XV Años', 'Cumpleaños'. Dejar vacío para ver todos."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_reposteros_disponibles",
            "description": "Lista todos los reposteros verificados de Danhee Cake con especialidad, calificación y ubicación.",
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
            "name": "verificar_disponibilidad_repostero",
            "description": "Verifica si un repostero tiene disponibilidad en una fecha específica consultando sus citas agendadas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {
                        "type": "integer",
                        "description": "ID numérico del repostero."
                    },
                    "fecha": {
                        "type": "string",
                        "description": "Fecha en formato YYYY-MM-DD. Ej: '2026-06-15'."
                    }
                },
                "required": ["baker_id", "fecha"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_precios_por_categoria",
            "description": "Obtiene el rango de precios (mínimo, máximo y promedio) de los pasteles de una categoría.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {
                        "type": "string",
                        "description": "Nombre de la categoría. Ej: 'Boda', 'XV Años', 'Cumpleaños'."
                    }
                },
                "required": ["categoria"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "registrar_solicitud_cita",
            "description": "Registra una cita con un repostero de Danhee Cake. Usar cuando el cliente quiere agendar, reservar o solicitar una cita.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {
                        "type": "string",
                        "description": "Nombre completo del cliente."
                    },
                    "baker_id": {
                        "type": "integer",
                        "description": "ID del repostero seleccionado."
                    },
                    "fecha": {
                        "type": "string",
                        "description": "Fecha deseada en formato YYYY-MM-DD."
                    },
                    "hora": {
                        "type": "string",
                        "description": "Hora deseada en formato HH:MM. Ej: '10:00'."
                    },
                    "notas": {
                        "type": "string",
                        "description": "Detalles adicionales del pedido (tipo de pastel, ocasión, colores, etc.)."
                    }
                },
                "required": ["client_name", "baker_id", "fecha", "hora"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_categorias",
            "description": "Lista todas las categorías de pasteles disponibles en Danhee Cake con su icono y descripción.",
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
            "name": "buscar_pastel_por_nombre",
            "description": "Busca pasteles en el catálogo por nombre parcial o tipo específico de pastel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre": {
                        "type": "string",
                        "description": "Nombre o parte del nombre del pastel a buscar. Ej: 'tres leches', 'fondant', 'chocolate'."
                    }
                },
                "required": ["nombre"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_info_repostero",
            "description": "Obtiene la información completa del perfil de un repostero específico: bio, especialidad, calificación y portafolio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {
                        "type": "integer",
                        "description": "ID numérico del repostero (obtenido al consultar reposteros disponibles)."
                    }
                },
                "required": ["baker_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calcular_precio_personalizado",
            "description": "Calcula el precio estimado de un pastel personalizado según tamaño, relleno y tipo de decoración.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tamanio": {
                        "type": "string",
                        "description": "Tamaño del pastel: 'pequeño', 'mediano' o 'grande'."
                    },
                    "relleno": {
                        "type": "string",
                        "description": "Tipo de relleno. Ej: 'vainilla', 'chocolate', 'fresas', 'dulce de leche'."
                    },
                    "decoracion": {
                        "type": "string",
                        "description": "Tipo de decoración. Ej: 'fondant', 'buttercream', 'flores', 'minimalista'."
                    }
                },
                "required": ["tamanio", "relleno", "decoracion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_politicas_pasteleria",
            "description": "Proporciona las políticas de Danhee Cake sobre entregas, pagos, cancelaciones y personalización.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tema": {
                        "type": "string",
                        "description": "Tema de política: 'entrega', 'pago', 'cancelacion', 'personalizacion', 'pedido', 'garantia', 'general'."
                    }
                },
                "required": ["tema"]
            }
        }
    }
]


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 4: INICIALIZACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def test_ollama_tools_support(model_name: str) -> bool:
    """Verifica si el modelo de Ollama soporta function calling nativo."""
    try:
        test_messages = [{"role": "user", "content": "Dime hola"}]
        test_tools = [{
            "type": "function",
            "function": {
                "name": "test",
                "description": "Función de prueba",
                "parameters": {"type": "object", "properties": {}}
            }
        }]
        response = ollama_sdk.chat(
            model=model_name,
            messages=test_messages,
            tools=test_tools
        )
        print(f"[RAG Server] ✅ Modelo '{model_name}' soporta function calling nativo.", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[RAG Server] ⚠️ Modelo '{model_name}' NO soporta function calling nativo: {e}", file=sys.stderr)
        return False


def get_installed_llm_model():
    """Detecta el mejor modelo disponible en Ollama."""
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [m['name'] for m in data.get('models', [])]
            print(f"[RAG Server] Modelos detectados en Ollama: {models}", file=sys.stderr)
            priority = ["mistral-nemo", "llama3.1", "llama3.2", "mistral:latest", "mistral"]
            for pref in priority:
                for m in models:
                    if pref.split(':')[0] in m:
                        supports = test_ollama_tools_support(m)
                        return m, supports
            return models[0], test_ollama_tools_support(models[0]) if models else ("mistral:latest", False)
    except Exception as e:
        print(f"[RAG Server] No se pudo conectar a Ollama: {e}", file=sys.stderr)
        return "mistral:latest", False


print("[RAG Server] Cargando base de datos Chroma y embeddings...", file=sys.stderr)
try:
    db = Chroma(
        persist_directory=str(base_dir / "chroma"),
        embedding_function=OllamaEmbeddings(model="nomic-embed-text")
    )
    print("[RAG Server] Base de datos Chroma cargada exitosamente.", file=sys.stderr)
except Exception as e:
    print(f"[RAG Server] Error al cargar Chroma: {e}", file=sys.stderr)
    db = None

llm_model, supports_tools = get_installed_llm_model()
print(f"[RAG Server] Usando modelo LLM: {llm_model} (tools_support={supports_tools})", file=sys.stderr)


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 5: ORQUESTADOR PRINCIPAL (CON SYSTEM PROMPT CORREGIDO)
# ─────────────────────────────────────────────────────────────────────────────

def generate_response_with_tools(question: str, client_id: int = None) -> str:
    """Orquestador principal con Function Calling en 4 pasos."""
    global _current_client_id
    _current_client_id = client_id
    
    # PASO 1: Búsqueda RAG
    rag_context = ""
    if db is not None:
        try:
            docs = db.similarity_search(question, k=3)
            rag_context = "\n".join([doc.page_content for doc in docs])
            print(f"[RAG] Contexto RAG recuperado ({len(docs)} fragmentos).", file=sys.stderr)
        except Exception as e:
            print(f"[RAG] Error en búsqueda Chroma: {e}", file=sys.stderr)
    
    auth_status = "autenticado" if client_id else "visitante"
    
    # ✅ SYSTEM PROMPT CORREGIDO - El asistente DEBE ACTUAR, no dar instrucciones
    system_prompt = f"""Eres el asistente virtual de Danhee Cake, una pastelería personalizada premium.

INSTRUCCIONES IMPORTANTES:
1. SIEMPRE responde en español, con tono cálido, amable y profesional.
2. CUANDO el usuario pregunte sobre pasteles, precios, reposteros, disponibilidad o citas, DEBES usar las herramientas disponibles automáticamente.
3. NUNCA le digas al usuario que vaya a una sección específica o que use un botón. TÚ eres quien debe ejecutar la acción.
4. Si el usuario quiere ver pasteles → usa consultar_catalogo_pasteles()
5. Si el usuario quiere ver reposteros → usa consultar_reposteros_disponibles()
6. Si el usuario quiere ver precios → usa obtener_precios_por_categoria()
7. Si el usuario quiere agendar una cita → usa registrar_solicitud_cita()
8. Si el usuario pregunta por disponibilidad → usa verificar_disponibilidad_repostero()
9. Responde de forma natural mostrando los resultados que obtengas de las herramientas.
10. Mantén respuestas concisas: máximo 4-5 frases.

Estado del usuario: {auth_status}
{chr(10) + "Contexto adicional: " + rag_context if rag_context else ""}"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]
    
    # PASO 2: Llamada al LLM con Tools
    print(f"[RAG] Enviando pregunta a Ollama ({llm_model}) con {len(TOOLS_SCHEMA)} herramientas...", file=sys.stderr)
    
    try:
        if supports_tools:
            first_response = ollama_sdk.chat(
                model=llm_model,
                messages=messages,
                tools=TOOLS_SCHEMA
            )
        else:
            return _fallback_with_prompt_engineering(question, rag_context, client_id)
    except Exception as e:
        print(f"[RAG] Error llamando a Ollama SDK: {e}. Usando fallback.", file=sys.stderr)
        return _fallback_with_prompt_engineering(question, rag_context, client_id)
    
    assistant_message = first_response.get("message", {})
    tool_calls = assistant_message.get("tool_calls", [])
    
    # PASO 3 y 4: Ejecutar herramientas y re-invocar
    if tool_calls:
        print(f"[RAG] tool_calls detectados: {len(tool_calls)} herramienta(s).", file=sys.stderr)
        messages.append({"role": "assistant", "content": assistant_message.get("content", ""), "tool_calls": tool_calls})
        
        for call in tool_calls:
            func_name = call.get("function", {}).get("name", "")
            raw_args = call.get("function", {}).get("arguments", {})
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            
            print(f"[RAG] ▶ Ejecutando herramienta: {func_name}({args})", file=sys.stderr)
            
            if func_name in FUNCTIONS_MAP:
                try:
                    tool_result = FUNCTIONS_MAP[func_name](**args)
                    print(f"[RAG] ✔ Resultado obtenido", file=sys.stderr)
                    messages.append({"role": "tool", "content": json.dumps(tool_result, ensure_ascii=False)})
                except Exception as exec_err:
                    tool_result = {"error": f"La herramienta '{func_name}' falló: {str(exec_err)}"}
                    print(f"[RAG] ✘ Error en {func_name}: {exec_err}", file=sys.stderr)
                    messages.append({"role": "tool", "content": json.dumps(tool_result, ensure_ascii=False)})
            else:
                tool_result = {"error": f"Herramienta '{func_name}' no encontrada"}
                messages.append({"role": "tool", "content": json.dumps(tool_result, ensure_ascii=False)})
        
        print("[RAG] Re-invocando LLM con resultado de herramienta(s)...", file=sys.stderr)
        try:
            final_response = ollama_sdk.chat(model=llm_model, messages=messages)
            return final_response.get("message", {}).get("content", "").strip()
        except Exception as e:
            print(f"[RAG] Error en re-invocación LLM: {e}", file=sys.stderr)
            return _fallback_with_prompt_engineering(question, rag_context, client_id)
    else:
        direct_content = assistant_message.get("content", "").strip()
        print("[RAG] Respuesta directa del LLM (sin tool_calls).", file=sys.stderr)
        return direct_content if direct_content else _fallback_with_prompt_engineering(question, rag_context, client_id)


def _fallback_with_prompt_engineering(question: str, context: str, client_id: int = None) -> str:
    """Fallback cuando el modelo no soporta function calling nativo."""
    print("[RAG] Usando fallback con prompt engineering...", file=sys.stderr)
    
    tools_description = """
    Herramientas disponibles (devuelve JSON):
    1. consultar_catalogo_pasteles(categoria)
    2. consultar_reposteros_disponibles()
    3. verificar_disponibilidad_repostero(baker_id, fecha)
    4. obtener_precios_por_categoria(categoria)
    5. registrar_solicitud_cita(client_name, baker_id, fecha, hora, notas)
    6. consultar_categorias()
    7. buscar_pastel_por_nombre(nombre)
    8. obtener_info_repostero(baker_id)
    9. calcular_precio_personalizado(tamanio, relleno, decoracion)
    10. consultar_politicas_pasteleria(tema)
    
    Formato: {"tool": "nombre", "args": {...}} o {"response": "texto"}
    """
    
    system_prompt = f"""Eres el asistente de Danhee Cake. 
{tools_description}
Contexto: {context}
Usuario autenticado: {client_id is not None}

IMPORTANTE: Si el usuario pregunta por información que requiera una herramienta, DEBES usar el formato JSON con "tool". No le digas al usuario que vaya a otra sección."""
    
    try:
        model = ChatOllama(model=llm_model)
        prompt = f"{system_prompt}\n\nPregunta: {question}\n\nResponde con el formato JSON:"
        response = model.invoke(prompt)
        content = response.content.strip()
        
        json_start = content.find('{')
        json_end = content.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            parsed = json.loads(content[json_start:json_end])
            if "tool" in parsed and parsed["tool"] in FUNCTIONS_MAP:
                result = FUNCTIONS_MAP[parsed["tool"]](**parsed.get("args", {}))
                # Formatear resultado de forma amigable
                if "pasteles" in result:
                    pasteles = result["pasteles"][:3]
                    lista = "\n".join([f"  • {p['nombre']} - ${p['precio']}" for p in pasteles])
                    return f"📋 Aquí están los pasteles disponibles:\n{lista}\n\n¿Te gustaría ver más detalles de alguno?"
                elif "reposteros" in result:
                    reposteros = result["reposteros"][:3]
                    lista = "\n".join([f"  • {r['nombre_negocio']} - {r['especialidad']} ★{r['calificacion']}" for r in reposteros])
                    return f"👩‍🍳 Reposteros disponibles:\n{lista}\n\n¿Quieres agendar una cita con alguno?"
                elif "exito" in result and result["exito"]:
                    return result["mensaje"]
                else:
                    return f"Información de Danhee Cake: {json.dumps(result, ensure_ascii=False)[:500]}"
            elif "response" in parsed:
                return parsed["response"]
        return content
    except Exception as e:
        print(f"[RAG] Error en fallback: {e}", file=sys.stderr)
        return "Lo siento, tengo dificultades técnicas. Por favor intenta de nuevo. 🎂"


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 6: SERVIDOR HTTP
# ─────────────────────────────────────────────────────────────────────────────

class RAGRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    
    def do_POST(self):
        if self.path == '/chat':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                
                if not question:
                    self._send_error(400, "El mensaje está vacío")
                    return
                
                print(f"\n[RAG Server] ══ Nueva pregunta: '{question}' ══", file=sys.stderr)
                if client_id:
                    print(f"[RAG Server] ✅ Usuario autenticado (client_id={client_id})", file=sys.stderr)
                else:
                    print(f"[RAG Server] 👤 Usuario no autenticado (visitante)", file=sys.stderr)
                
                response_text = generate_response_with_tools(question, client_id)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                res_data = json.dumps({"response": response_text}, ensure_ascii=False)
                self.wfile.write(res_data.encode('utf-8'))
                print(f"[RAG Server] ✔ Respuesta enviada.", file=sys.stderr)
                
            except Exception as e:
                print(f"[RAG Server] Error procesando solicitud: {e}", file=sys.stderr)
                self._send_error(500, f"Error interno: {str(e)}")
        else:
            self._send_error(404, "Ruta no encontrada")
    
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def _send_error(self, status_code: int, message: str):
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": message}, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            print(f"[RAG Server] Error enviando error response: {e}", file=sys.stderr)


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 7: PUNTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def run_server(port: int = 5005):
    """Inicia el servidor HTTP del microservicio RAG con Function Calling."""
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, RAGRequestHandler)
    print(f"[RAG Server] 🚀 Microservicio RAG listo en http://localhost:{port}", file=sys.stderr)
    print(f"[RAG Server] 📦 {len(TOOLS_SCHEMA)} herramientas disponibles:", file=sys.stderr)
    for tool in TOOLS_SCHEMA:
        print(f"[RAG Server]   • {tool['function']['name']}", file=sys.stderr)
    print(f"[RAG Server] 🤖 Usando modelo: {llm_model} (tools_support={supports_tools})", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[RAG Server] Deteniendo servidor...", file=sys.stderr)
        httpd.server_close()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] != '--server':
        question = sys.argv[1].strip()
        try:
            response_text = generate_response_with_tools(question)
            print(response_text)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        port = 5005
        if len(sys.argv) > 2:
            try:
                port = int(sys.argv[2])
            except ValueError:
                pass
        run_server(port)