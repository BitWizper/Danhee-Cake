#!/usr/bin/env sh
# Generate a base64-encoded 64-byte JWT secret
if command -v openssl >/dev/null 2>&1; then
  openssl rand -base64 64
else
  node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
fi
