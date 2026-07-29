# Usar imagen oficial de Node.js
FROM node:18-bookworm

# Directorio de trabajo
WORKDIR /app/rag

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer puerto del RAG
EXPOSE 5001

# Comando para iniciar el servidor RAG
CMD ["node", "app.js"]
