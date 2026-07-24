"""
app.py — Servidor Principal HTTP y Punto de Entrada Microservicio RAG Danhee Cake.
Reestructurado con Arquitectura Multi-Agente Modular.
"""

import sys
import json
import os
import time
import urllib.request
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configurar encoding UTF-8 para consola Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

base_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(base_dir))

# Importar configuración de BD y persistencia de chat
from db_config import (
    get_or_create_chat_session, get_chat_history, add_chat_message,
    get_last_conversation_by_client, get_chat_messages, add_observability_log,
    get_user_by_id
)

# Importar utilidades compartidas, guardrails y herramientas
from tools.common_tools import (
    _set_current_client_id, _get_current_client_id, check_guardrails,
    _should_use_tools, _get_cached_response, _set_cached_response,
    _get_ollama_options, json_serial, _should_skip_rag
)
from tools.registry import (
    TOOLS_SCHEMA, BAKER_TOOLS_SCHEMA, FUNCTIONS_MAP,
    _resolve_tool_name, _parse_tool_call_from_text
)

# Importar Agente Ruteador Multi-Agente
from agents.router import TaskRouter

def get_tools_model() -> str:
    """Detecta el mejor modelo disponible en Ollama."""
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
            print(f"[RAG Server] Modelos detectados en Ollama: {models}", file=sys.stderr)

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

# Inicializar modelo y Agente Ruteador principal
llm_model = get_tools_model()
task_router = TaskRouter(llm_model=llm_model)

def generate_response_with_tools(question: str, client_id: int = None, conversation_id: str = None) -> str:
    """Orquestador con TaskRouter Multi-Agente."""
    _set_current_client_id(client_id)
    return task_router.route_and_process(question, client_id, conversation_id)


# ─────────────────────────────────────────────────────────────────────────────
# SERVIDOR HTTP Y GESTOR DE PETICIONES
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
            
            if not conversation_id and client_id:
                conversation_id = get_last_conversation_by_client(client_id)
            
            if not conversation_id:
                self._send_error(400, "Se requiere conversation_id o client_id")
                return
            
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
        import re
        if self.path == '/chat':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()
                client_id = req_data.get('client_id')
                conversation_id = req_data.get('conversation_id')
                role = req_data.get('role')
                
                _set_current_client_id(client_id)
                
                if not conversation_id and client_id:
                    conversation_id = get_last_conversation_by_client(client_id)
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                get_or_create_chat_session(conversation_id, client_id)
                
                response_text = task_router.route_and_process(question, client_id, conversation_id, explicit_role=role)
                
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
                
                _set_current_client_id(client_id)
                
                if not role and client_id:
                    user = get_user_by_id(client_id)
                    if user:
                        role = user.get('role')
                if not role:
                    role = 'cliente'
                    
                import ollama as ollama_sdk
                from agents.customer_agent import SYSTEM_PROMPT
                from agents.baker_agent import BAKER_SYSTEM_PROMPT
                
                current_system_prompt = BAKER_SYSTEM_PROMPT if role == 'repostero' else SYSTEM_PROMPT
                current_tools_schema = BAKER_TOOLS_SCHEMA if role == 'repostero' else TOOLS_SCHEMA
                use_tools = _should_use_tools(question, role)
                
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-transform')
                self.send_header('Connection', 'close')
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
                
                # Guardrails
                if check_guardrails(question):
                    err_msg = "Entrada bloqueada por políticas de seguridad de Danhee Cake."
                    send_event("error", {"content": err_msg})
                    send_event("done", {})
                    return
                
                if not conversation_id and client_id:
                    last_conv = get_last_conversation_by_client(client_id)
                    if last_conv:
                        conversation_id = last_conv
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                
                get_or_create_chat_session(conversation_id, client_id)
                send_event("conversation_id", {"conversation_id": conversation_id})
                
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
                        history_holder[0] = get_chat_history(conversation_id, current_system_prompt, max_turns=12)
                    
                    def fetch_rag():
                        if role != 'repostero' and task_router.rag_agent and not _should_skip_rag(question):
                            rag_context_holder[0] = task_router.rag_agent.search(question, top_k=2)
                    
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
                
                if not tool_calls:
                    parsed_tool_call = _parse_tool_call_from_text(content)
                    if parsed_tool_call:
                        tool_calls = [parsed_tool_call]

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
                    direct_content = assistant_message.get("content", "").strip() or "¡Hola! Soy tu asistente de Danhee Cake. ¿En qué puedo ayudarte?"
                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                    final_response_text = direct_content
                    for word in re.findall(r'\S+\s*', direct_content):
                        send_event("token", {"content": word})
                    add_chat_message(conversation_id, "assistant", direct_content)
                    _set_cached_response(question, role, direct_content, conversation_id)
                
                send_event("done", {})
                
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


def run_server(port=5005):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, RAGRequestHandler)
    print(f"\n[RAG Server] 🚀 Servidor listo en http://localhost:{port}", file=sys.stderr)
    print(f"[RAG Server] 🎂 Asistente EXCLUSIVO de Danhee Cake con Arquitectura Multi-Agente", file=sys.stderr)
    print(f"[RAG Server] 🔀 TaskRouter derivando entre Clientes y Reposteros", file=sys.stderr)
    print(f"[RAG Server] ⚡ Advanced RAG (Búsqueda Híbrida + Reranking)", file=sys.stderr)
    print(f"[RAG Server] 📦 {len(TOOLS_SCHEMA)} herramientas de cliente y {len(BAKER_TOOLS_SCHEMA)} de repostero.", file=sys.stderr)
    print("", file=sys.stderr)
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()