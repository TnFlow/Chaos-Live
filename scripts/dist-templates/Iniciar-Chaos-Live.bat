@echo off
setlocal EnableExtensions
title Chaos-Live - Centro de Control

:: Toda la logica de arranque (supervision, reinicio automatico y espera al
:: servidor antes de abrir el navegador) vive en el script de PowerShell.
:: Este .bat solo existe para poder arrancar con doble clic.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%Iniciar-Chaos-Live.ps1"

if errorlevel 1 (
    echo.
    echo [!] Chaos-Live termino con error. Revisa la carpeta logs\
    pause
)
