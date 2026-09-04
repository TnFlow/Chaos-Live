@echo off
setlocal EnableExtensions
title Instalador del Mod de Minecraft Fabric 1.20.1
color 0A

echo =========================================================================
echo             INSTALADOR DEL MOD DE FABRIC PARA MINECRAFT
echo =========================================================================
echo.

set "ROOT_DIR=%~dp0"
set "MINECRAFT_DIR=%APPDATA%\.minecraft"
set "MODS_DIR=%MINECRAFT_DIR%\mods"

if not exist "%MINECRAFT_DIR%" goto no_minecraft
if not exist "%MODS_DIR%" mkdir "%MODS_DIR%" >nul 2>&1

echo [1/2] Verificando instalacion de Fabric Loader 1.20.1...
echo       Asegurate de tener instalado:
echo       1. Fabric Loader 0.14+ para Minecraft 1.20.1 (https://fabricmc.net/)
echo       2. Fabric API 1.20.1 en tu carpeta de mods.
echo.

set "FOUND_JAR="
for %%F in ("%ROOT_DIR%minecraft-mod\build\libs\*.jar") do (
    echo %%~nxF | findstr /i /v "sources" >nul
    if not errorlevel 1 set "FOUND_JAR=%%F"
)

if not defined FOUND_JAR goto mod_not_compiled

echo [2/2] Copiando mod compilado a tu carpeta .minecraft\mods...
copy /y "%FOUND_JAR%" "%MODS_DIR%\" >nul
echo.
echo [OK] Mod Chaos-Live instalado correctamente en tu Minecraft.
goto finish

:mod_not_compiled
echo [2/2] Para compilar el archivo .jar del mod en esta maquina:
echo       Abre una terminal en la carpeta 'minecraft-mod' y ejecuta:
echo       ./gradlew build
echo.
echo       O si juegas en un servidor con RCON, no necesitas instalar ningun mod:
echo       Chaos-Live se conectara por RCON directamente.
goto finish

:no_minecraft
color 0C
echo [!] No se detecto la carpeta estandar de Minecraft en:
echo     %MINECRAFT_DIR%
echo Si usas un launcher alternativo (Prism, CurseForge, Modrinth), copia el mod manualmente.
echo.
pause
exit /b 1

:finish
echo.
echo =========================================================================
echo Al abrir Minecraft 1.20.1 con Fabric, el mod se conectara
echo automaticamente a Chaos-Live al entrar a tu mundo o servidor.
echo =========================================================================
echo.
pause
