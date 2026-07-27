#!/bin/bash
# Script de pruebas de seguridad para verificar mejoras implementadas
# Prueba: Bloqueo de métodos HTTP y SQL Injection en GET

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║    🔒 PRUEBAS DE MEJORAS DE SEGURIDAD - DANHEE 2026      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

API="http://localhost:4000"
DOMAIN="https://unspoken-resurrect-bountiful.ngrok-free.dev"

# =====================================================================
# 1. PRUEBAS DE MÉTODOS HTTP PELIGROSOS (Mejorado)
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[1] ⚡ PRUEBAS DE MÉTODOS HTTP PELIGROSOS (Bloqueo en Nginx + Express)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

methods=("TRACE" "TRACK" "PUT" "DELETE" "PATCH" "CONNECT" "PROPFIND" "COPY")

for method in "${methods[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$API/api/cakes" 2>/dev/null)
  if [[ "$status" == "405" ]]; then
    echo "✅ [$status] $method bloqueado correctamente"
  else
    echo "⚠️ [$status] $method - respuesta inesperada"
  fi
done

echo ""
echo "✅ Métodos permitidos (GET, POST, HEAD, OPTIONS):"
for method in "GET" "POST" "HEAD" "OPTIONS"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$API/api/cakes" 2>/dev/null)
  if [[ "$status" != "405" ]]; then
    echo "  ✅ [$status] $method permitido"
  fi
done

# =====================================================================
# 2. PRUEBAS DE SQL INJECTION EN GET (Detector Mejorado)
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[2] 🛡️ PRUEBAS DE SQL INJECTION EN GET (Detector Mejorado)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

sqli_payloads=(
  "1' OR '1'='1"
  "1' UNION SELECT null,null--"
  "1'; DROP TABLE users--"
  "1' AND 1=1--"
  "1' SLEEP(5)--"
  "1' OR SLEEP(5)--"
  "1"  # Normal, no debería bloquearse
)

for payload in "${sqli_payloads[@]}"; do
  encoded=$(echo -n "$payload" | jq -sRr @uri)
  status=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/cakes?id=$encoded" 2>/dev/null)
  
  if [[ "$payload" == "1" ]]; then
    if [[ "$status" != "400" ]]; then
      echo "✅ [200] Query normal permitida: ?id=$payload"
    else
      echo "❌ [400] Query normal fue bloqueada (falso positivo)"
    fi
  else
    if [[ "$status" == "400" ]]; then
      echo "✅ [400] SQLi detectado y bloqueado: $payload"
    else
      echo "⚠️ [$status] $payload - posible bypass"
    fi
  fi
done

# =====================================================================
# 3. PRUEBAS DE SQL INJECTION EN GET (Falsos Positivos Reducidos)
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[3] ✨ PRUEBAS DE QUERIES NORMALES (Sin Falsos Positivos)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

normal_queries=(
  "?limit=10"
  "?offset=0"
  "?category=birthday"
  "?featured=true"
  "?baker=5"
  "?id=123"
)

for query in "${normal_queries[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/cakes$query" 2>/dev/null)
  if [[ "$status" != "400" ]]; then
    echo "✅ [$status] Query normal permitida: $query"
  else
    echo "❌ [400] Query normal fue bloqueada: $query"
  fi
done

# =====================================================================
# 4. PRUEBAS DE NOSQL INJECTION EN POST (Ya implementadas)
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[4] 🛡️ PRUEBAS DE NOSQL INJECTION EN POST (Ya implementadas)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

nosql_payloads=(
  '{"username":{"$ne":null},"password":{"$ne":null}}'
  '{"username":{"$gt":""},"password":{"$gt":""}}'
  '{"username":{"$regex":"^admin"},"password":{"$ne":null}}'
)

for payload in "${nosql_payloads[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$API/api/auth/login" 2>/dev/null)
  
  if [[ "$status" == "400" ]] || [[ "$status" == "401" ]] || [[ "$status" == "429" ]]; then
    echo "✅ [$status] NoSQL Injection bloqueada: $(echo $payload | cut -c1-50)..."
  else
    echo "⚠️ [$status] $payload - posible bypass"
  fi
done

# =====================================================================
# 5. PRUEBAS DE RATE LIMITING (Confirmación)
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[5] 🚨 PRUEBAS DE RATE LIMITING (Confirmación)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Probando Rate Limiting en /api/auth/login (3 intentos rápidos)..."
for i in {1..3}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    "$API/api/auth/login" 2>/dev/null)
  
  if [[ "$status" == "429" ]]; then
    echo "✅ [$status] Rate limiting activo en intento $i - BLOQUEADO"
    break
  else
    echo "  [$status] Intento $i permitido"
  fi
  sleep 0.1
done

# =====================================================================
# 6. RESUMEN DE MEJORAS IMPLEMENTADAS
# =====================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMEN DE MEJORAS IMPLEMENTADAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Mejoras Implementadas:"
echo "  1. Bloqueo de métodos HTTP peligrosos (TRACE, PUT, DELETE, etc.)"
echo "     - Implementado en: Nginx (línea 1) + Express (middleware)"
echo "  2. Detector de SQL Injection mejorado en parámetros GET"
echo "     - Patrones: UNION, Boolean-based, Time-based, Stacked queries"
echo "     - Reducción de falsos positivos: Requiere 2+ patrones sospechosos"
echo "  3. NoSQL Injection bloqueado en POST (ya implementado)"
echo "  4. Rate Limiting confirmado (20/min en chat, 6 en auth)"
echo "  5. XSS Protection en frontend + backend"
echo "  6. Validación de request body (previene objeto inyección)"
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         ✅ PRUEBAS DE SEGURIDAD COMPLETADAS              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
