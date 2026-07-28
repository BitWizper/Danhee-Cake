#!/usr/bin/env pwsh
# PowerShell script to generate a base64-encoded 64-byte JWT secret
[System.Convert]::ToBase64String((New-Object Byte[] 64 | %{ (Get-Random -Maximum 256) }))
