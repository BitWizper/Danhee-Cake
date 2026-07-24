"""
db_config.py — Módulo de acceso a datos para el microservicio RAG de Danhee Cake.

Usa un pool de conexiones persistente para eliminar la latencia de reconexión
a MySQL (Clever Cloud) en cada llamada.
"""

import os
import sys
import json
import mysql.connector
from mysql.connector import Error, pooling
from dotenv import load_dotenv
from pathlib import Path

# Cargar las variables de entorno desde el archivo de entorno del proyecto
base_dir = Path(__file__).resolve().parent.parent
for env_path in [base_dir / ".env", base_dir / ".envi"]:
    if env_path.exists():
        load_dotenv(env_path, override=False)
        break

# ── Pool de conexiones persistente ───────────────────────────────────────────
_pool = None

def get_pool():
    global _pool
    if _pool is None:
        try:
            _pool = pooling.MySQLConnectionPool(
                pool_name="danhee_pool",
                pool_size=2,
                pool_reset_session=True,
                host=os.getenv("DB_HOST"),
                port=int(os.getenv("DB_PORT", 3306)),
                database=os.getenv("DB_NAME"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                connection_timeout=10,
                autocommit=False,
            )
            print("[db_config] ✅ Pool de conexiones MySQL creado (size=2)", file=sys.stderr)
        except Error as e:
            print(f"[db_config] ❌ Error creando pool: {e}", file=sys.stderr)
            _pool = None
    return _pool


def get_connection():
    """Obtiene una conexión del pool. Si el pool falla, crea una conexión directa."""
    pool = get_pool()
    if pool:
        try:
            return pool.get_connection()
        except Error as e:
            print(f"[db_config] Pool error, fallback a conexión directa: {e}", file=sys.stderr)
    # Fallback a conexión directa
    try:
        return mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
        )
    except Error as e:
        print(f"[db_config] Error conectando a MySQL: {e}", file=sys.stderr)
        return None


# ── Cache en memoria para datos que raramente cambian ────────────────────────
import time
_cache = {}
_CACHE_TTL = 120  # segundos

def _cache_get(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    return None

def _cache_set(key, data):
    _cache[key] = {"data": data, "ts": time.time()}


# ── Funciones de acceso a datos ───────────────────────────────────────────────

def get_cakes():
    cached = _cache_get("cakes")
    if cached is not None:
        return cached
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT c.*, cat.name as category_name, b.business_name
            FROM cakes c
            LEFT JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN baker_profiles b ON c.baker_id = b.id
        ''')
        result = cursor.fetchall()
        _cache_set("cakes", result)
        return result
    except Error as e:
        print(f"[db_config] Error en get_cakes: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()

def get_bakers():
    cached = _cache_get("bakers")
    if cached is not None:
        return cached
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM baker_profiles')
        result = cursor.fetchall()
        _cache_set("bakers", result)
        return result
    except Error as e:
        print(f"[db_config] Error en get_bakers: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()

def get_baker_by_id(baker_id):
    key = f"baker_{baker_id}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT b.*, u.name, u.avatar_url, u.email
            FROM baker_profiles b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = %s
        ''', (baker_id,))
        result = cursor.fetchone()
        _cache_set(key, result)
        return result
    except Error as e:
        print(f"[db_config] Error en get_baker_by_id: {e}", file=sys.stderr)
        return None
    finally:
        cursor.close()
        conn.close()

def get_appointments_by_baker_date(baker_id, date_str):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM appointments WHERE baker_id = %s AND date = %s', (baker_id, date_str))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_appointments_by_baker_date: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()

def insert_appointment(client_id, baker_id, date_str, time_slot, notes, status='pending'):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (client_id, baker_id, date_str, time_slot, notes, status))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en insert_appointment: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()

def insert_guest_appointment(baker_id, date_str, time_slot, notes, status='pending'):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO appointments (baker_id, date, time_slot, notes, status)
            VALUES (%s, %s, %s, %s, %s)
        ''', (baker_id, date_str, time_slot, notes, status))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en insert_guest_appointment: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()

def get_categories():
    cached = _cache_get("categories")
    if cached is not None:
        return cached
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM categories WHERE is_active = 1')
        result = cursor.fetchall()
        _cache_set("categories", result)
        return result
    except Error as e:
        print(f"[db_config] Error en get_categories: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()

def get_user_by_id(user_id):
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT id, name, role FROM users WHERE id = %s', (user_id,))
        return cursor.fetchone()
    except Error as e:
        print(f"[db_config] Error en get_user_by_id: {e}", file=sys.stderr)
        return None
    finally:
        cursor.close()
        conn.close()

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
        cursor.close()
        conn.close()

def get_chat_history(conversation_id, system_prompt, max_turns=8):
    """
    Recupera el historial con sliding window reducido a 8 turnos para
    minimizar el contexto enviado al LLM y reducir latencia de inferencia.
    """
    conn = get_connection()
    if not conn: return [{"role": "system", "content": system_prompt}]
    try:
        cursor = conn.cursor(dictionary=True)
        # Traer sólo los últimos max_turns*2 mensajes directamente en SQL
        cursor.execute('''
            SELECT role, content, tool_calls
            FROM chat_messages
            WHERE conversation_id = %s
              AND role IN ('user', 'assistant', 'tool')
            ORDER BY id DESC
            LIMIT %s
        ''', (conversation_id, max_turns * 2))
        rows = list(reversed(cursor.fetchall()))

        messages = [{"role": "system", "content": system_prompt}]
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
        cursor.close()
        conn.close()

def get_last_conversation_by_client(client_id):
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT conversation_id
            FROM chat_sessions
            WHERE client_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
        ''', (client_id,))
        row = cursor.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"[db_config] Error en get_last_conversation_by_client: {e}", file=sys.stderr)
        return None
    finally:
        cursor.close()
        conn.close()

def get_chat_messages(conversation_id):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT role, content, tool_calls
            FROM chat_messages
            WHERE conversation_id = %s
            ORDER BY id ASC
        ''', (conversation_id,))
        rows = cursor.fetchall()
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
        cursor.close()
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
    """Versión síncrona: escribe el mensaje de forma segura para evitar problemas de conexión y FK."""
    if not conversation_id:
        return False
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
        # Fallback si la sesión aún no existe en chat_sessions
        if "1452" in str(e) or "a foreign key constraint fails" in str(e):
            get_or_create_chat_session(conversation_id)
            try:
                cursor.execute('''
                    INSERT INTO chat_messages (conversation_id, role, content, tool_calls)
                    VALUES (%s, %s, %s, %s)
                ''', (conversation_id, role, content, tool_calls_json))
                conn.commit()
                return True
            except Error:
                pass
        return False
    finally:
        try:
            cursor.close()
            conn.close()
        except Exception:
            pass



def add_observability_log(session_id, user_prompt, system_response, ttft_ms,
                           total_latency_ms, tokens_per_second, was_blocked, tools_executed):
    """Versión síncrona: escribe el log de observabilidad de forma segura."""
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        tools_json = json.dumps(tools_executed, default=custom_serializer) if tools_executed else None
        cursor.execute('''
            INSERT INTO observability_logs
              (session_id, user_prompt, system_response, ttft_ms,
               total_latency_ms, tokens_per_second, was_blocked, tools_executed)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ''', (session_id, user_prompt, system_response, ttft_ms,
              total_latency_ms, tokens_per_second, int(was_blocked), tools_json))
        conn.commit()
        return True
    except Error as e:
        print(f"[db_config] Error en add_observability_log: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()


def get_baker_profile_by_user_id(user_id):
    conn = get_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM baker_profiles WHERE user_id = %s', (user_id,))
        return cursor.fetchone()
    except Error as e:
        print(f"[db_config] Error en get_baker_profile_by_user_id: {e}", file=sys.stderr)
        return None
    finally:
        cursor.close()
        conn.close()

def get_baker_cakes(baker_id):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT c.*, cat.name as category_name
            FROM cakes c
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.baker_id = %s
            ORDER BY c.created_at DESC
        ''', (baker_id,))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_baker_cakes: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()

def add_baker_cake(baker_id, category_id, name, description, price, image_url=None, is_featured=0):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO cakes (baker_id, category_id, name, description, price, image_url, is_featured)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''', (baker_id, category_id, name, description, price, image_url, is_featured))
        conn.commit()
        return cursor.lastrowid
    except Error as e:
        print(f"[db_config] Error en add_baker_cake: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()

def update_baker_cake(baker_id, cake_id, name, description, price, category_id, is_featured=0):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE cakes 
            SET name = %s, description = %s, price = %s, category_id = %s, is_featured = %s 
            WHERE id = %s AND baker_id = %s
        ''', (name, description, price, category_id, is_featured, cake_id, baker_id))
        conn.commit()
        return cursor.rowcount > 0
    except Error as e:
        print(f"[db_config] Error en update_baker_cake: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()

def delete_baker_cake(baker_id, cake_id):
    conn = get_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM cakes WHERE id = %s AND baker_id = %s', (cake_id, baker_id))
        conn.commit()
        return cursor.rowcount > 0
    except Error as e:
        print(f"[db_config] Error en delete_baker_cake: {e}", file=sys.stderr)
        return False
    finally:
        cursor.close()
        conn.close()


def get_client_appointments(client_id):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT a.id, a.date, a.time_slot, a.notes, a.status, b.business_name as baker_business_name
            FROM appointments a
            JOIN baker_profiles b ON a.baker_id = b.id
            WHERE a.client_id = %s
            ORDER BY a.date ASC, a.time_slot ASC
        ''', (client_id,))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_client_appointments: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()


def get_baker_appointments(baker_user_id):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT a.id, a.date, a.time_slot, a.notes, a.status, u.name as client_name
            FROM appointments a
            JOIN users u ON a.client_id = u.id
            JOIN baker_profiles b ON a.baker_id = b.id
            WHERE b.user_id = %s
            ORDER BY a.date ASC, a.time_slot ASC
        ''', (baker_user_id,))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_baker_appointments: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()


def get_client_designs(client_id):
    conn = get_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT id, sponge, filling, decoration, size, notes, status, created_at
            FROM cake_designs
            WHERE client_id = %s
            ORDER BY created_at DESC
        ''', (client_id,))
        return cursor.fetchall()
    except Error as e:
        print(f"[db_config] Error en get_client_designs: {e}", file=sys.stderr)
        return []
    finally:
        cursor.close()
        conn.close()