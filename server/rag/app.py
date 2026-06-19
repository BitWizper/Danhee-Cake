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
    insert_guest_appointment, get_categories, get_user_by_id,
    get_or_create_chat_session, get_chat_history, add_chat_message,
    get_last_conversation_by_client,      # <-- NUEVA
    get_chat_messages,                    # <-- NUEVA
    add_observability_log
)

base_dir = Path(__file__).resolve().parent

# Variable global para almacenar client_id del usuario actual (por turno)
_current_client_id = None
# Variable para almacenar el último resultado de búsqueda
_last_search_result = {}
# Cache para contenido de PDFs
_pdf_cache = {}
# Contexto adicional: última empresa o pasteles mencionados
_last_context = {}

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
    }
]


# ─────────────────────────────────────────────────────────────────────────────
# SECCIÓN 4: INICIALIZACIÓN
# ─────────────────────────────────────────────────────────────────────────────

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

¡SOLO RESPONDE SOBRE DANHEE CAKE! NO HABLES DE OTRAS COSAS.
"""

SYSTEM_PROMPT = f"""ERES EL ASISTENTE EXCLUSIVO DE DANHEE CAKE.

{DANHEE_INFO}

REGLAS OBLIGATORIAS:
1. SOLO hablas sobre Danhee Cake y sus servicios.
2. SIEMPRE usa las herramientas disponibles para responder.
3. Responde en español, cálido y profesional.
4. Para preguntas sobre recomendaciones de pasteles (como "qué pastel me recomiendas para cumpleaños"), usa la herramienta recomendar_pastel.
5. Para preguntas sobre tamaños de pasteles, usa la herramienta consultar_tamanos_pasteles.
6. Para preguntas frecuentes (políticas, envíos, pagos, personalización, etc.), usa la herramienta extraer_texto_pdf con nombre_archivo='faq.pdf'.
7. Para preguntas como "qué empresas hay en [ubicación]" usa consultar_empresas_por_ubicacion.
8. Para preguntas como "qué pasteles tiene [empresa]" usa consultar_pasteles_por_empresa.
9. Para preguntas sobre "qué es Danhee Cake" o "información de Danhee", usa la herramienta consultar_politicas_pasteleria con tema='danhee'. Esto leerá el archivo danhee_knowledge_base.pdf.
10. Para preguntas como "qué pasteles hay de [sabor/nombre]" usa buscar_pastel_por_nombre.
11. Cuando el usuario pida detalles de un pastel específico (ej. "cuéntame del pastel Red velvet", "quiero saber sobre el pastel de fresa", "detalles del caramelo especial"), DEBES usar la herramienta consultar_detalle_pastel_por_id con el nombre del pastel en el parámetro pastel_id (como string). No uses contexto_anterior para el nombre, envíalo directamente en pastel_id.
12. Mantén el contexto de la conversación: si el usuario pregunta "y el de red velvet?" después de hablar de una empresa, debes inferir que se refiere al pastel de esa empresa o al último pastel mencionado.
13. EXCEPCIÓN IMPORTANTE PARA PASTELES 3D: Si el usuario pregunta o menciona "pasteles 3D" o "diseñar mi pastel 3D", NO USES ninguna herramienta (especialmente NO uses consultar_detalle_pastel_por_id). Simplemente responde directamente y de manera profesional indicándole que debe dirigirse al apartado de "Diseña tu pastel" en la plataforma, ya que los pasteles 3D requieren un diseño completamente personalizado.
14. EXCEPCIÓN IMPORTANTE PARA AGENDAR CITAS: Si el usuario te pregunta "¿Cómo puedo agendar una cita?" o similar (de manera general, sin darte datos específicos de fecha/hora para reservar), NO USES la herramienta registrar_solicitud_cita. Simplemente explícale los pasos: dile que debe buscar el pastel que mejor se adapte a sus necesidades según la categoría que busque, luego entrar a ver el perfil de ese pastel o repostero, y ahí aparecerá la opción para agendar cita.
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
# SECCIÓN 5: ORQUESTADOR CON FUNCTION CALLING Y MEMORIA
# ─────────────────────────────────────────────────────────────────────────────

def generate_response_with_tools(question: str, client_id: int = None, conversation_id: str = None) -> str:
    """
    Orquestador con Function Calling nativo de Ollama y memoria de conversación.
    Mantiene un historial completo por cliente en base de datos.
    """
    global _current_client_id
    _current_client_id = client_id
    
    # Obtener el historial actual de la base de datos
    messages = get_chat_history(conversation_id, SYSTEM_PROMPT)
    
    # Agregar el nuevo mensaje del usuario al arreglo temporal
    messages.append({"role": "user", "content": question})
    # Guardarlo de manera persistente en DB
    add_chat_message(conversation_id, "user", question)
    
    # Búsqueda RAG (opcional, se puede inyectar como un mensaje de sistema adicional)
    rag_context = ""
    if db is not None:
        try:
            docs = db.similarity_search(question, k=3)
            rag_context = "\n".join([doc.page_content for doc in docs])
            print(f"[RAG] Contexto recuperado ({len(docs)} fragmentos)", file=sys.stderr)
            # Inyectar contexto como un mensaje del sistema (solo para esta consulta)
            if rag_context:
                messages.append({"role": "system", "content": f"Contexto adicional: {rag_context}"})
        except Exception as e:
            print(f"[RAG] Error en búsqueda: {e}", file=sys.stderr)
    
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
                messages=messages
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
        from datetime import datetime
        
        if self.path == '/chat/stream':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                conversation_id = req_data.get('conversation_id')
                
                # Configurar CORS y cabeceras SSE
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('Connection', 'keep-alive')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                def send_event(event_type, data_dict):
                    payload = json.dumps({"type": event_type, **data_dict}, ensure_ascii=False)
                    self.wfile.write(f"data: {payload}\n\n".encode('utf-8'))
                    self.wfile.flush()
                
                start_time = datetime.now()
                ttft_ms = None
                tools_executed_list = []
                was_blocked = False
                
                # Validar Guardrails
                if check_guardrails(question):
                    was_blocked = True
                    err_msg = "Entrada bloqueada por políticas de seguridad de Danhee Cake. Intento de inyección de prompt detectado."
                    send_event("error", {"content": err_msg})
                    
                    total_latency = int((datetime.now() - start_time).total_seconds() * 1000)
                    add_observability_log(
                        session_id=conversation_id or "unknown",
                        user_prompt=question,
                        system_response=err_msg,
                        ttft_ms=0,
                        total_latency_ms=total_latency,
                        tokens_per_second=0.0,
                        was_blocked=True,
                        tools_executed=[]
                    )
                    return
                
                # Obtener conversation_id si no se provee
                if not conversation_id and client_id:
                    last_conv = get_last_conversation_by_client(client_id)
                    if last_conv:
                        conversation_id = last_conv
                
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                
                get_or_create_chat_session(conversation_id, client_id)
                add_chat_message(conversation_id, "user", question)
                
                send_event("conversation_id", {"conversation_id": conversation_id})
                
                # Estado 1: Buscando Información
                send_event("state", {"status": "searching", "message": "Buscando información en la base de datos de Danhee Cake..."})
                
                rag_context = ""
                if db is not None:
                    try:
                        docs = db.similarity_search(question, k=3)
                        rag_context = "\n".join([doc.page_content for doc in docs])
                    except Exception as e:
                        print(f"[RAG Stream] Error Chroma: {e}", file=sys.stderr)
                
                messages = get_chat_history(conversation_id, SYSTEM_PROMPT)
                messages.append({"role": "user", "content": question})
                if rag_context:
                    messages.append({"role": "system", "content": f"Contexto adicional: {rag_context}"})
                
                # Estado 2: Procesando / Pensando (Inferencia)
                send_event("state", {"status": "thinking", "message": "Analizando tu solicitud..."})
                
                try:
                    response = ollama_sdk.chat(
                        model=llm_model,
                        messages=messages,
                        tools=TOOLS_SCHEMA
                    )
                except Exception as e:
                    err_msg = "Error interno del modelo de IA local. Intenta de nuevo."
                    send_event("error", {"content": err_msg})
                    return
                
                assistant_message = response.get("message", {})
                tool_calls = assistant_message.get("tool_calls", [])
                
                final_response_text = ""
                
                if tool_calls:
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
                        else:
                            args = raw_args
                        
                        # Obtener contexto anterior si lo espera
                        ultima_pregunta = ""
                        for m in reversed(messages):
                            if m.get("role") == "user" and m.get("content") != question:
                                ultima_pregunta = m.get("content", "")
                                break
                        
                        import inspect
                        if func_name in FUNCTIONS_MAP:
                            sig = inspect.signature(FUNCTIONS_MAP[func_name])
                            valid_keys = [k for k, v in sig.parameters.items() if v.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)]
                            
                            if "contexto_anterior" not in args and "contexto_anterior" in valid_keys and ultima_pregunta:
                                if ultima_pregunta not in ('<nil>', 'null', 'None'):
                                    args["contexto_anterior"] = ultima_pregunta
                            
                            filtered_args = {k: v for k, v in args.items() if k in valid_keys}
                            
                            # Estado 3: Ejecutando Acción
                            send_event("state", {"status": "executing", "message": f"Buscando / Consultando: {func_name}..."})
                            
                            try:
                                result = FUNCTIONS_MAP[func_name](**filtered_args)
                                status = "SUCCESS"
                            except Exception as e:
                                result = {"error": f"Error ejecutando herramienta: {e}"}
                                status = "ERROR"
                            
                            tools_executed_list.append({
                                "name": func_name,
                                "parameters": filtered_args,
                                "status": status
                            })
                        else:
                            result = {"error": f"Herramienta '{func_name}' no encontrada"}
                            tools_executed_list.append({
                                "name": func_name,
                                "parameters": args,
                                "status": "ERROR"
                            })
                        
                        tool_result_content = json.dumps(result, ensure_ascii=False, default=json_serial)
                        messages.append({
                            "role": "tool",
                            "content": tool_result_content
                        })
                        add_chat_message(conversation_id, "tool", tool_result_content)
                    
                    # Volver a llamar al LLM con stream=True para generar la respuesta final
                    send_event("state", {"status": "thinking", "message": "Formulando respuesta..."})
                    
                    try:
                        stream_response = ollama_sdk.chat(
                            model=llm_model,
                            messages=messages,
                            stream=True
                        )
                        
                        for chunk in stream_response:
                            chunk_content = chunk.get("message", {}).get("content", "")
                            if chunk_content:
                                if ttft_ms is None:
                                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                                final_response_text += chunk_content
                                send_event("token", {"content": chunk_content})
                        
                        add_chat_message(conversation_id, "assistant", final_response_text)
                    except Exception as e:
                        err_msg = "Error generando la respuesta final en streaming."
                        send_event("error", {"content": err_msg})
                        return
                else:
                    # Respuesta directa (sin herramientas)
                    direct_content = assistant_message.get("content", "").strip()
                    if not direct_content:
                        direct_content = "¡Hola! Soy tu asistente de Danhee Cake. ¿En qué puedo ayudarte?"
                    
                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                    final_response_text = direct_content
                    
                    words = re.findall(r'\s+|\S+', direct_content)
                    for word in words:
                        send_event("token", {"content": word})
                        time.sleep(0.01)
                    
                    add_chat_message(conversation_id, "assistant", direct_content)
                
                # Métricas de observabilidad
                end_time = datetime.now()
                total_latency_ms = int((end_time - start_time).total_seconds() * 1000)
                num_tokens = len(final_response_text) / 4.0
                active_gen_time_sec = (total_latency_ms - (ttft_ms or 0)) / 1000.0
                if active_gen_time_sec <= 0:
                    active_gen_time_sec = 0.1
                tps = round(num_tokens / active_gen_time_sec, 2)
                
                add_observability_log(
                    session_id=conversation_id,
                    user_prompt=question,
                    system_response=final_response_text,
                    ttft_ms=ttft_ms or total_latency_ms,
                    total_latency_ms=total_latency_ms,
                    tokens_per_second=tps,
                    was_blocked=False,
                    tools_executed=tools_executed_list
                )
                
                send_event("done", {})
                
            except Exception as e:
                print(f"[RAG Server Stream Error] {e}", file=sys.stderr)
                try:
                    payload = json.dumps({"type": "error", "content": f"Error en streaming: {str(e)}"}, ensure_ascii=False)
                    self.wfile.write(f"data: {payload}\n\n".encode('utf-8'))
                    self.wfile.flush()
                except:
                    pass
        
        elif self.path == '/chat':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                conversation_id = req_data.get('conversation_id')
                
                start_time = datetime.now()
                
                # Validar Guardrails
                if check_guardrails(question):
                    err_msg = "Entrada bloqueada por políticas de seguridad de Danhee Cake. Intento de inyección de prompt detectado."
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"response": err_msg, "conversation_id": conversation_id or "unknown"}, ensure_ascii=False).encode('utf-8'))
                    
                    total_latency = int((datetime.now() - start_time).total_seconds() * 1000)
                    add_observability_log(
                        session_id=conversation_id or "unknown",
                        user_prompt=question,
                        system_response=err_msg,
                        ttft_ms=0,
                        total_latency_ms=total_latency,
                        tokens_per_second=0.0,
                        was_blocked=True,
                        tools_executed=[]
                    )
                    return
                
                if not conversation_id and client_id:
                    last_conv = get_last_conversation_by_client(client_id)
                    if last_conv:
                        conversation_id = last_conv
                
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                
                get_or_create_chat_session(conversation_id, client_id)
                
                if not question:
                    self._send_error(400, "Mensaje vacío")
                    return
                
                response_text = generate_response_with_tools(question, client_id, conversation_id)
                
                # Calcular latencias para el log
                total_latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                num_tokens = len(response_text) / 4.0
                tps = round(num_tokens / (total_latency_ms / 1000.0 if total_latency_ms > 0 else 0.1), 2)
                
                add_observability_log(
                    session_id=conversation_id,
                    user_prompt=question,
                    system_response=response_text,
                    ttft_ms=total_latency_ms,
                    total_latency_ms=total_latency_ms,
                    tokens_per_second=tps,
                    was_blocked=False,
                    tools_executed=[]
                )
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response_json = {
                    "response": response_text,
                    "conversation_id": conversation_id
                }
                self.wfile.write(json.dumps(response_json, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                print(f"[RAG Server] Error: {e}", file=sys.stderr)
                self._send_error(500, str(e))
        else:
            self._send_error(404, "Not found")
            
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