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
        role = None

        if isinstance(explicit_role, str):
            explicit_role = explicit_role.lower().strip()
            if explicit_role in ('cliente', 'repostero'):
                role = explicit_role
            else:
                explicit_role = None

        if client_id:
            user = get_user_by_id(client_id)
            if user:
                db_role = user.get('role', 'cliente')
                if role and role != db_role:
                    print(f"[TaskRouter] ⚠️ Role explícito '{role}' no coincide con la base de datos '{db_role}' para client_id={client_id}. Usando rol de BD.", file=sys.stderr)
                role = db_role
            elif not role:
                role = 'cliente'

        if not role:
            role = 'cliente'

        print(f"[TaskRouter] 🔀 Derivando solicitud al subagente especialista: '{role}'", file=sys.stderr)

        if role == 'repostero':
            return self.baker_agent.process_request(question, client_id, conversation_id)
        return self.customer_agent.process_request(question, client_id, conversation_id)
