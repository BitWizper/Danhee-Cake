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
