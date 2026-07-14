# Usar una imagen oficial de Node.js ligera basada en Bookworm para sqlite3 reciente
FROM node:18-bookworm

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de Node
COPY package*.json ./
COPY requirements.txt ./

# Instalar dependencias de Node
RUN npm install

# Instalar Python 3 y crear un virtualenv para el microservicio RAG
RUN apt-get update && \
        apt-get install -y --no-install-recommends \
            python3 \
            python3-venv \
            python3-pip \
            python-is-python3 \
            build-essential \
            python3-dev \
            sqlite3 \
            libsqlite3-dev && \
        python3 -m venv /opt/venv && \
        /opt/venv/bin/pip install --upgrade pip setuptools wheel && \
        /opt/venv/bin/pip install --no-cache-dir -r requirements.txt && \
        rm -rf /var/lib/apt/lists/*

# Usar el virtualenv por defecto
ENV PATH="/opt/venv/bin:$PATH"

# Copiar el resto del código
COPY . .

# Comando para iniciar la aplicación (ajustado a tu estructura)
CMD ["node", "src/app.js"]