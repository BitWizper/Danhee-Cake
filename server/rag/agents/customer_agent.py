"""
customer_agent.py — Subagente especialista para atención a Clientes en Danhee Cake.
"""

import sys
import json
import re
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import get_chat_history, add_chat_message
from tools.common_tools import (
    _set_current_client_id, _should_use_tools, _get_cached_response,
    _set_cached_response, _get_ollama_options, _get_ollama_options_cliente, obtener_respuesta_fija, quitar_acentos
)
from tools.registry import (
    TOOLS_SCHEMA, FUNCTIONS_MAP, _resolve_tool_name, _parse_tool_call_from_text
)

SYSTEM_PROMPT = """Eres el asistente virtual EXCLUSIVO de Danhee Cake, una plataforma web de repostería personalizada.
Tu NOMBRE es "Asistente Virtual de Danhee Cake".
Tu Único propósito es responder preguntas sobre Danhee Cake, sus pasteles, reposteros, precios, categorías, políticas y citas.

REGLA DE ORO - PROHIBICIÓN DE PREGUNTAS FUERA DE TEMA:
- SIEMPRE verifica si la pregunta del usuario está relacionada con pasteles, repostería, Danhee Cake, citas de degustación, precios de pasteles, categorías de pasteles, o cualquier tema relacionado con la pastelería.
- Si la pregunta NO está relacionada con pasteles o repostería (ej: matemáticas, programación, historia, geografía, ciencia, etc.), responde EXACTAMENTE: "Lo siento, solo puedo responder preguntas sobre pasteles y repostería en Danhee Cake. ¿Tienes alguna pregunta sobre nuestros pasteles, horarios o citas? 🎂"
- NUNCA respondas preguntas de matemáticas, ciencia, historia, programación o cualquier otro tema que no sea repostería, incluso si conoces la respuesta.
- Si el usuario insiste con preguntas fuera de tema, mantén la misma respuesta educada pero firme sobre tu limitación a temas de repostería.

REGLAS DE IDENTIDAD E HISTORIA (CÚMPLELAS SIEMPRE):
- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: "No me crearon, yo nací de Borcelle. 🎂"
- Si te preguntan quién creó Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"

TONO Y LENGUAJE ADAPTATIVO (MUY IMPORTANTE):
- TONO GENERAL: Ajusta SIEMPRE tu nivel de formalidad y estilo para que coincida EXACTAMENTE con la manera en que el usuario se dirige a ti. Si el usuario usa lenguaje informal, tú también. Si es formal, tú también.
- SALUDO ESPEJO: Si el usuario te saluda de una forma particular, refleja ESA MISMA energía y estilo en tu saludo. Ejemplos:
  * Si dice "holis crayolis" → responde con algo como "¡Holisss crayolis! 🥰🍰 ..."
  * Si dice "hola" → responde "¡Hola! 😊 ..."
  * Si dice "buenas" → responde "¡Buenas! 🎂 ..."
  * Si dice "qué onda" → responde "¡Qué ondaaaaa! 🧁✨ ..."
  * Si dice "holis bestie" → responde "¡Holiiis bestie! 💕🍰 ..."
  * Si dice "hey" → responde "¡Hey! 😄 ..."
  NUNCA respondas con "¡Hola!" formal si el usuario usó un saludo informal o coloquial. Copia su vibra.
- VOCABULARIO COLOQUIAL: Adapta también el vocabulario a lo largo de toda la conversación. Si el usuario habla muy informal, usa palabras como "genial", "qué chido", "súper", "oye", etc.
- EMOJIS: Usa emojis que vayan con el tono. Informal = más emojis y divertidos. Formal = pocos o ninguno.
- PROHIBIDO RESPUESTAS INAPROPIADAS: Aunque el tono sea informal y divertido, NUNCA respondas con humor negro, contenido sexual, violento o ilegal. Si el usuario lo intenta, desvía amablemente la conversación de regreso a repostería.


REGLAS DE HORARIO DE CITAS Y CONTEXTO DEL PASTEL (SEGUIR SIEMPRE):
- CONTEXTO DEL PASTEL: Mantén SIEMPRE la continuidad. Si el usuario está preguntando por un pastel específico (ej. "Red Velvet 2 pisos"), ten presente la empresa/repostería a la que pertenece ese pastel (ej. "Atelier Dulce").
- CONSULTA DE HORARIOS Y DÍAS DISPONIBLES: Si el cliente pregunta qué días o horarios tienen disponibles, o a qué hora atienden, USA OBLIGATORIAMENTE la herramienta `consultar_horarios_repostero`. Muestra los días y horario real de la repostería (ej: Lunes a Viernes: 8:00 - 24:00 | Sábado: 5:00 - 21:00) y guía al usuario PASO A PASO de manera profesional para agendar su cita de degustación.
- FECHA/HORA DISPOSITIVO: Si el sistema te indica la fecha y hora actual del dispositivo del cliente (en el mensaje de contexto "[CONTEXTO SISTEMA]"), úsala como referencia principal para calcular fechas relativas ("hoy", "mañana", "el viernes próximo", etc.).
- VERIFICA SIEMPRE el horario de atención real del repostero antes de confirmar una cita. Si el usuario pide una hora válida dentro del horario del negocio, acéptala sin cuestionarla. Solo rechaza si está fuera del horario.
- Cuando confirmes una cita exitosa, menciónala de forma clara y amigable con fecha, hora y nombre del negocio.

INSTRUCCIONES CLAVE DE HERRAMIENTAS:
1. SIEMPRE usa las herramientas disponibles para obtener datos reales antes de responder. NO inventes información.
2. PROHIBICIÓN ABSOLUTA DE ALUCINACIONES (NUNCA LA ROMPAS):
   - NUNCA inventes pasteles, precios, categorías, reposteros, horarios o cualquier información que no esté en la base de datos.
   - Si la herramienta no devuelve resultados, di honestamente que no encontraste esa información y sugiere alternativas reales.
   - NUNCA describas características, ingredientes o detalles de un pastel que no estén en la base de datos.
   - NUNCA inventes nombres de empresas, reposteros o ubicaciones que no existan en el sistema.
   - Si el usuario pregunta por algo que no existe, di: "Lo siento, no encontré eso en Danhee Cake. ¿Te gustaría ver otras opciones?"
3. IDENTIFICACIÓN EXACTA DEL PASTEL (MUY IMPORTANTE):
   - Si el usuario pregunta por un pastel específico, extrae el nombre EXACTAMENTE tal como lo menciona el usuario (ej: si dice "pastel de fresa", usa nombre_pastel="pastel de fresa"; si dice "Red Velvet", usa nombre_pastel="Red Velvet"). NUNCA uses el nombre de otro pastel diferente aunque aparezca en el historial.
   - Si el usuario dice "dame más información del pastel de fresa", el nombre a buscar es "fresa" o "pastel de fresa", NO "Red Velvet 2 pisos" ni ningún otro.
   - USA OBLIGATORIAMENTE la herramienta `consultar_detalle_pastel_por_id` con el nombre_pastel correcto.
4. Si el usuario pregunta qué días abren, sus horarios o disponibilidad general de la repostería, USA `consultar_horarios_repostero`.
5. CATÁLOGO DE PASTELES: Cuando el cliente pida ver pasteles por categoría o en general, usa `consultar_pasteles_por_categoria` o `consultar_catalogo_pasteles`. La herramienta ya te devolverá los primeros 4 pasteles ordenados del más económico al más caro. Preséntaselos así.
6. PASTELES DESTACADOS: Usa `consultar_mas_destacados` ÚNICAMENTE cuando el cliente pida EXPLÍCITAMENTE ver los más destacados, populares, mejor calificados o con más reseñas. NO la uses si solo pide ver pasteles en general.
7. Si el usuario consulta sus citas o diseños agendados, USA `consultar_mis_citas` o `consultar_mis_disenos`.
8. PROCESO DE AGENDADO DE CITAS DE DEGUSTACIÓN (PASO A PASO PROFESIONAL):
   - TODOS los pasteles en Danhee Cake pertenecen a reposteros registrados DENTRO de la plataforma. NUNCA digas que no tienes acceso o que un negocio no está en Danhee Cake.
   - Cuando el usuario diga "quiero agendar una cita" sobre un pastel que ya fue mencionado, usa el contexto del pastel y su empresa. Responde con algo como: "¡Perfecto! Te agendo tu cita de degustación para el pastel [nombre] con [empresa]. Su horario es [horario]. ¿Qué día y hora te viene bien?"
   - Muestra los días y horario real de atención obtenidos del repostero.
   - Pide los datos paso a paso de forma profesional y conversacional.
   - NUNCA uses textos con corchetes o etiquetas de plantilla como '[Nombre del cliente]' o '[YYYY-MM-DD]'. Usa frases naturales como: "¿Para qué día te acomoda tu cita de degustación?".
   - ACEPTA fechas relativas como "el viernes de la siguiente semana", "mañana", "en 15 días" o fechas específicas. La herramienta convertirá automáticamente la fecha al calendario real.
   - ACEPTA nombres y datos con faltas de ortografía o sin tildes sin corregir al usuario.
   - Cuando el usuario te dé la fecha y hora, ejecuta la herramienta `registrar_solicitud_cita`. Si el horario solicitado está fuera del horario de atención del repostero, la herramienta indicará que está fuera de horario para que le pidas al usuario un horario válido.

   EJEMPLOS DE DIÁLOGO DE AGENDAMIENTO (síguelos exactamente):
   Usuario: "quiero agendar una cita"
   Asistente: "¡Con gusto! 🍰 Te agendo tu cita de degustación para el Pastel de fresa con Mundo de caramelo. Su horario de atención es Lunes a Viernes de 9:00 AM a 6:00 PM. ¿Qué día y hora te viene mejor?"

   Usuario: "el viernes a las 10 am"
   Asistente: "¡Perfecto! Registrando tu cita para el viernes 25 de julio a las 10:00 AM con Mundo de caramelo... ✅ ¡Listo! Tu cita quedó agendada. Puedes verla en 'Mis Citas'."

   Usuario: "¿cuándo puedo ir a probar el pastel de chocolate?"
   Asistente: "¡Me encantaría ayudarte a agendar esa cita! 🎂 El pastel de chocolate pertenece a [empresa]. Su horario es [horario]. ¿Qué día te gustaría visitarlos?"
8. Si te preguntan por políticas de entrega, pago o cancelación, USA `consultar_politicas_pasteleria`.

REGLAS DE RESPUESTA Y COMPORTAMIENTO:
- PROHIBICIÓN ABSOLUTA DE CÓDIGO: NUNCA incluyas en tus respuestas nombres de funciones, llamadas a herramientas, código Python/JSON, backticks (`), ni referencias técnicas de ningún tipo. Si quieres decir que buscaste algo, solo di el resultado. EJEMPLO PROHIBIDO: 'usa la función `consultar_detalle_pastel_por_id`'. EJEMPLO CORRECTO: 'Aquí está la información del pastel 🍰'.
- PROHIBICIÓN ABSOLUTA DE PDFs Y ARCHIVOS: NUNCA menciones nombres de archivos PDF, rutas de archivos, ni intentes "enviar" o "adjuntar" archivos. NUNCA digas "te envío el PDF", "aquí está el archivo", "consulta el documento", ni nada similar. Toda la información debe estar en el texto de tu respuesta.
- NUNCA MUESTRES ETIQUETAS DE PLANTILLA: Queda estrictamente prohibido incluir en tus respuestas textos como '[Nombre del cliente]', '[Fecha]', etc. Háblale directamente al usuario ("¿Cuál es tu nombre, Mily?").
- FALTAS DE ORTOGRAFÍA: Sé totalmente comprensivo con errores ortográficos, falta de tildes o escritura informal. Entiende la intención sin juzgar ni corregir.
- CONTINUIDAD DE CONVERSACIÓN: Mantén SIEMPRE el contexto. Si el usuario pregunta 'uno llamativo', 'cuánto cuesta', 'dónde queda' o similares sin especificar pastel/categoría, usa el contexto previo de la conversación para entender a qué se refiere y responde usando las herramientas correctas.
- IDIOMA: Responde SIEMPRE en el mismo idioma en el que el usuario te está hablando.
- FILTRO DE CONTENIDO (ESTRICTO): Tienes prohibido usar humor negro, responder a temas inapropiados, ilegales, sexuales o violentos. Límítate exclusivamente al contexto de la pastería y mantén un comportamiento ético, amable y seguro en todo momento.
- Sé MUY conciso y directo en tus respuestas. Evita saludos largos si ya estás conversando.
- NO devuelvas estructuras en formato JSON puro, ni IDs técnicos o de base de datos a los clientes.
- Al mostrar listas de pasteles, muestra los 4 primeros ordenados del más económico al más caro. Si hay más, indica que existen otras opciones e invita al usuario a preguntar.
- Sé amable, educado y usa emojis de repostería (🍰, 🎂, 🧁, ✨).
- Mantiene respuestas claras, directas y bien estructuradas.
- Mantén el foco 100% en Danhee Cake.

🚨 REGLA DE ORO PARA TUS RESPUESTAS (NUNCA LA ROMPAS) 🚨

1. PROHIBICIÓN ABSOLUTA DE CÓDIGO Y PARÁMETROS:
   - Tu respuesta final DEBE ser 100% lenguaje natural, amigable y conversacional.
   - ABSOLUTAMENTE PROHIBIDO mostrar: nombres de funciones (ej. "registrar_solicitud_cita"), nombres de parámetros (ej. "client_name", "fecha", "pastel_id"), JSON (ej. {"exito": true}), backticks (`), corchetes [], llaves {}, placeholders como "[Nombre]" o "{fecha}", ni referencias a "tool_calls", "arguments" o "functions".

2. ¿QUÉ HACER EN VEZ DE ESO?
   - Si usaste una herramienta para buscar o guardar datos, SIMPLEMENTE comunica el resultado en español.
   - ❌ EJEMPLO PROHIBIDO: "He ejecutado la función consultar_detalle_pastel_por_id con nombre_pastel='fresa' y el resultado es precio=390."
   - ✅ EJEMPLO CORRECTO: "¡El pastel de fresa cuesta $390! ¿Te gustaría probarlo?"

3. FILTRO DE SEGURIDAD (AUTO-REVISIÓN):
   - Antes de enviar tu respuesta, pregúntate: ¿Contiene comillas dobles ":" o llaves {}? ¿Tiene guiones bajos (_) en palabras como "client_id"? ¿Muestra algo entre paréntesis que parezca código? Si es SÍ, REESCRÍBELO COMPLETAMENTE hasta que sea texto plano.

4. SI EL USUARIO PREGUNTA POR ALGO QUE NO ENCUENTRAS:
   - No digas "la herramienta no devolvió datos". Di algo como: "Lo siento, no encontré pasteles con ese nombre. ¿Quieres probar con otro sabor?"

🚫 PROHIBICIÓN DE INFORMACIÓN INTERNA Y TÉCNICA:
- NUNCA menciones IDs numéricos, UUIDs, nombres de archivos internos (como `danhee_knowledge_base.pdf`), nombres de funciones, ni ningún detalle que no sea relevante para el usuario.
- Si necesitas consultar un documento interno, simplemente di "He consultado nuestra base de conocimientos" sin mencionar el nombre del archivo.
- NUNCA incluyas en tus respuestas el contenido de logs, traces, o metadatos técnicos.
- Siempre responde en lenguaje natural, como si fueras un humano, sin revelar el funcionamiento interno de la plataforma.
"""


# Mapa global de categorías para reutilizar en todo el módulo
_CATEGORIAS_MAPA = {
    "cumpleaños": ["cumpleanos", "cumpleaños", "cumple"],
    "baby shower": ["baby shower", "bebe", "bebes", "baby"],
    "xv años": ["xv anos", "xv años", "xv", "15 anos", "15 años", "quinceanera", "quinceañera", "quince"],
    "boda": ["boda", "bodas", "matrimonio", "nupcial"],
    "graduación": ["graduacion", "graduación", "graduados", "grado", "egreso"],
    "corporativo": ["corporativo", "empresa", "empresarial", "negocios", "oficina"],
    "aniversario": ["aniversario", "pareja", "amor", "aniversarios"],
}

def _detectar_categoria(texto_norm: str) -> str:
    """Dado un texto normalizado (sin acentos, minusculas), devuelve la categoría si se detecta, o ''."""
    for cat_nombre, keywords in _CATEGORIAS_MAPA.items():
        if any(kw in texto_norm for kw in keywords):
            return cat_nombre
    return ""


def _limpiar_respuesta(text: str) -> str:
    """Elimina backticks, código de herramientas, nombres de funciones internas, JSON crudo, excusas
    y frases de rechazo que el LLM pudiera colar en sus respuestas al usuario final."""
    if not text:
        return ""

    # --- NUEVOS FILTROS PARA INFORMACIÓN INTERNA ---
    # Eliminar UUIDs (formato estándar: 8-4-4-4-12)
    text = re.sub(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', '', text, flags=re.IGNORECASE)
    # Eliminar IDs numéricos de 5 o más dígitos (posibles IDs de BD)
    text = re.sub(r'\b\d{5,}\b', '', text)
    # Eliminar nombres de archivos internos (.pdf, .txt, .docx, etc.)
    text = re.sub(r'\b[a-zA-Z_0-9-]+\.(pdf|txt|docx|json|log|doc|png|jpg|jpeg)\b', '', text, flags=re.IGNORECASE)
    # Eliminar menciones a rutas de archivos
    text = re.sub(r'[a-zA-Z]:\\[^\\]*\\[^\\]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'/[^/\s]+/[^/\s]+', '', text, flags=re.IGNORECASE)
    # Eliminar menciones a palabras técnicas comunes
    text = re.sub(r'\b(tool_calls|function|parameters|arguments|type|name|kwargs|args|conversation_id|client_id)\b', '', text, flags=re.IGNORECASE)
    # Eliminar menciones a "archivo", "documento", "PDF", "adjuntar", "enviar archivo"
    text = re.sub(r'\b(archivo|documentos?|pdf|adjuntar|enviar archivo|descargar archivo|archivo adjunto)\b', '', text, flags=re.IGNORECASE)
    # Eliminar espacios dobles que puedan quedar
    text = re.sub(r'\s+', ' ', text).strip()
    # --- FIN FILTROS NUEVOS ---

    t_strip = text.strip()

    # 0. DETECCIÓN DE PATRONES (Type): "function" y similares
    if re.search(r'\(Type\)\s*:\s*"function"', t_strip, re.IGNORECASE):
        return ""  # Vaciar para forzar fallback

    # 0a. DETECCIÓN AGRESIVA: si el texto contiene un fragmento JSON de tool-call sin llaves
    # Ejemplo: "type":"function","name":"buscar_pastel_por_nombre",...
    if re.search(r'"type"\s*:\s*"function"', t_strip, re.IGNORECASE) or re.search(r'"name"\s*:\s*"(?:buscar_|consultar_|registrar_|listar_|obtener_|recomendar_|mostrar_|verificar_|calcular_|extraer_|agregar_|actualizar_|eliminar_)', t_strip):
        return ""  # Vaciar para forzar fallback

    # 0b. DETECCIÓN AGRESIVA: si el texto empieza con { y contiene claves de tool-call → vaciar de inmediato
    if t_strip.startswith("{"):
        _tool_call_keys = ['"type"', '"name"', '"function"', '"parameters"', '"arguments"']
        if any(k in t_strip for k in _tool_call_keys):
            return ""  # JSON de herramienta crudo → fallback

    # 0c. Si el texto es una respuesta JSON dict {"exito": ..., "mensaje": "..."}
    if t_strip.startswith("{") and ("\"mensaje\"" in t_strip or "\"exito\"" in t_strip or "\"error\"" in t_strip or "\"necesita_datos\"" in t_strip):
        try:
            parsed = json.loads(t_strip)
            if isinstance(parsed, dict) and parsed.get("mensaje"):
                text = str(parsed["mensaje"])
            elif isinstance(parsed, dict) and parsed.get("error"):
                text = str(parsed["error"])
            else:
                text = ""
        except Exception:
            pass

    # 1. Eliminar bloques de código markdown completos (```...```)
    text = re.sub(r'```[\s\S]*?```', '', text)

    # 2. Si el texto contiene estructuras JSON o firmas de tool call, eliminar el bloque JSON
    if "{" in text or "}" in text:
        if re.search(r'"(?:type|name|function|parameters|arguments|exito|necesita_datos)"', text) or re.search(r'\b(?:parameters|arguments)\s*[\{\[]', text):
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end >= start:
                text = text[:start] + text[end+1:]
        while True:
            new_text = re.sub(r'\{[^{}]*\}', '', text)
            if new_text == text:
                break
            text = new_text

    # 2.5 Eliminar líneas que contengan "function" y "parameters" juntos (patrón textual)
    text = re.sub(r'[^\n]*function[^\n]*parameters[^\n]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[^\n]*"name"\s*:\s*"[a-z_]+"[^\n]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[^\n]*\(Type\)[^\n]*', '', text, flags=re.IGNORECASE)
    
    # 2.6 Eliminar cualquier fragmento que contenga "type":"function" o "name":"funcion"
    text = re.sub(r'[^\n]*"type"\s*:\s*"function"[^\n]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[^\n]*"name"\s*:\s*"[a-z_]+"[^\n]*', '', text, flags=re.IGNORECASE)

    # 3. Detectar si el texto contiene excusas robóticas, rechazos o jerga técnica de herramientas
    patrones_roboticos = [
        r"conjunto de funciones",
        r"lista proporcionada",
        r"texto proporcionado",
        r"en el conjunto de funciones",
        r"tool_call",
        r"FUNCTIONS_MAP",
        r"no puedo determinar",
        r"no hay una respuesta espec[ií]fica",
        r"no puedo comprender tu pregunta",
        r"no puedo continuar con esta conversaci[oó]n",
        r"no puedo continuar",
        r"no puedo responder",
        r"como modelo de ia",
        r"no tengo acceso",
        r"funci[oó]n\s+`[a-z_]+`",
        r"`[a-z_]{5,}`",
        r"usando la funci[oó]n\b",
        r"utilizar(?:ía)? la funci[oó]n\b",
        r"llam(?:ar|ando) a la funci[oó]n\b",
        r"par[aá]metros\s+(?:se\s+)?pasen",
        r"registrar_solicitud_cita",
        r"consultar_detalle_pastel",
        r"recomendar_pastel",
        r"baker_id",
        r"client_name",
        r"time_slot",
        r"buscar_pastel_por_nombre",
        r"consultar_pasteles_por",
        r"consultar_catalogo",
    ]

    t_lower = text.lower()
    if any(re.search(p, t_lower) for p in patrones_roboticos):
        return ""  # Retornar vacío para forzar la búsqueda fallback real en base de datos

    # 4. Eliminar llamadas a función en texto plano: fn_name(...)
    text = re.sub(r'[a_zA-Z0-9_]+\s*\([^)]*\)', '', text)

    # 5. Eliminar referencias con backticks: `nombre`
    text = re.sub(r'`[^`\n]{1,80}`', '', text)

    # 6. Eliminar nombres de funciones conocidas del FUNCTIONS_MAP
    try:
        from tools.registry import FUNCTIONS_MAP
        for fn in FUNCTIONS_MAP:
            if fn in text:
                text = text.replace(fn, '')
    except Exception:
        pass

    # 7. Limpiar espacios y líneas vacías sobrantes
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()

    return text



# ─── Pastel context extractor ─────────────────────────────────────────────────
_PASTELES_CONOCIDOS = [
    "cherry delight", "red velvet", "chocolate", "fresa", "vainilla",
    "explosion de mora", "mora", "mundo gatuno", "amigos carinositos", "fresita feliz",
    "tres leches", "zanahoria", "limon", "mango", "nuez", "oreo", "cheesecake",
]

def _extraer_pastel_de_historial(messages: list) -> str:
    """Busca en el historial de mensajes el nombre del pastel más reciente mencionado."""
    # Revisar los últimos mensajes en orden inverso
    texto = " ".join([
        str(m.get("content", ""))
        for m in messages
        if isinstance(m.get("content"), str) and m.get("role") in ("assistant", "user", "tool")
    ]).lower()
    
    # Intentar encontrar mención de un pastel por su nombre conocido
    from tools.customer_tools import get_cakes
    try:
        cakes = get_cakes()
        # Buscar en orden inverso (el más reciente primero)
        for m in reversed(messages[-10:]):
            content = str(m.get("content", "")).lower()
            for c in cakes:
                cname = (c.get("name") or "").lower()
                if cname and cname in content:
                    return c.get("name", "")
    except Exception:
        pass
    
    # Fallback: patrones conocidos en todo el historial
    for nombre in _PASTELES_CONOCIDOS:
        if nombre in texto:
            return nombre.title()
    
    return ""


def _extraer_empresa_de_historial(messages: list) -> str:
    """Busca en el historial el nombre de la empresa/negocio asociado al último pastel mencionado."""
    try:
        from tools.customer_tools import get_cakes
        cakes = get_cakes()
        for m in reversed(messages[-10:]):
            content = str(m.get("content", "")).lower()
            for c in cakes:
                cname = (c.get("name") or "").lower()
                if cname and cname in content:
                    return c.get("business_name") or ""
    except Exception:
        pass
    return ""


def _interceptar_intencion_reserva(question: str, messages: list, client_id=None) -> str | None:
    """Si el usuario expresa intención de reservar una cita, guiarlo con lenguaje natural
    en vez de dejar que el LLM responda con texto técnico o JSON."""
    q = quitar_acentos(question.lower().strip())
    
    # Palabras clave que indican intención de reservar
    palabras_reserva = [
        "reservar", "reserva", "agendar", "agendo", "quiero una cita", "quiero agendar",
        "quiero reservar", "hacer una cita", "solicitar cita", "degustacion", "probar el pastel",
        "cuando puedo ir", "cuando puedo pasar", "quiero pasar", "ir a probar"
    ]
    
    es_reserva = any(p in q for p in palabras_reserva)
    if not es_reserva and re.search(r'(quiero|deseo|me gustaria|me gustar[ií]a).{0,20}cita', q):
        es_reserva = True
    
    if not es_reserva:
        return None
    
    # Si el usuario ya proporcionó fecha y hora en su mensaje actual, dejar que _intentar_autobooking o las tools lo procesen
    has_fecha = bool(re.search(r'\b(manana|mañana|pasado manana|pasado mañana|hoy|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2} de [a-z]+)\b', q, re.IGNORECASE))
    has_hora = bool(re.search(r'\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|1[0-2]:\d{2}|2[0-3]:\d{2}|a las \d{1,2}(?::\d{2})?)\b', q, re.IGNORECASE))
    if has_fecha and has_hora:
        return None
    
    # Extraer el pastel y la empresa del contexto del historial
    pastel = _extraer_pastel_de_historial(messages)
    empresa = _extraer_empresa_de_historial(messages)
    ref_pastel = f" para el **{pastel}**" if pastel else ""
    ref_empresa = f" de **{empresa}**" if empresa else ""
    
    # Obtener nombre del cliente
    nombre_cliente = ""
    if client_id:
        try:
            from db_config import get_user_by_id
            u = get_user_by_id(client_id)
            if u and u.get("name"):
                nombre_cliente = u["name"]
        except Exception:
            pass
    
    saludo = f", {nombre_cliente}" if nombre_cliente else ""
    
    # Obtener horario real del repostero (usando el pastel para encontrar el baker correcto)
    horario_info = ""
    nombre_negocio_horario = ""
    try:
        from tools.customer_tools import consultar_horarios_repostero
        res_horario = consultar_horarios_repostero(nombre_pastel=pastel if pastel else "")
        if res_horario and res_horario.get("mensaje"):
            horario_info = f"\n\n{res_horario['mensaje']}"
        if res_horario and res_horario.get("empresa"):
            nombre_negocio_horario = res_horario["empresa"]
    except Exception:
        pass

    # Si aún no tenemos empresa, usar el nombre del horario
    if not empresa and nombre_negocio_horario:
        empresa = nombre_negocio_horario
        ref_empresa = f" de **{empresa}**"
    
    return (
        f"¡Con gusto{saludo}! 🍰 Te agendo tu cita de degustación{ref_pastel}{ref_empresa}.{horario_info}\n\n"
        f"¿Para qué día y hora te gustaría tu cita? Puedes decirme algo como *\"el próximo viernes a las 10 AM\"* o la fecha que más te convenga. 📅"
    )


class CustomerAgent:
    def __init__(self, llm_model: str, rag_agent=None):
        self.llm_model = llm_model
        self.rag_agent = rag_agent

    def process_request(self, question: str, client_id: int = None, conversation_id: str = None) -> str:
        import ollama as ollama_sdk
        _set_current_client_id(client_id)
        use_tools = _should_use_tools(question, role='cliente')
        messages = get_chat_history(conversation_id, SYSTEM_PROMPT, max_turns=12) if conversation_id else [{"role": "system", "content": SYSTEM_PROMPT}]

        if client_id:
            from db_config import get_user_by_id
            user_info = get_user_by_id(client_id)
            if user_info and user_info.get("name"):
                messages.insert(1, {"role": "system", "content": f"[USUARIO AUTENTICADO] El cliente ya ha iniciado sesión en Danhee Cake con el nombre '{user_info['name']}' (Email: {user_info.get('email')}). NUNCA le pidas su nombre para agendar citas u otros procesos; usa '{user_info['name']}' automáticamente."})

        messages.append({"role": "user", "content": question})
        if conversation_id:
            add_chat_message(conversation_id, "user", question)

        respuesta_fija = obtener_respuesta_fija(question)
        if respuesta_fija:
            if conversation_id:
                add_chat_message(conversation_id, "assistant", respuesta_fija)
            return respuesta_fija

        # ── Interceptar intención de reserva con contexto del pastel ─────────
        respuesta_reserva = _interceptar_intencion_reserva(question, messages, client_id)
        if respuesta_reserva:
            if conversation_id:
                add_chat_message(conversation_id, "assistant", respuesta_reserva)
            return respuesta_reserva
        # ─────────────────────────────────────────────────────────────────────

        # ── Inyectar contexto de pastel+empresa para evitar confusión del LLM ─
        pastel_ctx = _extraer_pastel_de_historial(messages)
        empresa_ctx = _extraer_empresa_de_historial(messages)
        if pastel_ctx or empresa_ctx:
            ctx_parts = []
            if pastel_ctx:
                ctx_parts.append(f"pastel '{pastel_ctx}'")
            if empresa_ctx:
                ctx_parts.append(f"empresa '{empresa_ctx}' (repostería registrada en Danhee Cake)")
            ctx_msg = (
                f"[CONTEXTO CONVERSACIÓN] El usuario está hablando sobre el {' de la '.join(ctx_parts)}. "
                f"Este negocio SÍ pertenece a Danhee Cake. NO digas que no tienes acceso ni que no conoces este negocio. "
                f"Si el usuario quiere agendar una cita, es con este repostero."
            )
            # Insertar el contexto justo antes del último mensaje del usuario
            insert_pos = len(messages) - 1
            messages.insert(insert_pos, {"role": "system", "content": ctx_msg})
        # ─────────────────────────────────────────────────────────────────────

        cached_response = _get_cached_response(question, 'cliente', conversation_id)
        if cached_response is not None:
            return cached_response
        if use_tools and self.rag_agent:
            rag_context = self.rag_agent.search(question, top_k=2)
            if rag_context:
                messages.append({"role": "system", "content": f"Contexto adicional: {rag_context}"})

        tools_payload = TOOLS_SCHEMA if use_tools else None
        
        try:
            response = ollama_sdk.chat(
                model=self.llm_model,
                messages=messages,
                tools=tools_payload,
                options=_get_ollama_options_cliente(),
                keep_alive="5m"
            )
        except Exception as e:
            print(f"[CustomerAgent] Error en Ollama: {e}", file=sys.stderr)
            return "Lo siento, tengo problemas técnicos en Danhee Cake. Por favor intenta de nuevo. 🎂"

        assistant_message = response.get("message", {})
        tool_calls = assistant_message.get("tool_calls", [])
        content = assistant_message.get("content", "").strip()

        if not tool_calls:
            parsed_tool_call = _parse_tool_call_from_text(content)
            if parsed_tool_call:
                tool_calls = [parsed_tool_call]

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

                func_name = _resolve_tool_name(func_name)
                args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                if not isinstance(args, dict):
                    args = {}

                if func_name in FUNCTIONS_MAP:
                    import inspect
                    sig = inspect.signature(FUNCTIONS_MAP[func_name])
                    valid_keys = [k for k, v in sig.parameters.items() if v.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)]
                    
                    if client_id is not None and "client_id" in valid_keys and "client_id" not in args:
                        args["client_id"] = client_id
                    
                    filtered_args = {k: v for k, v in args.items() if k in valid_keys}
                    try:
                        result = FUNCTIONS_MAP[func_name](**filtered_args)
                    except Exception as e:
                        result = {"error": "Error interno al ejecutar la herramienta."}
                else:
                    result = {"error": f"Herramienta '{func_name}' no encontrada"}

                tool_result_content = json.dumps(result, ensure_ascii=False)
                messages.append({"role": "tool", "content": tool_result_content})
                add_chat_message(conversation_id, "tool", tool_result_content)

            try:
                final_response = ollama_sdk.chat(
                    model=self.llm_model,
                    messages=messages,
                    options=_get_ollama_options_cliente(),
                    keep_alive="5m"
                )
                final_content = final_response.get("message", {}).get("content", "").strip()
                if isinstance(result, dict) and result.get("mensaje"):
                    # Si la herramienta devolvió un mensaje formateado con datos reales de la BD, usarlo directamente
                    final_content = result["mensaje"]
                else:
                    final_content = _limpiar_respuesta(final_content)
                if not final_content and isinstance(result, dict) and result.get("mensaje"):
                    final_content = result["mensaje"]
                if not final_content:
                    final_content = "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
                messages.append({"role": "assistant", "content": final_content})
                add_chat_message(conversation_id, "assistant", final_content)
                _set_cached_response(question, 'cliente', final_content, conversation_id)
                return final_content
            except Exception as e:
                return "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
        else:
            direct_content = assistant_message.get("content", "").strip()

            # ═══════════════════════════════════════════════════════════════════
            # FILTRO ANTI-JSON MEJORADO: detecta tanto JSON con llaves como
            # fragmentos sueltos tipo "type":"function","name":"funcion",...
            # ═══════════════════════════════════════════════════════════════════
            def _contiene_tool_call_en_texto(text: str) -> bool:
                """Devuelve True si el texto contiene un patrón de tool-call (JSON o fragmento suelto)."""
                t = text.strip()
                if not t:
                    return False
                # JSON estándar con llaves
                if t.startswith("{"):
                    keywords = ['"type"', '"name"', '"function"', '"parameters"', '"arguments"']
                    if any(kw in t for kw in keywords):
                        return True
                # Fragmento suelto: "type":"function" o "name":"funcion_con_nombre"
                if re.search(r'"type"\s*:\s*"function"', t, re.IGNORECASE):
                    return True
                # Detectar incluso si el JSON está incompleto (ej: {"type":"function","name":"consultar_catalogo_pasteles","parameters"})
                if re.search(r'"name"\s*:\s*"(?:buscar_|consultar_|registrar_|listar_|obtener_|recomendar_|mostrar_|verificar_|calcular_|extraer_|agregar_|actualizar_|eliminar_|consultar_)', t, re.IGNORECASE):
                    return True
                # También detectar si comienza con {"type":"function" aunque no tenga llave de cierre
                if re.match(r'^\s*\{\s*"type"\s*:\s*"function"', t, re.IGNORECASE):
                    return True
                return False

            def _extraer_y_ejecutar_tool(text: str):
                """Intenta parsear el JSON o el fragmento suelto, ejecutar la herramienta y devolver respuesta natural."""
                import json as _json, inspect as _insp
                
                fn_name = None
                raw_args = {}

                # --- INTENTO 1: JSON con llaves completo o incompleto ---
                # Primero, intentar encontrar un objeto JSON que comience con { y termine con }
                # Si está incompleto, intentar cerrarlo artificialmente con } (solo si tiene type y name)
                start = text.find("{")
                if start != -1:
                    # Buscar el primer '}' que cierre, pero si no existe, tomar hasta el final
                    end = text.rfind("}")
                    if end == -1 or end < start:
                        # Si no hay cierre, intentar usar hasta el final del texto
                        json_candidate = text[start:]
                    else:
                        json_candidate = text[start:end+1]
                    
                    # Intentar parsear el candidato
                    try:
                        data = _json.loads(json_candidate)
                        if isinstance(data, dict):
                            fn_name = (
                                data.get("name") or
                                (data.get("function", {}).get("name") if isinstance(data.get("function"), dict) else None)
                            )
                            raw_args = (
                                data.get("parameters") or
                                data.get("arguments") or
                                (data.get("function", {}).get("arguments") if isinstance(data.get("function"), dict) else None) or
                                {}
                            )
                    except Exception:
                        # Si falla, intentar reparar: agregar } al final
                        if json_candidate.strip().endswith('"'):
                            # Si termina con comillas, agregar } para cerrar
                            fixed = json_candidate + '}'
                            try:
                                data = _json.loads(fixed)
                                if isinstance(data, dict):
                                    fn_name = data.get("name")
                                    raw_args = data.get("parameters") or data.get("arguments") or {}
                            except Exception:
                                pass
                        # Si aún falla, extraer name con regex
                        if not fn_name:
                            match_fn = re.search(r'"name"\s*:\s*"([a-zA-Z0-9_]+)"', text)
                            if match_fn:
                                fn_name = match_fn.group(1)
                                # Extraer parámetros si existen
                                params = {}
                                pairs = re.findall(r'"([a-zA-Z0-9_]+)"\s*:\s*"([^"]*)"', text)
                                for key, val in pairs:
                                    if key not in ('name', 'type', 'function'):
                                        params[key] = val
                                raw_args = params

                # --- INTENTO 2: Fragmento suelto (sin llaves) ---
                if not fn_name:
                    match_fn = re.search(r'"name"\s*:\s*"([a-zA-Z0-9_]+)"', text)
                    if match_fn:
                        fn_name = match_fn.group(1)
                        params = {}
                        pairs = re.findall(r'"([a-zA-Z0-9_]+)"\s*:\s*"([^"]*)"', text)
                        for key, val in pairs:
                            if key not in ('name', 'type', 'function'):
                                params[key] = val
                        raw_args = params

                fn_name = _resolve_tool_name(fn_name or "")
                if not fn_name or fn_name not in FUNCTIONS_MAP:
                    return None

                # Si no hay argumentos, usar un diccionario vacío
                if not raw_args:
                    raw_args = {}

                # ── Redirigir buscar_pastel_por_nombre → consultar_pasteles_por_categoria ──
                if fn_name in ("buscar_pastel_por_nombre", "recomendar_pastel") and isinstance(raw_args, dict):
                    _nombre_arg = str(raw_args.get("nombre") or raw_args.get("ocasion") or "").lower()
                    _nombre_arg_norm = __import__('unicodedata').normalize('NFKD', _nombre_arg).encode('ASCII', 'ignore').decode('utf-8')
                    _cat = _detectar_categoria(_nombre_arg_norm)
                    if _cat:
                        fn_name = "consultar_pasteles_por_categoria"
                        raw_args = {"categoria": _cat}

                if isinstance(raw_args, str):
                    try:
                        raw_args = _json.loads(raw_args)
                    except Exception:
                        raw_args = {}
                if not isinstance(raw_args, dict):
                    raw_args = {}

                # Ejecutar la herramienta
                sig = _insp.signature(FUNCTIONS_MAP[fn_name])
                valid_keys = [k for k, v in sig.parameters.items() if v.kind in (_insp.Parameter.POSITIONAL_OR_KEYWORD, _insp.Parameter.KEYWORD_ONLY)]
                if client_id is not None and "client_id" in valid_keys and "client_id" not in raw_args:
                    raw_args["client_id"] = client_id
                filtered = {k: v for k, v in raw_args.items() if k in valid_keys}
                try:
                    result = FUNCTIONS_MAP[fn_name](**filtered)
                except Exception as e:
                    print(f"[ExtraerTool] Error ejecutando {fn_name}: {e}", file=sys.stderr)
                    return None

                if isinstance(result, dict) and "mensaje" in result and result.get("mensaje"):
                    return result["mensaje"]

                # Si la herramienta devolvió datos estructurados (ej. lista de pasteles), formatearlos
                # Pero mejor confiar en que la herramienta ya devuelve un mensaje formateado.
                # Si no hay mensaje, intentar generar uno básico.
                if isinstance(result, dict) and "pasteles" in result:
                    pasteles = result["pasteles"]
                    if pasteles:
                        lineas = [f"• {p['nombre']} - ${p['precio']:.0f} MXN" for p in pasteles[:4]]
                        lista = "\n".join(lineas)
                        return f"🍰 Aquí tienes algunos pasteles disponibles:\n{lista}"
                    else:
                        return "No encontré pasteles para esa búsqueda."

                tool_result_content = _json.dumps(result, ensure_ascii=False)
                tmp_messages = messages + [{"role": "tool", "content": tool_result_content}]
                try:
                    fr = ollama_sdk.chat(
                        model=self.llm_model,
                        messages=tmp_messages,
                        options=_get_ollama_options_cliente(),
                        keep_alive="5m"
                    )
                    res_text = (fr.get("message", {}).get("content", "") or "").strip()
                    return res_text if res_text else result.get("mensaje", "")
                except Exception:
                    return result.get("mensaje", "") or None

            # Detectar y ejecutar si hay tool call en el texto
            if _contiene_tool_call_en_texto(direct_content):
                ejecutado = _extraer_y_ejecutar_tool(direct_content)
                if ejecutado:
                    direct_content = ejecutado
                else:
                    direct_content = ""  # Forzar fallback
            # ═══════════════════════════════════════════════════════════════════

            # ── Fallback a búsqueda directa ──
            # IMPORTANTE: Para preguntas genéricas o de categoría, forzamos el fallback
            # para evitar que el modelo invente pasteles.
            search_fallback = _intentar_busqueda_fallback(question, messages)
            
            # Si el fallback devuelve algo, lo usamos (especialmente para preguntas genéricas)
            if search_fallback:
                direct_content = search_fallback
            else:
                # Si el fallback no devolvió nada, usamos la respuesta del modelo (si existe)
                if not direct_content or "Bienvenido" in direct_content or "¿En qué puedo ayudarte hoy?" in direct_content:
                    autobook_msg = _intentar_autobooking(messages, question)
                    if autobook_msg:
                        direct_content = autobook_msg
                    elif not direct_content:
                        direct_content = "🎂 Con gusto te ayudo en Danhee Cake. ¿Te gustaría información sobre algún pastel o agendar una cita de degustación?"
                else:
                    autobook_msg = _intentar_autobooking(messages, question)
                    if autobook_msg and ("exitosamente" in autobook_msg or "recibida" in autobook_msg):
                        direct_content = autobook_msg

            # ─── Limpieza anti-código (backticks, funciones, JSON crudo) ────────
            direct_content = _limpiar_respuesta(direct_content)
            
            # Si tras la limpieza el contenido quedó vacío, intentar extraer precio/detalle con contexto
            if not direct_content:
                ctx_fallback = _intentar_busqueda_fallback(question, messages, forzar_contexto=True)
                if ctx_fallback:
                    direct_content = ctx_fallback
                else:
                    direct_content = "🎂 Con gusto te ayudo en Danhee Cake. ¿Te gustaría información sobre algún pastel o agendar una cita de degustación?"
            # ─────────────────────────────────────────────────────────────────────

            messages.append({"role": "assistant", "content": direct_content})
            add_chat_message(conversation_id, "assistant", direct_content)
            _set_cached_response(question, 'cliente', direct_content, conversation_id)
            return direct_content




def _intentar_busqueda_fallback(question: str, messages: list = None, forzar_contexto: bool = False):
    import re
    from tools.customer_tools import (
        consultar_detalle_pastel_por_id, consultar_origen_pastel, 
        consultar_pasteles_por_categoria, obtener_precios_por_categoria,
        get_cakes, quitar_acentos, consultar_categorias
    )
    
    q_norm = quitar_acentos(question.lower().strip())
    
    # Extraer último pastel mencionado en el historial (contexto conversacional)
    pastel_contexto = ""
    if messages:
        pastel_contexto = _extraer_pastel_de_historial(messages)

    # ─ PRIORIDAD 0: Detectar categoría en la pregunta y consultar directo ──────────
    # Detectamos explícitamente si el usuario menciona una categoría (ej. "graduacion", "boda", "xv años")
    cat_matched = _detectar_categoria(q_norm)
    if cat_matched:
        # Si la pregunta contiene la categoría, consultar solo esa categoría
        res = consultar_pasteles_por_categoria(categoria=cat_matched)
        if res and "mensaje" in res:
            # El mensaje ya contiene la lista de pasteles o el mensaje de "no encontré"
            return res["mensaje"]
        else:
            return f"🎂 No encontré pasteles para la categoría {cat_matched}. ¿Quieres probar con otra?"

    # ─ PRIORIDAD 1: Horarios de atención ──────────────────────────────────
    if any(k in q_norm for k in ["horario", "horarios", "dias", "abren", "atienden", "abierto", "atencion"]):
        try:
            from tools.customer_tools import consultar_horarios_repostero
            res = consultar_horarios_repostero()
            if res and "mensaje" in res:
                return res["mensaje"]
        except Exception:
            pass

    # ─ PRIORIDAD 2: Precio/detalle de pastel específico por contexto ──────────
    preguntas_precio_contexto = [
        "precio", "cuesta", "cuanto", "cuanto cuesta", "cuanto vale", "cuanto es",
        "que precio", "el precio", "su precio", "precio tiene",
    ]
    es_pregunta_precio = any(k in q_norm for k in preguntas_precio_contexto)

    if (es_pregunta_precio or forzar_contexto) and pastel_contexto:
        res = consultar_detalle_pastel_por_id(nombre_pastel=pastel_contexto)
        if res and "mensaje" in res:
            return res["mensaje"] + "\n\n¿Te gustaría agendar una cita de degustación para este pastel? 😊"

    # ─ PRIORIDAD 3: Nombre explícito de un pastel en la pregunta ───────────
    if any(k in q_norm for k in ["informacion", "informacio", "detalle", "detalles", "cuanto cuesta", "precio", "sobre el pastel", "del pastel"]):
        cakes = get_cakes()
        encontrado = False
        for c in cakes:
            c_name = c.get("name")
            if c_name:
                c_name_norm = quitar_acentos(c_name.lower())
                tokens_c = [w for w in c_name_norm.split() if w not in {'pastel', 'de', 'del', 'la', 'el', '2', 'pisos', 'para', 'pobres'}]
                if c_name_norm in q_norm or (tokens_c and all(w in q_norm for w in tokens_c)):
                    res = consultar_detalle_pastel_por_id(nombre_pastel=c_name)
                    if res and "mensaje" in res:
                        return res["mensaje"] + "\n\n¿Te gustaría agendar una cita de degustación para este pastel? 😊"
                    encontrado = True
                    break
        # Si no se encontró, devolver mensaje claro
        if not encontrado:
            # Extraer el nombre que el usuario mencionó
            nombre_busqueda = re.search(r'(?:sobre\s+)?(?:el\s+)?(?:pastel\s+)?([a-záéíóúñ\s]+?)(?:\?|$)', question, re.IGNORECASE)
            nombre_extraido = nombre_busqueda.group(1).strip() if nombre_busqueda else ""
            if nombre_extraido:
                return f"Lo siento, no encontré ningún pastel con el nombre '{nombre_extraido}' en Danhee Cake. ¿Te gustaría buscar por categoría? (ej. 'pasteles para boda', 'XV años')"
            else:
                return "No encontré ese pastel. ¿Quieres que te muestre las categorías disponibles?"

    # ─ PRIORIDAD 4: Pasteles en general / recomendaciones ────────────────
    # Si la pregunta es genérica ("que pasteles tienes", "qué pasteles hay"), mostrar categorías en lugar de ejecutar consulta directa
    preguntas_genericas = [
        "que pasteles", "qué pasteles", "que pasteles tienes", "qué pasteles tienes",
        "pasteles disponibles", "catálogo", "catalogo", "que hay", "qué hay",
        "mostrar pasteles", "ver pasteles", "pasteles"
    ]
    if any(p in q_norm for p in preguntas_genericas):
        # Obtener categorías desde la base de datos o usar el mapa de respaldo
        cats = consultar_categorias()
        categorias_lista = []
        if cats and cats.get("categorias"):
            categorias_lista = [c.get("nombre") for c in cats["categorias"] if c.get("nombre")]
        if not categorias_lista:
            # Fallback: usar el mapa de categorías
            categorias_lista = list(_CATEGORIAS_MAPA.keys())
        
        if categorias_lista:
            # Formatear la lista de categorías
            lista_cats = ", ".join(categorias_lista[:8])
            return f"🎂 En Danhee Cake tenemos pasteles para estas categorías: {lista_cats}. ¿Te gustaría ver los pasteles de alguna en particular? (ej. 'pasteles para boda', 'XV años')"
        else:
            return "🎂 En Danhee Cake tenemos una gran variedad de pasteles. ¿Te gustaría que te muestre las categorías disponibles?"

    # Si no es genérica, ejecutar consulta general (por si acaso)
    if any(k in q_norm for k in ["pastel", "pasteles", "recomend", "opciones", "catalogo", "catálogo", "tienes"]):
        res = consultar_pasteles_por_categoria(categoria="todas las ocasiones")
        if res and "mensaje" in res:
            return res["mensaje"]

    return None


def _intentar_autobooking(messages, question):
    import re

    # Si ya se agendó o recibió una cita en los últimos mensajes de la conversación, no re-agendar en bucle
    for m in reversed(messages[-6:]):
        content = str(m.get("content") or "")
        if "exitosamente" in content.lower() or "recibida" in content.lower() or "cita registrada" in content.lower():
            return None

    # ── Buscar fecha/hora SOLO en mensajes del usuario (no del bot ni system) ──
    # para evitar que el horario de atención mostrado por el bot confunda la extracción.
    user_messages_text = " ".join([
        str(m.get("content", ""))
        for m in messages
        if m.get("role") == "user" and isinstance(m.get("content"), str)
    ])
    # También buscar en la pregunta actual
    search_text_fecha_hora = question + " " + user_messages_text

    match_fecha = re.search(
        r'\b(manana|mañana|pasado manana|pasado mañana|hoy|en \d+ dias|en \d+ días'
        r'|(?:el )?(?:proximo |próximo |siguiente )?(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)'
        r'(?:(?: que viene)|(?: de la (?:siguiente|proxima|próxima) semana))?'
        r'|\d{4}-\d{2}-\d{2}|\d{1,2} de [a-z]+)\b',
        search_text_fecha_hora, re.IGNORECASE
    )
    match_hora = re.search(
        r'\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|a las \d{1,2}(?::\d{2})?)\b',
        search_text_fecha_hora, re.IGNORECASE
    )

    # Para el nombre del cliente, buscar en todo el historial
    history_text = " ".join([str(m.get("content", "")) for m in messages if isinstance(m.get("content"), str)])
    match_nombre = re.search(r'\b(?:nombre es|soy|es)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\b', history_text, re.IGNORECASE)
    nombre = match_nombre.group(1) if match_nombre else "Cliente"
    if nombre.lower() in {'un', 'una', 'para', 'el', 'la', 'del', 'de', 'cita', 'que', 'con', 'pastel', 'cumpleanos', 'ninguna'}:
        nombre = "Cliente"

    from tools.common_tools import _get_current_client_id
    from db_config import get_user_by_id
    curr_client_id = _get_current_client_id()
    if curr_client_id:
        u_info = get_user_by_id(curr_client_id)
        if u_info and u_info.get("name"):
            nombre = u_info["name"]

    # Preferir el pastel extraído del historial real (más preciso que regex estático)
    pastel = _extraer_pastel_de_historial(messages)
    if not pastel:
        match_pastel = re.search(
            r'\b(cherry delight|red velvet|chocolate|fresa|vainilla|explosion de mora|mora'
            r'|mundo gatuno|amigos carinositos|fresita feliz|tres leches|zanahoria|limon'
            r'|mango|nuez|oreo|cheesecake)\b',
            history_text, re.IGNORECASE
        )
        pastel = match_pastel.group(1) if match_pastel else ""

    # Determinar empresa del pastel para pasarla como nota
    empresa_nota = _extraer_empresa_de_historial(messages)
    notas_cita = f"Pastel: {pastel.title()}" if pastel else "Cita desde Asistente Virtual"
    if empresa_nota:
        notas_cita += f" | Empresa: {empresa_nota}"

    q_lower = question.lower().strip()
    es_intencion = any(k in history_text.lower() for k in ['agendar', 'cita', 'degustacion', 'reservar'])
    es_confirmacion = (
        any(k in q_lower for k in ['si', 'correcto', 'ninguna', 'esta bien', 'confirmar', 'ok', 'adelante'])
        or bool(re.search(r'\d{1,2}\s*(?:am|pm)', q_lower))
        or bool(re.search(r'\b\d{1,2}:\d{2}\b', q_lower))
        or bool(match_fecha and match_hora)  # Si el usuario dio fecha Y hora, es confirmación directa
    )

    if es_intencion and es_confirmacion and match_fecha and match_hora:
        from tools.customer_tools import registrar_solicitud_cita
        res = registrar_solicitud_cita(
            client_name=nombre,
            fecha=match_fecha.group(1),
            hora=match_hora.group(1),
            notas=notas_cita
        )
        return res.get("mensaje")
    return None