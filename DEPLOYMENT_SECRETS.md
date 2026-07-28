## Gestión de secretos y configuración segura para despliegue

Este documento explica cómo configurar variables de entorno seguras para la aplicación Danhee, con instrucciones específicas para Clever Cloud y para despliegue local con Docker Compose.

Resumen corto
- Nunca guardes `server/.env` ni credenciales reales en el repositorio.
- Usa las variables de entorno del proveedor (Clever Cloud) o un secreto del orquestador.
- Genera un `JWT_SECRET` fuerte (64 bytes, base64) y guárdalo en el entorno de producción.

Variables requeridas
- `DB_HOST` — host de MySQL (ej: `bvtdjsmypbwpngczasgf-mysql.services.clever-cloud.com`)
- `DB_PORT` — puerto (por defecto `3306`)
- `DB_NAME` — nombre de la base de datos
- `DB_USER` — usuario de la base de datos
- `DB_PASSWORD` — contraseña de la base de datos
- `JWT_SECRET` — secreto fuerte para firmar JWT (requisito de seguridad)
- `JWT_EXPIRES_IN` — expiración del token (ej: `7d`)
- `PORT`, `NODE_ENV`, `FRONTEND_URL` — otros variables de configuración

Cómo establecer variables en Clever Cloud
1. Entra en tu app en la consola de Clever Cloud.
2. Ve a la pestaña *Environment* o *Environment variables*.
3. Añade cada variable listada arriba con su valor correspondiente.
4. Reinicia la aplicación desde la consola para que los cambios tomen efecto.

Notas para Docker Compose local
- Para pruebas locales usa un archivo `.env.local` (no lo añadas al repo). En `docker-compose.yml` ya se usan interpolaciones de entorno (`${VAR:-}`), por lo que basta con exportar las variables o crear un archivo `.env.local` y ejecutar:

```sh
docker compose --env-file .env.local up --build
```

Generar y rotar `JWT_SECRET`
- Linux / macOS / WSL:
  ```sh
  openssl rand -base64 64
  ```
- PowerShell (Windows):
  ```powershell
  node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
  ```

Rotación segura:
1. Genera el nuevo `JWT_SECRET` en tu entorno de despliegue.
2. Actualiza la variable en Clever Cloud (o tu gestor de secretos).
3. Reinicia la app.
4. Si necesitas soportar tokens antiguos durante la rotación, considera un proceso de clave dual (no implementado por defecto aquí).

Buenas prácticas adicionales
- Usa un gestor de secretos (Vault, AWS Secrets Manager, Clever Cloud env vars) para entornos productivos.
- Audit logs: registra cambios de secrets en tu proceso de CI/CD.
- Limita accesos al panel de Clever Cloud y habilita 2FA.

Si quieres, puedo generar un `JWT_SECRET` ahora y dejarlo listo para que lo copies al panel de Clever Cloud.
