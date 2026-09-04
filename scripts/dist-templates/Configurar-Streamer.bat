@echo off
setlocal EnableExtensions
title Configurador de Chaos-Live
color 0E

echo =========================================================================
echo                 CONFIGURADOR DE CANAL -- CHAOS-LIVE
echo =========================================================================
echo.
echo Este asistente te ayudara a configurar tu canal para transmitir.
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

set /p TIKTOK_USER="Ingresa tu usuario de TikTok LIVE (sin @, deja vacio si no usaras TikTok): "
set /p MOCK_CHOICE="Deseas activar modo de prueba/simulacion sin estar en vivo? (S/N) [S]: "

if /i "%MOCK_CHOICE%"=="N" goto set_mock_false
set "USE_MOCK=true"
goto ask_rcon

:set_mock_false
set "USE_MOCK=false"

:ask_rcon
set /p RCON_PASS="Contrasena RCON de Minecraft (opcional, presiona Enter para omitir): "
if "%RCON_PASS%"=="" set "RCON_PASS=minecraft"

echo.
echo Guardando configuracion en .env...

echo # Configuracion generada por Asistente Chaos-Live > "%ROOT_DIR%.env"
echo TIKTOK_USERNAME=%TIKTOK_USER% >> "%ROOT_DIR%.env"
echo USE_MOCK=%USE_MOCK% >> "%ROOT_DIR%.env"
echo MOCK_INTERVAL_MS=3000 >> "%ROOT_DIR%.env"
echo. >> "%ROOT_DIR%.env"
echo RCON_HOST=127.0.0.1 >> "%ROOT_DIR%.env"
echo RCON_PORT=25575 >> "%ROOT_DIR%.env"
echo RCON_PASSWORD=%RCON_PASS% >> "%ROOT_DIR%.env"
echo. >> "%ROOT_DIR%.env"
echo WS_PORT=8080 >> "%ROOT_DIR%.env"
echo DATABASE_URL=file:./data/chaos-live.db >> "%ROOT_DIR%.env"
echo LOG_LEVEL=info >> "%ROOT_DIR%.env"

echo.
echo [OK] Configuracion guardada exitosamente en .env
echo.
echo Ahora puedes hacer doble clic en 'Iniciar-Chaos-Live.bat' para comenzar.
echo.
pause
