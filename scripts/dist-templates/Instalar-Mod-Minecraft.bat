@echo off
setlocal EnableExtensions
title Instalador del Mod de Minecraft Fabric 1.20.1

:: Busca la carpeta de mods en todos los lanzadores habituales (Minecraft
:: normal, CurseForge, Prism, Modrinth) y copia el mod. La logica vive en el
:: .ps1; este .bat solo existe para poder ejecutarlo con doble clic.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%Instalar-Mod-Minecraft.ps1"
