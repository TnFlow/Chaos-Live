@echo off
setlocal EnableExtensions
title Chaos-Live - Instalador

:: Comprueba que este PC tiene todo lo necesario y arregla lo que puede
:: (base de datos, .env, carpetas). La logica vive en el .ps1; este .bat
:: solo existe para poder ejecutarlo con doble clic.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%Instalar-Chaos-Live.ps1"
