# Usar imagen oficial de Node.js
FROM node:18-bookworm

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de Node
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install

# Copiar el resto del código
COPY . .

# Comando para iniciar la aplicación
CMD ["node", "src/app.js"]