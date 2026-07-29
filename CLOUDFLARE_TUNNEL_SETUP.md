# Configuración de Cloudflare Quick Tunnels (TryCloudflare)

Esta guía explica cómo configurar Cloudflare Quick Tunnels para exponer tu API localmente sin necesidad de dominio propio ni cuenta.

## Requisitos Previos

- Docker y Docker Compose instalados
- Archivo `.env` configurado en la raíz del proyecto

## Pasos de Configuración

### 1. Crear archivo .env

Crea un archivo `.env` en la raíz del proyecto (no en `server/`) con el siguiente contenido:

```bash
# JWT Configuration
JWT_SECRET=tu_secreto_jwt_aqui
JWT_EXPIRES_IN=7d

# Database Configuration (para Docker)
DB_HOST=database
DB_PORT=3306
DB_NAME=danhee_db
DB_USER=usuario
DB_PASSWORD=tu_contraseña_mysql_aqui
MYSQL_ROOT_PASSWORD=tu_contraseña_root_mysql_aqui

# Local Database Configuration
LOCAL_DB_NAME=danhee_db
LOCAL_DB_USER=usuario
LOCAL_DB_PASSWORD=tu_contraseña_mysql_aqui

# RAG Microservice
START_RAG=true
OLLAMA_HOST=host.docker.internal
```

**IMPORTANTE**: El archivo `.env` ya está protegido en `.gitignore` para no exponer tus credenciales.

### 2. Iniciar los servicios

```bash
docker-compose up -d
```

Esto iniciará:
- **backend**: Tu API en el puerto 4000 (local) y 5000 (interno Docker)
- **database**: MySQL 8.0
- **cloudflared**: Cloudflare Quick Tunnel que expone tu API públicamente

### 3. Verificar que los servicios estén corriendo

```bash
docker ps
```

Debes ver 3 contenedores activos: `backend`, `database`, y `cloudflared_tunnel`.

### 4. Obtener la URL pública

Después de iniciar los servicios, obtén la URL pública generada por Cloudflare:

```bash
docker logs cloudflared_tunnel
```

Verás una línea similar a:
```
https://xxxx-xxxx-xxxx.trycloudflare.com
```

Esta URL es tu endpoint público para la API.

### 5. Verificar la conexión

Tu API estará disponible en:
- **Local**: `http://localhost:4000`
- **Pública**: `https://xxxx-xxxx-xxxx.trycloudflare.com` (URL generada por Cloudflare)

## Características de Quick Tunnels

- **Gratis**: No requiere cuenta ni pago
- **Sin dominio**: Genera subdominio aleatorio en `trycloudflare.com`
- **HTTPS automático**: Certificados SSL automáticos
- **Seguridad**: Protección DDoS de Cloudflare incluida
- **Fácil**: Un solo comando, sin configuración

## Configuración Adicional

### Probar la API

Puedes probar tu API usando la URL pública:

```bash
curl https://tu-url.trycloudflare.com/api/endpoint
```

### La URL cambia cada vez

- Esto es normal en Quick Tunnels
- Cada vez que reinicias el contenedor, se genera una nueva URL
- Para URL fija, necesitas dominio propio + Cloudflare Tunnel estándar

## Troubleshooting

### El tunnel no se conecta

- Revisa los logs del contenedor: `docker logs cloudflared_tunnel`
- Asegúrate de que el servicio backend esté corriendo: `docker ps`

### Error 502 Bad Gateway

- Verifica que el servicio backend esté accesible internamente en `http://backend:5000`
- Revisa los logs del backend: `docker logs danhee-backend-1`

### La URL no aparece en los logs

- Espera unos segundos después de iniciar el contenedor
- Cloudflare necesita tiempo para generar el subdominio
- Revisa los logs nuevamente: `docker logs cloudflared_tunnel`

## Limitaciones

- La URL cambia cada vez que reinicias el contenedor
- No hay SLA garantizado (servicio de prueba/desarrollo)
- Diseñado para desarrollo y pruebas, no para producción

Para uso en producción con URL fija, considera comprar dominio y usar Cloudflare Tunnel estándar.
