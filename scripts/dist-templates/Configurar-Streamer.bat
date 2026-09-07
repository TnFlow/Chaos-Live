@echo off
setlocal EnableExtensions
title Configurador de Chaos-Live

:: Solo pregunta el usuario de TikTok y lo guarda. Antes este script
:: reescribia el .env entero, asi que cualquier ajuste hecho a mano (otro
:: puerto, otra ruta de base de datos) se perdia al volver a configurar el
:: canal. Ahora se actualiza la clave y se deja el resto intacto.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%Instalar-Chaos-Live.ps1" -SoloConfigurar
