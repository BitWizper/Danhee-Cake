#!/usr/bin/env sh
# Template nginx config with environment variables and start nginx
set -e

TEMPLATE=/etc/nginx/conf.d/default.conf.template
TARGET=/etc/nginx/conf.d/default.conf

if [ -f "$TEMPLATE" ]; then
  echo "Rendering nginx config from template"
  # Substitute BACKEND_URL if provided; default to http://localhost:5000
  : ${BACKEND_URL:=http://localhost:5000}
  export BACKEND_URL
  envsubst '
    $BACKEND_URL
  ' < "$TEMPLATE" > "$TARGET"
fi

echo "Starting nginx..."
exec nginx -g 'daemon off;'
