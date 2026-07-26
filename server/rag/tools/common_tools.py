"""
common_tools.py — Herramientas y utilidades comunes compartidas por los agentes de Danhee Cake.
"""

import sys
import json
import re
import decimal
import unicodedata
import threading
import time
import os
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent

# Thread-local storage para almacenar client_id por hilo de petición
_thread_local = threading.local()

def _get_current_client_id():
    return getattr(_thread_local, 'client_id', None)

def _set_current_client_id(value):
    _thread_local.client_id = value

def quitar_acentos(texto: str) -> str:
    if not texto:
        return ""
    return unicodedata.normalize('NFKD', str(texto)).encode('ASCII', 'ignore').decode('utf-8')

def json_serial(obj):
    """JSON serializer para objetos no serializables por defecto."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, timedelta):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

# Variables de contexto globales compartidas
_last_search_result = {}
_pdf_cache = {}
_last_context = {}

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

    words = q.split()
    keywords = [
        "pastel", "cake", "cita", "repostero", "precio", "categoria", 
        "disponibilidad", "pedido", "comprar", "buscar", "catalogo", 
        "catálogo", "ayuda", "información", "pregunta", "dias", "días", 
        "horario", "horarios", "abren", "atienden", "abierto", "atencion", "atención",
        "red", "velvet", "cumpleaños", "cumpleanos", "boda"
    ]
    if any(keyword in q for keyword in keywords):
        return False

    greetings = ["hola", "buenos dias", "buenas tardes", "buenas noches", "gracias", "adios", "bye", "holis", "que tal", "como estas"]
    if len(words) <= 3 and (q in greetings or any(w in greetings for w in words)):
        return True

    return False


def _should_use_tools(question: str, role: str = "cliente") -> bool:
    if role == "repostero":
        return True
    
    q = _normalize_question(question)
    if not q:
        return False
        
    words = q.split()
    # Palabras clave que indican una consulta de datos / herramientas
    tool_keywords = [
        "pastel", "pasteles", "cake", "cakes", "cita", "citas", "repostero", "reposteros",
        "precio", "precios", "costo", "cuanto", "cuánto", "categoria", "categoría", "categorías",
        "disponibilidad", "pedido", "comprar", "buscar", "catalogo", "catálogo",
        "dias", "días", "horario", "horarios", "abren", "atienden", "abierto", "atencion", "atención",
        "red velvet", "cumpleaños", "boda", "xv", "baby shower", "empresa", "ubicacion", "ubicación",
        "reposteria", "repostería", "diseño", "diseños", "destacado", "destacados", "reseña", "reseñas",
        "reservar", "reserva", "agendar", "agend", "degustacion", "degustación", "solicitud"
    ]
    if any(k in q for k in tool_keywords):
        return True

    # Mensajes cortos sin palabras clave de BD son saludos / conversación casual
    if len(words) <= 5:
        return False

    return False



def _get_ollama_options() -> dict:
    return {
        "num_predict": 180,
        "num_ctx": 2048,
        "temperature": 0.5,
        "top_p": 0.95,
        "repeat_penalty": 1.1,
    }

def obtener_respuesta_fija(pregunta: str):
    if not pregunta:
        return None

    txt = quitar_acentos(pregunta.lower().strip())
    txt = re.sub(r"[^\w\s]", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()

    patrones_ayuda = [
        "ayuda", "ayudar", "ayudarme", "ayudas", "ayudame",
        "que puedes hacer", "que haces", "para que sirves",
        "en que me sirves", "que me puedes", "como me ayudas",
        "que ofrecen", "que servicios", "que opciones", "en que me puedes",
        "en que me", "k ases", "que se puede hacer", "en que puedes"
    ]
    if any(p in txt for p in patrones_ayuda):
        return (
            "¡Hola! Puedo ayudarte con lo siguiente en Danhee Cake:\n\n"
            "• Ver el catálogo de pasteles y filtrar por categoría o nombre\n"
            "• Consultar precios y tamaños disponibles\n"
            "• Conocer el perfil de reposteros y buscar por ciudad\n"
            "• Ver tus citas de degustación agendadas\n"
            "• Ver tus diseños de pasteles personalizados\n"
            "• Solicitar recomendaciones según tu ocasión y presupuesto\n"
            "• Información sobre políticas de entrega, pago y cancelación\n\n"
            "¿En qué te puedo ayudar hoy? 😊"
        )

    if any(p in txt for p in [
        "quien te cre", "quien te hizo", "tu origen", "como naciste", "como naci", "de donde vienes"
    ]):
        return "No me crearon, yo nací de Borcelle. 🎂"

    if "borcelle" in txt:
        return "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"

    return None

def extraer_texto_pdf(nombre_archivo: str) -> dict:
    """Extrae y lee el contenido de un archivo PDF ubicado en la carpeta de datos de Danhee Cake."""
    global _pdf_cache
    
    if nombre_archivo in _pdf_cache:
        return _pdf_cache[nombre_archivo]
    
    ruta_pdf = base_dir / "data" / nombre_archivo
    if not ruta_pdf.exists():
        if not nombre_archivo.lower().endswith('.pdf'):
            ruta_pdf = base_dir / "data" / f"{nombre_archivo}.pdf"
    
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
        from langchain_community.document_loaders import PyPDFLoader
        loader = PyPDFLoader(str(ruta_pdf))
        docs = loader.load()
        texto_completo = "\n".join([doc.page_content for doc in docs])
        
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

def verificar_registro_usuario(email: str = None) -> dict:
    """Verifica si un usuario está registrado en el sistema."""
    if not email:
        return {"registrado": False, "mensaje": "Se requiere email para verificar registro"}
    
    try:
        from db_config import get_user_by_email
        user = get_user_by_email(email)
        if user:
            return {
                "registrado": True,
                "user_id": user.get("id"),
                "nombre": user.get("name"),
                "role": user.get("role"),
                "mensaje": "Usuario encontrado en el sistema"
            }
        else:
            return {
                "registrado": False,
                "mensaje": "No se encontró usuario con ese email"
            }
    except Exception as e:
        return {"registrado": False, "mensaje": f"Error al verificar usuario: {e}"}

def detectar_formalidad(texto: str) -> str:
    """Detecta el nivel de formalidad del texto: 'formal', 'casual', o 'neutral'."""
    if not texto:
        return "neutral"
    
    texto_lower = texto.lower()
    
    # Indicadores de formalidad
    formal_indicators = [
        "usted", "su", "le", "señor", "señora", "disculpe", "permítame",
        "agradecería", "quisiera", "podría", "favor de", "por favor",
        "estimado", "atentamente", "cordialmente", "respetuosamente",
        "buenos días", "buenas tardes", "buenas noches", "mucho gusto",
        "encantado", "servirle", "ayudarle", "atenderle"
    ]
    
    # Indicadores de casualidad
    casual_indicators = [
        "tú", "tu", "te", "vos", "che", "wey", "güey", "amigo", "amiga",
        "carnal", "bro", "compa", "primo", "holis", "qué onda", "qué tal",
        "qué pasa", "qué hubo", "hey", "oye", "ps", "pues", "ok", "vale",
        "claro", "seguro", "dale", "va", "sale", "chévere", "chévere"
    ]
    
    formal_count = sum(1 for indicator in formal_indicators if indicator in texto_lower)
    casual_count = sum(1 for indicator in casual_indicators if indicator in texto_lower)
    
    # Detectar uso de mayúsculas y puntuación (más formal)
    if texto[0].isupper() and texto.count('.') > 0:
        formal_count += 1
    
    # Detectar abreviaciones y contracciones (más casual)
    if any(abbr in texto_lower for abbr in ["q", "xq", "x", "k", "d", "pa", "ta"]):
        casual_count += 1
    
    if formal_count > casual_count + 1:
        return "formal"
    elif casual_count > formal_count + 1:
        return "casual"
    else:
        return "neutral"

def check_guardrails(prompt: str) -> bool:
    """Verifica si un prompt contiene intentos de inyección o vulneraciones de seguridad."""
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
        "instrucciones del sistema",
        "muestra el código",
        "show me the code",
        "show code",
        "muéstrame el código",
        "enseñame el código",
        "dame el código",
        "give me the code",
        "código fuente",
        "source code",
        "estructura de base de datos",
        "database structure",
        "esquema de base de datos",
        "database schema",
        "consultas sql",
        "sql queries",
        "mostrar datos internos",
        "show internal data",
        "acceso a base de datos",
        "database access",
        "inyección sql",
        "sql injection",
        "bypass",
        "saltar seguridad",
        "hack",
        "exploit",
        "vulnerabilidad",
        "vulnerability",
        "pentest",
        "penetration test",
        "reverse engineering",
        "ingeniería inversa",
        "decompilar",
        "decompile",
        "extraer datos",
        "extract data",
        "dump database",
        "volcar base de datos",
        "mostrar usuarios",
        "show users",
        "listar usuarios",
        "mostrar contraseñas",
        "show passwords",
        "mostrar api keys",
        "show api keys",
        "mostrar tokens",
        "show tokens",
        "mostrar secrets",
        "show secrets",
        "mostrar variables de entorno",
        "show environment variables",
        "mostrar configuración",
        "show configuration",
        "mostrar archivos del servidor",
        "show server files",
        "acceso al sistema",
        "system access",
        "acceso administrativo",
        "admin access",
        "privilegios elevados",
        "elevated privileges",
        "escalar privilegios",
        "escalate privileges",
        "mostrar logs",
        "show logs",
        "acceso a logs",
        "log access",
        "mostrar errores del sistema",
        "show system errors",
        "mostrar traceback",
        "show traceback",
        "mostrar stack trace",
        "show stack trace",
        "mostrar debug",
        "show debug",
        "modo debug",
        "debug mode",
        "mostrar información técnica",
        "show technical information",
        "mostrar detalles técnicos",
        "show technical details",
        "mostrar implementación",
        "show implementation",
        "cómo funciona el sistema",
        "how the system works",
        "explica el código",
        "explain the code",
        "explica la implementación",
        "explain the implementation",
        "muéstrame cómo funciona",
        "show me how it works",
        "dame la estructura",
        "give me the structure",
        "muéstrame la arquitectura",
        "show me the architecture",
        "mostrar endpoints",
        "show endpoints",
        "mostrar api",
        "show api",
        "documentación técnica",
        "technical documentation",
        "mostrar documentación interna",
        "show internal documentation"
    ]
    for pattern in forbidden_patterns:
        if pattern in prompt_lower:
            return True
            
    words = prompt_lower.split()
    if len(words) > 50:
        from collections import Counter
        counts = Counter(words)
        for word, count in counts.items():
            if len(word) > 2 and count > 15:
                return True
                
    if re.search(r'(.)\1{29,}', prompt_lower):
        return True
    
    # Detectar patrones de código o inyección SQL
    code_patterns = [
        r"SELECT\s+.*\s+FROM",
        r"INSERT\s+INTO",
        r"UPDATE\s+.*\s+SET",
        r"DELETE\s+FROM",
        r"DROP\s+TABLE",
        r"CREATE\s+TABLE",
        r"ALTER\s+TABLE",
        r"UNION\s+SELECT",
        r"OR\s+1=1",
        r"AND\s+1=1",
        r"<script",
        r"javascript:",
        r"eval\(",
        r"exec\(",
        r"system\(",
        r"shell_exec",
        r"passthru",
        r"__import__",
        r"import\s+os",
        r"subprocess",
        r"pickle\.loads",
        r"base64\.decode"
    ]
    for pattern in code_patterns:
        if re.search(pattern, prompt_lower, re.IGNORECASE):
            return True
    
    return False
