import sys
from pathlib import Path

from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain_ollama import ChatOllama

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

question = sys.argv[1].strip()
base_dir = Path(__file__).resolve().parent

db = Chroma(
    persist_directory=str(base_dir / "chroma"),
    embedding_function=OllamaEmbeddings(
        model="nomic-embed-text"
    )
)

docs = db.similarity_search(question, k=3)

context = "\n".join([
    doc.page_content for doc in docs
])

model = ChatOllama(model="llama3.2")

response = model.invoke(f"""
Eres un asistente de Danhee Cake.

Responde en español, de forma clara, cálida y útil.
No repitas la pregunta del usuario ni devuelvas el contexto completo.
Si el contexto no alcanza, pide una aclaración breve.
Mantén la respuesta breve: máximo 4 frases.

Contexto:
{context}

Pregunta:
{question}
""")

print(response.content.strip())