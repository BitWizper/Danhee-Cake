#!/bin/bash

# Script de Backup Automático de Base de Datos MySQL
# Este script crea backups de la base de datos y los guarda con fecha

# Configuración
DB_HOST="database"
DB_USER="root"
DB_PASSWORD="${MYSQL_ROOT_PASSWORD:-cbd4373f5df5781a670f7b53064828d1ef452cea3bd8c410ee67d35a3a886d9c1253dc9f09e6d346ae1dc9705a69a5561e75e6653e3285c3dd22823df0c68969}"
DB_NAME="danhee_db"
BACKUP_DIR="/backups"
RETENTION_DAYS=7

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Nombre del archivo con fecha
BACKUP_FILE="$BACKUP_DIR/danhee_db_$(date +%Y%m%d_%H%M%S).sql.gz"

echo "[$(date)] Iniciando backup de base de datos..."

# Crear backup
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup exitoso: $BACKUP_FILE"
    
    # Calcular tamaño del backup
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Tamaño del backup: $SIZE"
else
    echo "[$(date)] ERROR: Falló el backup de base de datos"
    exit 1
fi

# Eliminar backups antiguos (retención de 7 días)
echo "[$(date)] Limpiando backups antiguos (más de $RETENTION_DAYS días)..."
find "$BACKUP_DIR" -name "danhee_db_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# Contar backups restantes
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/danhee_db_*.sql.gz 2>/dev/null | wc -l)
echo "[$(date)] Backups restantes: $BACKUP_COUNT"

echo "[$(date)] Proceso de backup completado"
