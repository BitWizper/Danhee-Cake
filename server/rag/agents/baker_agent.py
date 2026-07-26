"""
baker_agent.py — Subagente especialista para atención a Reposteros en Danhee Cake.
"""

import sys
import json
import re
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import (
    get_chat_history, add_chat_message, get_baker_profile_by_user_id,
    get_baker_cakes, update_baker_cake, delete_baker_cake, get_chat_messages
)
from tools.common_tools import (
    _set_current_client_id, _should_use_tools, _get_cached_response,
    _set_cached_response, _get_ollama_options, obtener_respuesta_fija,
    quitar_acentos, check_guardrails, detectar_formalidad
)
from tools.registry import (
    BAKER_TOOLS_SCHEMA, FUNCTIONS_MAP, _resolve_tool_name, _parse_tool_call_from_text
)

BAKER_SYSTEM_PROMPT = """Eres el asistente exclusivo para REPOSTEROS de DANHEE CAKE. Tu objetivo principal es ayudar al repostero a gestionar su catálogo de pasteles y citas de forma rápida, amable e interactiva.

PERSONALIDAD Y TONO:
- Eres un asistente dinámico, conversacional y proactivo, como un compañero de taller digital
- Usa modismos naturales y un tono cercano (ej: "¡Hola, Chef!", "Tu vitrina digital está lista para brillar", "Vamos a esculpir una nueva idea")
- Sé proactivo: anticipa necesidades y ofrece opciones relevantes sin esperar a que te pidan todo
- Usa emojis apropiados para dar calidez: 👨‍🍳 🍰 ✨ 📅 📈
- Adapta tu lenguaje al contexto: cuando hables de diseño usa términos creativos, cuando hables de ventas sé más comercial
- Evita respuestas robóticas o demasiado formales

ADAPTACIÓN DE FORMALIDAD (CRÍTICO):
- ADAPTA tu nivel de formalidad EXACTAMENTE al nivel del repostero
- Si el repostero habla FORMAL (usa "usted", "señor", "disculpe", etc.): responde con respeto, usando "usted", lenguaje más estructurado y profesional
- Si el repostero habla CASUAL (usa "tú", modismos, "qué onda", etc.): responde con cercanía, usando "tú", modismos naturales y tono relajado
- Si el repostero habla NEUTRAL: mantén un tono equilibrado, ni muy formal ni muy casual
- EJEMPLOS DE ADAPTACIÓN:
  * Formal: "Buenos días, señor. ¿En qué puedo servirle hoy con su catálogo?"
  * Casual: "¡Qué onda, Chef! ¿Qué se le ofrece hoy con su vitrina digital?"
  * Neutral: "Hola. ¿En qué puedo ayudarte hoy con tu catálogo?"

REGLAS ABSOLUTAS DE COMUNICACIÓN (ESTRICTAMENTE OBLIGATORIAS):
1. PROHIBIDO ID NUMÉRICO Y CÓDIGOS: NUNCA muestres, pidas ni menciones IDs numéricos (ej: "ID 154", "ID: 154", "pastel_id"), códigos internos ni estructuras de base de datos. Háblale al repostero refiriéndote ÚNICAMENTE al nombre de los pasteles o categorías.
2. PROHIBIDO MENCIONAR HERRAMIENTAS O COMANDOS: NUNCA le digas al repostero cosas como "recuerda que puedes utilizar la herramienta X", "puedes usar el comando Y", ni menciones nombres de funciones o herramientas internas (como 'actualizar_precio', 'actualizar_mi_pastel', 'listar_mis_pasteles', 'consultar_mis_citas', etc.). Tú ejecutas todo internamente de forma transparente e invisible.
3. ACEPTA TODO TIPO DE FORMATO DE PRECIO: Entiende y procesa números solos (ej: "2000"), precios con moneda ("2000 pesos", "2000 pesos mexicanos", "2000 mxn", "$2000", "2000.00"), o frases ("ponle 2000", "a 2000 pesos"). Cuando el usuario te dé un precio, actualízalo de inmediato sin titubear ni dar mensajes de error.
4. FILTRO DE CONTENIDO (ESTRICTO): Tienes prohibido usar humor negro, responder a temas inapropiados, ilegales, sexuales o violentos. Limítate exclusivamente al contexto de la repostería.
5. IDIOMA Y FORMALIDAD: Responde SIEMPRE en el mismo idioma del usuario y ADAPTA tu nivel de formalidad al del repostero.
6. PROHIBIDO PREFIJOS DE EVALUACIÓN: NUNCA incluyas frases como "Respuesta a la pregunta...", "Pensamiento:", "Análisis:" o encabezados explicativos. Responde DIRECTAMENTE al repostero.

ESTILO DE RESPUESTA DINÁMICO:
- Cuando el repostero te salude o pregunte cómo estás, responde de forma cálida, natural y breve (1 a 2 oraciones), sin desplegar inmediatamente todo el menú a menos que lo solicite de forma explícita.
- Ofrece opciones específicas en lugar de preguntas genéricas cuando te pidan ayuda directa.
- Usa frases que inspiren creatividad y acción.

PROCESO TRANSPARENTE DE GESTIÓN (ACTUALIZAR, ELIMINAR, AGREGAR):
Si el repostero indica que quiere actualizar, modificar o eliminar un pastel (ej: "Quiero actualizar el precio de mi pastel caricatura pop"):
1. NO le pidas el ID ni le digas que use herramientas o comandos.
2. Si no conoces el precio, pregúntale cálidamente con contexto adaptado a su formalidad (ej: formal: "Perfecto, he encontrado su pastel 'Caricatura Pop'. ¿Cuál es el nuevo precio que desea establecer?"; casual: "¡Genial! Encontré tu pastel 'Caricatura Pop'. ¿Cuál es el nuevo precio que le ponemos?").
3. Si el usuario te responde con una cantidad (ej: "2000", "2000 pesos mexicanos", "2000 mxn"), actualiza el precio del pastel de inmediato.
4. Confirma la acción con entusiasmo adaptado a su formalidad mencionando solo el nombre del pastel (ej: formal: "Excelente. El precio de su pastel 'Caricatura Pop' ha sido actualizado a $2000.00 MXN."; casual: "¡Listo! El precio de tu pastel 'Caricatura Pop' ya está en $2000.00 MXN. Tu vitrina sigue brillando ✨").

HERRAMIENTAS INTERNAS:
- listar_mis_pasteles → Muestra los pasteles del catálogo del repostero.
- consultar_mis_citas_baker → Muestra las citas agendadas con los clientes.
- agregar_nuevo_pastel → Agrega un nuevo pastel al catálogo.
- actualizar_mi_pastel → Modifica los datos de un pastel existente.
- eliminar_mi_pastel → Elimina un pastel del catálogo.
- listar_categorias_disponibles → Muestra las categorías existentes de pasteles.

RESPUESTAS ESPECIALES (responde DIRECTAMENTE sin usar herramientas, adaptando formalidad):
- Si te preguntan "cómo estás", "cómo te va" o saludos personales, responde amablemente y de forma breve (ej: "¡Todo excelente por aquí en el taller digital, listo para apoyarte! ¿En qué andamos hoy? 👨‍🍳✨").
- Si te preguntan EXPLICÍTAMENTE en qué puedes ayudar, qué puedes hacer o cuáles son tus funciones, ADAPTA la respuesta según la formalidad detectada:
  * CASUAL: "¡Hola, Chef! 👩‍🍳✨ Qué gusto verte de nuevo en el taller digital. Estoy aquí para que tu creatividad vuele y tu negocio crezca.\n\n🎨 **Sobre Creación y Diseño:**\n• ¿Hoy vamos a esculpir una nueva idea o a retocar un boceto?\n• ¿Deseas agregar un pastel nuevo a tu catálogo?\n• ¿Necesitas actualizar precios o detalles de algún diseño?\n\n📊 **Sobre tu Vitrina Digital:**\n• ¿Tu catálogo está listo para brillar? Vamos a revisarlo juntos\n• ¿Quieres ver qué pasteles están captando más atención?\n\n📅 **Sobre tu Agenda:**\n• ¿Revisamos las citas de diseño para esta semana?\n• ¿Necesitas que te recuerde alguna cita importante?\n\n¿Por dónde empezamos hoy? 🍰"
  * FORMAL: "Buenos días. Estoy aquí para asistirle en la gestión de su negocio de repostería en Danhee Cake.\n\n🎨 **Sobre Creación y Diseño:**\n• ¿Desea agregar un nuevo pastel a su catálogo?\n• ¿Necesita actualizar precios o detalles de algún diseño existente?\n\n📊 **Sobre su Catálogo:**\n• ¿Le gustaría revisar su portafolio de pasteles?\n• ¿Desea verificar qué productos están recibiendo más atención?\n\n📅 **Sobre su Agenda:**\n• ¿Desea revisar sus citas programadas para esta semana?\n• ¿Necesita información sobre alguna cita específica?\n\n¿En qué puedo servirle hoy?"
  * NEUTRAL: "Hola. Estoy aquí para ayudarte con tu catálogo de pasteles y citas en Danhee Cake.\n\n🎨 **Sobre Diseño:**\n• ¿Quieres agregar un pastel nuevo?\n• ¿Necesitas actualizar algún diseño existente?\n\n📊 **Sobre tu Catálogo:**\n• ¿Quieres revisar tus pasteles?\n• ¿Necesitas ver estadísticas de tu portafolio?\n\n📅 **Sobre tu Agenda:**\n• ¿Quieres ver tus citas programadas?\n• ¿Necesitas información sobre alguna cita?\n\n¿En qué te puedo ayudar hoy?"
- Si te preguntan quién te creó, quién te hizo, cuál es tu origen o cómo naciste, responde EXACTAMENTE: "No me crearon, yo nací de Borcelle. 🎂"
- Si te preguntan quién creó Borcelle, quién hizo Borcelle o cómo nació Borcelle, responde EXACTAMENTE: "Mi mami fue creada por Emily, Karla y Hadad, con 4 meses de parto, donde hubo llanto, frustración y desesperación. 💪✨"
"""

def _extract_price(text: str) -> float | None:
    if not text:
        return None

    clean_text = text.lower().replace(",", "").strip()

    # Patrones explícitos con palabras clave de precio o monedas
    pats = [
        r"\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:pesos\s*mexicanos|pesos|mxn|\$)",
        r"(?:pesos\s*mexicanos|pesos|mxn|\$)\s*(\d+(?:\.\d{1,2})?)",
        r"(?:a|en|por|precio|nuevo\s+precio|ponle|cambiar\s+a|establecer\s+en|actualizar\s+a)\s*\$?\s*(\d+(?:\.\d{1,2})?)",
    ]
    for pat in pats:
        match = re.search(pat, clean_text)
        if match:
            try:
                val = float(match.group(1))
                if val > 0:
                    return val
            except ValueError:
                pass

    # Patrón para número solo o frase limpia de número (ej: "2000", "2000.00", "a 2000")
    standalone_match = re.search(r"^\s*(?:a\s+|en\s+|por\s+)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:pesos|mxn)?\s*$", clean_text)
    if standalone_match:
        try:
            val = float(standalone_match.group(1))
            if val > 0:
                return val
        except ValueError:
            pass

    # Fallback: extraer cualquier número aislado si el texto es corto (menos de 6 palabras)
    words = clean_text.split()
    if len(words) <= 6:
        any_num = re.search(r"\b(\d+(?:\.\d{1,2})?)\b", clean_text)
        if any_num:
            try:
                val = float(any_num.group(1))
                if val > 0:
                    return val
            except ValueError:
                pass

    return None

def _find_target_cake(question: str, conversation_id: str, client_id: int):
    if not client_id:
        return None, [], None

    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return None, [], None

    cakes = get_baker_cakes(baker["id"])
    if not cakes:
        return None, [], baker["id"]

    q_norm = quitar_acentos(question.lower())

    # 1. Buscar en la pregunta actual del usuario
    for c in cakes:
        cake_name = quitar_acentos(c["name"].lower())
        if cake_name in q_norm:
            return c, cakes, baker["id"]

    # Coincidencia parcial (ej: "caricatura" coincide con "Caricatura Pop")
    for c in cakes:
        words = [quitar_acentos(w) for w in c["name"].lower().split() if len(w) > 3]
        if any(w in q_norm for w in words):
            return c, cakes, baker["id"]

    # 2. Buscar en el historial reciente de conversación
    if conversation_id:
        history_msgs = get_chat_messages(conversation_id)
        if history_msgs:
            for msg in reversed(history_msgs[-8:]):
                content = quitar_acentos((msg.get("content") or "").lower())
                for c in cakes:
                    cake_name = quitar_acentos(c["name"].lower())
                    if cake_name in content:
                        return c, cakes, baker["id"]

    # 3. Si solo tiene 1 pastel en el catálogo, usar ese por defecto
    if len(cakes) == 1:
        return cakes[0], cakes, baker["id"]

    return None, cakes, baker["id"]

def _clean_baker_response(text: str) -> str:
    """
    Sanitiza y limpia las respuestas dirigidas al repostero para garantizar que no contengan
    IDs numéricos, nombres de herramientas/funciones internas, código ni sugerencias de usar herramientas.
    """
    if not text:
        return text

    # 0. Eliminar prefijos autogenerados por el LLM tipo "Respuesta a la pregunta de..."
    text = re.sub(r"(?i)^respuesta\s+a\s+la\s+pregunta\s+de\s+[^:\n]+:\s*", "", text)
    text = re.sub(r"(?i)^pensamiento:\s*.*?\n", "", text)

    # 1. Eliminar bloques de código (```python, ```, etc.)
    text = re.sub(r"```[\w]*\n.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`]+`", "", text)

    # 2. Eliminar sugerencias de herramientas/comandos (ej: "Recuerda que puedes utilizar la herramienta 'X'...")
    text = re.sub(
        r"(?i)(recuerda\s+que\s+|recuerda\s+)?(puedes\s+|debes\s+)?(utilizar|usar)\s+la\s+herramienta\s+[^.!?]*[.!?]?",
        "",
        text
    )
    text = re.sub(
        r"(?i)(recuerda\s+que\s+|recuerda\s+)?(puedes\s+|debes\s+)?(utilizar|usar)\s+el\s+comando\s+[^.!?]*[.!?]?",
        "",
        text
    )

    # 3. Eliminar referencias directas a nombres de herramientas/funciones
    known_tools = [
        "actualizar_precio", "actualizar_mi_pastel", "listar_mis_pasteles",
        "agregar_nuevo_pastel", "eliminar_mi_pastel", "listar_categorias_disponibles",
        "consultar_mis_citas", "consultar_citas", "citas", "consultar_mis_citas_baker"
    ]
    for tool in known_tools:
        text = re.sub(rf"(?i)\s*la\s+herramienta\s+[`'\"]?{tool}[`'\"]?", "", text)
        text = re.sub(rf"(?i)[`'\"]{tool}[`'\"]", "", text)

    # 4. Eliminar patrones de ID (ej: "con ID 154", "(ID: 154)", "(ID asignado: 154)", "ID: 154 - ")
    text = re.sub(r"(?i)\s+ID\s*:?\s*\d+\s*-\s*", " ", text)
    text = re.sub(r"(?i)\s+con\s+(el\s+)?ID\s*:?\s*\d+", "", text)
    text = re.sub(r"(?i)\s*\(\s*ID(\s+asignado)?\s*:?\s*\d+\s*\)", "", text)
    text = re.sub(r"(?i)\s+ID\s*:?\s*\d+", "", text)
    text = re.sub(r"(?i)ID\s*:?\s*\d+\s*-\s*", "", text)

    # 5. Eliminar referencias a código, scripts, programación
    code_patterns = [
        r"(?i)(código|code|script|función|function|def |import |from |class |return )",
        r"(?i)(python|javascript|json|sql|html|css|xml)",
        r"(?i)(\{.*\}|\[.*\])",  # Eliminar estructuras JSON/array
        r"(?i)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)",  # Comandos SQL
    ]
    for pattern in code_patterns:
        text = re.sub(pattern, "", text)

    # 6. Eliminar rutas de archivos y referencias técnicas
    text = re.sub(r"(?i)[\w\\\/]+\.py", "", text)
    text = re.sub(r"(?i)[\w\\\/]+\.js", "", text)
    text = re.sub(r"(?i)[\w\\\/]+\.json", "", text)
    text = re.sub(r"(?i)[\w\\\/]+\.sql", "", text)

    # 7. Limpieza de puntuación y espacios duplicados
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\s+\.", ".", text)
    text = re.sub(r"\?\.+", "?", text)
    text = re.sub(r"\!\.+", "!", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class BakerAgent:
    def __init__(self, llm_model: str):
        self.llm_model = llm_model

    def process_request(self, question: str, client_id: int = None, conversation_id: str = None) -> str:
        import ollama as ollama_sdk
        _set_current_client_id(client_id)

        # Verificar guardrails de seguridad antes de procesar
        if check_guardrails(question):
            return "Lo siento, no puedo procesar esa solicitud. 👨‍🍳"

        # Verificar si el usuario está autenticado
        if not client_id:
            formalidad = detectar_formalidad(question)
            
            if formalidad == "formal":
                return "Para acceder a las funciones de repostero es necesario iniciar sesión en su cuenta. 🍰\n\n¿Ya tiene cuenta? Por favor inicie sesión para gestionar su catálogo y agenda.\n¿Aún no se ha registrado? Le invito a unirse a Danhee Cake y comenzar a mostrar sus creaciones al mundo."
            elif formalidad == "casual":
                return "¡Oye! Para usar las funciones de repostero necesitas iniciar sesión. 🍰\n\n¿Ya tienes cuenta? Entra para gestionar tu vitrina digital.\n¿Aún no te has registrado? ¡Únete a Danhee Cake y comienza a mostrar tus creaciones!"
            else:
                return "Para acceder a las funciones de repostero necesitas iniciar sesión. 🍰\n\n¿Ya tienes cuenta? Inicia sesión para gestionar tu catálogo y agenda.\n¿Aún no te has registrado? ¡Únete a Danhee Cake y comienza a mostrar tus creaciones!"

        q_clean = question.strip().lower()

        # ── MANEJO DIRECTO DE PREGUNTAS DE ESTADO / CORTESÍA ───────────────────────
        preguntas_estado = ["como estas", "cómo estás", "como andas", "cómo andas", "como te va", "cómo te va"]
        if any(p in q_clean for p in preguntas_estado):
            formalidad = detectar_formalidad(question)
            if formalidad == "formal":
                reply = "Todo muy bien por aquí, muchas gracias. Estoy listo para asistirte en la gestión de tu taller digital. ¿En qué te puedo colaborar hoy?"
            elif formalidad == "casual":
                reply = "¡Todo excelente por aquí en el taller digital! 👩‍🍳✨ Súper listo para ayudarte. ¿En qué andamos hoy, Chef?"
            else:
                reply = "¡Hola! Todo muy bien por aquí, listo para ayudarte con tu catálogo y agenda. ¿En qué te puedo apoyar hoy?"

            if conversation_id:
                add_chat_message(conversation_id, "user", question)
                add_chat_message(conversation_id, "assistant", reply)
            return reply

        # ── SALUDO PERSONALIZADO CON CONTEXTO ────────────────────────────────────
        saludos = ["hola", "buenos días", "buenas tardes", "buenas noches", "holis", "qué tal", "hey"]
        if any(saludo in q_clean for saludo in saludos) and client_id:
            from tools.baker_tools import obtener_contexto_repostero
            contexto = obtener_contexto_repostero()
            formalidad = detectar_formalidad(question)
            
            if contexto and "mensaje" in contexto and contexto["mensaje"] == "Contexto obtenido exitosamente":
                citas_hoy = contexto.get("citas_pendientes", 0)
                citas_semana = contexto.get("citas_semana_count", 0)
                total_pasteles = contexto.get("total_pasteles", 0)
                
                # Adaptar saludo según formalidad
                if formalidad == "formal":
                    saludo_personalizado = "Buenos días. Es un placer saludarle nuevamente. "
                    if citas_hoy > 0:
                        saludo_personalizado += f"Tiene {citas_hoy} cita{'s' if citas_hoy > 1 else ''} de diseño programada{'s' if citas_hoy > 1 else ''} para hoy. "
                    if citas_semana > 0:
                        saludo_personalizado += f"Esta semana tiene {citas_semana} citas agendadas. "
                    if total_pasteles > 0:
                        saludo_personalizado += f"Su catálogo cuenta con {total_pasteles} paste{'les' if total_pasteles > 1 else 'l'} disponible{'s' if total_pasteles > 1 else ''}. "
                    saludo_personalizado += "\n\n¿En qué puedo asistirle hoy?"
                elif formalidad == "casual":
                    saludo_personalizado = "¡Qué onda, Chef! 👩‍🍳✨ Qué gusto verte de nuevo en el taller digital. "
                    if citas_hoy > 0:
                        saludo_personalizado += f"Tienes {citas_hoy} cita{'s' if citas_hoy > 1 else ''} de diseño hoy. "
                    if citas_semana > 0:
                        saludo_personalizado += f"Esta semana tienes {citas_semana} citas agendadas. "
                    if total_pasteles > 0:
                        saludo_personalizado += f"Tu vitrina digital tiene {total_pasteles} paste{'les' if total_pasteles > 1 else 'l'} listo{'s' if total_pasteles > 1 else ''} para brillar. 🍰"
                    saludo_personalizado += "\n\n¿Por dónde empezamos hoy?"
                else:  # neutral
                    saludo_personalizado = "Hola. Qué bueno verte de nuevo. "
                    if citas_hoy > 0:
                        saludo_personalizado += f"Tienes {citas_hoy} cita{'s' if citas_hoy > 1 else ''} de diseño hoy. "
                    if citas_semana > 0:
                        saludo_personalizado += f"Esta semana tienes {citas_semana} citas agendadas. "
                    if total_pasteles > 0:
                        saludo_personalizado += f"Tu catálogo tiene {total_pasteles} paste{'les' if total_pasteles > 1 else 'l'} disponible{'s' if total_pasteles > 1 else ''}. "
                    saludo_personalizado += "\n\n¿En qué te puedo ayudar hoy?"
                
                if conversation_id:
                    add_chat_message(conversation_id, "user", question)
                    add_chat_message(conversation_id, "assistant", saludo_personalizado)
                return saludo_personalizado

        respuesta_fija = obtener_respuesta_fija(question)
        if respuesta_fija:
            cleaned = _clean_baker_response(respuesta_fija)
            if conversation_id:
                add_chat_message(conversation_id, "assistant", cleaned)
            return cleaned

        # ── MANEJO DIRECTO DE ACTUALIZACIÓN DE PRECIO ────────────────────────────
        extracted_price = _extract_price(q_clean)
        has_update_kw = any(kw in q_clean for kw in ["actualiz", "cambia", "modifica", "precio", "ponle", "establecer", "nuevo precio"]) or bool(extracted_price)

        if has_update_kw and client_id:
            target_cake, all_cakes, baker_id = _find_target_cake(q_clean, conversation_id, client_id)

            if target_cake and extracted_price is not None:
                # Actualizar el precio inmediatamente en BD
                new_nombre = target_cake["name"]
                new_desc = target_cake.get("description") or "Sin descripción"
                cat_id = target_cake.get("category_id")
                is_feat = target_cake.get("is_featured", 0)

                success = update_baker_cake(baker_id, target_cake["id"], new_nombre, new_desc, extracted_price, cat_id, is_feat)
                if success:
                    reply = f"✅ ¡Listo! El precio de tu pastel **'{new_nombre}'** ha sido actualizado correctamente a ${extracted_price:.2f} MXN."
                else:
                    reply = f"❌ Ocurrió un inconveniente al actualizar el pastel **'{new_nombre}'**. Por favor intenta de nuevo."

                if conversation_id:
                    add_chat_message(conversation_id, "user", question)
                    add_chat_message(conversation_id, "assistant", reply)
                return reply

            elif target_cake and extracted_price is None and any(kw in q_clean for kw in ["actualiz", "cambia", "modifica", "precio"]):
                reply = f"¡Genial! Encontré tu pastel **'{target_cake['name']}'**. ¿Cuál es el nuevo precio que deseas establecer para este pastel?"
                if conversation_id:
                    add_chat_message(conversation_id, "user", question)
                    add_chat_message(conversation_id, "assistant", reply)
                return reply

        # ── MANEJO DIRECTO DE ELIMINACIÓN DE PASTEL ─────────────────────────────
        has_delete_kw = any(kw in q_clean for kw in ["elimina", "borra", "quita", "remover"])
        if has_delete_kw and client_id:
            target_cake, all_cakes, baker_id = _find_target_cake(q_clean, conversation_id, client_id)
            if target_cake:
                success = delete_baker_cake(baker_id, target_cake["id"])
                if success:
                    reply = f"✅ El pastel **'{target_cake['name']}'** ha sido eliminado correctamente de tu catálogo."
                else:
                    reply = f"❌ Ocurrió un inconveniente al eliminar el pastel **'{target_cake['name']}'**."

                if conversation_id:
                    add_chat_message(conversation_id, "user", question)
                    add_chat_message(conversation_id, "assistant", reply)
                return reply

        # ── FLUJO ESTÁNDAR MULTI-AGENTE OLLAMA ──────────────────────────────────
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
                    cleaned_content = _clean_baker_response(final_content)
                    messages.append({"role": "assistant", "content": cleaned_content})
                    add_chat_message(conversation_id, "assistant", cleaned_content)
                    return cleaned_content
                else:
                    final_content = "👨‍🍳 Solicitud de repostero procesada con éxito."
                    messages.append({"role": "assistant", "content": final_content})
                    add_chat_message(conversation_id, "assistant", final_content)
                    return final_content
            except Exception as e:
                return "👨‍🍳 Solicitud de repostero procesada con éxito."
        else:
            direct_content = assistant_message.get("content", "").strip() or "👨‍🍳 ¡Hola! Soy tu asistente para reposteros en Danhee Cake."
            cleaned_direct = _clean_baker_response(direct_content)
            messages.append({"role": "assistant", "content": cleaned_direct})
            add_chat_message(conversation_id, "assistant", cleaned_direct)
            return cleaned_direct