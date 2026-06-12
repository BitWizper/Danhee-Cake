"""
db_config.py — Módulo de acceso a datos para el microservicio RAG de Danhee Cake.

Conexión directa a MySQL (Clever Cloud) para permitir acceso inmediato 
a los datos por el chatbot, sin depender del servidor Node.js.
"""

import os
import sys
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
from pathlib import Path
import json

# Cargar las variables de entorno desde el archivo .env de Node.js
base_dir = Path(__file__).resolve().parent.parent
load_dotenv(base_dir / ".env")

def get_connection():
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD")
        )
        return connection
    except Error as e:
        print(f"[db_config] Error conectando a MySQL: {e}", file=sys.stderr)
        return None

def get_cakes():
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        query = '''
            SELECT c.*, cat.name as category_name, b.business_name
            FROM cakes c
            LEFT JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN baker_profiles b ON c.baker_id = b.id
        '''
        cursor.execute(query)
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_cakes: {e}", file=sys.stderr)
        return []
    finally:
        if conn: conn.close()

def get_bakers():
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        query = 'SELECT * FROM baker_profiles'
        cursor.execute(query)
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_bakers: {e}", file=sys.stderr)
        return []
    finally:
        if conn: conn.close()

def get_baker_by_id(baker_id):
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(dictionary=True)
        query = '''
            SELECT b.*, u.name, u.avatar_url, u.email
            FROM baker_profiles b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = %s
        '''
        cursor.execute(query, (baker_id,))
        return cursor.fetchone()
    except Error as e:
        print(f"[db_config] Error en get_baker_by_id: {e}", file=sys.stderr)
        return None
    finally:
        if conn: conn.close()

def get_appointments_by_baker_date(baker_id, date_str):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        query = 'SELECT * FROM appointments WHERE baker_id = %s AND date = %s'
        cursor.execute(query, (baker_id, date_str))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_appointments_by_baker_date: {e}", file=sys.stderr)
        return []
    finally:
        if conn: conn.close()

def insert_appointment(client_id, baker_id, date_str, time_slot, notes, status='pending'):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        query = '''
            INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status)
            VALUES (%s, %s, %s, %s, %s, %s)
        '''
        cursor.execute(query, (client_id, baker_id, date_str, time_slot, notes, status))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en insert_appointment: {e}", file=sys.stderr)
        return False
    finally:
        if conn: conn.close()

def insert_guest_appointment(baker_id, date_str, time_slot, notes, status='pending'):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        query = '''
            INSERT INTO appointments (baker_id, date, time_slot, notes, status)
            VALUES (%s, %s, %s, %s, %s)
        '''
        cursor.execute(query, (baker_id, date_str, time_slot, notes, status))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en insert_guest_appointment: {e}", file=sys.stderr)
        return False
    finally:
        if conn: conn.close()

def get_categories():
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        query = 'SELECT * FROM categories WHERE is_active = 1'
        cursor.execute(query)
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_categories: {e}", file=sys.stderr)
        return []
    finally:
        if conn: conn.close()

def get_user_by_id(user_id):
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(dictionary=True)
        query = 'SELECT id, name, role FROM users WHERE id = %s'
        cursor.execute(query, (user_id,))
        return cursor.fetchone()
    except Error as e:
        print(f"[db_config] Error en get_user_by_id: {e}", file=sys.stderr)
        return None
    finally:
        if conn: conn.close()

def get_or_create_chat_session(conversation_id, client_id=None):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT conversation_id FROM chat_sessions WHERE conversation_id = %s', (conversation_id,))
        if cursor.fetchone():
            return True
        cursor.execute('INSERT INTO chat_sessions (conversation_id, client_id) VALUES (%s, %s)', (conversation_id, client_id))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en get_or_create_chat_session: {e}", file=sys.stderr)
        return False
    finally:
        if conn: conn.close()

def get_chat_history(conversation_id, system_prompt, max_turns=10):
    conn = get_connection()
    if not conn: return [{"role": "system", "content": system_prompt}]
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT role, content, tool_calls 
            FROM chat_messages 
            WHERE conversation_id = %s 
            ORDER BY id ASC
        ''', (conversation_id,))
        rows = cursor.fetchall()
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Sliding window: conservamos los últimos turnos para evitar Out of Memory
        if len(rows) > max_turns * 2:
            rows = rows[-(max_turns * 2):]
            
        for row in rows:
            msg = {"role": row["role"], "content": row["content"]}
            if row["tool_calls"]:
                try:
                    msg["tool_calls"] = json.loads(row["tool_calls"])
                except:
                    pass
            messages.append(msg)
            
        return messages
    except Error as e:
        print(f"[db_config] Error en get_chat_history: {e}", file=sys.stderr)
        return [{"role": "system", "content": system_prompt}]
    finally:
        if conn: conn.close()

def get_last_conversation_by_client(client_id):
    """
    Retorna el conversation_id más reciente de un cliente autenticado.
    Asume que la tabla chat_sessions tiene una columna updated_at o created_at.
    Si no, cambiar ORDER BY updated_at DESC por ORDER BY id DESC
    """
    conn = get_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        query = '''
            SELECT conversation_id
            FROM chat_sessions
            WHERE client_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
        '''
        cursor.execute(query, (client_id,))
        row = cursor.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"[db_config] Error en get_last_conversation_by_client: {e}", file=sys.stderr)
        return None
    finally:
        if conn:
            conn.close()

def get_chat_messages(conversation_id):
    """
    Devuelve todos los mensajes de una conversación (sin el system prompt).
    """
    conn = get_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        query = '''
            SELECT role, content, tool_calls
            FROM chat_messages
            WHERE conversation_id = %s
            ORDER BY id ASC
        '''
        cursor.execute(query, (conversation_id,))
        rows = cursor.fetchall()
        # Convertir tool_calls de JSON string a objeto si existe
        for row in rows:
            if row.get('tool_calls'):
                try:
                    row['tool_calls'] = json.loads(row['tool_calls'])
                except:
                    pass
        return rows
    except Exception as e:
        print(f"[db_config] Error en get_chat_messages: {e}", file=sys.stderr)
        return []
    finally:
        if conn:
            conn.close()

def custom_serializer(obj):
    if hasattr(obj, 'model_dump'):
        return obj.model_dump()
    if hasattr(obj, 'dict'):
        return obj.dict()
    if hasattr(obj, '__dict__'):
        return obj.__dict__
    return str(obj)

def add_chat_message(conversation_id, role, content, tool_calls=None):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        tool_calls_json = json.dumps(tool_calls, default=custom_serializer) if tool_calls else None
        cursor.execute('''
            INSERT INTO chat_messages (conversation_id, role, content, tool_calls)
            VALUES (%s, %s, %s, %s)
        ''', (conversation_id, role, content, tool_calls_json))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en add_chat_message: {e}", file=sys.stderr)
        return False
    finally:
        if conn: conn.close()