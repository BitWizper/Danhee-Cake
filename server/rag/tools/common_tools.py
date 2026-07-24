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
        r"\bayud",
        r"que puedes hacer",
        r"funciones",
        r"como me ayudas",
        r"que haces",
        r"en ke me",
        r"k ases",
        r"que me puedes",
        r"como te puedo",
        r"en que puedes ayudar",
        r"como te ayud"
    ]
    if any(re.search(p, txt) for p in patrones_ayuda):
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

    if any(re.search(p, txt) for p in [
        r"quien te cre", r"quien te hizo", r"tu origen", r"como naciste", r"como naci", r"de donde vienes"
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
        "instrucciones del sistema"
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
    return False
