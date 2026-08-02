# Usar imagen oficial de Node.js con versión específica
FROM node:20.11-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de Node desde el directorio server
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install

# Copiar el resto del código del directorio server
COPY . .

# Comando para iniciar la aplicación
CMD ["node", "src/app.js"]