"""
router.py — Agente Ruteador (Task Router) para derivar consultas a subagentes especialistas.
"""

import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import get_user_by_id
from agents.customer_agent import CustomerAgent
from agents.baker_agent import BakerAgent
from agents.rag_agent import AdvancedRAGAgent

class TaskRouter:
    """
    Agente Ruteador (Orquestador).
    Analiza la petición y el rol del usuario para derivar la consulta al subagente
    especialista adecuado (CustomerAgent vs BakerAgent) con contexto transparente.
    """

    def __init__(self, llm_model: str):
        self.llm_model = llm_model
        self.rag_agent = AdvancedRAGAgent()
        self.customer_agent = CustomerAgent(llm_model=llm_model, rag_agent=self.rag_agent)
        self.baker_agent = BakerAgent(llm_model=llm_model)

    def route_and_process(self, question: str, client_id: int = None, conversation_id: str = None, explicit_role: str = None) -> str:
        # Determine effective user role
        role = 'cliente'
        if explicit_role:
            role = explicit_role.lower().strip()
        elif client_id:
            user = get_user_by_id(client_id)
            if user:
                role = user.get('role', 'cliente')

        print(f"[TaskRouter] 🔀 Derivando solicitud al subagente especialista: '{role}'", file=sys.stderr)

        if role == 'repostero':
            return self.baker_agent.process_request(question, client_id, conversation_id)
        else:
            return self.customer_agent.process_request(question, client_id, conversation_id)
