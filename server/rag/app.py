import sys
import json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import decimal
from datetime import date, datetime
import unicodedata

def quitar_acentos(texto: str) -> str:
    if not texto: return ""
    return unicodedata.normalize('NFKD', str(texto)).encode('ASCII', 'ignore').decode('utf-8')

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

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

# Módulo de acceso a datos directo a MySQL
from db_config import (
    get_cakes, get_bakers, get_baker_by_id, 
    get_appointments_by_baker_date, insert_appointment, 
    insert_guest_appointment, get_categories, get_user_by_id
)

base_dir = Path(__file__).resolve().parent

# Variable global para almacenar client_id del usuario actual (por turno)
_current_client_id = None
# (Refresco del linter)

# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 1: FUNCIONES LOCALES DE DANHEE CAKE (10 herramientas)
# ─────────────────────────────────────────────────────────────────────────────

def consultar_catalogo_pasteles(categoria: str = "") -> dict:
    """
    Consulta el catálogo de pasteles disponibles en Danhee Cake.
    Puede filtrar por categoría: XV Años, Boda, Baby Shower, Cumpleaños, etc.
    """
    pasteles = get_cakes()
    
    if categoria and categoria.strip():
        categoria_lower = categoria.lower()
        pasteles = [
            p for p in pasteles
            if categoria_lower in str(p.get("category_name", "")).lower()
            or categoria_lower in str(p.get("name", "")).lower()
        ]
    
    if not pasteles:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para la categoría '{categoria}'."}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "calificacion": p.get("rating", 0),
            "categoria": p.get("category_name", "Sin categoría"),
        }
        for p in pasteles[:10]
    ]
    return {"pasteles": resultado, "total": len(resultado)}


def consultar_reposteros_disponibles() -> dict:
    """Lista todos los reposteros verificados de Danhee Cake."""
    reposteros = get_bakers()
    
    resultado = [
        {
            "id": r.get("id"),
            "nombre_negocio": r.get("business_name"),
            "especialidad": r.get("specialty"),
            "calificacion": float(r.get("rating_avg", 0)) if r.get("rating_avg") else 0.0,
            "ubicacion": r.get("location"),
            "verificado": bool(r.get("is_verified")),
        }
        for r in reposteros
    ]
    return {"reposteros": resultado, "total": len(resultado)}


def verificar_disponibilidad_repostero(baker_id: int, fecha: str) -> dict:
    """Verifica si un repostero de Danhee Cake tiene disponibilidad en una fecha específica."""
    citas = get_appointments_by_baker_date(baker_id, fecha)
    
    disponible = len(citas) < 5
    
    return {
        "baker_id": baker_id,
        "fecha": fecha,
        "disponible": disponible,
        "citas_agendadas": len(citas),
        "mensaje": f"El repostero #{baker_id} de Danhee Cake {'sí' if disponible else 'no'} tiene disponibilidad para {fecha}. {'' if disponible else 'Prueba otra fecha.'}"
    }


def obtener_precios_por_categoria(categoria: str) -> dict:
    """Obtiene el rango de precios de los pasteles de Danhee Cake por categoría."""
    todos = get_cakes()
    
    filtrados = [
        p for p in todos
        if categoria.lower() in str(p.get("category_name", "")).lower()
    ]
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para la categoría '{categoria}'."}
    
    precios = [float(p.get("price", 0)) for p in filtrados if p.get("price")]
    if not precios:
        return {"mensaje": f"No hay precios registrados en Danhee Cake para '{categoria}'."}
    
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
    """Registra una solicitud de cita con un repostero de Danhee Cake."""
    global _current_client_id
    
    print(f"[RAG Tools] Registrando cita en Danhee Cake: {client_name}, baker={baker_id}, {fecha} {hora}", file=sys.stderr)
    
    notas_final = f"Cliente: {client_name}. {notas}".strip()
    
    if _current_client_id:
        exito = insert_appointment(_current_client_id, baker_id, fecha, hora, notas_final)
        if exito:
            return {
                "exito": True,
                "mensaje": f"✅ ¡Cita registrada en Danhee Cake! {client_name}, tu cita con el repostero #{baker_id} está agendada para el {fecha} a las {hora}. 🎉"
            }
    else:
        exito = insert_guest_appointment(baker_id, fecha, hora, notas_final)
        if exito:
            return {
                "exito": True,
                "mensaje": f"✅ ¡Solicitud recibida en Danhee Cake! {client_name}, pronto recibirás confirmación para tu cita del {fecha} a las {hora}. 🎂"
            }
    
    return {
        "exito": False,
        "mensaje": f"📋 Hubo un problema al registrar la cita para {client_name} en Danhee Cake. Por favor intenta más tarde."
    }


def consultar_categorias() -> dict:
    """Lista todas las categorías de pasteles disponibles en Danhee Cake."""
    cats = get_categories()
    if not cats:
        return {"categorias": [
            {"nombre": "XV Años", "icono": "👑", "descripcion": "Pasteles elegantes para XV años"},
            {"nombre": "Boda", "icono": "💍", "descripcion": "Pasteles nupciales de lujo"},
            {"nombre": "Baby Shower", "icono": "🍼", "descripcion": "Diseños tiernos para baby shower"},
            {"nombre": "Cumpleaños", "icono": "🎂", "descripcion": "Pasteles personalizados para cumpleaños"},
            {"nombre": "Aniversario", "icono": "💑", "descripcion": "Pasteles románticos para aniversarios"},
            {"nombre": "Graduación", "icono": "🎓", "descripcion": "Celebra tu graduación con estilo"},
        ]}
    return {"categorias": [{"nombre": c.get("name"), "icono": c.get("icon")} for c in cats]}


def buscar_pastel_por_nombre(nombre: str) -> dict:
    """Busca pasteles en el catálogo de Danhee Cake por nombre parcial para obtener su precio y detalles."""
    todos = get_cakes()
    
    nombre_limpio = quitar_acentos(nombre).lower()
    encontrados = [
        p for p in todos
        if nombre_limpio in quitar_acentos(str(p.get("name", ""))).lower()
    ]
    
    if not encontrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake con el nombre '{nombre}'."}
    
    return {
        "encontrados": [
            {
                "id": p.get("id"),
                "nombre": p.get("name"),
                "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
                "mensaje": f"El pastel '{p.get('name')}' tiene un precio exacto de ${float(p.get('price', 0)) if p.get('price') else 0.0} MXN"
            }
            for p in encontrados[:5]
        ],
        "cantidad": len(encontrados)
    }


def obtener_info_repostero(baker_id: int) -> dict:
    """Obtiene información completa de un repostero de Danhee Cake."""
    repostero = get_baker_by_id(baker_id)
    if not repostero:
        return {"error": f"No se encontró el repostero de Danhee Cake con ID {baker_id}."}
    
    return {
        "id": repostero.get("id"),
        "nombre_negocio": repostero.get("business_name"),
        "especialidad": repostero.get("specialty"),
        "bio": repostero.get("bio"),
        "calificacion": float(repostero.get("rating_avg", 0)) if repostero.get("rating_avg") else 0.0,
        "ubicacion": repostero.get("location"),
        "verificado": bool(repostero.get("is_verified")),
    }


def calcular_precio_personalizado(tamanio: str, relleno: str, decoracion: str) -> dict:
    """Calcula el precio estimado de un pastel personalizado en Danhee Cake."""
    precios_base = {"pequeño": 350, "mediano": 550, "grande": 850}
    extra_relleno = {"vainilla": 0, "chocolate": 50, "fresas": 80, "dulce de leche": 70}
    extra_decoracion = {"fondant": 150, "buttercream": 80, "flores": 120, "minimalista": 50}
    
    base = precios_base.get(tamanio.lower(), 550)
    extra_r = extra_relleno.get(relleno.lower(), 60)
    extra_d = extra_decoracion.get(decoracion.lower(), 100)
    
    return {
        "tamanio": tamanio,
        "relleno": relleno,
        "decoracion": decoracion,
        "precio_estimado": base + extra_r + extra_d,
        "moneda": "MXN",
        "nota": "Precio estimado en Danhee Cake. El final puede variar según complejidad."
    }


def consultar_politicas_pasteleria(tema: str) -> dict:
    """Proporciona las políticas oficiales de Danhee Cake."""
    politicas = {
        "entrega": {
            "tema": "Política de Entrega - Danhee Cake",
            "info": "📦 En Danhee Cake: Pedidos estándar requieren 5 días de anticipación. Pasteles de boda o XV Años: mínimo 15 días de anticipación. Entrega a domicilio disponible."
        },
        "pago": {
            "tema": "Métodos de Pago - Danhee Cake",
            "info": "💳 En Danhee Cake aceptamos: Transferencia bancaria, tarjeta de débito/crédito y efectivo. Se requiere anticipo del 50% para confirmar el pedido."
        },
        "cancelacion": {
            "tema": "Política de Cancelación - Danhee Cake",
            "info": "❌ En Danhee Cake: Cancelaciones con más de 7 días: reembolso del 80%. Entre 3-7 días: reembolso del 50%. Menos de 72 horas: sin reembolso."
        },
        "personalizacion": {
            "tema": "Personalización - Danhee Cake",
            "info": "🎨 En Danhee Cake cada pastel es 100% personalizable: puedes elegir sabor, relleno, tamaño, decoración y temática."
        },
        "general": {
            "tema": "Información General - Danhee Cake",
            "info": "🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales."
        }
    }
    tema_key = tema.lower().strip()
    return politicas.get(tema_key, politicas["general"])


def recomendar_pastel(ocasion: str, presupuesto: str = "", estilo: str = "") -> dict:
    """Recomienda pasteles de Danhee Cake según ocasión, presupuesto y estilo."""
    recomendaciones = {
        "boda": "🎂 Para bodas en Danhee Cake recomendamos pasteles elegantes de múltiples niveles. Estilos: vintage o minimalista.",
        "cumpleaños infantil": "🎈 Para cumpleaños infantiles recomendamos colores vivos y temáticas animadas. Estilo infantil.",
        "estilo aesthetic": "✨ Para estilo aesthetic recomendamos pasteles coreanos y minimalistas con colores pastel.",
        "presupuesto bajo": "💰 Para presupuesto ajustado recomendamos diseños sencillos de tamaño pequeño o mediano.",
        "evento formal": "🎩 Para eventos formales recomendamos estilos minimalistas o vintage con decoración elegante.",
        "xv años": "👑 Para XV años recomendamos pasteles elegantes de múltiples niveles con decoración sofisticada.",
        "baby shower": "🍼 Para baby shower recomendamos diseños tiernos y coloridos en tonos pastel.",
        "aniversario": "💑 Para aniversarios recomendamos pasteles románticos de estilo vintage o coreano.",
        "graduacion": "🎓 Para graduación recomendamos pasteles temáticos que celebren el logro académico."
    }
    
    ocasion_lower = ocasion.lower()
    for key, mensaje in recomendaciones.items():
        if key in ocasion_lower:
            return {"recomendacion": mensaje, "plataforma": "Danhee Cake"}
    
    return {"recomendacion": "En Danhee Cake tenemos pasteles para todas las ocasiones. ¿Qué tipo de evento planeas?", "plataforma": "Danhee Cake"}


def consultar_origen_pastel(nombre_pastel: str) -> dict:
    """Obtiene a qué empresa, repostero, categoría y precio pertenece un pastel en Danhee Cake."""
    todos = get_cakes()
    
    nombre_limpio = quitar_acentos(nombre_pastel).lower()
    encontrados = [
        p for p in todos
        if nombre_limpio in quitar_acentos(str(p.get("name", ""))).lower()
    ]
    
    if not encontrados:
        return {"mensaje": f"No encontré ningún pastel llamado '{nombre_pastel}' en Danhee Cake."}
    
    pastel = encontrados[0]
    baker_id = pastel.get("baker_id")
    business_name = pastel.get("business_name")
    if not business_name:
        business_name = "Empresa no especificada"
        
    category_name = pastel.get("category_name")
    if not category_name:
        category_name = "Categoría no especificada"
        
    precio = float(pastel.get("price", 0)) if pastel.get("price") else 0.0

    baker_name = "Repostero no especificado"
    if baker_id:
        repostero_info = get_baker_by_id(baker_id)
        if repostero_info:
            baker_name = repostero_info.get("name", baker_name)
            
    return {
        "pastel": pastel.get("name"),
        "empresa": business_name,
        "repostero": baker_name,
        "categoria": category_name,
        "precio": precio,
        "mensaje": f"El pastel '{pastel.get('name')}' pertenece a la categoría '{category_name}', tiene un precio de ${precio} MXN, y es elaborado por la empresa '{business_name}' del repostero '{baker_name}'."
    }


def extraer_texto_pdf(nombre_archivo: str) -> dict:
    """Extrae y lee el contenido de un archivo PDF ubicado en la carpeta de datos de Danhee Cake."""
    from langchain_community.document_loaders import PyPDFLoader
    
    # Asegurar que busque en la carpeta 'data'
    ruta_pdf = base_dir / "data" / nombre_archivo
    if not ruta_pdf.exists():
        if not nombre_archivo.lower().endswith('.pdf'):
            ruta_pdf = base_dir / "data" / f"{nombre_archivo}.pdf"
            
    if not ruta_pdf.exists():
        return {"mensaje": f"No se encontró el PDF '{nombre_archivo}' en la carpeta de datos."}
        
    try:
        loader = PyPDFLoader(str(ruta_pdf))
        docs = loader.load()
        texto = "\n".join([doc.page_content for doc in docs])
        if len(texto) > 3000:
            texto = texto[:3000] + "\n... [Contenido truncado]"
            
        return {
            "archivo": ruta_pdf.name,
            "paginas": len(docs),
            "contenido": texto
        }
    except Exception as e:
        return {"error": f"Error al leer el PDF: {e}"}



def buscar_pasteles_por_rango_precio(precio: float, condicion: str) -> dict:
    """
    Busca pasteles que tengan un precio menor o mayor al indicado.
    condicion debe ser 'menor' o 'mayor'.
    """
    todos = get_cakes()
    
    try:
        precio_limite = float(precio)
    except ValueError:
        return {"mensaje": "El precio debe ser un número válido."}
        
    condicion = condicion.lower().strip()
    
    if condicion == "menor":
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) < precio_limite]
        mensaje_condicion = f"menor a ${precio_limite}"
    elif condicion == "mayor":
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) > precio_limite]
        mensaje_condicion = f"mayor a ${precio_limite}"
    else:
        return {"mensaje": "La condición debe ser 'menor' o 'mayor'."}
        
    if not filtrados:
        return {"mensaje": f"No encontré pasteles con un precio {mensaje_condicion} en Danhee Cake."}
        
    filtrados.sort(key=lambda x: float(x.get("price")), reverse=(condicion=="mayor"))
    
    return {
        "condicion": condicion,
        "precio_limite": precio_limite,
        "encontrados": [
            {
                "id": p.get("id"),
                "nombre": p.get("name"),
                "precio": float(p.get("price")),
                "ocasion": p.get("category_name", "Sin categoría especificada"),
                "mensaje": f"Pastel '{p.get('name')}' ideal para {p.get('category_name', 'cualquier ocasión')}, cuesta ${float(p.get('price'))} MXN."
            }
            for p in filtrados[:10]
        ],
        "cantidad": len(filtrados)
    }

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
    "recomendar_pastel": recomendar_pastel,
    "consultar_origen_pastel": consultar_origen_pastel,
    "extraer_texto_pdf": extraer_texto_pdf,
    "buscar_pasteles_por_rango_precio": buscar_pasteles_por_rango_precio,
}


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 3: ESQUEMAS JSON DE HERRAMIENTAS PARA OLLAMA
# ─────────────────────────────────────────────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "consultar_catalogo_pasteles",
            "description": "Consulta el catálogo de pasteles disponibles en Danhee Cake. Puede filtrar por categoría.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {"type": "string", "description": "Categoría a filtrar: Boda, XV Años, Cumpleaños, etc."}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_reposteros_disponibles",
            "description": "Lista todos los reposteros verificados de Danhee Cake con especialidad y calificación.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "verificar_disponibilidad_repostero",
            "description": "Verifica si un repostero de Danhee Cake tiene disponibilidad en una fecha específica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {"type": "integer", "description": "ID del repostero"},
                    "fecha": {"type": "string", "description": "Fecha en formato YYYY-MM-DD"}
                },
                "required": ["baker_id", "fecha"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_precios_por_categoria",
            "description": "Obtiene el rango de precios de los pasteles de Danhee Cake por categoría.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {"type": "string", "description": "Nombre de la categoría"}
                },
                "required": ["categoria"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "registrar_solicitud_cita",
            "description": "Registra una cita con un repostero de Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {"type": "string", "description": "Nombre completo del cliente"},
                    "baker_id": {"type": "integer", "description": "ID del repostero"},
                    "fecha": {"type": "string", "description": "Fecha YYYY-MM-DD"},
                    "hora": {"type": "string", "description": "Hora HH:MM"},
                    "notas": {"type": "string", "description": "Notas adicionales"}
                },
                "required": ["client_name", "baker_id", "fecha", "hora"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_categorias",
            "description": "Lista todas las categorías de pasteles disponibles en Danhee Cake.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_pastel_por_nombre",
            "description": "Busca pasteles en Danhee Cake por nombre parcial. Útil para consultar el precio exacto y real de un pastel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre": {"type": "string", "description": "Nombre del pastel a buscar"}
                },
                "required": ["nombre"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_info_repostero",
            "description": "Obtiene información detallada de un repostero de Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {"type": "integer", "description": "ID del repostero"}
                },
                "required": ["baker_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calcular_precio_personalizado",
            "description": "Calcula el precio estimado de un pastel personalizado en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tamanio": {"type": "string", "description": "pequeño/mediano/grande"},
                    "relleno": {"type": "string", "description": "vainilla/chocolate/fresas/dulce de leche"},
                    "decoracion": {"type": "string", "description": "fondant/buttercream/flores/minimalista"}
                },
                "required": ["tamanio", "relleno", "decoracion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_politicas_pasteleria",
            "description": "Proporciona las políticas de Danhee Cake (entregas, pagos, cancelaciones).",
            "parameters": {
                "type": "object",
                "properties": {
                    "tema": {"type": "string", "description": "entrega/pago/cancelacion/personalizacion/general"}
                },
                "required": ["tema"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recomendar_pastel",
            "description": "Recomienda pasteles de Danhee Cake según ocasión, presupuesto o estilo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ocasion": {"type": "string", "description": "boda, cumpleaños infantil, xv años, baby shower, etc."},
                    "presupuesto": {"type": "string", "description": "bajo, medio, alto (opcional)"},
                    "estilo": {"type": "string", "description": "vintage, minimalista, coreano, infantil (opcional)"}
                },
                "required": ["ocasion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_origen_pastel",
            "description": "Obtiene a qué empresa, repostero, categoría y precio exacto pertenece un pastel específico en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_pastel": {"type": "string", "description": "Nombre parcial o completo del pastel"}
                },
                "required": ["nombre_pastel"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "extraer_texto_pdf",
            "description": "Extrae y lee el contenido de un archivo PDF desde la carpeta de datos de Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_archivo": {"type": "string", "description": "Nombre del archivo PDF a leer"}
                },
                "required": ["nombre_archivo"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_pasteles_por_rango_precio",
            "description": "Busca pasteles que tengan un precio menor o mayor a una cantidad indicada. Retorna los pasteles, su precio y su ocasión (categoría).",
            "parameters": {
                "type": "object",
                "properties": {
                    "precio": {"type": "number", "description": "El precio límite para buscar"},
                    "condicion": {"type": "string", "description": "Debe ser 'menor' o 'mayor'"}
                },
                "required": ["precio", "condicion"]
            }
        }
    }
]


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 4: INICIALIZACIÓN
# ─────────────────────────────────────────────────────────────────────────────

# Información completa de Danhee Cake para el system prompt
DANHEE_INFO = """
DANHEE CAKE - INFORMACIÓN OFICIAL:

Danhee Cake es una plataforma web especializada en repostería personalizada.
La plataforma conecta clientes con reposteros profesionales.

SERVICIOS PARA CLIENTES:
• Explorar catálogos de pasteles
• Buscar diseños por categoría
• Visualizar perfiles de reposteros
• Reservar citas con reposteros
• Solicitar pasteles personalizados

SERVICIOS PARA REPOSTEROS:
• Administrar su perfil profesional
• Subir imágenes de pasteles
• Gestionar citas con clientes
• Mostrar especialidades y portafolio

CARACTERÍSTICAS DE LA PLATAFORMA:
• Sistema de autenticación de usuarios
• Exploración de pasteles por categorías
• Perfiles detallados de reposteros
• Sistema de citas en línea
• Panel administrativo

ESTILOS DE PASTELES DISPONIBLES:
• Vintage: bordes decorativos, colores suaves, estilo retro
• Minimalista: diseño limpio, líneas simples, elegancia
• Coreano: colores pastel, diseño minimalista, decoración sencilla
• Infantil: colores intensos, personajes animados, decoraciones llamativas
• Boda: elegantes, múltiples niveles, decoración sofisticada
• Temático: personalizados según ocasión especial

TAMAÑOS DE PASTELES:
• Pequeño: 6 a 8 personas
• Mediano: 10 a 15 personas
• Grande: 20 a 30 personas
• Múltiples niveles: 40 personas o más

RECOMENDACIONES POR OCASIÓN:
• Boda: pasteles elegantes de múltiples niveles
• Cumpleaños infantil: colores vivos y temáticas animadas
• Estilo aesthetic: pasteles coreanos y minimalistas
• Presupuesto bajo: diseños sencillos de tamaño pequeño/mediano
• Evento formal: estilos minimalistas o vintage

POLÍTICAS IMPORTANTES:
• Pedidos estándar: 5 días de anticipación
• Pasteles de boda/XV: 15 días de anticipación
• Anticipo del 50% para confirmar pedido
• Cancelación +7 días: reembolso 80%
• Cancelación 3-7 días: reembolso 50%
• Cancelación -72 horas: sin reembolso

¡SOLO RESPONDE SOBRE DANHEE CAKE! NO HABLES DE OTRAS COSAS.
"""


def get_tools_model() -> str:
    """Detecta el mejor modelo con soporte de tools en Ollama."""
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [m['name'] for m in data.get('models', [])]
            print(f"[RAG Server] Modelos detectados: {models}", file=sys.stderr)
            
            priority = ["llama3.1", "llama3.2", "mistral-nemo", "mistral:latest", "mistral"]
            for pref in priority:
                for m in models:
                    if pref in m or pref.split(':')[0] in m:
                        print(f"[RAG Server] ✅ Usando modelo: {m}", file=sys.stderr)
                        return m
            return models[0] if models else "llama3.1"
    except Exception as e:
        print(f"[RAG Server] No se pudo conectar a Ollama: {e}", file=sys.stderr)
    return "llama3.1"


print("[RAG Server] Cargando Chroma DB...", file=sys.stderr)
try:
    db = Chroma(
        persist_directory=str(base_dir / "chroma"),
        embedding_function=OllamaEmbeddings(model="nomic-embed-text")
    )
    print("[RAG Server] Chroma DB cargada.", file=sys.stderr)
except Exception as e:
    print(f"[RAG Server] Error cargando Chroma: {e}", file=sys.stderr)
    db = None

llm_model = get_tools_model()
print(f"[RAG Server] 🤖 Usando modelo con soporte de tools: {llm_model}", file=sys.stderr)


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 5: ORQUESTADOR CON FUNCTION CALLING (4 PASOS)
# ─────────────────────────────────────────────────────────────────────────────

def generate_response_with_tools(question: str, client_id: int = None) -> str:
    """
    Orquestador con Function Calling nativo de Ollama para Danhee Cake.
    
    PASO 1: Búsqueda RAG en Chroma
    PASO 2: Llamada a Ollama con tools[]
    PASO 3: Ejecutar función local si hay tool_calls
    PASO 4: Re-invocar LLM con resultado
    """
    global _current_client_id
    _current_client_id = client_id
    
    # ── PASO 1: Búsqueda RAG ────────────────────────────────────────────────
    rag_context = ""
    if db is not None:
        try:
            docs = db.similarity_search(question, k=3)
            rag_context = "\n".join([doc.page_content for doc in docs])
            print(f"[RAG] Contexto recuperado ({len(docs)} fragmentos)", file=sys.stderr)
        except Exception as e:
            print(f"[RAG] Error en búsqueda: {e}", file=sys.stderr)
    
    # Identificar al usuario autenticado usando DB para que Ollama sepa su nombre y rol
    identidad_usuario = "visitante"
    if client_id:
        user_info = get_user_by_id(client_id)
        if user_info:
            identidad_usuario = f"autenticado (Nombre: {user_info.get('name')}, Rol: {user_info.get('role')})"
        else:
            identidad_usuario = "autenticado"

    # System prompt ESTRICTAMENTE para Danhee Cake
    system_prompt = f"""ERES EL ASISTENTE EXCLUSIVO DE DANHEE CAKE.

{DANHEE_INFO}

REGLAS OBLIGATORIAS:
1. SOLO hablas sobre Danhee Cake y sus servicios.
2. NUNCA menciones Danganronpa, anime, manga, Hajime Hinata o cualquier cosa externa.
3. Si el usuario pregunta algo NO relacionado con Danhee Cake, responde: "Lo siento, solo puedo ayudarte con temas relacionados a Danhee Cake, nuestra plataforma de repostería personalizada."
4. SIEMPRE usa las herramientas disponibles para responder.
5. Responde en español, cálido y profesional. Si el usuario está autenticado, llámalo por su nombre.

Usuario: {identidad_usuario}
{chr(10) + "Contexto: " + rag_context if rag_context else ""}"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]
    
    # ── PASO 2: Llamada al LLM con Tools ─────────────────────────────────────
    print(f"[RAG] Llamando a Ollama ({llm_model}) con {len(TOOLS_SCHEMA)} herramientas...", file=sys.stderr)
    
    try:
        response = ollama_sdk.chat(
            model=llm_model,
            messages=messages,
            tools=TOOLS_SCHEMA
        )
    except Exception as e:
        print(f"[RAG] Error en Ollama: {e}", file=sys.stderr)
        return "Lo siento, tengo problemas técnicos en Danhee Cake. Por favor intenta de nuevo. 🎂"
    
    assistant_message = response.get("message", {})
    tool_calls = assistant_message.get("tool_calls", [])
    
    # ── PASO 3: Si hay tool_calls, ejecutar ──────────────────────────────────
    if tool_calls:
        print(f"[RAG] 🔧 Ejecutando {len(tool_calls)} herramienta(s) de Danhee Cake...", file=sys.stderr)
        
        messages.append({
            "role": "assistant",
            "content": assistant_message.get("content", ""),
            "tool_calls": tool_calls
        })
        
        for tool_call in tool_calls:
            func_name = tool_call.get("function", {}).get("name", "")
            raw_args = tool_call.get("function", {}).get("arguments", {})
            
            if isinstance(raw_args, str):
                try:
                    args = json.loads(raw_args)
                except json.JSONDecodeError:
                    args = {}
            else:
                args = raw_args
            
            print(f"[RAG]   ▶ {func_name}({args})", file=sys.stderr)
            
            if func_name in FUNCTIONS_MAP:
                try:
                    result = FUNCTIONS_MAP[func_name](**args)
                    print(f"[RAG]   ✅ Resultado obtenido", file=sys.stderr)
                except Exception as e:
                    result = {"error": f"Error en Danhee Cake: {str(e)}"}
                    print(f"[RAG]   ❌ Error: {e}", file=sys.stderr)
            else:
                result = {"error": f"Herramienta '{func_name}' no encontrada en Danhee Cake"}
                print(f"[RAG]   ❌ Herramienta no encontrada", file=sys.stderr)
            
            messages.append({
                "role": "tool",
                "content": json.dumps(result, ensure_ascii=False, default=json_serial)
            })
        
        # ── PASO 4: Re-invocar LLM con resultados ─────────────────────────────
        print(f"[RAG] Re-invocando LLM con resultados...", file=sys.stderr)
        try:
            final_response = ollama_sdk.chat(
                model=llm_model,
                messages=messages
            )
            final_content = final_response.get("message", {}).get("content", "").strip()
            
            if final_content:
                # Verificar que no hable de cosas externas
                forbidden = ["danganronpa", "hajime", "anime", "manga", "japones"]
                if any(word in final_content.lower() for word in forbidden):
                    return "🎂 Danhee Cake es nuestra plataforma de repostería personalizada. ¿En qué puedo ayudarte con tus pasteles?"
                return final_content
            else:
                last_tool_result = json.loads(messages[-1]["content"])
                if "pasteles" in last_tool_result:
                    pasteles = last_tool_result["pasteles"][:5]
                    lista = "\n".join([f"• **{p['nombre']}** - ${p['precio']} ★{p['calificacion']}" for p in pasteles])
                    return f"🍰 Estos son los pasteles disponibles en Danhee Cake:\n{lista}"
                elif "reposteros" in last_tool_result:
                    reposteros = last_tool_result["reposteros"][:5]
                    lista = "\n".join([f"• **{r['nombre_negocio']}** - {r['especialidad']} ★{r['calificacion']}" for r in reposteros])
                    return f"👩‍🍳 Estos son los reposteros de Danhee Cake:\n{lista}"
                elif "mensaje" in last_tool_result:
                    return last_tool_result["mensaje"]
                elif "recomendacion" in last_tool_result:
                    return last_tool_result["recomendacion"]
                else:
                    return f"📋 Danhee Cake: {json.dumps(last_tool_result, ensure_ascii=False, default=json_serial)[:500]}"
                    
        except Exception as e:
            print(f"[RAG] Error en re-invocación: {e}", file=sys.stderr)
            return "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
    
    # ── Sin tool_calls: respuesta directa ─────────────────────────────────────
    else:
        direct_content = assistant_message.get("content", "").strip()
        print(f"[RAG] Respuesta directa del LLM", file=sys.stderr)
        
        # Verificar que no hable de cosas externas
        forbidden = ["danganronpa", "hajime", "anime", "manga", "japones"]
        if direct_content and any(word in direct_content.lower() for word in forbidden):
            return "🎂 ¡Hola! Soy el asistente de Danhee Cake, tu plataforma de repostería personalizada. ¿En qué puedo ayudarte hoy?"
        
        if direct_content:
            return direct_content
        else:
            return "🎂 ¡Bienvenido a Danhee Cake! Soy tu asistente virtual. ¿Te gustaría explorar nuestros pasteles, conocer a nuestros reposteros o agendar una cita?"


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
                    self._send_error(400, "Mensaje vacío")
                    return
                
                print(f"\n[RAG Server] ══ Pregunta: '{question}' ══", file=sys.stderr)
                if client_id:
                    print(f"[RAG Server] ✅ Usuario autenticado ID: {client_id}", file=sys.stderr)
                else:
                    print(f"[RAG Server] 👤 Usuario visitante", file=sys.stderr)
                
                response_text = generate_response_with_tools(question, client_id)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"response": response_text}, ensure_ascii=False).encode('utf-8'))
                print(f"[RAG Server] ✔ Respuesta enviada", file=sys.stderr)
                
            except Exception as e:
                print(f"[RAG Server] Error: {e}", file=sys.stderr)
                self._send_error(500, str(e))
        else:
            self._send_error(404, "Not found")
    
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def _send_error(self, code, msg):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode())


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 7: PUNTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def run_server(port=5005):
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, RAGRequestHandler)
    print(f"\n[RAG Server] 🚀 Servidor listo en http://localhost:{port}", file=sys.stderr)
    print(f"[RAG Server] 🎂 Asistente EXCLUSIVO de Danhee Cake", file=sys.stderr)
    print(f"[RAG Server] 🔧 Function Calling NATIVO con Ollama", file=sys.stderr)
    print(f"[RAG Server] 📦 {len(TOOLS_SCHEMA)} herramientas disponibles:", file=sys.stderr)
    for tool in TOOLS_SCHEMA:
        print(f"  • {tool['function']['name']}", file=sys.stderr)
    print("", file=sys.stderr)
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()