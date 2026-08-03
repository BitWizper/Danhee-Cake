# Script para actualizar automáticamente el dominio temporal de Cloudflare Tunnel
# y configurarlo en el backend

Write-Host "Reiniciando contenedores Docker..." -ForegroundColor Yellow
docker compose down

Write-Host "Iniciando contenedores Docker..." -ForegroundColor Yellow
docker compose up -d

Write-Host "Esperando a que Cloudflare Tunnel genere la URL temporal..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "Extrayendo dominio temporal de Cloudflare Tunnel..." -ForegroundColor Yellow
$cloudflareLogs = docker logs cloudflared_tunnel --tail 100 2>&1 | Out-String

if ([string]::IsNullOrWhiteSpace($cloudflareLogs)) {
    Write-Host "No se pudieron obtener los logs del contenedor. Esperando 5 segundos más..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    $cloudflareLogs = docker logs cloudflared_tunnel --tail 100 2>&1 | Out-String
}

if ([string]::IsNullOrWhiteSpace($cloudflareLogs)) {
    Write-Host "Error: No se pudieron obtener los logs del contenedor cloudflared_tunnel" -ForegroundColor Red
    exit 1
}

$domainPattern = "https://([a-z0-9-]+\.trycloudflare\.com)"
$domainMatches = [regex]::Matches($cloudflareLogs, $domainPattern)

if ($domainMatches.Count -gt 0) {
    # Tomar el último match (el más reciente)
    $domain = $domainMatches[$domainMatches.Count - 1].Groups[1].Value
    
    Write-Host "Dominio temporal encontrado: https://$domain" -ForegroundColor Green
    
    # Actualizar PUBLIC_HOST en el .env del servidor
    $envPath = "server\.env"
    $envContent = Get-Content $envPath -Raw
    
    # Eliminar línea PUBLIC_HOST existente si existe
    $envContent = $envContent -replace "PUBLIC_HOST=.*`r?`n", ""
    
    # Agregar nueva línea PUBLIC_HOST
    $envContent = $envContent.TrimEnd() + "`nPUBLIC_HOST=localhost,127.0.0.1,$domain"
    
    # Actualizar CLOUDFLARE_TUNNEL en el .env del servidor
    $envContent = $envContent -replace "CLOUDFLARE_TUNNEL=.*`r?`n", ""
    $envContent = $envContent.TrimEnd() + "`nCLOUDFLARE_TUNNEL=https://$domain"
    
    Set-Content $envPath $envContent -NoNewline
    Write-Host "PUBLIC_HOST actualizado en server/.env" -ForegroundColor Green
    Write-Host "CLOUDFLARE_TUNNEL actualizado en server/.env" -ForegroundColor Green
    
    # Actualizar PUBLIC_HOST en docker.env para Docker Compose
    # Solo modificar la línea PUBLIC_HOST, preservando el resto del archivo (incluyendo secrets)
    $dockerEnvPath = "docker.env"
    if (Test-Path $dockerEnvPath) {
        $dockerEnvContent = Get-Content $dockerEnvPath -Raw
        
        # Eliminar línea PUBLIC_HOST existente si existe
        $dockerEnvContent = $dockerEnvContent -replace "PUBLIC_HOST=.*`r?`n", ""
        
        # Agregar nueva línea PUBLIC_HOST
        $dockerEnvContent = $dockerEnvContent.TrimEnd() + "`nPUBLIC_HOST=localhost,127.0.0.1,$domain"
        
        Set-Content $dockerEnvPath $dockerEnvContent -NoNewline
        Write-Host "PUBLIC_HOST actualizado en docker.env (secrets preservados)" -ForegroundColor Green
    } else {
        # Si docker.env no existe, crearlo solo con PUBLIC_HOST (no recomendado, pero fallback)
        $dockerEnvContent = "PUBLIC_HOST=localhost,127.0.0.1,$domain"
        Set-Content $dockerEnvPath $dockerEnvContent -NoNewline
        Write-Host "ADVERTENCIA: docker.env no existía, creado solo con PUBLIC_HOST (falta configurar secrets)" -ForegroundColor Yellow
    }
    
    # Actualizar configuración CORS en app.js
    $appJsPath = "server\src\app.js"
    $appJsContent = Get-Content $appJsPath -Raw
    
    # Actualizar la línea CLOUDFLARE_TUNNEL en el array ALLOWED_CLOUDFLARE_TUNNELS
    # Buscar el patrón actual y reemplazarlo con el nuevo túnel
    $corsPattern = "'[a-z0-9-]+\.trycloudflare\.com', // túnel actual"
    $corsReplacement = "'$domain', // túnel actual"
    
    $appJsContent = $appJsContent -replace $corsPattern, $corsReplacement
    
    Set-Content $appJsPath $appJsContent -NoNewline
    Write-Host "Configuración CORS actualizada en server/src/app.js" -ForegroundColor Green
    
    # Reiniciar el backend para aplicar cambios
    Write-Host "Reiniciando backend para aplicar cambios..." -ForegroundColor Yellow
    docker compose restart backend
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "DOMINIO TEMPORAL DE CLOUDFLARE:" -ForegroundColor Cyan
    Write-Host "https://$domain" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Actualiza VITE_BASE_URL en Vercel con este dominio" -ForegroundColor Yellow
    
    # Copiar al portapapeles
    Set-Clipboard "https://$domain"
    Write-Host "URL copiada al portapapeles" -ForegroundColor Green
    Write-Host "Configura VITE_BASE_URL en Vercel con: https://$domain" -ForegroundColor Yellow
} else {
    Write-Host "No se pudo extraer el dominio temporal. Verifica los logs de cloudflared_tunnel" -ForegroundColor Red
    docker logs cloudflared_tunnel --tail 100
}
