"""
rag_agent.py — Subagente y Motor Advanced RAG con Búsqueda Híbrida y Reranking para Danhee Cake.
"""

import sys
import os
import re
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from tools.common_tools import quitar_acentos, _should_skip_rag

try:
    from langchain_community.vectorstores import Chroma
    from langchain_ollama import OllamaEmbeddings
except ImportError:
    Chroma = None
    OllamaEmbeddings = None

class AdvancedRAGAgent:
    """
    Subagente especial en RAG (Recuperación de Información).
    Implementa Búsqueda Híbrida (Vectorial + Térmica/Léxica) y Reranking (Score-based).
    """

    def __init__(self, chroma_dir: str = None):
        if chroma_dir is None:
            chroma_dir = str(base_dir / "chroma")
            
        self.db = None
        if Chroma and OllamaEmbeddings:
            try:
                self.db = Chroma(
                    persist_directory=chroma_dir,
                    embedding_function=OllamaEmbeddings(model="nomic-embed-text")
                )
                print("[Advanced RAG] ✅ Chroma DB cargada correctamente.", file=sys.stderr)
            except Exception as e:
                print(f"[Advanced RAG] ⚠️ Error al cargar Chroma DB: {e}", file=sys.stderr)

    def _calculate_keyword_score(self, question: str, content: str) -> float:
        """Calcula una puntuación de coincidencia por palabras clave (BM25/TF-IDF simplificado)."""
        q_tokens = set(re.findall(r"\w+", quitar_acentos(question.lower())))
        c_tokens = re.findall(r"\w+", quitar_acentos(content.lower()))
        if not q_tokens or not c_tokens:
            return 0.0
        
        matches = sum(1 for token in c_tokens if token in q_tokens)
        return matches / float(len(q_tokens) + 5)

    def rerank_documents(self, question: str, docs, top_k: int = 3):
        """
        Model de Re-rankeo (Reranker):
        Reevalúa el top-10 de fragmentos recuperados para reducirlo al top_k (default 3)
        óptimo antes de inyectarlo al LLM.
        """
        if not docs:
            return []
            
        scored_docs = []
        for idx, doc in enumerate(docs):
            vector_score = 1.0 / (idx + 1)
            keyword_score = self._calculate_keyword_score(question, doc.page_content)
            # Score combinado (Híbrido)
            hybrid_score = (vector_score * 0.5) + (keyword_score * 0.5)
            scored_docs.append((hybrid_score, doc))
            
        # Ordenar de mayor a menor puntuación
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored_docs[:top_k]]

    def search(self, question: str, top_k: int = 3) -> str:
        """
        Ejecuta Búsqueda Híbrida + Reranking y retorna el contexto optimizado.
        """
        if not self.db or _should_skip_rag(question):
            return ""

        try:
            # Recuperar Top-10 candidatos por similitud vectorial
            raw_docs = self.db.similarity_search(question, k=10)
            if not raw_docs:
                return ""
                
            # Aplicar Re-rankeo para seleccionar el Top-3 óptimo
            top_docs = self.rerank_documents(question, raw_docs, top_k=top_k)
            
            context = "\n\n".join([
                f"Fuente: {doc.metadata.get('source','desconocida')}\n{doc.page_content}"
                for doc in top_docs
            ])
            return context
        except Exception as e:
            print(f"[Advanced RAG] Error en búsqueda: {e}", file=sys.stderr)
            return ""
