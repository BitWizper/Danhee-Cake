# Frontend Dockerfile for Vite + React app
FROM node:20.19-alpine AS builder
WORKDIR /app

# Install dependencies and build the app
COPY package*.json ./
RUN npm install

COPY . .
# Build with VITE_BASE_URL empty to use relative paths
ARG VITE_BASE_URL=
ENV VITE_BASE_URL=$VITE_BASE_URL
RUN npm run build

# Production image
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Install envsubst (gettext) to allow runtime templating of nginx config
RUN apk add --no-cache gettext

# Copy template and entrypoint
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
