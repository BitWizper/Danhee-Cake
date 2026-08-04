# Manual de Instalacion - Danhee Cake

> Pasteleria Personalizada | Windows 11
> Desarrollo Local + Produccion Docker + Chatbot IA (Ollama/RAG)

---

## Tabla de Contenidos

1. [Arquitectura del Proyecto](#1-arquitectura-del-proyecto)
2. [Herramientas Requeridas](#2-herramientas-requeridas)
3. [Instalacion de Herramientas Base](#3-instalacion-de-herramientas-base)
4. [Clonacion del Repositorio](#4-clonacion-del-repositorio)
5. [Configuracion de Variables de Entorno](#5-configuracion-de-variables-de-entorno)
6. [Modo Desarrollo Local (sin Docker)](#6-modo-desarrollo-local-sin-docker)
7. [Modo Produccion (Docker Compose)](#7-modo-produccion-docker-compose)
8. [Configuracion de Ollama + RAG (Chatbot IA)](#8-configuracion-de-ollama--rag-chatbot-ia)
9. [Configuracion de Cloudinary](#9-configuracion-de-cloudinary)
10. [Configuracion de Clever Cloud (MySQL Produccion)](#10-configuracion-de-clever-cloud-mysql-produccion)
11. [Deploy Frontend en Vercel](#11-deploy-frontend-en-vercel)
12. [Cloudflare Tunnel](#12-cloudflare-tunnel)
13. [Verificacion de Instalacion](#13-verificacion-de-instalacion)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Arquitectura del Proyecto

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│   React 18 + Vite 8 + Three.js + React Router              │
│   Deploy: Vercel (produccion) / localhost:5173 (dev)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP /api/*
┌──────────────────────────▼──────────────────────────────────┐
│                     BACKEND (Express 5)                      │
│   JWT Auth + Rate Limiting + Helmet + Multer               │
│   Puerto: 4000                                              │
├─────────────┬────────────────┬──────────────────────────────┤
│  MySQL 8.0  │  ChromaDB      │  RAG Service (Node.js)      │
│  (datos)    │  (vectores)    │  LangChain + Ollama          │
│  Puerto:3306│  Puerto:8000   │  Puerto: 5001               │
└─────────────┴────────────────┴──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Cloudflare Tunnel / Nginx                       │
│   Expone backend a internet                                  │
└─────────────────────────────────────────────────────────────┘
```

### Servicios principales:

| Servicio       | Tecnologia        | Puerto  | Descripcion                          |
|----------------|-------------------|---------|--------------------------------------|
| Frontend       | React + Vite      | 3000/5173 | Interfaz de usuario                |
| Backend        | Express 5 (Node)  | 4000    | API REST + Auth JWT                 |
| MySQL          | MySQL 8.0.36      | 3306    | Base de datos relacional            |
| ChromaDB       | Chroma 0.4.24     | 8000    | Base de datos vectorial (RAG)       |
| RAG Service    | Node.js+LangChain | 5001    | Microservicio chatbot IA            |
| Nginx          | Nginx 1.25        | 80      | Reverse proxy + static files        |
| Cloudflared    | cloudflared       | -       | Tunel a internet                    |

---

## 2. Herramientas Requeridas

### Software obligatorio:

| Herramienta        | Version      | Uso                              | Descarga |
|--------------------|-------------|----------------------------------|----------|
| **Node.js**        | 20.x LTS    | Frontend + Backend               | https://nodejs.org |
| **Docker Desktop** | 4.x+        | Contenedores (produccion)        | https://docker.com/products/docker-desktop |
| **Git**            | 2.x+        | Control de versiones             | https://git-scm.com |
| **MySQL**          | 8.0 (opt.)  | Solo si NO usas Docker para DB   | https://dev.mysql.com/downloads/mysql |

### Software para Chatbot IA (Opcional):

| Herramienta        | Version      | Uso                              | Descarga |
|--------------------|-------------|----------------------------------|----------|
| **Ollama**         | Latest      | Modelos de lenguaje local        | https://ollama.com |

### Cuentas necesarias:

| Servicio       | Uso                                  | Costo    |
|----------------|--------------------------------------|----------|
| **Cloudinary** | Almacenamiento de imagenes           | Gratis   |
| **Vercel**     | Deploy del frontend                  | Gratis   |
| **Clever Cloud** | MySQL en produccion (opcional)    | Pago     |
| **Cloudflare** | Tunel para exponer backend           | Gratis   |

---

## 3. Instalacion de Herramientas Base

### 3.1 Node.js 20.x LTS

```powershell
# Verificar si ya esta instalado
node --version

# Si no esta instalado, descargar e instalar desde:
# https://nodejs.org/en/download (version 20.x LTS)

# Verificar instalacion
node --version    # Debe mostrar v20.x.x
npm --version     # Debe mostrar 10.x.x
```

### 3.2 Git

```powershell
# Verificar si ya esta instalado
git --version

# Si no esta instalado, descargar desde:
# https://git-scm.com/download/win

# Verificar instalacion
git --version
```

### 3.3 Docker Desktop

```powershell
# 1. Descargar Docker Desktop desde:
#    https://www.docker.com/products/docker-desktop/

# 2. Instalar y reiniciar el equipo

# 3. Abrir Docker Desktop y verificar que el engine este corriendo
#    (icono de Docker en la barra de tareas debe estar verde/estable)

# 4. Verificar en terminal:
docker --version
docker compose version

# 5. Habilitar WSL 2 backend (Docker lo solicita durante la instalacion)
```

### 3.4 Ollama (para chatbot IA)

```powershell
# 1. Descargar desde: https://ollama.com/download

# 2. Instalar ejecutando el instalador

# 3. Verificar que Ollama esta corriendo:
ollama --version

# 4. Descargar modelo recomendado para RAG:
ollama pull llama3.2

# 5. Verificar que el modelo esta disponible:
ollama list
```

---

## 4. Clonacion del Repositorio

```powershell
# Navegar a la carpeta donde quieres el proyecto
cd D:\Proyectos

# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO> Danhee-Cake

# Entrar al directorio del proyecto
cd Danhee-Cake
```

---

## 5. Configuracion de Variables de Entorno

### 5.1 Archivo .env raiz (Frontend + Docker)

```powershell
# Copiar el archivo de ejemplo
Copy-Item .env.example .env

# Editar el archivo .env con los valores reales
notepad .env
```

**Configuracion minima para desarrollo local:**

```env
# ============================================================
# Database - Local (Docker)
# ============================================================
LOCAL_DB_NAME=danhee_db
LOCAL_DB_USER=usuario
LOCAL_DB_PASSWORD=password
MYSQL_ROOT_PASSWORD=<generar-uno-seguro>

# ============================================================
# JWT / Autenticacion
# ============================================================
JWT_SECRET=<se-genera-automaticamente>
REFRESH_TOKEN_SECRET=<se-genera-automaticamente>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# ============================================================
# Server
# ============================================================
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# ============================================================
# RAG / Ollama
# ============================================================
START_RAG=false
OLLAMA_HOST=localhost
CHROMA_HOST=http://localhost:8000
RAG_SERVICE_URL=http://localhost:5001
RAG_SERVICE_SECRET=<generar-uno-seguro>
RAG_PORT=5001
```

### 5.2 Archivo server/.env (Backend)

```powershell
# Crear/editar el archivo de entorno del backend
notepad server/.env
```

**Configuracion para desarrollo local (sin Clever Cloud):**

```env
# ============================================================
# Database - Local
# ============================================================
DB_HOST=localhost
DB_PORT=3306
DB_NAME=danhee_db
DB_USER=usuario
DB_PASSWORD=password
DB_USE_LOCAL_DB=true

# ============================================================
# JWT / Autenticacion
# ============================================================
JWT_SECRET=<mismo-que-el-env-raiz>
REFRESH_TOKEN_SECRET=<mismo-que-el-env-raiz>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# ============================================================
# Server
# ============================================================
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# ============================================================
# RAG / Ollama
# ============================================================
START_RAG=false
OLLAMA_HOST=localhost
CHROMA_HOST=http://localhost:8000
RAG_SERVICE_URL=http://localhost:5001
RAG_SERVICE_SECRET=<mismo-que-el-env-raiz>

# ============================================================
# Cloudinary
# ============================================================
CLOUDINARY_CLOUD_NAME=<tu-cloud-name>
CLOUDINARY_API_KEY=<tu-api-key>
CLOUDINARY_API_SECRET=<tu-api-secret>
```

### 5.3 Generar secretos automaticamente

```powershell
# Ejecutar el script de configuracion automatica
npm run setup:dev
```

Este script genera automaticamente `JWT_SECRET` y `REFRESH_TOKEN_SECRET` seguros.

---

## 6. Modo Desarrollo Local (sin Docker)

> Ideal para programar. Cada servicio se corre manualmente.

### 6.1 Instalar MySQL localmente

**Opcion A: MySQL instalado directamente en Windows**

```powershell
# 1. Descargar MySQL Installer desde:
#    https://dev.mysql.com/downloads/installer/

# 2. Instalar MySQL Server 8.0 + MySQL Workbench

# 3. Crear base de datos y usuario:
#    Abrir MySQL Workbench y ejecutar:

CREATE DATABASE danhee_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'usuario'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON danhee_db.* TO 'usuario'@'localhost';
FLUSH PRIVILEGES;

# 4. Ejecutar el schema:
#    En MySQL Workbench, abrir server/init-local-db.sql y ejecutarlo
```

**Opcion B: MySQL con Docker (solo la base de datos)**

```powershell
# Levantar solo MySQL en Docker
docker run -d --name danhee-mysql `
  -p 3306:3306 `
  -e MYSQL_ROOT_PASSWORD=rootpassword `
  -e MYSQL_DATABASE=danhee_db `
  -e MYSQL_USER=usuario `
  -e MYSQL_PASSWORD=password `
  mysql:8.0.36

# Esperar ~30 segundos a que MySQL este listo
# Luego ejecutar el schema:
docker exec -i danhee-mysql mysql -u usuario -ppassword danhee_db < server/init-local-db.sql
```

### 6.2 Instalar dependencias del Frontend

```powershell
# En la raiz del proyecto
npm install
```

### 6.3 Instalar dependencias del Backend

```powershell
# En la carpeta del servidor
cd server
npm install
cd ..
```

### 6.4 Instalar dependencias del RAG Service

```powershell
# En la carpeta del servicio RAG
cd server/rag
npm install
cd ../..
```

### 6.5 Iniciar servicios (en terminales separadas)

**Terminal 1 - Frontend:**
```powershell
npm run dev
# Abre http://localhost:5173
```

**Terminal 2 - Backend:**
```powershell
cd server
npm run dev
# API en http://localhost:4000
```

**Terminal 3 - RAG Service (opcional, requiere Ollama):**
```powershell
cd server/rag
npm run dev
# RAG en http://localhost:5001
```

### 6.6 Verificar desarrollo local

```powershell
# Frontend
curl http://localhost:5173

# Backend health check
curl http://localhost:4000/api/health

# RAG service (si esta corriendo)
curl http://localhost:5001/health
```

---

## 7. Modo Produccion (Docker Compose)

> Levanta TODO el stack en contenedores: frontend, backend, MySQL, ChromaDB, RAG, Cloudflare Tunnel.

### 7.1 Preparar archivos de entorno

```powershell
# Asegurar que el .env raiz existe y tiene los valores correctos
# (ver seccion 5)

# Verificar que server/.env existe
Test-Path server/.env
```

### 7.2 Levantar todos los servicios

```powershell
# Construir y levantar todos los contenedores
docker compose up --build -d

# Ver el estado de los contenedores
docker compose ps

# Ver logs en tiempo real
docker compose logs -f
```

### 7.3 Inicializar base de datos (primera vez)

```powershell
# Esperar a que MySQL este listo (~30 segundos)
# Luego ejecutar el schema:
Get-Content server/init-local-db.sql | docker compose exec -T database mysql -u usuario -ppassword danhee_db
```

### 7.4 Acceder a los servicios

| Servicio    | URL                           |
|-------------|-------------------------------|
| Frontend    | http://localhost:3000         |
| Backend API | http://localhost:4000         |
| Backend (debug) | http://localhost:5005     |

### 7.5 Comandos utiles de Docker

```powershell
# Detener todos los servicios
docker compose down

# Detener y borrar volumenes (cuidado: borra la BD)
docker compose down -v

# Reiniciar un servicio especifico
docker compose restart backend

# Ver logs de un servicio especifico
docker compose logs -f backend
docker compose logs -f database
docker compose logs -f chromadb
docker compose logs -f rag-service

# Entrar a la consola de un contenedor
docker compose exec backend sh
docker compose exec database mysql -u usuario -ppassword danhee_db

# Reconstruir solo un servicio
docker compose up --build -d backend
```

### 7.6 Backup de base de datos

```powershell
# Ejecutar backup manual
docker compose run --rm backup

# Los backups se guardan en el volumen db_backups
```

---

## 8. Configuracion de Ollama + RAG (Chatbot IA)

### 8.1 Instalar Ollama

```powershell
# 1. Descargar desde https://ollama.com/download
# 2. Instalar (el instalador configura el servicio automaticamente)
# 3. Verificar que Ollama esta corriendo:
ollama list
```

### 8.2 Descargar modelo de lenguaje

```powershell
# Modelo recomendado (3.8GB, buen balance calidad/rendimiento):
ollama pull llama3.2

# Modelo mas ligero si tienes poca RAM (2GB):
ollama pull llama3.2:1b

# Verificar que el modelo se descargo:
ollama list
```

### 8.3 Configurar Ollama para acepter conexiones externas

Ollama por defecto solo escucha en localhost. Para que Docker pueda conectarse:

**En Windows (variables de entorno del sistema):**

```powershell
# Agregar variable de entorno del sistema:
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")

# Reiniciar el servicio de Ollama:
# Abrir Task Manager > Services > Ollama > Restart
# O simplemente reiniciar el equipo
```

### 8.4 Levantar ChromaDB (base de datos vectorial)

**Sin Docker (desarrollo local):**
```powershell
# ChromaDB requiere Python. Instalar con pip:
pip install chromadb

# Ejecutar ChromaDB:
chroma run --path ./chroma-data --port 8000
```

**Con Docker (recomendado):**
```powershell
docker run -d --name chromadb `
  -p 8000:8000 `
  -v chroma_data:/chroma/chroma `
  chromadb/chroma:0.4.24
```

### 8.5 Inicializar el servicio RAG

```powershell
# Instalar dependencias del RAG
cd server/rag
npm install

# Inicializar ChromaDB (crear colecciones)
node init-chroma.js

# Ingerir documentos para el chatbot (si hay documentos en data/)
node ingest-documents.js

# Iniciar el servicio RAG
npm run dev
```

### 8.6 Configurar variables para RAG

En `server/.env` y `.env` raiz:

```env
START_RAG=true
OLLAMA_HOST=localhost          # O host.docker.internal si usas Docker
CHROMA_HOST=http://localhost:8000
RAG_SERVICE_URL=http://localhost:5001
RAG_SERVICE_SECRET=<tu-secret-aqui>
```

En Docker Compose, el `OLLAMA_HOST` debe ser `host.docker.internal`:

```env
OLLAMA_HOST=host.docker.internal
```

### 8.7 Verificar el chatbot IA

```powershell
# Verificar que Ollama responde:
curl http://localhost:11434/api/tags

# Verificar que ChromaDB esta activo:
curl http://localhost:8000/api/v1/heartbeat

# Verificar que el RAG service responde:
curl http://localhost:5001/health
```

---

## 9. Configuracion de Cloudinary

Cloudinary se usa para almacenar imagenes de pasteles y perfiles.

### 9.1 Crear cuenta

1. Ir a https://cloudinary.com y crear cuenta gratuita
2. En el dashboard, anotar las credenciales:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

### 9.2 Configurar en el proyecto

En `server/.env`:

```env
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret
```

### 9.3 Verificar

Las imagenes se suben automaticamente al crear pasteles o actualizar perfiles. No se requiere configuracion adicional.

---

## 10. Configuracion de Clever Cloud (MySQL Produccion)

> Opcional: para tener base de datos MySQL en produccion fuera de Docker.

### 10.1 Crear addon MySQL en Clever Cloud

1. Crear cuenta en https://www.clever-cloud.com
2. Crear un addon **MySQL**
3. Anotar las credenciales proporcionadas:
   - Host
   - Port
   - Database name
   - User
   - Password

### 10.2 Configurar en el proyecto

En `server/.env`:

```env
DB_HOST=bvtdjsmypbwpngczasgf-mysql.services.clever-cloud.com
DB_PORT=3306
DB_NAME=bvtdjsmypbwpngczasgf
DB_USER=ueixm6eypteu4pjt
DB_PASSWORD=<tu-password>
DB_USE_LOCAL_DB=false
```

### 10.3 Ejecutar schema en Clever Cloud

```powershell
# Conectar con MySQL Workbench usando las credenciales de Clever Cloud
# Abrir server/schema.sql y ejecutarlo contra la base de datos remota
```

### 10.4 Cambiar entre local y produccion

```env
# Para usar Clever Cloud:
DB_USE_LOCAL_DB=false

# Para usar MySQL local (Docker o instalado):
DB_USE_LOCAL_DB=true
```

---

## 11. Deploy Frontend en Vercel

### 11.1 Preparar el proyecto

```powershell
# Instalar Vercel CLI
npm install -g vercel
```

### 11.2 Deploy

```powershell
# Desde la raiz del proyecto
vercel

# Seguir las instrucciones (el archivo vercel.json ya esta configurado)
```

### 11.3 Configurar variables de entorno en Vercel

En el dashboard de Vercel, agregar:

| Variable          | Valor                                      |
|-------------------|--------------------------------------------|
| `VITE_BASE_URL`   | URL del backend (Cloudflare o produccion)  |

### 11.4 Deploy automatico

Vercel hace deploy automatico en cada push a la rama principal si conectas el repositorio de GitHub.

---

## 12. Cloudflare Tunnel

> Expone el backend a internet sin necesidad de puertos abiertos ni IP publica.

### 12.1 Con Docker (incluido en docker-compose)

```powershell
# El tunel se levanta automaticamente con docker compose
# Obtener la URL generada:
docker compose logs cloudflared | Select-String "trycloudflare.com"
```

La URL sera algo como: `https://snitch-wing-riddance.ngrok-free.dev`

### 12.2 Actualizar URL del backend

Cuando la URL del tunel cambie, actualizar:

**En `server/.env`:**
```env
FRONTEND_URL=https://tu-frontend.vercel.app
```

**En Vercel (variables de entorno):**
```
VITE_BASE_URL=https://nueva-url-del-tunel.trycloudflare.com
```

**Script automatico (Windows):**
```powershell
.\update-cloudflare-url.ps1
```

---

## 13. Verificacion de Instalacion

### Checklist rapido:

```powershell
# 1. Verificar herramientas base
node --version          # v20.x.x
npm --version           # 10.x.x
git --version           # 2.x.x
docker --version        # 24.x.x
docker compose version  # 2.x.x
ollama --version        # 0.x.x (si se instalo)

# 2. Verificar frontend (desarrollo)
curl http://localhost:5173

# 3. Verificar backend
curl http://localhost:4000/api/health

# 4. Verificar base de datos
# Con Docker:
docker compose exec database mysql -u usuario -ppassword -e "SHOW TABLES;" danhee_db

# Sin Docker (MySQL local):
mysql -u usuario -ppassword -e "SHOW TABLES;" danhee_db

# 5. Verificar ChromaDB
curl http://localhost:8000/api/v1/heartbeat

# 6. Verificar Ollama
curl http://localhost:11434/api/tags

# 7. Verificar RAG Service
curl http://localhost:5001/health

# 8. Verificar Docker (produccion)
docker compose ps
# Todos los servicios deben estar "Up" o "running"
```

### Prueba funcional completa:

1. Abrir `http://localhost:5173` (dev) o `http://localhost:3000` (Docker)
2. Registrarse como usuario nuevo
3. Verificar que las categorias se cargan (requiere BD con seed)
4. Probar el chatbot IA (si RAG esta activo)

---

## 14. Troubleshooting

### Error: "Cannot find module"

```powershell
# Borrar node_modules y reinstalar
Remove-Item -Recurse -Force node_modules
npm install

# Lo mismo para el backend:
cd server
Remove-Item -Recurse -Force node_modules
npm install
```

### Error: "ECONNREFUSED" al conectar a MySQL

```powershell
# Verificar que MySQL esta corriendo
# Con Docker:
docker compose ps database
docker compose logs database

# Sin Docker: Verificar que el servicio MySQL esta activo en Windows
Get-Service MySQL80
```

### Error: "Access denied for user"

```powershell
# Verificar credenciales en server/.env
# Asegurar que el usuario existe en MySQL:
# Con Docker:
docker compose exec database mysql -u root -p<root-password> -e "SELECT User, Host FROM mysql.user;"
```

### Error: Ollama no responde desde Docker

```powershell
# Verificar que Ollama escucha en todas las interfaces:
# Variable de entorno OLLAMA_HOST=0.0.0.0:11434

# En Docker Compose, usar host.docker.internal:
# OLLAMA_HOST=host.docker.internal

# Verificar firewall de Windows:
# Permitir conexiones entrantes al puerto 11434
```

### Error: ChromaDB no conecta

```powershell
# Verificar que ChromaDB esta corriendo:
docker compose ps chromadb

# Reiniciar ChromaDB:
docker compose restart chromadb
```

### Error: Puerto ya en uso

```powershell
# Ver que proceso usa el puerto:
netstat -ano | findstr :4000
netstat -ano | findstr :3000
netstat -ano | findstr :3306

# Matar el proceso:
taskkill /PID <PID> /F
```

### Error: Docker "no space left on device"

```powershell
# Limpiar imagenes y contenedores no utilizados:
docker system prune -a --volumes
```

### Error: Frontend no conecta con backend

```powershell
# Verificar que el proxy de Vite esta configurado (vite.config.js):
# proxy: { '/api': 'http://localhost:4000' }

# Verificar que el backend esta corriendo:
curl http://localhost:4000/api/health

# Verificar CORS en server/.env:
# FRONTEND_URL=http://localhost:5173
```

### El chatbot no responde

```powershell
# 1. Verificar Ollama:
ollama list                    # Debe mostrar el modelo
ollama run llama3.2 "hola"    # Probar directamente

# 2. Verificar RAG service:
curl http://localhost:5001/health

# 3. Verificar ChromaDB:
curl http://localhost:8000/api/v1/heartbeat

# 4. Verificar variables de entorno:
# START_RAG=true
# OLLAMA_HOST=localhost (o host.docker.internal en Docker)
```

### Base de datos vacia (no hay categorias)

```powershell
# Ejecutar el seed manualmente:
# Con Docker:
Get-Content server/init-local-db.sql | docker compose exec -T database mysql -u usuario -ppassword danhee_db

# Sin Docker:
Get-Content server/init-local-db.sql | mysql -u usuario -ppassword danhee_db
```

---

## Resumen de comandos rapidos

### Desarrollo local:

```powershell
# 1. Configurar entorno
npm run setup:dev

# 2. Instalar dependencias
npm install
cd server; npm install; cd ../server/rag; npm install; cd ../..

# 3. Levantar MySQL (si usa Docker solo para DB)
docker run -d --name danhee-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=rootpassword -e MYSQL_DATABASE=danhee_db -e MYSQL_USER=usuario -e MYSQL_PASSWORD=password mysql:8.0.36

# 4. Inicializar BD
Get-Content server/init-local-db.sql | docker exec -i danhee-mysql mysql -u usuario -ppassword danhee_db

# 5. Iniciar servicios (en terminales separadas)
npm run dev              # Terminal 1: Frontend
cd server; npm run dev   # Terminal 2: Backend
cd server/rag; npm run dev  # Terminal 3: RAG (opcional)
```

### Produccion Docker:

```powershell
# Levantar todo
docker compose up --build -d

# Ver logs
docker compose logs -f

# Detener todo
docker compose down

# Reiniciar todo
docker compose restart
```

---

*Manual generado para Danhee Cake - Pasteleria Personalizada*
*Ultima actualizacion: Agosto 2026*
