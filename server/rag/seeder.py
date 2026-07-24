"""
seeder.py — Script de sembrado de datos de estrés (10,000+ registros ficticios realistas)
para evaluar latencias de búsqueda y optimización de índices HNSW / B-Tree.
"""

import sys
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

base_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(base_dir))

from db_config import get_connection

CATEGORIES = ["Cumpleaños", "Boda", "XV Años", "Baby Shower", "Aniversario", "Graduación", "Infantil", "Corporativo"]
FLAVORS = ["Vainilla", "Chocolate", "Tres Leches", "Red Velvet", "Fresa", "Zanahoria", "Limón", "Oreo", "Café", "Nutella"]
FILLINGS = ["Buttercream", "Dulce de Leche", "Crema Pastelera", "Frutos Rojos", "Ganache de Chocolate", "Queso Crema"]
LOCATIONS = ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Querétaro", "Mérida", "León", "Toluca"]

def seed_stress_data(num_records: int = 10000):
    """
    Genera e inserta en lote (bulk transaction) 10,000+ registros ficticios realistas.
    Mide el tiempo transcurrido para validar transacciones optimizadas.
    """
    print("=" * 70)
    print(f"🚀 INICIANDO SEMBRADO DE DATOS DE ESTRÉS ({num_records:,} REGISTROS)")
    print("=" * 70)
    
    conn = get_connection()
    if not conn:
        print("❌ No se pudo establecer conexión a la base de datos.", file=sys.stderr)
        return
        
    start_time = time.time()
    cursor = conn.cursor()

    try:
        # Verificar o crear tabla de benchmark de estrés si no existe
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS benchmark_stress_cakes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                price DECIMAL(10,2),
                baker_name VARCHAR(150),
                location VARCHAR(100),
                created_at DATETIME,
                INDEX idx_category (category),
                INDEX idx_price (price),
                INDEX idx_location (location)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        print(f"🌱 Generando {num_records:,} registros en memoria...")
        records = []
        base_date = datetime.now() - timedelta(days=365)

        for i in range(num_records):
            name = f"Pastel {random.choice(FLAVORS)} {random.choice(FILLINGS)} Premium #{i+1}"
            category = random.choice(CATEGORIES)
            price = round(random.uniform(250.0, 2500.0), 2)
            baker = f"Pastelería Gourmet #{random.randint(1, 200)}"
            location = random.choice(LOCATIONS)
            created_at = base_date + timedelta(minutes=random.randint(0, 525600))
            records.append((name, category, price, baker, location, created_at))

        print(f"📦 Insertando registros mediante Bulk Insert / Transacción Empaquetada...")
        insert_query = """
            INSERT INTO benchmark_stress_cakes (name, category, price, baker_name, location, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        
        # Ejecutar inserción en lotes de 2,000 registros
        batch_size = 2000
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            cursor.executemany(insert_query, batch)
            conn.commit()
            print(f"   • Insertados {i + len(batch):,} / {num_records:,} registros...")

        elapsed = time.time() - start_time
        print("\n" + "=" * 70)
        print(f"✅ SEMBRADO COMPLETADO EN {elapsed:.2f} SEGUNDOS")
        print(f"⚡ Velocidad: {int(num_records / elapsed):,} registros/segundo")
        print("=" * 70)

    except Exception as e:
        conn.rollback()
        print(f"❌ Error durante el sembrado de datos: {e}", file=sys.stderr)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    count = 10000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        count = int(sys.argv[1])
    seed_stress_data(count)
