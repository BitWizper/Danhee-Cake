"""
baker_agent.py — Subagente especialista para atención a Reposteros en Danhee Cake.
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
    BAKER_TOOLS_SCHEMA, FUNCTIONS_MAP, _resolve_tool_name, _parse_tool_call_from_text
)

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
- Adapta tu tono dinámicamente según cómo se exprese el usuario (formal o informal). Sé flexible y comprensivo con ligeras faltas de ortografía o exceso de signos de puntuación, captando la intención sin corregirlo, pero SIEMPRE manteniéndote strictly en el tema de Danhee Cake.

CRÍTICO - FORMATO DE SALIDA:
- NUNCA generes texto en formato JSON, ni escribas estructuras como '{"type":"function"...}'.
- NUNCA muestres nombres de funciones ni argumentos de código al usuario.
- Si necesitas usar una herramienta, invócala mediante el mecanismo del sistema (tool call). La respuesta visible para el usuario SIEMPRE debe ser un texto en lenguaje natural, amable y conversacional.

RESPUESTAS ESPECIALES (responde DIRECTAMENTE sin usar herramientas):
- Si te preguntan en qué puedes ayudar, qué puedes hacer o cuáles son tus funciones, responde exactamente:
  "¡Hola! Como asistente para reposteros de Danhee Cake puedo ayudarte con:\n\n👨‍🍳 **Gestión de tu catálogo:**\n• Ver todos tus pasteles registrados\n• Agregar nuevos pasteles\n• Actualizar precios, nombre, categoría o descripción\n• Eliminar pasteles de tu catálogo\n• Consultar las categorías disponibles\n• Ver tus citas agendadas con clientes\n\n¿Con cuál te ayudo hoy? 😊"
- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: "No me crearon, yo nací de Borcelle. 🎂"
- Si te preguntan quién creó Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"
"""

class BakerAgent:
    def __init__(self, llm_model: str):
        self.llm_model = llm_model

    def process_request(self, question: str, client_id: int = None, conversation_id: str = None) -> str:
        import ollama as ollama_sdk
        _set_current_client_id(client_id)

        respuesta_fija = obtener_respuesta_fija(question)
        if respuesta_fija:
            if conversation_id:
                add_chat_message(conversation_id, "assistant", respuesta_fija)
            return respuesta_fija

        messages = get_chat_history(conversation_id, BAKER_SYSTEM_PROMPT, max_turns=4)
        messages.append({"role": "user", "content": question})
        add_chat_message(conversation_id, "user", question)

        try:
            response = ollama_sdk.chat(
                model=self.llm_model,
                messages=messages,
                tools=BAKER_TOOLS_SCHEMA,
                options=_get_ollama_options(),
                keep_alive="5m"
            )
        except Exception as e:
            print(f"[BakerAgent] Error en Ollama: {e}", file=sys.stderr)
            return "Lo siento, hubo un problema al procesar tu solicitud como repostero en Danhee Cake. 👨‍🍳"

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
                        result = {"error": "Error interno al ejecutar la herramienta de repostero."}
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
                    final_content = "👨‍🍳 Solicitud de repostero procesada con éxito."
                    messages.append({"role": "assistant", "content": final_content})
                    add_chat_message(conversation_id, "assistant", final_content)
                return final_content
            except Exception as e:
                return "👨‍🍳 Solicitud de repostero procesada con éxito."
        else:
            direct_content = assistant_message.get("content", "").strip() or "👨‍🍳 ¡Hola! Soy tu asistente para reposteros en Danhee Cake."
            messages.append({"role": "assistant", "content": direct_content})
            add_chat_message(conversation_id, "assistant", direct_content)
            return direct_content
