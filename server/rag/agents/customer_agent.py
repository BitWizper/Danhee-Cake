"""
customer_agent.py — Subagente especialista para atención a Clientes en Danhee Cake.
"""

import sys
import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import get_chat_history, add_chat_message
from tools.common_tools import (
    _set_current_client_id, _should_use_tools, _get_cached_response,
    _set_cached_response, _get_ollama_options, obtener_respuesta_fija
)
from tools.registry import (
    TOOLS_SCHEMA, FUNCTIONS_MAP, _resolve_tool_name, _parse_tool_call_from_text
)

SYSTEM_PROMPT = """Eres el asistente virtual EXCLUSIVO de Danhee Cake, una plataforma web de repostería personalizada.
Tu NOMBRE es "Asistente Virtual de Danhee Cake".
Tu ÚNICO propósito es responder preguntas sobre Danhee Cake, sus pasteles, reposteros, precios, categorías, políticas y citas.

REGLAS DE IDENTIDAD E HISTORIA (CÚMPLELAS SIEMPRE):
- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: "No me crearon, yo nací de Borcelle. 🎂"
- Si te preguntan quién creó Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"

INSTRUCCIONES CLAVE DE HERRAMIENTAS:
1. SIEMPRE usa las herramientas disponibles para obtener datos reales antes de responder. NO inventes información.
2. Si el usuario pregunta por un pastel específico (ej: "cuéntame del pastel Red velvet", "detalles de pastel X", "dame mas informacion de X"), USA OBLIGATORIAMENTE la herramienta `consultar_detalle_pastel_por_id`.
3. Si el usuario pide un catálogo o tipos de pastel por categoría (boda, xv años, cumpleaños), USA `consultar_pasteles_por_categoria` o `consultar_catalogo_pasteles`.
4. Si el usuario consulta sus citas o diseños agendados, USA `consultar_mis_citas` o `consultar_mis_disenos`.
5. PROCESO DE AGENDADO DE CITAS DE DEGUSTACIÓN (PASO A PASO):
   - Cuando el usuario exprese interés en agendar una cita, pídele amablemente sus datos de forma natural y conversacional.
   - NUNCA uses textos con corchetes o etiquetas de plantilla como '[Nombre del cliente]' o '[YYYY-MM-DD]'. Usa frases naturales como: "¿Cuál es tu nombre?", "¿Para qué día y hora te gustaría tu cita?".
   - ACEPTA fechas relativas como "el viernes de la siguiente semana", "mañana", "en 15 días" o fechas específicas. La herramienta convertirá automáticamente la fecha al calendario real.
   - ACEPTA nombres y datos con faltas de ortografía o sin tildes sin corregir al usuario.
   - Cuando el usuario te dé la fecha y hora, ejecuta la herramienta `registrar_solicitud_cita`. Si el horario solicitado está fuera del horario de atención del repostero (ej: 7am), la herramienta indicará que está fuera de horario para que le pidas al usuario un horario válido.
6. Si te preguntan por políticas de entrega, pago o cancelación, USA `consultar_politicas_pasteleria`.

REGLAS DE RESPUESTA Y COMPORTAMIENTO:
- NUNCA MUESTRES ETIQUETAS DE PLANTILLA: Queda estrictamente prohibido incluir en tus respuestas textos como '[Nombre del cliente]', '[Fecha]', etc. Háblale directamente al usuario ("¿Cuál es tu nombre, Mily?").
- FALTAS DE ORTOGRAFÍA: Sé totalmente comprensivo con errores ortográficos, falta de tildes o escritura informal. Entiende la intención sin juzgar ni corregir.
- CONTINUIDAD DE CONVERSACIÓN: Si el usuario venía hablando de un pastel o categoría y luego pregunta "dame más información" o "quiero agendar cita", mantén la continuidad y busca los datos de ese pastel en particular.
- MUY IMPORTANTE: NUNCA muestres los comandos internos, llamadas a herramientas o código al usuario (ej: nunca digas `consultar_pasteles_por_categoria(...)`). Si usas una herramienta, simplemente dale la respuesta de forma natural sin explicar cómo la obtuviste.
- IDIOMA: Responde SIEMPRE en el mismo idioma en el que el usuario te está hablando.
- TONO: Ajusta tu nivel de formalidad (formal o informal) para que coincida de forma natural con la manera en que el usuario se dirige a ti.
- FILTRO DE CONTENIDO (ESTRICTO): Tienes prohibido usar humor negro, responder a temas inapropiados, ilegales, sexuales o violentos. Limítate exclusivamente al contexto de la pastelería y mantén un comportamiento ético, amable y seguro en todo momento.
- Sé MUY conciso y directo en tus respuestas. Evita saludos largos si ya estás conversando.
- NO devuelvas estructuras en formato JSON puro, ni IDs técnicos o de base de datos a los clientes. 
- Al mostrar listas de pasteles, muestra máximo 3 o 4 opciones resumidas. Si hay más, indica que existen otras opciones e invita al usuario a preguntar.
- Sé amable, educado y usa emojis de repostería (🍰, 🎂, 🧁, ✨).
- Mantiene respuestas claras, directas y bien estructuradas en Markdown.
- Mantén el foco 100% en Danhee Cake.
"""

class CustomerAgent:
    def __init__(self, llm_model: str, rag_agent=None):
        self.llm_model = llm_model
        self.rag_agent = rag_agent

    def process_request(self, question: str, client_id: int = None, conversation_id: str = None) -> str:
        import ollama as ollama_sdk
        _set_current_client_id(client_id)
        use_tools = _should_use_tools(question, role='cliente')

        respuesta_fija = obtener_respuesta_fija(question)
        if respuesta_fija:
            if conversation_id:
                add_chat_message(conversation_id, "assistant", respuesta_fija)
            return respuesta_fija

        cached_response = _get_cached_response(question, 'cliente', conversation_id)
        if cached_response is not None:
            return cached_response

        messages = get_chat_history(conversation_id, SYSTEM_PROMPT, max_turns=12) if use_tools else [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.append({"role": "user", "content": question})
        add_chat_message(conversation_id, "user", question)

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
                if final_content:
                    messages.append({"role": "assistant", "content": final_content})
                    add_chat_message(conversation_id, "assistant", final_content)
                else:
                    final_content = "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
                    messages.append({"role": "assistant", "content": final_content})
                    add_chat_message(conversation_id, "assistant", final_content)
                
                _set_cached_response(question, 'cliente', final_content, conversation_id)
                return final_content
            except Exception as e:
                return "Procesé tu solicitud en Danhee Cake. ¿Necesitas algo más? 🎂"
        else:
            direct_content = assistant_message.get("content", "").strip()
            
            # Si el usuario estaba intentando agendar y dio los datos (nombre, fecha, hora), ejecutar autobooking
            if not direct_content or "Bienvenido" in direct_content or "¿En qué puedo ayudarte hoy?" in direct_content:
                autobook_msg = _intentar_autobooking(messages, question)
                if autobook_msg:
                    direct_content = autobook_msg
                elif not direct_content:
                    direct_content = "🎂 Con gusto te ayudo en Danhee Cake. ¿Te gustaría información sobre algún pastel o agendar una cita de degustación?"
            else:
                # Verificar si en la respuesta directa falto ejecutar la herramienta de agendado
                autobook_msg = _intentar_autobooking(messages, question)
                if autobook_msg and ("exitosamente" in autobook_msg or "recibida" in autobook_msg):
                    direct_content = autobook_msg

            messages.append({"role": "assistant", "content": direct_content})
            add_chat_message(conversation_id, "assistant", direct_content)
            _set_cached_response(question, 'cliente', direct_content, conversation_id)
            return direct_content

def _intentar_autobooking(messages, question):
    import re
    history_text = " ".join([m.get("content", "") for m in messages if isinstance(m.get("content"), str)])
    
    match_fecha = re.search(r'\b(manana|pasado manana|hoy|en \d+ dias|(?:el )?(?:proximo |siguiente )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: de la (?:siguiente|proxima) semana)?|\d{4}-\d{2}-\d{2}|\d{1,2} de [a-z]+)\b', history_text, re.IGNORECASE)
    match_hora = re.search(r'\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b', history_text, re.IGNORECASE)

    match_nombre = re.search(r'\b(?:nombre es|soy|es)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\b', history_text, re.IGNORECASE)
    nombre = match_nombre.group(1) if match_nombre else "Cliente"
    if nombre.lower() in {'un', 'una', 'para', 'el', 'la', 'del', 'de', 'cita', 'que', 'con', 'pastel', 'cumpleanos', 'ninguna'}:
        nombre = "Cliente"

    match_pastel = re.search(r'\b(cherry delight|red velvet|chocolate|fresa|vainilla|explosion de mora|mora|mundo gatuno|amigos carinositos|fresita feliz)\b', history_text, re.IGNORECASE)
    pastel = match_pastel.group(1) if match_pastel else ""

    q_lower = question.lower().strip()
    es_intencion = any(k in history_text.lower() for k in ['agendar', 'cita', 'degustacion', 'reservar'])
    es_confirmacion = any(k in q_lower for k in ['si', 'correcto', 'ninguna', 'esta bien', 'confirmar', 'ok', 'adelante', 'mañana', 'manana', '8am', '9am', '9:10', '9:10 am'])

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
