# Usar una imagen oficial de Node.js ligera
FROM node:18-bullseye

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de Node
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install

# Copiar el resto del código
COPY . .

# Comando para iniciar la aplicación (ajustado a tu estructura)
CMD ["node", "src/app.js"]