# Migración de Base de Datos - Índices de Optimización

## Descripción
Este script agrega índices a las tablas de la base de datos `danhee_db` para optimizar el rendimiento de las queries del chatbot RAG.

## Cómo ejecutar

### Opción 1: MySQL CLI
```bash
mysql -u tu_usuario -p danhee_db < server/rag/migrations/add_indexes.sql
```

### Opción 2: Docker (si usas Docker Compose)
```bash
docker compose exec database mysql -u usuario -ppassword danhee_db < server/rag/migrations/add_indexes.sql
```

### Opción 3: phpMyAdmin o similar
1. Abre phpMyAdmin
2. Selecciona la base de datos `danhee_db`
3. Ve a la pestaña "SQL"
4. Copia y pega el contenido de `add_indexes.sql`
5. Ejecuta

## Verificación
Después de ejecutar el script, verifica que los índices se crearon correctamente:

```sql
SHOW INDEX FROM chat_sessions;
SHOW INDEX FROM chat_messages;
SHOW INDEX FROM cakes;
SHOW INDEX FROM baker_profiles;
SHOW INDEX FROM appointments;
```

## Impacto esperado
- **Queries de chat**: 50-80% más rápidas (índices en `conversation_id`, `client_id`)
- **Búsqueda de pasteles**: 30-50% más rápida (índices en `baker_id`, `category_id`)
- **Verificación de citas**: 60-90% más rápida (índice compuesto en `baker_id + date`)
- **Historial de conversaciones**: 40-60% más rápido (índices en `created_at`, `role`)

## Notas
- Los índices `IF NOT EXISTS` no fallarán si ya existen
- El script incluye una query final para verificar todos los índices creados
- No se requiere downtime para agregar índices en la mayoría de los casos
