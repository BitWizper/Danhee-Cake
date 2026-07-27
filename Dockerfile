# Frontend Dockerfile for Vite + React app
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies and build the app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production image
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config to support SPA routing if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates
COPY ssl/ /etc/nginx/ssl/

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
