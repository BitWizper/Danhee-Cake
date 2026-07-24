import sys
import json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import decimal
from datetime import date, datetime, timedelta
import unicodedata
import threading
import os
import time

def quitar_acentos(texto: str) -> str:
    if not texto: return ""
    return unicodedata.normalize('NFKD', str(texto)).encode('ASCII', 'ignore').decode('utf-8')

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, timedelta):
        return str(obj)
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
    insert_guest_appointment, get_categories, get_user_by_id,
    get_or_create_chat_session, get_chat_history, add_chat_message,
    get_last_conversation_by_client,      # <-- NUEVA
    get_chat_messages,                    # <-- NUEVA
    add_observability_log,
    get_baker_profile_by_user_id, get_baker_cakes,
    add_baker_cake, update_baker_cake, delete_baker_cake,
    get_client_appointments, get_baker_appointments, get_client_designs
)

base_dir = Path(__file__).resolve().parent

# Thread-local storage para almacenar client_id por hilo de petición
# Evita que peticiones concurrentes sobreescriban el client_id entre sí
_thread_local = threading.local()

def _get_current_client_id():
    return getattr(_thread_local, 'client_id', None)

def _set_current_client_id(value):
    _thread_local.client_id = value

# Variable para almacenar el último resultado de búsqueda
_last_search_result = {}
# Cache para contenido de PDFs
_pdf_cache = {}
# Contexto adicional: última empresa o pasteles mencionados
_last_context = {}

# Cache simple en memoria para respuestas rápidas repetidas
_RESPONSE_CACHE = {}
_RESPONSE_CACHE_TTL_SECONDS = 60


def _normalize_question(question: str) -> str:
    return " ".join((question or "").strip().lower().split())


def _get_cached_response(question: str, role: str, conversation_id: str | None = None) -> str | None:
    if conversation_id or role == 'repostero':
        return None
    key = f"{role}:{_normalize_question(question)}"
    entry = _RESPONSE_CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < _RESPONSE_CACHE_TTL_SECONDS:
        return entry["value"]
    return None


def _set_cached_response(question: str, role: str, response: str, conversation_id: str | None = None) -> None:
    if conversation_id or role == 'repostero':
        return
    key = f"{role}:{_normalize_question(question)}"
    _RESPONSE_CACHE[key] = {"ts": time.time(), "value": response}


def _should_skip_rag(question: str) -> bool:
    q = _normalize_question(question)
    if not q:
        return True

    greetings = ["hola", "buenos dias", "buenas tardes", "buenas noches", "gracias", "adios", "bye", "hola!", "qué tal", "como estas"]
    if q in greetings or q.startswith(tuple(greetings)):
        return True

    keywords = ["pastel", "cake", "cita", "repostero", "precio", "categoria", "disponibilidad", "pedido", "comprar", "buscar", "catalogo", "catálogo", "ayuda", "información", "pregunta"]
    return not any(keyword in q for keyword in keywords)


def _should_use_tools(question: str, role: str = "cliente") -> bool:
    if role == "repostero":
        return True
    return not _should_skip_rag(question)


def _get_ollama_options() -> dict:
    return {
        "num_predict": 180,
        "num_ctx": 1024,
        "temperature": 0.5,
        "top_p": 0.95,
        "repeat_penalty": 1.1,
    }

# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 1: FUNCIONES LOCALES DE DANHEE CAKE
# ─────────────────────────────────────────────────────────────────────────────

def consultar_catalogo_pasteles(categoria: str = "", contexto_anterior: str = "") -> dict:
    """
    Consulta el catálogo de pasteles disponibles en Danhee Cake.
    Puede filtrar por categoría: XV Años, Boda, Baby Shower, Cumpleaños, etc.
    """
    global _last_search_result, _last_context
    pasteles = get_cakes()
    print(f"[DEBUG] Total pasteles en BD: {len(pasteles)}", file=sys.stderr)
    
    if categoria and categoria.strip():
        categoria_lower = categoria.lower()
        categoria_normalizada = quitar_acentos(categoria_lower)
        
        pasteles = [
            p for p in pasteles
            if categoria_normalizada in quitar_acentos(str(p.get("category_name", "")).lower())
            or categoria_lower in str(p.get("name", "")).lower()
        ]
        print(f"[DEBUG] Pasteles filtrados por '{categoria}': {len(pasteles)}", file=sys.stderr)
    elif contexto_anterior:
        contexto_normalizado = quitar_acentos(contexto_anterior.lower())
        pasteles = [
            p for p in pasteles
            if contexto_normalizado in quitar_acentos(str(p.get("category_name", "")).lower())
            or contexto_normalizado in quitar_acentos(str(p.get("name", "")).lower())
        ]
        print(f"[DEBUG] Pasteles filtrados por contexto '{contexto_anterior}': {len(pasteles)}", file=sys.stderr)
    
    if not pasteles:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para la categoría '{categoria if categoria else contexto_anterior}'."}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "calificacion": p.get("rating", 0),
            "categoria": p.get("category_name", "Sin categoría"),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
        }
        for p in pasteles[:20]
    ]
    
    _last_search_result = {"pasteles": resultado, "categoria": categoria if categoria else contexto_anterior}
    _last_context["ultima_categoria"] = _last_search_result["categoria"]
    
    return {"pasteles": resultado, "total": len(resultado), "categoria_filtro": categoria if categoria else contexto_anterior if contexto_anterior else "todos"}


def consultar_todos_los_pasteles(contexto_anterior: str = "") -> dict:
    """Muestra el catálogo completo de todos los pasteles disponibles en Danhee Cake."""
    pasteles = get_cakes()
    
    if not pasteles:
        return {"mensaje": "No hay pasteles registrados en Danhee Cake."}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "calificacion": p.get("rating", 0),
            "categoria": p.get("category_name", "Sin categoría"),
            "descripcion": p.get("description", ""),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
        }
        for p in pasteles
    ]
    return {"pasteles": resultado, "total": len(resultado), "mensaje": f"🍰 Catálogo completo de Danhee Cake: {len(resultado)} pasteles disponibles."}


def consultar_reposteros_disponibles(contexto_anterior: str = "") -> dict:
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


def obtener_precios_por_categoria(categoria: str = "", contexto_anterior: str = "") -> dict:
    """Obtiene el rango de precios de los pasteles de Danhee Cake por categoría."""
    todos = get_cakes()
    
    # Usar contexto si no hay categoría
    categoria_buscar = categoria if categoria else contexto_anterior
    
    if not categoria_buscar:
        return {"mensaje": "Por favor especifica una categoría para consultar precios."}
    
    filtrados = [
        p for p in todos
        if categoria_buscar.lower() in str(p.get("category_name", "")).lower()
        or categoria_buscar.lower() in str(p.get("name", "")).lower()
    ]
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para '{categoria_buscar}'. Los pasteles disponibles son: " + ", ".join([p.get("name") for p in todos[:5]])}
    
    precios = [float(p.get("price", 0)) for p in filtrados if p.get("price")]
    if not precios:
        return {"mensaje": f"No hay precios registrados en Danhee Cake para '{categoria_buscar}'."}
    
    # Listar pasteles con sus precios
    lista_pasteles = "\n".join([f"• {p.get('name')} - ${float(p.get('price', 0))} MXN" for p in filtrados[:10]])
    
    return {
        "categoria": categoria_buscar,
        "precio_min": min(precios),
        "precio_max": max(precios),
        "precio_promedio": round(sum(precios) / len(precios), 2),
        "cantidad_pasteles": len(filtrados),
        "pasteles": [{"nombre": p.get("name"), "precio": float(p.get("price", 0))} for p in filtrados[:10]],
        "mensaje": f"🍰 Pasteles en la categoría '{categoria_buscar}':\n{lista_pasteles}\n\n💰 Rango de precios: ${min(precios)} - ${max(precios)} MXN"
    }


def registrar_solicitud_cita(
    client_name: str,
    baker_id: int,
    fecha: str,
    hora: str,
    notas: str = ""
) -> dict:
    """Registra una solicitud de cita con un repostero de Danhee Cake."""
    
    notas_final = f"Cliente: {client_name}. {notas}".strip()
    
    client_id = _get_current_client_id()
    if client_id:
        exito = insert_appointment(client_id, baker_id, fecha, hora, notas_final)
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


def consultar_categorias(contexto_anterior: str = "") -> dict:
    """Lista todas las categorías de pasteles disponibles en Danhee Cake."""
    cats = get_categories()
    if not cats:
        categorias_info = [
            {"nombre": "XV Años", "icono": "👑", "descripcion": "Pasteles elegantes para XV años"},
            {"nombre": "Boda", "icono": "💍", "descripcion": "Pasteles nupciales de lujo"},
            {"nombre": "Baby Shower", "icono": "🍼", "descripcion": "Diseños tiernos para baby shower"},
            {"nombre": "Cumpleaños", "icono": "🎂", "descripcion": "Pasteles personalizados para cumpleaños"},
            {"nombre": "Aniversario", "icono": "💑", "descripcion": "Pasteles románticos para aniversarios"},
            {"nombre": "Graduación", "icono": "🎓", "descripcion": "Celebra tu graduación con estilo"},
        ]
        
        if contexto_anterior:
            contexto_norm = quitar_acentos(contexto_anterior.lower())
            categorias_filtradas = [
                c for c in categorias_info 
                if contexto_norm in quitar_acentos(c["nombre"].lower())
            ]
            if categorias_filtradas:
                return {"categorias": categorias_filtradas}
        
        return {"categorias": categorias_info}
    
    return {"categorias": [{"nombre": c.get("name"), "icono": c.get("icon")} for c in cats]}


def buscar_pastel_por_nombre(nombre: str, contexto_anterior: str = "") -> dict:
    """
    Busca pasteles en el catálogo de Danhee Cake por nombre parcial.
    Retorna lista completa con nombre, empresa, categoría, precio y calificación.
    """
    global _last_context
    todos = get_cakes()
    
    # Normalizar el nombre de búsqueda
    nombre_limpio = quitar_acentos(nombre.lower())
    encontrados = []
    
    # Buscar en todos los pasteles
    for p in todos:
        nombre_pastel = quitar_acentos(str(p.get("name", "")).lower())
        if nombre_limpio in nombre_pastel:
            encontrados.append(p)
    
    # Si no hay resultados y hay contexto anterior, buscar también en el contexto
    if not encontrados and contexto_anterior:
        contexto_limpio = quitar_acentos(contexto_anterior.lower())
        for p in todos:
            nombre_pastel = quitar_acentos(str(p.get("name", "")).lower())
            if contexto_limpio in nombre_pastel and nombre_limpio in nombre_pastel:
                encontrados.append(p)
    
    if not encontrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake con el nombre que contiene '{nombre}'."}
    
    # Construir resultado detallado
    resultado = []
    for p in encontrados[:10]:
        baker_id = p.get("baker_id")
        business_name = p.get("business_name", "Danhee Cake")
        categoria = p.get("category_name", "Sin categoría")
        precio = float(p.get("price", 0)) if p.get("price") else 0.0
        rating = p.get("rating", 0)
        
        resultado.append({
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": precio,
            "categoria": categoria,
            "empresa": business_name,
            "calificacion": rating,
        })
    
    # Guardar en contexto la lista de pasteles encontrados
    _last_context["ultimos_pasteles"] = resultado
    _last_context["ultima_busqueda_nombre"] = nombre
    
    # Crear mensaje legible
    lista = "\n".join([
        f"• **{r['nombre']}** - ${r['precio']:.2f} MXN\n  🏢 Empresa: {r['empresa']}\n  📂 Categoría: {r['categoria']}\n  ⭐ Calificación: {r['calificacion']}"
        for r in resultado
    ])
    
    return {
        "encontrados": resultado,
        "cantidad": len(resultado),
        "mensaje": f"🍰 Encontré {len(resultado)} pasteles que coinciden con '{nombre}':\n\n{lista}"
    }


def obtener_info_repostero(baker_id: int) -> dict:
    """Obtiene información completa de un repostero de Danhee Cake."""
    repostero = get_baker_by_id(baker_id)
    if not repostero:
        return {"error": f"No se encontró el repostero de Danhee Cake con ID {baker_id}."}
    
    todos_pasteles = get_cakes()
    pasteles_repostero = [
        {
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "categoria": p.get("category_name", "Sin categoría")
        }
        for p in todos_pasteles
        if p.get("baker_id") == baker_id
    ]
    
    return {
        "id": repostero.get("id"),
        "nombre_negocio": repostero.get("business_name"),
        "especialidad": repostero.get("specialty"),
        "bio": repostero.get("bio"),
        "calificacion": float(repostero.get("rating_avg", 0)) if repostero.get("rating_avg") else 0.0,
        "ubicacion": repostero.get("location"),
        "verificado": bool(repostero.get("is_verified")),
        "pasteles": pasteles_repostero,
        "total_pasteles": len(pasteles_repostero)
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
    # Si el tema es "danhee", leer el PDF danhee_knowledge_base.pdf
    tema_key = tema.lower().strip()
    if tema_key == "danhee":
        resultado_pdf = extraer_texto_pdf("danhee_knowledge_base.pdf")
        if "mensaje" in resultado_pdf:
            return {"tema": "Información de Danhee Cake", "info": resultado_pdf["mensaje"]}
        else:
            return {"tema": "Información de Danhee Cake", "info": "🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales. Ofrecemos pasteles personalizados para toda ocasión: XV años, bodas, cumpleaños, baby showers y más. Contamos con reposteros verificados y diseños únicos."}
    
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
    return politicas.get(tema_key, politicas["general"])


def recomendar_pastel(ocasion: str, presupuesto: str = "", estilo: str = "", contexto_anterior: str = "") -> dict:
    """Recomienda pasteles de Danhee Cake según ocasión, presupuesto y estilo."""
    todos_pasteles = get_cakes()
    
    # Si no hay ocasión pero hay contexto, usar el contexto
    ocasion_buscar = ocasion if ocasion else contexto_anterior
    
    if not ocasion_buscar:
        return {"mensaje": "Por favor especifica qué tipo de pastel te gustaría que te recomiende (cumpleaños, boda, etc.)"}
    
    ocasion_lower = ocasion_buscar.lower()
    ocasion_normalizada = quitar_acentos(ocasion_lower)
    
    pasteles_filtrados = [
        p for p in todos_pasteles
        if ocasion_normalizada in quitar_acentos(str(p.get("category_name", "")).lower())
        or ocasion_lower in str(p.get("name", "")).lower()
    ]
    
    if presupuesto and pasteles_filtrados:
        if "bajo" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if float(p.get("price", 0)) < 500]
        elif "medio" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if 500 <= float(p.get("price", 0)) <= 800]
        elif "alto" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if float(p.get("price", 0)) > 800]
    
    if pasteles_filtrados:
        recomendaciones_reales = [
            {
                "nombre": p.get("name"),
                "precio": float(p.get("price", 0)),
                "empresa": p.get("business_name", "Danhee Cake"),
                "repostero": p.get("baker_name", "No especificado"),
                "categoria": p.get("category_name")
            }
            for p in pasteles_filtrados[:5]
        ]
        lista = "\n".join([f"• {r['nombre']} - ${r['precio']} MXN (Empresa: {r['empresa']})" for r in recomendaciones_reales])
        return {
            "recomendacion": f"🎂 Para {ocasion_buscar}, te recomiendo estos pasteles de Danhee Cake:\n{lista}\n\n¿Te gustaría saber más detalles de alguno?",
            "pasteles": recomendaciones_reales,
            "plataforma": "Danhee Cake"
        }
    
    # Si hay pasteles en la base de datos pero no coinciden con la ocasión
    if todos_pasteles:
        pasteles_disponibles = "\n".join([f"• {p.get('name')} - ${p.get('price')} MXN" for p in todos_pasteles[:5]])
        return {
            "recomendacion": f"No encontré pasteles específicos para '{ocasion_buscar}', pero estos son algunos pasteles disponibles en Danhee Cake:\n{pasteles_disponibles}\n\n¿Te gustaría que te muestre más opciones?",
            "plataforma": "Danhee Cake"
        }
    
    return {
        "recomendacion": f"En Danhee Cake tenemos pasteles para todas las ocasiones. Para {ocasion_buscar}, podemos ayudarte a diseñar un pastel personalizado. ¿Te gustaría agendar una cita con uno de nuestros reposteros?",
        "plataforma": "Danhee Cake"
    }


def consultar_origen_pastel(nombre_pastel: str, contexto_anterior: str = "") -> dict:
    """
    Obtiene a qué empresa, repostero, categoría y precio pertenece un pastel en Danhee Cake.
    También permite buscar por nombre de empresa/pastelería.
    """
    todos = get_cakes()
    
    # Si no hay nombre_pastel pero hay contexto, usar el contexto
    nombre_buscar = nombre_pastel if nombre_pastel else contexto_anterior
    
    if not nombre_buscar:
        return {"mensaje": "Por favor especifica el nombre del pastel o la pastelería que quieres consultar."}
    
    nombre_limpio = quitar_acentos(nombre_buscar).lower()
    
    # Buscar por nombre de pastel
    encontrados = [
        p for p in todos
        if nombre_limpio in quitar_acentos(str(p.get("name", ""))).lower()
    ]
    
    # Si no se encontró por nombre de pastel, buscar por nombre de empresa
    if not encontrados:
        encontrados = [
            p for p in todos
            if p.get("business_name") and (
                (nombre_limpio in quitar_acentos(str(p.get("business_name"))).lower()) or 
                (quitar_acentos(str(p.get("business_name"))).lower() in nombre_limpio)
            )
        ]
    
    if not encontrados:
        return {"mensaje": f"No encontré ningún pastel o pastelería llamada '{nombre_buscar}' en Danhee Cake. Los pasteles disponibles son: " + ", ".join([p.get("name") for p in todos[:5]])}
    
    # Si hay múltiples resultados, mostrar todos
    if len(encontrados) > 1:
        resultados = []
        for p in encontrados[:5]:
            baker_id = p.get("baker_id")
            business_name = p.get("business_name", "Empresa no especificada")
            precio = float(p.get("price", 0)) if p.get("price") else 0.0
            
            baker_name = "Repostero no especificado"
            if baker_id:
                repostero_info = get_baker_by_id(baker_id)
                if repostero_info:
                    baker_name = repostero_info.get("name", baker_name)
            
            resultados.append(f"• {p.get('name')} - ${precio} MXN (Empresa: {business_name}, Repostero: {baker_name})")
        
        return {
            "mensaje": f"Encontré varios resultados para '{nombre_buscar}':\n" + "\n".join(resultados),
            "resultados": encontrados[:5]
        }
    
    # Un solo resultado
    pastel = encontrados[0]
    baker_id = pastel.get("baker_id")
    business_name = pastel.get("business_name", "Empresa no especificada")
    category_name = pastel.get("category_name", "Categoría no especificada")
    precio = float(pastel.get("price", 0)) if pastel.get("price") else 0.0

    baker_name = "Repostero no especificado"
    repostero_info = {}
    if baker_id:
        repostero = get_baker_by_id(baker_id)
        if repostero:
            baker_name = repostero.get("name", baker_name)
            repostero_info = {
                "nombre": repostero.get("name"),
                "nombre_negocio": repostero.get("business_name"),
                "especialidad": repostero.get("specialty"),
                "ubicacion": repostero.get("location")
            }
    
    mensaje = f"🍰 El pastel '{pastel.get('name')}':\n"
    mensaje += f"📋 Categoría: {category_name}\n"
    mensaje += f"💰 Precio: ${precio} MXN\n"
    mensaje += f"🏢 Empresa/Pastelería: {business_name}\n"
    mensaje += f"👨‍🍳 Repostero: {baker_name}"
    
    if repostero_info.get("ubicacion"):
        mensaje += f"\n📍 Ubicación: {repostero_info['ubicacion']}"
    if repostero_info.get("especialidad"):
        mensaje += f"\n🎯 Especialidad: {repostero_info['especialidad']}"
    
    return {
        "pastel": pastel.get("name"),
        "empresa": business_name,
        "repostero": baker_name,
        "categoria": category_name,
        "precio": precio,
        "ubicacion": repostero_info.get("ubicacion", "No especificada"),
        "especialidad": repostero_info.get("especialidad", "No especificada"),
        "mensaje": mensaje
    }


def extraer_texto_pdf(nombre_archivo: str) -> dict:
    """Extrae y lee el contenido de un archivo PDF ubicado en la carpeta de datos de Danhee Cake."""
    global _pdf_cache
    
    # Verificar caché
    if nombre_archivo in _pdf_cache:
        return _pdf_cache[nombre_archivo]
    
    from langchain_community.document_loaders import PyPDFLoader
    
    # Buscar en la carpeta 'data'
    ruta_pdf = base_dir / "data" / nombre_archivo
    if not ruta_pdf.exists():
        if not nombre_archivo.lower().endswith('.pdf'):
            ruta_pdf = base_dir / "data" / f"{nombre_archivo}.pdf"
    
    # Si no existe, buscar por nombre parcial
    if not ruta_pdf.exists():
        data_dir = base_dir / "data"
        if data_dir.exists():
            for pdf_file in data_dir.glob("*.pdf"):
                if nombre_archivo.lower() in pdf_file.stem.lower():
                    ruta_pdf = pdf_file
                    break
    
    if not ruta_pdf.exists():
        return {"mensaje": f"No se encontró el PDF '{nombre_archivo}' en la carpeta de datos."}
    
    try:
        loader = PyPDFLoader(str(ruta_pdf))
        docs = loader.load()
        texto_completo = "\n".join([doc.page_content for doc in docs])
        
        # Para FAQ, extraer preguntas y respuestas
        if "faq" in ruta_pdf.stem.lower():
            lineas = texto_completo.split('\n')
            preguntas = []
            respuestas = []
            for i, linea in enumerate(lineas):
                linea_clean = linea.strip()
                if linea_clean.endswith('?') or linea_clean.startswith('¿'):
                    preguntas.append(linea_clean)
                    if i + 1 < len(lineas):
                        respuestas.append(lineas[i+1].strip())
            
            if preguntas:
                faq_texto = "📚 PREGUNTAS FRECUENTES (FAQ):\n\n"
                for q, r in zip(preguntas[:10], respuestas[:10]):
                    faq_texto += f"❓ {q}\n💡 {r}\n\n"
                
                resultado = {
                    "archivo": ruta_pdf.name,
                    "paginas": len(docs),
                    "contenido": texto_completo[:3000],
                    "faq": faq_texto,
                    "mensaje": faq_texto
                }
                _pdf_cache[nombre_archivo] = resultado
                return resultado
        
        # Limitar longitud
        if len(texto_completo) > 3000:
            texto_completo = texto_completo[:3000] + "\n... [Contenido truncado]"
        
        resultado = {
            "archivo": ruta_pdf.name,
            "paginas": len(docs),
            "contenido": texto_completo,
            "mensaje": f"📄 Contenido de '{ruta_pdf.name}':\n\n{texto_completo}"
        }
        _pdf_cache[nombre_archivo] = resultado
        return resultado
        
    except Exception as e:
        return {"error": f"Error al leer el PDF: {e}"}


def buscar_pasteles_por_rango_precio(precio: float, condicion: str, contexto_anterior: str = "") -> dict:
    """
    Busca pasteles que tengan un precio menor o mayor al indicado.
    condicion debe ser 'menor', 'mayor', 'abajo', 'arriba', 'menos', 'mas'
    """
    todos = get_cakes()
    
    try:
        precio_limite = float(precio)
    except (ValueError, TypeError):
        return {"mensaje": "El precio debe ser un número válido."}
        
    condicion = condicion.lower().strip()
    
    # Normalizar condiciones
    if any(c in condicion for c in ["menor", "menos", "abajo", "debajo", "inferior", "<"]):
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) < precio_limite]
        mensaje_condicion = f"menor a ${precio_limite}"
        orden_ascendente = True
    elif any(c in condicion for c in ["mayor", "mas", "arriba", "superior", "encima", ">"]):
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) > precio_limite]
        mensaje_condicion = f"mayor a ${precio_limite}"
        orden_ascendente = False
    else:
        return {"mensaje": "La condición debe ser 'menor' o 'mayor', por ejemplo '<', '>', 'menor a', 'mayor a'."}
        
    if not filtrados:
        return {"mensaje": f"No encontré pasteles con un precio {mensaje_condicion} en Danhee Cake."}
    
    filtrados.sort(key=lambda x: float(x.get("price")), reverse=not orden_ascendente)
    
    pasteles_mostrados = []
    for p in filtrados[:15]:
        precio_actual = float(p.get("price"))
        pasteles_mostrados.append({
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": precio_actual,
            "ocasion": p.get("category_name", "Sin categoría especificada"),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
        })
    
    lista = "\n".join([f"• {p['nombre']} - ${p['precio']} MXN (Empresa: {p['empresa']})" for p in pasteles_mostrados[:10]])
    
    return {
        "condicion": condicion,
        "precio_limite": precio_limite,
        "encontrados": pasteles_mostrados,
        "cantidad": len(filtrados),
        "mensaje": f"Encontré {len(filtrados)} pasteles con precio {mensaje_condicion} en Danhee Cake:\n{lista}"
    }


def consultar_pasteles_por_categoria(categoria: str = "", contexto_anterior: str = "") -> dict:
    """
    Consulta qué pasteles están disponibles para una categoría específica.
    Retorna los pasteles junto con la empresa y repostero que los elabora.
    """
    global _last_search_result, _last_context
    todos = get_cakes()
    print(f"[DEBUG] consultar_pasteles_por_categoria: '{categoria}'", file=sys.stderr)
    print(f"[DEBUG] Total pasteles en BD: {len(todos)}", file=sys.stderr)
    
    categoria_buscar = categoria if categoria else contexto_anterior
    
    if not categoria_buscar:
        return {
            "mensaje": "Por favor especifica qué categoría de pasteles quieres ver (cumpleaños, boda, xv años, etc.)",
            "encontrados": [],
            "cantidad": 0
        }
    
    categoria_normalizada = quitar_acentos(categoria_buscar.lower().strip())
    
    sinonimos = {
        "cumpleaños": ["cumpleaños", "birthday", "feliz cumpleaños", "happy birthday", "cumple"],
        "xv años": ["xv", "quince", "quince años", "xv años", "15 años"],
        "boda": ["boda", "wedding", "matrimonio", "nupcial"],
        "baby shower": ["baby shower", "bebe", "baby", "shower"],
        "aniversario": ["aniversario", "anniversary"],
        "graduacion": ["graduacion", "graduation", "ceremonia"]
    }
    
    busqueda_terminos = [categoria_normalizada]
    for key, terminos in sinonimos.items():
        if categoria_normalizada in key or any(termino in categoria_normalizada for termino in terminos):
            busqueda_terminos.extend(terminos)
            break
    
    filtrados = []
    for p in todos:
        category_name = p.get("category_name", "")
        if category_name:
            category_normalizada = quitar_acentos(category_name.lower())
            for termino in busqueda_terminos:
                if termino in category_normalizada or category_normalizada in termino:
                    filtrados.append(p)
                    break
    
    print(f"[DEBUG] Pasteles filtrados para '{categoria_buscar}': {len(filtrados)}", file=sys.stderr)
    
    if not filtrados:
        return {
            "mensaje": f"No encontré pasteles en Danhee Cake para '{categoria_buscar}'. ¿Te gustaría ver otras categorías?",
            "ocasion": categoria_buscar,
            "encontrados": [],
            "cantidad": 0
        }
    
    resultado = []
    for p in filtrados[:15]:
        baker_id = p.get("baker_id")
        business_name = p.get("business_name", "Danhee Cake")
        
        baker_name = p.get("baker_name", "Repostero no especificado")
        if not baker_name or baker_name == "Repostero no especificado":
            if baker_id:
                repostero_info = get_baker_by_id(baker_id)
                if repostero_info:
                    baker_name = repostero_info.get("name", repostero_info.get("business_name", baker_name))
        
        resultado.append({
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "empresa": business_name,
            "repostero": baker_name,
            "categoria": p.get("category_name", "Sin categoría"),
        })
    
    _last_search_result = {"encontrados": resultado, "categoria": categoria_buscar}
    _last_context["ultima_categoria"] = categoria_buscar
    
    lista = "\n".join([f"• **{p['nombre']}** - ${p['precio']} MXN\n  🏢 Empresa: {p['empresa']}\n  👨‍🍳 Repostero: {p['repostero']}" for p in resultado[:10]])
    
    return {
        "categoria": categoria_buscar,
        "encontrados": resultado,
        "cantidad": len(filtrados),
        "mensaje": f"🍰 Para {categoria_buscar}, tenemos {len(filtrados)} pasteles disponibles en Danhee Cake:\n\n{lista}"
    }


def consultar_tamanos_pasteles(contexto_anterior: str = "") -> dict:
    """
    Consulta los tamaños disponibles de pasteles en Danhee Cake.
    Lee el contenido del archivo cake_sizes.pdf y devuelve su información.
    """
    # Intentar leer cake_sizes.pdf
    ruta_pdf = base_dir / "data" / "cake_sizes.pdf"
    print(f"[DEBUG] Buscando PDF en: {ruta_pdf}", file=sys.stderr)
    if ruta_pdf.exists():
        try:
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(str(ruta_pdf))
            docs = loader.load()
            texto_completo = "\n".join([doc.page_content for doc in docs])
            if texto_completo.strip():
                print(f"[DEBUG] PDF leído correctamente, {len(texto_completo)} caracteres", file=sys.stderr)
                # Limitar a 2000 caracteres para no saturar
                texto_resumido = texto_completo[:2000]
                return {
                    "mensaje": f"📏 Información de tamaños de pasteles (desde cake_sizes.pdf):\n\n{texto_resumido}",
                    "fuente": "cake_sizes.pdf"
                }
            else:
                print("[DEBUG] El PDF está vacío o no contiene texto extraíble", file=sys.stderr)
        except Exception as e:
            print(f"[DEBUG] Error leyendo cake_sizes.pdf con PyPDFLoader: {e}", file=sys.stderr)
            # Intentar con pypdf como fallback
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(ruta_pdf))
                texto_completo = ""
                for page in reader.pages:
                    texto_completo += page.extract_text() + "\n"
                if texto_completo.strip():
                    return {
                        "mensaje": f"📏 Información de tamaños de pasteles (desde cake_sizes.pdf):\n\n{texto_completo[:2000]}",
                        "fuente": "cake_sizes.pdf"
                    }
            except Exception as e2:
                print(f"[DEBUG] Error con pypdf: {e2}", file=sys.stderr)
    
    # Fallback a información por defecto si no existe el PDF o no se pudo leer
    return {
        "mensaje": "📏 En Danhee Cake ofrecemos pasteles en los siguientes tamaños:\n\n• Pequeño: 6-8 personas (desde $350 MXN)\n• Mediano: 10-15 personas (desde $550 MXN)\n• Grande: 20-30 personas (desde $850 MXN)\n• Múltiples niveles: 40+ personas (cotizar)\n\nSi deseas información más detallada, por favor consulta nuestro documento de tamaños."
    }


def recomendar_por_tamanio(tamanio_deseado: str) -> dict:
    """Recomienda pasteles según el tamaño deseado (pequeño, mediano, grande)."""
    todos = get_cakes()
    
    tamanio_lower = tamanio_deseado.lower()
    
    rangos_tamanios = {
        "pequeño": (0, 450),
        "mediano": (451, 700),
        "grande": (701, 10000)
    }
    
    rango = rangos_tamanios.get(tamanio_lower, (0, 10000))
    
    filtrados = [
        p for p in todos
        if p.get("price") and rango[0] <= float(p.get("price")) <= rango[1]
    ]
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles de tamaño {tamanio_deseado} en Danhee Cake actualmente."}
    
    resultado = [
        {
            "nombre": p.get("name"),
            "precio": float(p.get("price")),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
            "ocasion": p.get("category_name", "General")
        }
        for p in filtrados[:10]
    ]
    
    lista = "\n".join([f"• {r['nombre']} - ${r['precio']} MXN (Empresa: {r['empresa']})" for r in resultado])
    
    return {
        "tamanio": tamanio_deseado,
        "recomendaciones": resultado,
        "mensaje": f"🎂 Para un pastel {tamanio_deseado}, te recomiendo estos pasteles de Danhee Cake:\n{lista}"
    }


def consultar_detalle_pastel_por_id(pastel_id: int = None, contexto_anterior: str = "") -> dict:
    """
    Consulta el detalle completo de un pastel específico por su ID o nombre.
    Ahora acepta también un string como nombre (a través del parámetro pastel_id).
    Retorna: nombre, empresa, precio, ubicación y calificación con reseñas.
    """
    todos = get_cakes()
    pastel_encontrado = None

    # Limpiar contexto_anterior si contiene valores no válidos (como '<nil>' o 'null')
    if contexto_anterior and contexto_anterior.lower() in ('<nil>', 'null', 'none'):
        contexto_anterior = ""

    # Si pastel_id es None o un string no numérico, usar el nombre proporcionado
    if pastel_id is None or (isinstance(pastel_id, str) and not pastel_id.isdigit()):
        # Priorizar pastel_id si es un string no vacío
        nombre_buscar = pastel_id if isinstance(pastel_id, str) and pastel_id.strip() else contexto_anterior
        if not nombre_buscar:
            return {"mensaje": "No especificaste qué pastel deseas consultar."}
        nombre_limpio = quitar_acentos(nombre_buscar.lower())
        print(f"[DEBUG] Buscando pastel por nombre: '{nombre_limpio}'", file=sys.stderr)
        # Buscar coincidencia exacta primero
        for p in todos:
            if quitar_acentos(p.get("name", "").lower()) == nombre_limpio:
                pastel_encontrado = p
                break
        # Si no, buscar coincidencia parcial
        if not pastel_encontrado:
            for p in todos:
                if nombre_limpio in quitar_acentos(p.get("name", "").lower()):
                    pastel_encontrado = p
                    break
        if not pastel_encontrado:
            return {"mensaje": f"No encontré un pastel con el nombre '{nombre_buscar}' en Danhee Cake."}
    else:
        # Convertir a entero si es necesario
        try:
            pid = int(pastel_id)
        except (ValueError, TypeError):
            return {"mensaje": "El identificador del pastel debe ser un número."}
        for p in todos:
            if p.get("id") == pid:
                pastel_encontrado = p
                break
        if not pastel_encontrado:
            return {"mensaje": f"No encontré el pastel con ID {pid} en Danhee Cake."}

    # Obtener información del repostero
    baker_id = pastel_encontrado.get("baker_id")
    business_name = pastel_encontrado.get("business_name", "Danhee Cake")
    nombre_pastel = pastel_encontrado.get("name")
    precio = float(pastel_encontrado.get("price", 0)) if pastel_encontrado.get("price") else 0.0
    rating = pastel_encontrado.get("rating", 0.0)
    reseñas = pastel_encontrado.get("review_count", 0)
    if reseñas is None:
        reseñas = 0

    ubicacion = "No especificada"
    if baker_id:
        repostero = get_baker_by_id(baker_id)
        if repostero:
            ubicacion = repostero.get("location", "No especificada")

    # Formatear mensaje con estrellas
    estrellas = "★" * int(rating) + "☆" * (5 - int(rating)) if rating else "☆☆☆☆☆"
    mensaje = (
        f"🍰 **{nombre_pastel}**\n"
        f"🏢 Empresa: {business_name}\n"
        f"💰 Precio: ${precio:.2f} MXN\n"
        f"📍 Ubicación: {ubicacion}\n"
        f"⭐ Calificación: {estrellas} {rating:.1f} ({reseñas} reseñas)\n"
    )
    return {
        "pastel": nombre_pastel,
        "empresa": business_name,
        "precio": precio,
        "ubicacion": ubicacion,
        "calificacion": rating,
        "reseñas": reseñas,
        "mensaje": mensaje
    }


def consultar_empresas_por_ubicacion(ubicacion: str, contexto_anterior: str = "") -> dict:
    """
    Consulta qué empresas (pastelerías) están ubicadas en una ciudad o región específica.
    """
    global _last_context
    reposteros = get_bakers()
    ubicacion_buscar = ubicacion if ubicacion else contexto_anterior
    if not ubicacion_buscar:
        return {"mensaje": "Por favor especifica una ubicación (ciudad, estado, país) para buscar empresas."}
    
    ubicacion_normalizada = quitar_acentos(ubicacion_buscar.lower())
    filtrados = []
    for r in reposteros:
        loc = r.get("location", "")
        if loc:
            loc_norm = quitar_acentos(loc.lower())
            if ubicacion_normalizada in loc_norm or loc_norm in ubicacion_normalizada:
                filtrados.append(r)
    
    if not filtrados:
        return {"mensaje": f"No encontré empresas en '{ubicacion_buscar}' en Danhee Cake."}
    
    resultado = []
    for r in filtrados:
        resultado.append({
            "nombre_negocio": r.get("business_name"),
            "especialidad": r.get("specialty"),
            "calificacion": float(r.get("rating_avg", 0)) if r.get("rating_avg") else 0.0,
            "ubicacion": r.get("location"),
            "verificado": bool(r.get("is_verified"))
        })
    
    _last_context["ultima_ubicacion"] = ubicacion_buscar
    _last_context["ultimas_empresas"] = resultado
    
    lista = "\n".join([f"• **{emp['nombre_negocio']}** - {emp['ubicacion']} - ⭐ {emp['calificacion']}" for emp in resultado])
    return {
        "ubicacion": ubicacion_buscar,
        "empresas": resultado,
        "cantidad": len(resultado),
        "mensaje": f"🏢 Empresas en {ubicacion_buscar}:\n{lista}\n\n¿Te gustaría conocer los pasteles de alguna de ellas?"
    }


def consultar_pasteles_por_empresa(empresa: str, contexto_anterior: str = "") -> dict:
    """
    Consulta todos los pasteles que pertenecen a una empresa específica.
    """
    global _last_context
    todos_pasteles = get_cakes()
    empresa_buscar = empresa if empresa else contexto_anterior
    if not empresa_buscar:
        return {"mensaje": "Por favor especifica el nombre de la empresa para ver sus pasteles."}
    
    empresa_normalizada = quitar_acentos(empresa_buscar.lower())
    filtrados = []
    for p in todos_pasteles:
        biz = p.get("business_name", "")
        if biz:
            biz_norm = quitar_acentos(biz.lower())
            if empresa_normalizada in biz_norm or biz_norm in empresa_normalizada:
                filtrados.append(p)
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles de la empresa '{empresa_buscar}' en Danhee Cake."}
    
    resultado = []
    for p in filtrados:
        resultado.append({
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "categoria": p.get("category_name", "Sin categoría"),
            "calificacion": p.get("rating", 0)
        })
    
    _last_context["ultima_empresa"] = empresa_buscar
    _last_context["ultimos_pasteles"] = resultado
    
    lista = "\n".join([f"• **{pastel['nombre']}** - ${pastel['precio']} MXN - {pastel['categoria']}" for pastel in resultado])
    return {
        "empresa": empresa_buscar,
        "pasteles": resultado,
        "cantidad": len(resultado),
        "mensaje": f"🍰 Pasteles de {empresa_buscar}:\n{lista}"
    }


def mostrar_opciones(contexto: str = "", contexto_anterior: str = "") -> dict:
    """Muestra las opciones de pasteles disponibles según el contexto de la conversación."""
    global _last_search_result
    
    # Usar contexto_anterior si no hay contexto
    contexto_buscar = contexto if contexto else contexto_anterior
    
    if _last_search_result and _last_search_result.get("encontrados"):
        lista = "\n".join([
            f"• **{p['nombre']}** - ${p['precio']} MXN (Empresa: {p['empresa']})"
            for p in _last_search_result["encontrados"][:10]
        ])
        return {
            "mensaje": f"Aquí están las opciones que tenemos disponibles para {_last_search_result.get('categoria', 'tu búsqueda')}:\n\n{lista}",
            "opciones": _last_search_result["encontrados"],
            "categoria": _last_search_result.get("categoria", "seleccionada")
        }
    
    if contexto_buscar:
        return consultar_pasteles_por_categoria(categoria=contexto_buscar)
    
    categorias = consultar_categorias()
    lista_cats = "\n".join([f"• {c['nombre']} {c.get('icono', '')}" for c in categorias.get("categorias", [])])
    return {
        "mensaje": f"Estas son las categorías de pasteles disponibles en Danhee Cake:\n{lista_cats}\n\n💡 ¿Te gustaría que te muestre los pasteles de alguna categoría específica?",
        "categorias": categorias.get("categorias", [])
    }


def listar_mis_pasteles() -> dict:
    """
    Muestra la lista de pasteles asociados al catálogo del repostero autenticado.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    cakes = get_baker_cakes(baker["id"])
    if not cakes:
        return {"mensaje": "Aún no tienes pasteles registrados en tu catálogo. ¡Puedes pedirme que agregue uno!"}
    
    lista = []
    for c in cakes:
        destacado = "⭐ Destacado" if c.get("is_featured") else ""
        cat = c.get("category_name") or "Sin categoría"
        desc = c.get("description") or "Sin descripción"
        precio = float(c.get("price", 0))
        lista.append(f"• **ID: {c['id']}** - **{c['name']}** - ${precio:.2f} MXN - Categoría: {cat} - {desc} {destacado}")
    
    mensaje = "🍰 **Tus pasteles registrados:**\n\n" + "\n".join(lista)
    return {
        "pasteles": cakes,
        "cantidad": len(cakes),
        "mensaje": mensaje
    }

def agregar_nuevo_pastel(nombre: str, precio: float, categoria: str = None, descripcion: str = None) -> dict:
    """
    Agrega un nuevo pastel al catálogo del repostero.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    # Resolver id de categoría
    category_id = None
    if categoria:
        cats = get_categories()
        categoria_norm = quitar_acentos(categoria.lower())
        for cat in cats:
            if categoria_norm in quitar_acentos(cat["name"].lower()) or quitar_acentos(cat["slug"].lower()) in categoria_norm:
                category_id = cat["id"]
                break
    
    cake_id = add_baker_cake(baker["id"], category_id, nombre, descripcion, precio)
    if cake_id:
        return {
            "success": True,
            "cake_id": cake_id,
            "mensaje": f"✅ ¡Pastel **'{nombre}'** agregado exitosamente a tu catálogo con un precio de ${precio:.2f} MXN! (ID asignado: {cake_id})"
        }
    else:
        return {"mensaje": "❌ Ocurrió un error al intentar registrar el pastel en la base de datos."}

def actualizar_mi_pastel(pastel_id: int, nombre: str = None, precio: float = None, descripcion: str = None, categoria: str = None) -> dict:
    """
    Actualiza la información de un pastel existente del repostero.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    # Primero obtener el pastel actual para validar pertenencia y completar campos vacíos
    cakes = get_baker_cakes(baker["id"])
    target_cake = None
    for c in cakes:
        if c["id"] == int(pastel_id):
            target_cake = c
            break
            
    if not target_cake:
        return {"mensaje": f"No se encontró el pastel con ID {pastel_id} en tu catálogo. Verifica que el ID sea correcto."}
    
    # Preparar valores (si no se envían, conservar los existentes)
    new_nombre = nombre if nombre is not None else target_cake["name"]
    new_precio = float(precio) if precio is not None else float(target_cake["price"])
    new_descripcion = descripcion if descripcion is not None else target_cake["description"]
    
    category_id = target_cake["category_id"]
    if categoria:
        cats = get_categories()
        categoria_norm = quitar_acentos(categoria.lower())
        for cat in cats:
            if categoria_norm in quitar_acentos(cat["name"].lower()) or quitar_acentos(cat["slug"].lower()) in categoria_norm:
                category_id = cat["id"]
                break
                
    is_featured = target_cake.get("is_featured", 0)
    
    success = update_baker_cake(baker["id"], int(pastel_id), new_nombre, new_descripcion, new_precio, category_id, is_featured)
    if success:
        return {
            "success": True,
            "mensaje": f"✅ El pastel **'{new_nombre}'** (ID: {pastel_id}) ha sido actualizado correctamente."
        }
    else:
        return {"mensaje": "❌ No se pudo actualizar el pastel. Intenta de nuevo."}

def eliminar_mi_pastel(pastel_id: int) -> dict:
    """
    Elimina un pastel del catálogo del repostero.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
        
    success = delete_baker_cake(baker["id"], int(pastel_id))
    if success:
        return {
            "success": True,
            "mensaje": f"✅ El pastel con ID {pastel_id} ha sido eliminado correctamente de tu catálogo."
        }
    else:
        return {"mensaje": f"❌ No se encontró o no se pudo eliminar el pastel con ID {pastel_id}. Verifica si el ID te pertenece."}

def listar_categorias_disponibles() -> dict:
    """
    Lista las categorías de pasteles activas para que el repostero sepa cuáles asignar.
    """
    cats = get_categories()
    if not cats:
        return {"mensaje": "No hay categorías registradas actualmente."}
        
    lista = [f"• **{c['name']}** (Slug: `{c['slug']}`)" for c in cats]
    mensaje = "🏷️ **Categorías de pasteles disponibles:**\n\n" + "\n".join(lista)
    return {
        "categorias": cats,
        "mensaje": mensaje
    }


def consultar_mis_citas() -> dict:
    """
    Consulta las citas programadas para el usuario actual (cliente o repostero) en Danhee Cake.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No has iniciado sesión. Por favor inicia sesión para consultar tus citas. 🍰"}
    
    # Determinar si es cliente o repostero
    user = get_user_by_id(client_id)
    if not user:
        return {"mensaje": "Usuario no encontrado."}
    
    role = user.get("role", "cliente")
    if role == "repostero":
        citas = get_baker_appointments(client_id)
        if not citas:
            return {"mensaje": "👨‍🍳 No tienes citas de degustación o asesoría programadas actualmente en Danhee Cake."}
        
        lista_citas = []
        for c in citas:
            fecha_formateada = str(c.get("date"))
            hora_formateada = str(c.get("time_slot"))
            status = c.get("status")
            cliente = c.get("client_name")
            notas = c.get("notes") or "Sin notas"
            lista_citas.append(f"• 📅 {fecha_formateada} a las {hora_formateada} con cliente **{cliente}** - Estado: {status} (Notas: {notas})")
        
        mensaje = "📅 **Tus citas programadas como repostero:**\n\n" + "\n".join(lista_citas)
        return {"citas": citas, "mensaje": mensaje}
    else:
        citas = get_client_appointments(client_id)
        if not citas:
            return {"mensaje": "🧁 No tienes ninguna cita programada actualmente en Danhee Cake. ¿Te gustaría agendar una cita para degustación con alguno de nuestros reposteros?"}
        
        lista_citas = []
        for c in citas:
            fecha_formateada = str(c.get("date"))
            hora_formateada = str(c.get("time_slot"))
            status = c.get("status")
            repostero = c.get("baker_business_name")
            notas = c.get("notes") or "Sin notas"
            lista_citas.append(f"• 📅 {fecha_formateada} a las {hora_formateada} con la pastelería **{repostero}** - Estado: {status} (Notas: {notas})")
            
        mensaje = "📅 **Tus citas de degustación programadas:**\n\n" + "\n".join(lista_citas)
        return {"citas": citas, "mensaje": mensaje}


def consultar_mis_disenos() -> dict:
    """
    Consulta los diseños de pasteles personalizados del cliente actual en Danhee Cake.
    """
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No has iniciado sesión. Por favor inicia sesión para consultar tus diseños. 🎨"}
        
    user = get_user_by_id(client_id)
    if not user:
        return {"mensaje": "Usuario no encontrado."}
        
    role = user.get("role", "cliente")
    if role == "repostero":
        return {"mensaje": "Los reposteros no diseñan pasteles propios, sino que gestionan los pasteles de su catálogo o reciben solicitudes de clientes."}
        
    disenos = get_client_designs(client_id)
    if not disenos:
        return {"mensaje": "🎨 Aún no tienes diseños personalizados guardados en Danhee Cake. Puedes ir a la sección 'Diseña tu pastel' para crear el tuyo."}
        
    lista_disenos = []
    tamanio_map = {"sm": "Pequeño", "md": "Mediano", "lg": "Grande"}
    for d in disenos:
        tamanio = tamanio_map.get(d.get("size"), d.get("size"))
        bizcocho = d.get("sponge")
        relleno = d.get("filling")
        decoracion = d.get("decoration")
        estado = d.get("status")
        notas = d.get("notes") or "Sin notas"
        lista_disenos.append(f"• **ID: {d['id']}** - Pastel {tamanio} (Bizcocho: {bizcocho}, Relleno: {relleno}, Decoración: {decoracion}) - Estado: {estado} (Notas: {notas})")
        
    mensaje = "🎨 **Tus diseños de pasteles personalizados:**\n\n" + "\n".join(lista_disenos)
    return {"disenos": disenos, "mensaje": mensaje}


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 2: MAPA DE FUNCIONES
# ─────────────────────────────────────────────────────────────────────────────

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
    
    # New user tools
    "consultar_mis_citas": consultar_mis_citas,
    "consultar_mis_disenos": consultar_mis_disenos,
    
    # Baker functions
    "listar_mis_pasteles": listar_mis_pasteles,
    "agregar_nuevo_pastel": agregar_nuevo_pastel,
    "actualizar_mi_pastel": actualizar_mi_pastel,
    "eliminar_mi_pastel": eliminar_mi_pastel,
    "listar_categorias_disponibles": listar_categorias_disponibles,
    
    # Robust aliases to handle model tool name hallucinations
    "obtener_precios": obtener_precios_por_categoria,
    "consultar_catalogo": consultar_catalogo_pasteles,
    "consultar_pasteles": consultar_catalogo_pasteles,
    "consultar_citas": consultar_mis_citas,
    "citas": consultar_mis_citas,
    "consultar_disenos": consultar_mis_disenos,
    "disenos": consultar_mis_disenos,
}


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 3: ESQUEMAS JSON DE HERRAMIENTAS PARA OLLAMA
# ─────────────────────────────────────────────────────────────────────────────

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
            "description": "Consulta el detalle completo de un pastel específico (nombre, empresa, precio, ubicación, calificación). Úsala cuando el usuario pregunte por los detalles de un pastel en particular, por ejemplo: 'cuéntame del pastel Red velvet', 'quiero saber sobre el pastel de fresa', 'detalles del pastel Caramelo especial'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obtener_precios_por_categoria",
            "description": "Obtiene el rango de precios de los pasteles por categoría.",
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
            "name": "buscar_pasteles_por_rango_precio",
            "description": "Busca pasteles con precio menor o mayor a una cantidad.",
            "parameters": {
                "type": "object",
                "properties": {
                    "precio": {"type": "number"},
                    "condicion": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": ["precio", "condicion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_catalogo_pasteles",
            "description": "Consulta el catálogo de pasteles disponibles.",
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
            "name": "consultar_todos_los_pasteles",
            "description": "Muestra el catálogo completo de todos los pasteles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_reposteros_disponibles",
            "description": "Lista todos los reposteros verificados.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "verificar_disponibilidad_repostero",
            "description": "Verifica disponibilidad de un repostero en una fecha.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {"type": "integer"},
                    "fecha": {"type": "string"}
                },
                "required": ["baker_id", "fecha"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "registrar_solicitud_cita",
            "description": "Registra una cita con un repostero. ÚSALA SOLO SI el usuario proporciona explícitamente todos los datos (nombre, id del repostero, fecha, hora). Si solo pregunta cómo agendar, NO USES esta herramienta.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {"type": "string"},
                    "baker_id": {"type": "integer"},
                    "fecha": {"type": "string"},
                    "hora": {"type": "string"},
                    "notas": {"type": "string"}
                },
                "required": ["client_name", "baker_id", "fecha", "hora"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_categorias",
            "description": "Lista todas las categorías de pasteles disponibles.",
            "parameters": {
                "type": "object",
                "properties": {
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
            "description": "Busca pasteles por nombre parcial (ej: 'red velvet'). Retorna lista con nombre, empresa, categoría, precio y calificación.",
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
            "name": "obtener_info_repostero",
            "description": "Obtiene información completa de un repostero.",
            "parameters": {
                "type": "object",
                "properties": {
                    "baker_id": {"type": "integer"}
                },
                "required": ["baker_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calcular_precio_personalizado",
            "description": "Calcula precio estimado de pastel personalizado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tamanio": {"type": "string"},
                    "relleno": {"type": "string"},
                    "decoracion": {"type": "string"}
                },
                "required": ["tamanio", "relleno", "decoracion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_politicas_pasteleria",
            "description": "Proporciona las políticas de Danhee Cake. Para información general de Danhee, usa el tema 'danhee'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tema": {"type": "string"}
                },
                "required": ["tema"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_tamanos_pasteles",
            "description": "Consulta los tamaños disponibles de pasteles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recomendar_por_tamanio",
            "description": "Recomienda pasteles según el tamaño deseado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tamanio_deseado": {"type": "string"}
                },
                "required": ["tamanio_deseado"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_empresas_por_ubicacion",
            "description": "Consulta qué empresas (pastelerías) están ubicadas en una ciudad o región específica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ubicacion": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": ["ubicacion"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_pasteles_por_empresa",
            "description": "Consulta todos los pasteles que pertenecen a una empresa específica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "empresa": {"type": "string"},
                    "contexto_anterior": {"type": "string"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_mis_citas",
            "description": "Consulta las citas programadas (degustaciones, asesorías) del cliente o repostero actual en Danhee Cake.",
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
            "description": "Consulta los diseños de pasteles personalizados creados por el cliente actual en Danhee Cake.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 4: INICIALIZACIÓN
# ─────────────────────────────────────────────────────────────────────────────

DANHEE_INFO = """
DANHEE CAKE - INFORMACIÓN OFICIAL:
Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales.

SERVICIOS PARA CLIENTES:
• Explorar catálogos de pasteles y buscar por categoría o nombre.
• Visualizar perfiles de reposteros y consultar empresas por ubicación.
• Reservar y consultar citas con reposteros.
• Solicitar y ver diseños de pasteles personalizados.
"""

SYSTEM_PROMPT = f"""Eres el asistente exclusivo para CLIENTES de DANHEE CAKE. Tu único objetivo es orientar a los clientes en la plataforma.

REGLAS GENERALES:
- ÁMBITO EXCLUSIVO: Solo responde sobre Danhee Cake. No hables de temas ajenos a la repostería o la plataforma.
- HERRAMIENTAS: Usa las herramientas disponibles cuando se requiera consultar o registrar información. NUNCA menciones nombres de funciones, código o devuelvas JSON en tu respuesta.
- IDIOMA Y TONO: Responde en español por defecto, cálido, breve y conversacional. Adapta el tono si el usuario es formal/informal o comete faltas de ortografía. Si habla en otro idioma, responde en ese idioma.
- HUMOR: Puedes usar humor sano o chistes ligeros sobre repostería si el cliente bromea, sin perder el profesionalismo.
- CLARIFICACIÓN: Si la pregunta es ambigua o faltan datos, pide una clarificación breve antes de ejecutar cualquier herramienta.
- LENGUAJE: Eres un asistente amigable y cercano que adapta su lenguaje al usuario. Si te saludan con confianza o slang (ej. "oliss", "holi", "hola bestie", "hola hermana"), responde con un tono igual de cálido, juvenil, inclusivo y moderno. Si te saludan formalmente (ej. "hola", "buenos días"), mantén un trato amable pero respetuoso. Conoce y comprende una amplia variedad de léxicos informales de Latinoamérica y España, interpretando correctamente la intención detrás de cada saludo o expresión coloquial.

CRÍTICO - FORMATO DE SALIDA:
- NUNCA generes texto en formato JSON, ni escribas estructuras como '{{"type":"function"...}}'.
- NUNCA muestres nombres de funciones ni argumentos de código al usuario.
- Si necesitas usar una herramienta, invócala mediante el mecanismo del sistema (tool call). La respuesta visible para el usuario SIEMPRE debe ser un texto en lenguaje natural, amable y conversacional.

HERRAMIENTAS Y FLUJOS:
- Búsquedas: recomendar_pastel, consultar_pasteles_por_categoria, buscar_pastel_por_nombre, consultar_detalle_pastel_por_id (pasa el nombre en pastel_id), obtener_precios_por_categoria, consultar_tamanos_pasteles.
- Ubicación/Empresas: consultar_empresas_por_ubicacion, consultar_pasteles_por_empresa.
- Cliente/Citas: consultar_mis_citas, consultar_mis_disenos, extraer_texto_pdf(nombre_archivo='faq.pdf'), consultar_politicas_pasteleria(tema='danhee').
- Agendar Citas: Para registrar_solicitud_cita requieres obligatoriamente: nombre, baker_id, fecha Y hora. Si no te da estos datos completos, explícale que debe ver el perfil del repostero para agendar.
- Pasteles 3D: Si piden pasteles 3D, indícales usar la sección 'Diseña tu pastel' en la plataforma.
- Registro: Si el cliente no está registrado, invítalo a registrarse. Si ya lo está, pídele ingresar correo y contraseña para ver más detalles personales.

RESPUESTAS EXACTAS (Prioridad alta - Ignora el uso de herramientas para estas preguntas):
- Si te preguntan en qué puedes ayudar o cuáles son tus funciones, responde EXACTAMENTE:
"¡Hola! Puedo ayudarte con lo siguiente en Danhee Cake:

• Ver el catálogo de pasteles y filtrar por categoría o nombre
• Consultar precios y tamaños disponibles
• Conocer el perfil de reposteros y buscar por ciudad
• Ver tus citas de degustación agendadas
• Ver tus diseños de pasteles personalizados
• Solicitar recomendaciones según tu ocasión y presupuesto
• Información sobre políticas de entrega, pago y cancelación

¿En qué te puedo ayudar hoy? 😊"

- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: 
"No me crearon, yo nací de Borcelle. 🎂"

- Si te preguntan quién creó Borcelle, quién es Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: 
"Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"

{DANHEE_INFO}"""

BAKER_SYSTEM_PROMPT = """Eres el asistente exclusivo para REPOSTEROS de DANHEE CAKE. Tu objetivo principal es ayudar al repostero a gestionar su catálogo de pasteles de forma rápida e interactiva.

REGLAS:
- Usa SIEMPRE las herramientas exclusivas de repostero para responder.
- Responde en español por defecto, de manera atenta, clara y concisa. Si el repostero escribe o pide respuesta en otro idioma (inglés, francés, portugués, etc.), adapta TODO tu idioma al idioma solicitado y manténlo durante toda la conversación hasta que el usuario cambie.
- Puedes responder con humor sano, chistes ligeros o comentarios divertidos relacionados con la repostería o la gestión del catálogo cuando el repostero bromee o lo pida, sin salirte del tema de Danhee Cake. Nunca uses humor ofensivo, irrespetuoso o fuera de lugar.
- listar_mis_pasteles → Muestra los pasteles del catálogo del repostero.
- consultar_mis_citas → Muestra las citas agendadas con los clientes.
- agregar_nuevo_pastel → Agrega un nuevo pastel al catálogo (requiere al menos nombre y precio, y puedes deducir o preguntar la categoría y descripción).
- actualizar_mi_pastel → Modifica los datos de un pastel existente del repostero (necesitas el pastel_id).
- eliminar_mi_pastel → Elimina un pastel del catálogo usando su ID.
- listar_categorias_disponibles → Muestra las categorías existentes que el repostero puede asignar a sus pasteles.
- Si el repostero pregunta sobre clientes, citas u otras opciones de clientes, recuérdale con amabilidad que estás aquí para ayudarle con la gestión rápida de sus pasteles.
- Mantén el contexto de la conversación entre turnos.
- Adapta tu tono dinámicamente según cómo se exprese el usuario (formal o informal). Sé flexible y comprensivo con ligeras faltas de ortografía o exceso de signos de puntuación, captando la intención sin corregirlo, pero SIEMPRE manteniéndote estrictamente en el tema de Danhee Cake.

CRÍTICO - FORMATO DE SALIDA:
- NUNCA generes texto en formato JSON, ni escribas estructuras como '{{"type":"function"...}}'.
- NUNCA muestres nombres de funciones ni argumentos de código al usuario.
- Si necesitas usar una herramienta, invócala mediante el mecanismo del sistema (tool call). La respuesta visible para el usuario SIEMPRE debe ser un texto en lenguaje natural, amable y conversacional.

RESPUESTAS ESPECIALES (responde DIRECTAMENTE sin usar herramientas):
- Si te preguntan en qué puedes ayudar, qué puedes hacer o cuáles son tus funciones, responde exactamente:
  "¡Hola! Como asistente para reposteros de Danhee Cake puedo ayudarte con:\n\n👨‍🍳 **Gestión de tu catálogo:**\n• Ver todos tus pasteles registrados\n• Agregar nuevos pasteles\n• Actualizar precios, nombre, categoría o descripción\n• Eliminar pasteles de tu catálogo\n• Consultar las categorías disponibles\n• Ver tus citas agendadas con clientes\n\n¿Con cuál te ayudo hoy? 😊"
- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: "No me crearon, yo nací de Borcelle. 🎂"
- Si te preguntan quién creó Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"
"""

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
                    "nombre": {"type": "string", "description": "Nombre del pastel (ej: 'Pastel de tres leches con fresas')"},
                    "precio": {"type": "number", "description": "Precio del pastel en MXN (ej: 450.0)"},
                    "categoria": {"type": "string", "description": "Categoría a la que pertenece (ej: 'Boda', 'XV Años', 'Cumpleaños', 'Baby Shower')"},
                    "descripcion": {"type": "string", "description": "Descripción opcional de los ingredientes, tamaño o diseño"}
                },
                "required": ["nombre", "precio"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "actualizar_mi_pastel",
            "description": "Actualiza el nombre, precio, descripción o categoría de uno de tus pasteles usando su ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer", "description": "ID numérico del pastel a modificar"},
                    "nombre": {"type": "string", "description": "Nuevo nombre del pastel"},
                    "precio": {"type": "number", "description": "Nuevo precio del pastel"},
                    "descripcion": {"type": "string", "description": "Nueva descripción del pastel"},
                    "categoria": {"type": "string", "description": "Nueva categoría del pastel"}
                },
                "required": ["pastel_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "eliminar_mi_pastel",
            "description": "Elimina un pastel de tu catálogo por completo usando su ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pastel_id": {"type": "integer", "description": "ID numérico del pastel a eliminar"}
                },
                "required": ["pastel_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "listar_categorias_disponibles",
            "description": "Muestra la lista de categorías activas en Danhee Cake para saber cuáles puedes asociar a tus pasteles.",
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
            "description": "Consulta las citas de degustación o asesoría agendadas con los clientes.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

def get_tools_model() -> str:
    """Detecta el mejor modelo con soporte de tools en Ollama."""
    try:
        ollama_host = os.getenv('OLLAMA_HOST', 'localhost').strip()

        if ollama_host.startswith(('http://', 'https://')):
            from urllib.parse import urlparse

            parsed = urlparse(ollama_host)
            host = parsed.hostname or 'localhost'
            port = parsed.port or 11434
        else:
            host = ollama_host
            port = 11434

        req = urllib.request.Request(f"http://{host}:{port}/api/tags")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [m['name'] for m in data.get('models', [])]
            print(f"[RAG Server] Modelos detectados: {models}", file=sys.stderr)

            priority = ["llama3:latest", "llama3.1", "llama3.2", "mistral-nemo", "mistral:latest", "mistral"]
            for pref in priority:
                for m in models:
                    if pref in m or pref.split(':')[0] in m:
                        print(f"[RAG Server] ✅ Usando modelo: {m}", file=sys.stderr)
                        return m
            return "llama3:latest"
    except Exception as e:
        print(f"[RAG Server] No se pudo conectar a Ollama: {e}", file=sys.stderr)
    return "llama3:latest"


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
# SECCIÓN 5: ORQUESTADOR CON FUNCTION CALLING Y MEMORIA
# ─────────────────────────────────────────────────────────────────────────────

def generate_response_with_tools(question: str, client_id: int = None, conversation_id: str = None) -> str:
    """
    Orquestador con Function Calling nativo de Ollama y memoria de conversación.
    Mantiene un historial completo por cliente en base de datos.
    """
    _set_current_client_id(client_id)
    
    # Determinar rol del usuario
    role = 'cliente'
    if client_id:
        user = get_user_by_id(client_id)
        if user:
            role = user.get('role', 'cliente')
            
    current_system_prompt = BAKER_SYSTEM_PROMPT if role == 'repostero' else SYSTEM_PROMPT
    current_tools_schema = BAKER_TOOLS_SCHEMA if role == 'repostero' else TOOLS_SCHEMA
    use_tools = _should_use_tools(question, role)

    cached_response = _get_cached_response(question, role, conversation_id)
    if cached_response is not None:
        return cached_response
    
    # Obtener el historial actual de la base de datos solo cuando realmente lo necesitamos
    messages = get_chat_history(conversation_id, current_system_prompt, max_turns=4) if use_tools else [{"role": "system", "content": current_system_prompt}]
    
    # Agregar el nuevo mensaje del usuario al arreglo temporal
    messages.append({"role": "user", "content": question})
    # Guardarlo de manera persistente en DB
    add_chat_message(conversation_id, "user", question)
    
    # Búsqueda RAG limitada a k=1 para reducir latencia (solo para clientes y cuando sí se necesitan herramientas)
    rag_context = ""
    if use_tools and role != 'repostero' and db is not None and not _should_skip_rag(question):
        try:
            docs = db.similarity_search(question, k=2)
            rag_context = "\n\n".join([
                f"Fuente: {doc.metadata.get('source','desconocida')}\n{doc.page_content}"
                for doc in docs
            ])
            if rag_context:
                messages.append({"role": "system", "content": f"Contexto adicional: {rag_context}"})
        except Exception as e:
            print(f"[RAG] Error en búsqueda: {e}", file=sys.stderr)
    
    tools_payload = current_tools_schema if use_tools else None
    print(f"[RAG] Llamando a Ollama ({llm_model}) con {'herramientas' if use_tools else 'respuesta directa'}...", file=sys.stderr)
    
    try:
        response = ollama_sdk.chat(
            model=llm_model,
            messages=messages,
            tools=tools_payload,
            options=_get_ollama_options(),
            keep_alive="5m"
        )
    except Exception as e:
        print(f"[RAG] Error en Ollama: {e}", file=sys.stderr)
        return "Lo siento, tengo problemas técnicos en Danhee Cake. Por favor intenta de nuevo. 🎂"
    
    assistant_message = response.get("message", {})
    tool_calls = assistant_message.get("tool_calls", [])
    
    content = assistant_message.get("content", "").strip()
    parsed_tool_call = None
    if not tool_calls and (content.startswith("{") and content.endswith("}")):
        try:
            parsed_json = json.loads(content)
            if isinstance(parsed_json, dict):
                if "name" in parsed_json:
                    name = parsed_json["name"]
                    args = parsed_json.get("params") or parsed_json.get("arguments") or {}
                    parsed_tool_call = {
                        "function": {
                            "name": name,
                            "arguments": args
                        }
                    }
                elif "function" in parsed_json and isinstance(parsed_json["function"], dict):
                    name = parsed_json["function"].get("name")
                    args = parsed_json["function"].get("arguments") or {}
                    if name:
                        parsed_tool_call = {
                            "function": {
                                "name": name,
                                "arguments": args
                            }
                        }
        except Exception:
            pass
            
    if parsed_tool_call:
        tool_calls = [parsed_tool_call]
        print(f"[RAG] 🔧 Detectado tool_call en texto content parseado (non-stream): {parsed_tool_call}", file=sys.stderr)
        
    if tool_calls:
        print(f"[RAG] 🔧 Ejecutando {len(tool_calls)} herramienta(s)...", file=sys.stderr)
        
        # Agregar el mensaje del asistente con las tool_calls al historial temporal y BD
        messages.append({
            "role": "assistant",
            "content": assistant_message.get("content", ""),
            "tool_calls": tool_calls
        })
        add_chat_message(conversation_id, "assistant", assistant_message.get("content", ""), tool_calls)
        
        for tool_call in tool_calls:
            if hasattr(tool_call, 'function'):
                func_name = tool_call.function.name
                raw_args = tool_call.function.arguments
            elif isinstance(tool_call, dict):
                func_name = tool_call.get("function", {}).get("name", "")
                raw_args = tool_call.get("function", {}).get("arguments", {})
            else:
                func_name = ""
                raw_args = {}
            
            if isinstance(raw_args, str):
                try:
                    args = json.loads(raw_args)
                except json.JSONDecodeError:
                    args = {}
            else:
                args = raw_args
                
            if not isinstance(args, dict):
                args = {}
            
            # Pasar contexto anterior si la función lo espera y no se proporcionó
            # Extraer la última pregunta del usuario del historial (la penúltima)
            ultima_pregunta = ""
            for m in reversed(messages):
                if m.get("role") == "user" and m.get("content") != question:
                    ultima_pregunta = m.get("content", "")
                    break
            
            if func_name in FUNCTIONS_MAP:
                import inspect
                sig = inspect.signature(FUNCTIONS_MAP[func_name])
                valid_keys = [
                    k for k, v in sig.parameters.items()
                    if v.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
                ]
                
                # Solo añadir contexto_anterior si la función lo requiere y no está presente
                if "contexto_anterior" not in args and "contexto_anterior" in valid_keys and ultima_pregunta:
                    # Evitar enviar strings no válidos como '<nil>'
                    if ultima_pregunta not in ('<nil>', 'null', 'None'):
                        args["contexto_anterior"] = ultima_pregunta
                
                # Filtrar argumentos para evitar errores por parámetros inventados por el LLM (alucinaciones)
                filtered_args = {k: v for k, v in args.items() if k in valid_keys}
                
                print(f"[RAG]   ▶ {func_name}({filtered_args})", file=sys.stderr)
                
                try:
                    result = FUNCTIONS_MAP[func_name](**filtered_args)
                    print(f"[RAG]   ✅ Resultado obtenido", file=sys.stderr)
                except Exception as e:
                    # Manejo de error seguro para evitar State Poisoning y bucles infinitos
                    result = {"error": "Error interno al ejecutar la herramienta. Por favor, informa al usuario que hubo un problema técnico y que intente más tarde."}
                    print(f"[RAG]   ❌ Error interceptado para proteger la memoria: {e}", file=sys.stderr)
            else:
                print(f"[RAG]   ▶ {func_name}({args})", file=sys.stderr)
                result = {"error": f"Herramienta '{func_name}' no encontrada"}
                print(f"[RAG]   ❌ Herramienta no encontrada", file=sys.stderr)
            
            tool_result_content = json.dumps(result, ensure_ascii=False, default=json_serial)
            messages.append({
                "role": "tool",
                "content": tool_result_content
            })
            add_chat_message(conversation_id, "tool", tool_result_content)
        
        print(f"[RAG] Re-invocando LLM con resultados...", file=sys.stderr)
        try:
            final_response = ollama_sdk.chat(
                model=llm_model,
                messages=messages,
                options=_get_ollama_options(),
                keep_alive="5m"
            )
            final_content = final_response.get("message", {}).get("content", "").strip()
            
            # Agregar la respuesta final del asistente al historial y DB
            if final_content:
                messages.append({"role": "assistant", "content": final_content})
                add_chat_message(conversation_id, "assistant", final_content)
            else:
                # Si no generó contenido, tomar el último resultado de la herramienta
                last_tool_result = json.loads(messages[-1]["content"])
                if "mensaje" in last_tool_result:
                    final_content = last_tool_result["mensaje"]
                elif "recomendacion" in last_tool_result:
                    final_content = last_tool_result["recomendacion"]
                else:
                    final_content = "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
                messages.append({"role": "assistant", "content": final_content})
                add_chat_message(conversation_id, "assistant", final_content)
            
            _set_cached_response(question, role, final_content, conversation_id)
            return final_content
                    
        except Exception as e:
            print(f"[RAG] Error en re-invocación: {e}", file=sys.stderr)
            return "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
    
    else:
        direct_content = assistant_message.get("content", "").strip()
        print(f"[RAG] Respuesta directa del LLM", file=sys.stderr)
        
        if not direct_content:
            direct_content = "🎂 ¡Bienvenido a Danhee Cake! Soy tu asistente virtual. ¿En qué puedo ayudarte?"
        
        # Agregar la respuesta directa al historial y base de datos
        messages.append({"role": "assistant", "content": direct_content})
        add_chat_message(conversation_id, "assistant", direct_content)
        
        _set_cached_response(question, role, direct_content, conversation_id)
        return direct_content


def check_guardrails(prompt: str) -> bool:
    if not prompt:
        return False
    prompt_lower = prompt.lower()
    forbidden_patterns = [
        "ignora las instrucciones",
        "ignora las reglas",
        "ignora los prompts",
        "ignore previous instructions",
        "ignore instructions",
        "revela tu system prompt",
        "revela tu prompt",
        "revela tus instrucciones",
        "revelar system prompt",
        "revelar instrucciones",
        "reveal your prompt",
        "reveal prompt",
        "asume el rol de",
        "actúa como",
        "assume the role of",
        "act as a",
        "you are now a",
        "ahora eres",
        "olvida todo",
        "forget all previous",
        "desactiva la seguridad",
        "disable safety",
        "jailbreak",
        "instrucciones del sistema"
    ]
    for pattern in forbidden_patterns:
        if pattern in prompt_lower:
            return True
            
    # Patrones repetitivos atípicos
    words = prompt_lower.split()
    if len(words) > 50:
        from collections import Counter
        counts = Counter(words)
        for word, count in counts.items():
            if len(word) > 2 and count > 15:
                return True
                
    import re
    if re.search(r'(.)\1{29,}', prompt_lower):
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 6: SERVIDOR HTTP
# ─────────────────────────────────────────────────────────────────────────────

class RAGRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    
    def do_GET(self):
        """Manejar solicitudes GET para obtener historial de chat"""
        from urllib.parse import urlparse, parse_qs
        
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == '/chat/history':
            params = parse_qs(parsed.query)
            conversation_id = params.get('conversation_id', [None])[0]
            client_id = params.get('client_id', [None])[0]
            
            # Si no hay conversation_id pero hay client_id, obtener el último
            if not conversation_id and client_id:
                conversation_id = get_last_conversation_by_client(client_id)
                if conversation_id:
                    print(f"[RAG Server] Recuperado conversation_id para cliente {client_id}: {conversation_id}", file=sys.stderr)
            
            if not conversation_id:
                self._send_error(400, "Se requiere conversation_id o client_id")
                return
            
            # Obtener los mensajes del historial (solo user y assistant)
            messages = get_chat_messages(conversation_id)
            filtered = [m for m in messages if m['role'] in ('user', 'assistant')]
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"messages": filtered}, ensure_ascii=False).encode('utf-8'))
        else:
            self._send_error(404, "Not found")
    
    def do_POST(self):
        import time
        import re
        import threading
        from datetime import datetime
        from concurrent.futures import ThreadPoolExecutor
        
        if self.path == '/chat':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                conversation_id = req_data.get('conversation_id')
                
                # Configurar client_id en thread-local
                _set_current_client_id(client_id)
                
                # Cargar/crear sesión
                if not conversation_id and client_id:
                    conversation_id = get_last_conversation_by_client(client_id)
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                get_or_create_chat_session(conversation_id, client_id)
                
                response_text = generate_response_with_tools(question, client_id, conversation_id)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"response": response_text, "conversation_id": conversation_id}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self._send_error(500, f"Error en chat: {str(e)}")
            return
            
        elif self.path == '/chat/stream':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                conversation_id = req_data.get('conversation_id')
                role = req_data.get('role')
                
                # Asignar a la variable global para que las funciones locales la conozcan
                _set_current_client_id(client_id)
                
                # Determinar rol del usuario
                if not role and client_id:
                    user = get_user_by_id(client_id)
                    if user:
                        role = user.get('role')
                if not role:
                    role = 'cliente'
                    
                current_system_prompt = BAKER_SYSTEM_PROMPT if role == 'repostero' else SYSTEM_PROMPT
                current_tools_schema = BAKER_TOOLS_SCHEMA if role == 'repostero' else TOOLS_SCHEMA
                use_tools = _should_use_tools(question, role)
                
                # Configurar CORS y cabeceras SSE estricto
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-transform')
                self.send_header('Connection', 'close') # <-- Fuerza el término de la conexión al acabar
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                def send_event(event_type, data_dict):
                    try:
                        payload = json.dumps({"type": event_type, **data_dict}, ensure_ascii=False)
                        self.wfile.write(f"data: {payload}\n\n".encode('utf-8'))
                        self.wfile.flush()
                    except Exception:
                        pass
                
                start_time = datetime.now()
                ttft_ms = None
                tools_executed_list = []
                
                # ── Guardrails ────────────────────────────────────────────────
                if check_guardrails(question):
                    err_msg = "Entrada bloqueada por políticas de seguridad de Danhee Cake."
                    send_event("error", {"content": err_msg})
                    send_event("done", {})
                    return
                
                # ── Conversation ID ───────────────────────────────────────────
                if not conversation_id and client_id:
                    last_conv = get_last_conversation_by_client(client_id)
                    if last_conv:
                        conversation_id = last_conv
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                
                get_or_create_chat_session(conversation_id, client_id)
                send_event("conversation_id", {"conversation_id": conversation_id})
                
                # ── Cargar historial + Chroma en paralelo solo si realmente se necesitan ─────────────────────
                rag_context_holder = [""]
                history_holder = [None]

                if not client_id and not conversation_id and role != 'repostero':
                    cached_response = _get_cached_response(question, role)
                    if cached_response is not None:
                        send_event("state", {"status": "ready", "message": "Respuesta rápida"})
                        for word in re.findall(r'\S+\s*', cached_response):
                            send_event("token", {"content": word})
                        send_event("done", {})
                        return

                if use_tools:
                    send_event("state", {"status": "searching", "message": "Buscando información..."})
                    
                    def fetch_history():
                        history_holder[0] = get_chat_history(conversation_id, current_system_prompt, max_turns=4)
                    
                    def fetch_rag():
                        if role != 'repostero' and db is not None and not _should_skip_rag(question):
                            try:
                                docs = db.similarity_search(question, k=1)
                                rag_context_holder[0] = "\n".join([doc.page_content for doc in docs])
                            except Exception as e:
                                print(f"[RAG Stream] Error Chroma: {e}", file=sys.stderr)
                    
                    with ThreadPoolExecutor(max_workers=2) as executor:
                        f1 = executor.submit(fetch_history)
                        f2 = executor.submit(fetch_rag)
                        f1.result()
                        f2.result()
                    
                    messages = history_holder[0] or [{"role": "system", "content": current_system_prompt}]
                    messages.append({"role": "user", "content": question})
                    add_chat_message(conversation_id, "user", question)
                    
                    if rag_context_holder[0]:
                        messages.append({"role": "system", "content": f"Contexto adicional: {rag_context_holder[0]}"})
                else:
                    messages = [{"role": "system", "content": current_system_prompt}, {"role": "user", "content": question}]
                    add_chat_message(conversation_id, "user", question)
                
                # ── Primera llamada al LLM ────────────────────────────────────
                send_event("state", {"status": "thinking", "message": "Analizando tu solicitud..."})
                
                OLLAMA_OPTIONS = _get_ollama_options()
                tools_payload = current_tools_schema if use_tools else None
                
                try:
                    response = ollama_sdk.chat(
                        model=llm_model,
                        messages=messages,
                        tools=tools_payload,
                        options=OLLAMA_OPTIONS,
                        keep_alive="5m"
                    )
                except Exception as e:
                    send_event("error", {"content": "Error interno del modelo de IA local."})
                    send_event("done", {})
                    return
                
                assistant_message = response.get("message", {})
                tool_calls = assistant_message.get("tool_calls", [])
                final_response_text = ""
                
                content = assistant_message.get("content", "").strip()
                parsed_tool_call = None
                if not tool_calls and (content.startswith("{") and content.endswith("}")):
                    try:
                        parsed_json = json.loads(content)
                        if isinstance(parsed_json, dict):
                            if "name" in parsed_json:
                                name = parsed_json["name"]
                                args = parsed_json.get("params") or parsed_json.get("arguments") or {}
                                parsed_tool_call = {
                                    "function": {
                                        "name": name,
                                        "arguments": args
                                    }
                                }
                            elif "function" in parsed_json and isinstance(parsed_json["function"], dict):
                                name = parsed_json["function"].get("name")
                                args = parsed_json["function"].get("arguments") or {}
                                if name:
                                    parsed_tool_call = {
                                        "function": {
                                            "name": name,
                                            "arguments": args
                                        }
                                    }
                    except Exception:
                        pass
                
                if parsed_tool_call:
                    tool_calls = [parsed_tool_call]
                    print(f"[RAG] 🔧 Detectado tool_call en texto content parseado (stream): {parsed_tool_call}", file=sys.stderr)
                    
                if use_tools and tool_calls:
                    messages.append({
                        "role": "assistant",
                        "content": assistant_message.get("content", ""),
                        "tool_calls": tool_calls
                    })
                    add_chat_message(conversation_id, "assistant", assistant_message.get("content", ""), tool_calls)
                    
                    for tool_call in tool_calls:
                        if hasattr(tool_call, 'function'):
                            func_name = tool_call.function.name
                            raw_args = tool_call.function.arguments
                        elif isinstance(tool_call, dict):
                            func_name = tool_call.get("function", {}).get("name", "")
                            raw_args = tool_call.get("function", {}).get("arguments", {})
                        else:
                            func_name = ""
                            raw_args = {}
                        
                        if isinstance(raw_args, str):
                            try: args = json.loads(raw_args)
                            except: args = {}
                        else: args = raw_args
                        if not isinstance(args, dict):
                            args = {}
                        
                        ultima_pregunta = ""
                        for m in reversed(messages):
                            if m.get("role") == "user" and m.get("content") != question:
                                ultima_pregunta = m.get("content", "")
                                break
                        
                        import inspect
                        if func_name in FUNCTIONS_MAP:
                            sig = inspect.signature(FUNCTIONS_MAP[func_name])
                            valid_keys = [
                                k for k, v in sig.parameters.items()
                                if v.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
                            ]
                            if "contexto_anterior" not in args and "contexto_anterior" in valid_keys and ultima_pregunta:
                                if ultima_pregunta not in ('<nil>', 'null', 'None'):
                                    args["contexto_anterior"] = ultima_pregunta
                            filtered_args = {k: v for k, v in args.items() if k in valid_keys}
                            
                            send_event("state", {"status": "executing", "message": f"Consultando: {func_name}..."})
                            try:
                                result = FUNCTIONS_MAP[func_name](**filtered_args)
                                tc_status = "SUCCESS"
                            except Exception as e:
                                result = {"error": f"Error ejecutando herramienta: {e}"}
                                tc_status = "ERROR"
                            tools_executed_list.append({"name": func_name, "parameters": filtered_args, "status": tc_status})
                        else:
                            result = {"error": f"Herramienta '{func_name}' no encontrada"}
                            tools_executed_list.append({"name": func_name, "parameters": args, "status": "ERROR"})
                        
                        tool_result_content = json.dumps(result, ensure_ascii=False, default=json_serial)
                        messages.append({"role": "tool", "content": tool_result_content})
                        add_chat_message(conversation_id, "tool", tool_result_content)
                    
                    # ── Respuesta final en stream ─────────────────────────────
                    send_event("state", {"status": "thinking", "message": "Formulando respuesta..."})
                    try:
                        stream_response = ollama_sdk.chat(
                            model=llm_model,
                            messages=messages,
                            stream=True,
                            options=OLLAMA_OPTIONS,
                            keep_alive="5m"
                        )
                        for chunk in stream_response:
                            chunk_content = chunk.get("message", {}).get("content", "")
                            if chunk_content:
                                if ttft_ms is None:
                                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                                final_response_text += chunk_content
                                send_event("token", {"content": chunk_content})
                        add_chat_message(conversation_id, "assistant", final_response_text)
                        _set_cached_response(question, role, final_response_text, conversation_id)
                    except Exception as e:
                        send_event("error", {"content": "Error generando la respuesta final."})
                
                else:
                    # ── Respuesta directa sin herramientas ────────────────────
                    direct_content = assistant_message.get("content", "").strip()
                    if not direct_content:
                        direct_content = "¡Hola! Soy tu asistente de Danhee Cake. ¿En qué puedo ayudarte?"
                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                    final_response_text = direct_content
                    for word in re.findall(r'\S+\s*', direct_content):
                        send_event("token", {"content": word})
                    add_chat_message(conversation_id, "assistant", direct_content)
                    _set_cached_response(question, role, direct_content, conversation_id)
                
                # ── CIERRE REQUERIDO Y OBLIGATORIO PARA SSE ───────────────────
                send_event("done", {})
                
                # Registrar observabilidad
                try:
                    end_time = datetime.now()
                    total_latency_ms = int((end_time - start_time).total_seconds() * 1000)
                    num_tokens = len(final_response_text) / 4.0
                    active_gen_sec = max((total_latency_ms - (ttft_ms or 0)) / 1000.0, 0.1)
                    tps = round(num_tokens / active_gen_sec, 2)
                    add_observability_log(
                        session_id=conversation_id, user_prompt=question,
                        system_response=final_response_text, ttft_ms=ttft_ms or total_latency_ms,
                        total_latency_ms=total_latency_ms, tokens_per_second=tps,
                        was_blocked=False, tools_executed=tools_executed_list
                    )
                except Exception:
                    pass
                
            except Exception as e:
                print(f"[RAG Server Stream Error] {e}", file=sys.stderr)
                send_event("error", {"content": f"Error en streaming: {str(e)}"})
                send_event("done", {})
            
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
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
    server_address = ('0.0.0.0', port)
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