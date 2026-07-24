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
2. Si el usuario pregunta por un pastel específico (ej: "cuéntame del pastel Red velvet", "detalles de pastel X"), USA OBLIGATORIAMENTE la herramienta `consultar_detalle_pastel_por_id`.
3. Si el usuario pide un catálogo o tipos de pastel por categoría (boda, xv años, cumpleaños), USA `consultar_pasteles_por_categoria` o `consultar_catalogo_pasteles`.
4. Si el usuario consulta sus citas o diseños agendados, USA `consultar_mis_citas` o `consultar_mis_disenos`.
5. Si el usuario pide recomendaciones por ocasión o presupuesto, USA `recomendar_pastel`.
6. Si te preguntan por políticas de entrega, pago o cancelación, USA `consultar_politicas_pasteleria`.

REGLAS DE RESPUESTA:
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

        messages = get_chat_history(conversation_id, SYSTEM_PROMPT, max_turns=4) if use_tools else [{"role": "system", "content": SYSTEM_PROMPT}]
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
            direct_content = assistant_message.get("content", "").strip() or "🎂 ¡Bienvenido a Danhee Cake! Soy tu asistente virtual. ¿En qué puedo ayudarte?"
            messages.append({"role": "assistant", "content": direct_content})
            add_chat_message(conversation_id, "assistant", direct_content)
            _set_cached_response(question, 'cliente', direct_content, conversation_id)
            return direct_content
