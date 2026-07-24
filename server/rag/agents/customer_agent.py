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
    _set_cached_response, _get_ollama_options, obtener_respuesta_fija, quitar_acentos
)
from tools.registry import (
    TOOLS_SCHEMA, FUNCTIONS_MAP, _resolve_tool_name, _parse_tool_call_from_text
)

SYSTEM_PROMPT = """Eres el asistente virtual EXCLUSIVO de Danhee Cake, una plataforma web de repostería personalizada.
Tu NOMBRE es "Asistente Virtual de Danhee Cake".
Tu Único propósito es responder preguntas sobre Danhee Cake, sus pasteles, reposteros, precios, categorías, políticas y citas.

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
2. IDENTIFICACIÓN EXACTA DEL PASTEL (MUY IMPORTANTE):
   - Si el usuario pregunta por un pastel específico, extrae el nombre EXACTAMENTE tal como lo menciona el usuario (ej: si dice "pastel de fresa", usa nombre_pastel="pastel de fresa"; si dice "Red Velvet", usa nombre_pastel="Red Velvet"). NUNCA uses el nombre de otro pastel diferente aunque aparezca en el historial.
   - Si el usuario dice "dame más información del pastel de fresa", el nombre a buscar es "fresa" o "pastel de fresa", NO "Red Velvet 2 pisos" ni ningún otro.
   - USA OBLIGATORIAMENTE la herramienta `consultar_detalle_pastel_por_id` con el nombre_pastel correcto.
3. Si el usuario pregunta qué días abren, sus horarios o disponibilidad general de la repostería, USA `consultar_horarios_repostero`.
4. CATÁLOGO DE PASTELES: Cuando el cliente pida ver pasteles por categoría o en general, usa `consultar_pasteles_por_categoria` o `consultar_catalogo_pasteles`. La herramienta ya te devolverá los primeros 4 pasteles ordenados del más económico al más caro. Preséntaselos así.
5. PASTELES DESTACADOS: Usa `consultar_mas_destacados` ÚNICAMENTE cuando el cliente pida EXPLÍCITAMENTE ver los más destacados, populares, mejor calificados o con más reseñas. NO la uses si solo pide ver pasteles en general.
6. Si el usuario consulta sus citas o diseños agendados, USA `consultar_mis_citas` o `consultar_mis_disenos`.
7. PROCESO DE AGENDADO DE CITAS DE DEGUSTACIÓN (PASO A PASO PROFESIONAL):
   - Muestra los días y horario real de atención obtenidos del repostero.
   - Pide los datos paso a paso de forma profesional y conversacional.
   - NUNCA uses textos con corchetes o etiquetas de plantilla como '[Nombre del cliente]' o '[YYYY-MM-DD]'. Usa frases naturales como: "¿Para qué día te acomoda tu cita de degustación?".
   - ACEPTA fechas relativas como "el viernes de la siguiente semana", "mañana", "en 15 días" o fechas específicas. La herramienta convertirá automáticamente la fecha al calendario real.
   - ACEPTA nombres y datos con faltas de ortografía o sin tildes sin corregir al usuario.
   - Cuando el usuario te dé la fecha y hora, ejecuta la herramienta `registrar_solicitud_cita`. Si el horario solicitado está fuera del horario de atención del repostero, la herramienta indicará que está fuera de horario para que le pidas al usuario un horario válido.
8. Si te preguntan por políticas de entrega, pago o cancelación, USA `consultar_politicas_pasteleria`.

REGLAS DE RESPUESTA Y COMPORTAMIENTO:
- PROHIBICIÓN ABSOLUTA DE CÓDIGO: NUNCA incluyas en tus respuestas nombres de funciones, llamadas a herramientas, código Python/JSON, backticks (`), ni referencias técnicas de ningún tipo. Si quieres decir que buscaste algo, solo di el resultado. EJEMPLO PROHIBIDO: 'usa la función `consultar_detalle_pastel_por_id`'. EJEMPLO CORRECTO: 'Aquí está la información del pastel 🍰'.
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
"""


def _limpiar_respuesta(text: str) -> str:
    """Elimina backticks, código de herramientas, nombres de funciones internas, JSON crudo, excusas
    y frases de rechazo que el LLM pudiera colar en sus respuestas al usuario final."""
    if not text:
        return ""

    # 1. Eliminar bloques de código markdown completos (```...```)
    text = re.sub(r'```[\s\S]*?```', '', text)

    # 2. Detectar si el texto contiene excusas robóticas, rechazos o jerga técnica de herramientas
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
        r"funci[oó]n\s+`[a-z_]+`",        # 'función `nombre_funcion`'
        r"`[a-z_]{5,}`",                    # backtick-wrapped identifiers
        r"usando la funci[oó]n\b",
        r"utilizar(?:ía)? la funci[oó]n\b",
        r"llam(?:ar|ando) a la funci[oó]n\b",
        r"par[aá]metros\s+(?:se\s+)?pasen",
    ]
    
    t_lower = text.lower()
    if any(re.search(p, t_lower) for p in patrones_roboticos):
        return ""  # Retornar vacío para forzar la búsqueda fallback real en base de datos

    # 3. Eliminar llamadas a función en texto plano: fn_name(...)
    text = re.sub(r'[a_zA-Z0-9_]+\s*\([^)]*\)', '', text)

    # 4. Eliminar referencias con backticks: `nombre`
    text = re.sub(r'`[^`\n]{1,80}`', '', text)

    # 5. Eliminar nombres de funciones conocidas del FUNCTIONS_MAP
    try:
        from tools.registry import FUNCTIONS_MAP
        for fn in FUNCTIONS_MAP:
            if fn in text:
                text = text.replace(fn, '')
    except Exception:
        pass

    # 6. Eliminar bloques JSON/dict crudos ({...}) de hasta 400 chars
    text = re.sub(r'\{[^{}]{0,400}\}', '', text)

    # 7. Limpiar espacios y líneas vacías sobrantes
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()

    return text


def _intentar_busqueda_fallback(question: str):
    import re
    from tools.customer_tools import (
        consultar_detalle_pastel_por_id, consultar_origen_pastel, 
        consultar_pasteles_por_categoria, obtener_precios_por_categoria,
        consultar_horarios_repostero, get_cakes, quitar_acentos
    )
    
    q_norm = quitar_acentos(question.lower().strip())
    
    # 1. Si preguntan por horarios, días o atención de la repostería
    if any(k in q_norm for k in ["horario", "horarios", "dias", "días", "abren", "atienden", "abierto", "atencion", "atención"]):
        res = consultar_horarios_repostero()
        if res and "mensaje" in res:
            return res["mensaje"]

    # 2. Si preguntan por detalles/información de un pastel específico
    if any(k in q_norm for k in ["informacion", "informacio", "detalle", "detalles", "cuanto cuesta", "precio", "sobre el pastel", "del pastel", "red velvet"]):
        cakes = get_cakes()
        for c in cakes:
            c_name = c.get("name")
            if c_name:
                c_name_norm = quitar_acentos(c_name.lower())
                tokens_c = [w for w in c_name_norm.split() if w not in {'pastel', 'de', 'del', 'la', 'el', '2', 'pisos'}]
                if c_name_norm in q_norm or (tokens_c and all(w in q_norm for w in tokens_c)):
                    res = consultar_detalle_pastel_por_id(nombre_pastel=c_name)
                    if res and "mensaje" in res:
                        return res["mensaje"] + "\n\n¿Te gustaría agendar una cita de degustación para este pastel? 😊"

    # 3. Mapeo completo de categorías (cumpleaños, baby shower, xv años, boda, graduación, corporativo, infantil, aniversario, etc.)
    categorias_mapa = {
        "cumpleaños": ["cumpleanos", "cumpleaños", "cumple"],
        "baby shower": ["baby shower", "bebe", "bebes", "baby"],
        "xv años": ["xv anos", "xv años", "xv", "15 anos", "15 años", "quinceanera", "quinceañera"],
        "boda": ["boda", "bodas", "matrimonio"],
        "graduación": ["graduacion", "graduación", "graduados"],
        "corporativo": ["corporativo", "empresa", "empresarial"],
        "infantil": ["infantil", "ninos", "niños", "ninas", "niñas"],
        "aniversario": ["aniversario", "pareja", "amor"],
    }
    
    cat_matched = ""
    for cat_nombre, keywords in categorias_mapa.items():
        if any(kw in q_norm for kw in keywords):
            cat_matched = cat_nombre
            break
            
    if cat_matched:
        res = consultar_pasteles_por_categoria(categoria=cat_matched)
        if res and "mensaje" in res:
            msg = res["mensaje"]
            if re.search(r'\b\d+\s*(?:pesos|mxn)?\b', q_norm):
                msg = f"Actualmente nuestros precios de pasteles en Danhee Cake empiezan desde la mejor relación calidad-precio. " + msg
            return msg

    # 4. Si preguntan por pasteles en general o piden recomendaciones
    if any(k in q_norm for k in ["pastel", "pasteles", "recomend", "opciones", "catalogo", "catálogo", "tienes"]):
        res = consultar_pasteles_por_categoria(categoria="todas las ocasiones")
        if res and "mensaje" in res:
            return res["mensaje"]

    return None


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


def _interceptar_intencion_reserva(question: str, messages: list, client_id=None) -> str | None:
    """Si el usuario expresa intención de reservar una cita, guiarlo con lenguaje natural
    en vez de dejar que el LLM responda con texto técnico."""
    q = quitar_acentos(question.lower().strip())
    
    # Palabras clave que indican intención de reservar
    palabras_reserva = [
        "reservar", "reserva", "agendar", "agendo", "quiero una cita", "quiero agendar",
        "quiero reservar", "hacer una cita", "solicitar cita", "degustacion", "probar el pastel",
        "cuando puedo ir", "cuando puedo pasar", "quiero pasar", "ir a probar"
    ]
    
    es_reserva = any(p in q for p in palabras_reserva)
    # Caso especial: "quiero reservar la cita" o "quiero la cita"
    if not es_reserva and re.search(r'(quiero|deseo|me gustaria|me gustar[ií]a).{0,20}cita', q):
        es_reserva = True
    
    if not es_reserva:
        return None
    
    # Verificar si ya respondimos con el flujo de cita recientemente (evitar bucle)
    for m in reversed(messages[-4:]):
        content = str(m.get("content") or "").lower()
        if ("qué día" in content or "que dia" in content or
                "para qué fecha" in content or "para que fecha" in content or
                "exitosamente" in content or "cita registrada" in content):
            return None  # Ya estamos en el flujo, dejar que el LLM maneje
    
    # Extraer el pastel del contexto
    pastel = _extraer_pastel_de_historial(messages)
    
    # Construir la parte referente al pastel
    if pastel:
        ref_pastel = f" para el pastel **{pastel}**"
    else:
        ref_pastel = ""
    
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
    
    # Obtener horario real del repostero
    horario_info = ""
    try:
        from tools.customer_tools import consultar_horarios_repostero
        res_horario = consultar_horarios_repostero()
        if res_horario and res_horario.get("mensaje"):
            horario_info = f"\n\n{res_horario['mensaje']}"
    except Exception:
        pass
    
    return (
        f"¡Con gusto te agendo tu cita de degustación{ref_pastel}{saludo}! 🍰{horario_info}\n\n"
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
                options=_get_ollama_options(),
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
                    options=_get_ollama_options(),
                    keep_alive="5m"
                )
                final_content = final_response.get("message", {}).get("content", "").strip()
                if not final_content:
                    final_content = "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
                # Aplicar limpieza anti-código al resultado final
                final_content = _limpiar_respuesta(final_content)
                messages.append({"role": "assistant", "content": final_content})
                add_chat_message(conversation_id, "assistant", final_content)
                _set_cached_response(question, 'cliente', final_content, conversation_id)
                return final_content
            except Exception as e:
                return "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
        else:
            direct_content = assistant_message.get("content", "").strip()

            # ═══════════════════════════════════════════════════════════════════
            # FILTRO ANTI-JSON: si el LLM filtró JSON de tool-call como texto,
            # lo interceptamos, ejecutamos la herramienta y devolvemos respuesta
            # natural. Soporta JSON con objetos anidados (parameters, arguments).
            # ═══════════════════════════════════════════════════════════════════
            def _contiene_json_tool_call(text: str) -> bool:
                """Devuelve True si el texto parece ser un JSON de tool-call."""
                t = text.strip()
                if not t.startswith("{"):
                    return False
                # Buscar cualquiera de las claves características
                keywords = ['"type"', '"name"', '"function"', '"parameters"', '"arguments"']
                return any(kw in t for kw in keywords)

            def _extraer_y_ejecutar_tool(text: str):
                """Intenta parsear el JSON, ejecutar la herramienta y devolver respuesta natural."""
                import json as _json, inspect as _insp
                # Buscar el bloque JSON más externo usando balance de llaves
                start = text.find("{")
                if start == -1:
                    return None
                depth = 0
                end = -1
                for i, ch in enumerate(text[start:], start):
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            end = i
                            break
                if end == -1:
                    return None
                try:
                    data = _json.loads(text[start:end + 1])
                except _json.JSONDecodeError:
                    return None

                if not isinstance(data, dict):
                    return None

                # Extraer nombre de función
                fn_name = (
                    data.get("name") or
                    (data.get("function", {}).get("name") if isinstance(data.get("function"), dict) else None)
                )
                fn_name = _resolve_tool_name(fn_name or "")

                # Extraer argumentos (puede ser dict o string JSON)
                raw_args = (
                    data.get("parameters") or
                    data.get("arguments") or
                    (data.get("function", {}).get("arguments") if isinstance(data.get("function"), dict) else None) or
                    {}
                )
                if isinstance(raw_args, str):
                    try:
                        raw_args = _json.loads(raw_args)
                    except Exception:
                        raw_args = {}
                if not isinstance(raw_args, dict):
                    raw_args = {}

                if not fn_name or fn_name not in FUNCTIONS_MAP:
                    return None

                # Ejecutar la herramienta
                sig = _insp.signature(FUNCTIONS_MAP[fn_name])
                valid_keys = [k for k, v in sig.parameters.items() if v.kind in (_insp.Parameter.POSITIONAL_OR_KEYWORD, _insp.Parameter.KEYWORD_ONLY)]
                if client_id is not None and "client_id" in valid_keys and "client_id" not in raw_args:
                    raw_args["client_id"] = client_id
                filtered = {k: v for k, v in raw_args.items() if k in valid_keys}
                try:
                    result = FUNCTIONS_MAP[fn_name](**filtered)
                except Exception:
                    return None

                # Pedir al LLM que presente el resultado de forma natural
                tool_result_content = _json.dumps(result, ensure_ascii=False)
                tmp_messages = messages + [{"role": "tool", "content": tool_result_content}]
                try:
                    fr = ollama_sdk.chat(
                        model=self.llm_model,
                        messages=tmp_messages,
                        options=_get_ollama_options(),
                        keep_alive="5m"
                    )
                    return (fr.get("message", {}).get("content", "") or "").strip() or result.get("mensaje", "")
                except Exception:
                    return result.get("mensaje", "") or None

            if _contiene_json_tool_call(direct_content):
                ejecutado = _extraer_y_ejecutar_tool(direct_content)
                if ejecutado:
                    direct_content = ejecutado
                else:
                    direct_content = ""  # Forzar fallback
            # ═══════════════════════════════════════════════════════════════════

            search_fallback = _intentar_busqueda_fallback(question)
            if search_fallback:
                direct_content = search_fallback
            else:
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
            # ─────────────────────────────────────────────────────────────────────

            messages.append({"role": "assistant", "content": direct_content})
            add_chat_message(conversation_id, "assistant", direct_content)
            _set_cached_response(question, 'cliente', direct_content, conversation_id)
            return direct_content




def _intentar_busqueda_fallback(question: str):
    import re
    from tools.customer_tools import (
        consultar_detalle_pastel_por_id, consultar_origen_pastel, 
        consultar_pasteles_por_categoria, obtener_precios_por_categoria,
        get_cakes, quitar_acentos
    )
    
    q_norm = quitar_acentos(question.lower().strip())
    
    # 1. Si preguntan por detalles/información de un pastel específico
    if any(k in q_norm for k in ["informacion", "informacio", "detalle", "detalles", "cuanto cuesta", "precio", "sobre el pastel", "del pastel", "red velvet"]):
        cakes = get_cakes()
        for c in cakes:
            c_name = c.get("name")
            if c_name:
                c_name_norm = quitar_acentos(c_name.lower())
                tokens_c = [w for w in c_name_norm.split() if w not in {'pastel', 'de', 'del', 'la', 'el', '2', 'pisos'}]
                if c_name_norm in q_norm or (tokens_c and all(w in q_norm for w in tokens_c)):
                    res = consultar_detalle_pastel_por_id(nombre_pastel=c_name)
                    if res and "mensaje" in res:
                        return res["mensaje"] + "\n\n¿Te gustaría agendar una cita de degustación para este pastel? 😊"
                        
    # 2. Si preguntan por pasteles de una categoría o presupuesto (ej: "pasteles de cumpleaños de 100 pesos")
    if any(k in q_norm for k in ["cumpleanos", "cumpleaños", "boda", "xv años", "xv", "baby shower", "aniversario"]):
        cat_matched = ""
        for cat in ["cumpleaños", "boda", "xv años", "baby shower", "aniversario"]:
            if quitar_acentos(cat) in q_norm:
                cat_matched = cat
                break
        if cat_matched:
            res = consultar_pasteles_por_categoria(categoria=cat_matched)
            if res and "mensaje" in res:
                msg = res["mensaje"]
                if re.search(r'\b\d+\s*(?:pesos|mxn)?\b', q_norm):
                    msg = f"Actualmente nuestros precios de pasteles en Danhee Cake empiezan desde la mejor relación calidad-precio. " + msg
                return msg
                
    return None

def _intentar_autobooking(messages, question):
    import re

    # Si ya se agendó o recibió una cita en los últimos mensajes de la conversación, no re-agendar en bucle
    for m in reversed(messages[-6:]):
        content = str(m.get("content") or "")
        if "exitosamente" in content.lower() or "recibida" in content.lower() or "cita registrada" in content.lower():
            return None

    history_text = " ".join([str(m.get("content", "")) for m in messages if isinstance(m.get("content"), str)])
    
    match_fecha = re.search(r'\b(manana|pasado manana|hoy|en \d+ dias|(?:el )?(?:proximo |siguiente )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: de la (?:siguiente|proxima) semana)?|\d{4}-\d{2}-\d{2}|\d{1,2} de [a-z]+)\b', history_text, re.IGNORECASE)
    match_hora = re.search(r'\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b', history_text, re.IGNORECASE)

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

    match_pastel = re.search(r'\b(cherry delight|red velvet|chocolate|fresa|vainilla|explosion de mora|mora|mundo gatuno|amigos carinositos|fresita feliz|tres leches|zanahoria|limon|mango|nuez|oreo|cheesecake)\b', history_text, re.IGNORECASE)
    pastel_regex = match_pastel.group(1) if match_pastel else ""
    
    # Preferir el pastel extraído del historial real (más preciso)
    pastel = _extraer_pastel_de_historial(messages) or pastel_regex

    q_lower = question.lower().strip()
    es_intencion = any(k in history_text.lower() for k in ['agendar', 'cita', 'degustacion', 'reservar'])
    es_confirmacion = any(k in q_lower for k in ['si', 'correcto', 'ninguna', 'esta bien', 'confirmar', 'ok', 'adelante', 'mañana', 'manana', '8am', '9am', '10am', '10 am', '9:10', '9:10 am']) or bool(re.search(r'\d{1,2}\s*(?:am|pm)', q_lower))

    if es_intencion and es_confirmacion and match_fecha and match_hora:
        from tools.customer_tools import registrar_solicitud_cita
        res = registrar_solicitud_cita(
            client_name=nombre,
            fecha=match_fecha.group(1),
            hora=match_hora.group(1),
            notas=f"Pastel: {pastel.title()}" if pastel else "Cita desde Asistente Virtual"
        )
        return res.get("mensaje")
    return None
