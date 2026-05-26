import sys
import json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request

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
except ImportError as e:
    print(f"Error al importar librerías. Asegúrate de que las dependencias estén instaladas: {e}", file=sys.stderr)
    sys.exit(1)

base_dir = Path(__file__).resolve().parent

# 1. Función para detectar dinámicamente el mejor modelo de chat disponible en Ollama
def get_installed_llm_model():
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [m['name'] for m in data.get('models', [])]
            print(f"[RAG Server] Modelos detectados en Ollama: {models}", file=sys.stderr)
            
            # Preferencia de modelos: Llama 3.2 o Mistral (que ya tiene el usuario)
            for m in ["llama3.2:latest", "llama3.2", "mistral:latest", "mistral"]:
                if m in models:
                    return m
                # Búsqueda difusa (ej. por si tiene mistral:7b o similar)
                for model_name in models:
                    if m.split(':')[0] in model_name:
                        return model_name
            if models:
                # Si hay algún otro modelo, usar el primero
                return models[0]
    except Exception as e:
        print(f"[RAG Server] No se pudo conectar a la API de Ollama para listar modelos: {e}. Usando 'mistral:latest' como fallback.", file=sys.stderr)
    return "mistral:latest"

# 2. Inicializar la base de datos vectorial Chroma
print("[RAG Server] Cargando base de datos Chroma y embeddings...", file=sys.stderr)
try:
    db = Chroma(
        persist_directory=str(base_dir / "chroma"),
        embedding_function=OllamaEmbeddings(
            model="nomic-embed-text"
        )
    )
    print("[RAG Server] Base de datos Chroma cargada exitosamente.", file=sys.stderr)
except Exception as e:
    print(f"[RAG Server] Error al cargar la base de datos Chroma: {e}", file=sys.stderr)
    db = None

# 3. Detectar el modelo LLM a utilizar e instanciarlo
llm_model = get_installed_llm_model()
print(f"[RAG Server] Usando modelo LLM: {llm_model}", file=sys.stderr)
model = ChatOllama(model=llm_model)

# Prompt base para el asistente de Danhee Cake
def generate_response(question):
    # Realizar búsqueda de similitud en Chroma DB
    context = ""
    if db is not None:
        try:
            docs = db.similarity_search(question, k=3)
            context = "\n".join([doc.page_content for doc in docs])
        except Exception as e:
            print(f"[RAG Server] Error al buscar en Chroma: {e}", file=sys.stderr)
            context = ""
    
    prompt = f"""Eres un asistente de Danhee Cake, una pastelería personalizada premium.

Responde en español, de forma clara, cálida, amable y servicial.
No repitas la pregunta del usuario ni devuelvas el contexto completo.
Si el contexto no proporciona suficiente información para responder a la pregunta, pide de manera breve y amable una aclaración o invita al usuario a contactar por redes sociales/teléfono para un pedido personalizado.
Mantén la respuesta breve y concisa: máximo 4 frases.

Contexto de la pastelería:
{context}

Pregunta del usuario:
{question}
"""
    response = model.invoke(prompt)
    return response.content.strip()

# 4. Manejador de peticiones HTTP para el modo Servidor
class RAGRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Evitar inundar la consola con logs HTTP repetitivos de desarrollo
        pass

    def do_POST(self):
        if self.path == '/chat':
            try:
                # Leer el contenido del mensaje
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                question = req_data.get('message', '').strip()

                if not question:
                    self.send_error_response(400, "El mensaje está vacío")
                    return

                print(f"[RAG Server] Pregunta recibida: '{question}'", file=sys.stderr)

                # Generar respuesta RAG
                response_text = generate_response(question)

                # Responder al cliente
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                res_data = json.dumps({"response": response_text}, ensure_ascii=False)
                self.wfile.write(res_data.encode('utf-8'))
                print(f"[RAG Server] Respuesta enviada exitosamente.", file=sys.stderr)

            except Exception as e:
                print(f"[RAG Server] Error procesando la solicitud de chat: {e}", file=sys.stderr)
                self.send_error_response(500, f"Error interno: {str(e)}")
        else:
            self.send_error_response(404, "Ruta no encontrada")

    def do_OPTIONS(self):
        # Soporte CORS para desarrollo local
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def send_error_response(self, status_code, message):
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_data = json.dumps({"error": message}, ensure_ascii=False)
            self.wfile.write(err_data.encode('utf-8'))
        except Exception as e:
            print(f"[RAG Server] Error enviando respuesta de error: {e}", file=sys.stderr)

# 5. Iniciar el servidor HTTP
def run_server(port=5005):
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, RAGRequestHandler)
    print(f"[RAG Server] Microservicio RAG listo en http://localhost:{port}", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[RAG Server] Deteniendo servidor...", file=sys.stderr)
        httpd.server_close()

# 6. Orquestación del punto de entrada principal
if __name__ == '__main__':
    # Si se pasa un argumento que no sea '--server', ejecutar en modo una sola llamada (Compatibilidad)
    if len(sys.argv) > 1 and sys.argv[1] != '--server':
        question = sys.argv[1].strip()
        try:
            response_text = generate_response(question)
            print(response_text)  # Único print a stdout para que lo capture Node
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        # De lo contrario, iniciar el servidor persistente
        port = 5005
        # Permitir especificar el puerto si se requiere
        if len(sys.argv) > 2:
            try:
                port = int(sys.argv[2])
            except ValueError:
                pass
        run_server(port)