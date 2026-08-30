@echo off
setlocal EnableExtensions
title Compilando Mod Fabric 1.20.1 de Chaos-Live
color 0B

echo =========================================================================
echo             COMPILADOR DEL MOD DE MINECRAFT (FABRIC 1.20.1)
echo =========================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [1/2] Compilando mod con Gradle (esto puede tardar unos momentos la primera vez)...
call gradlew.bat build

if errorlevel 1 goto build_error

echo.
echo [2/2] ¡Compilacion exitosa!
if exist "build\libs\chaoslive-mod-1.0.0.jar" (
    echo El archivo generado es: build\libs\chaoslive-mod-1.0.0.jar
    echo.
    echo Copiando automaticamente a tu carpeta de Minecraft (.minecraft\mods)...
    mkdir "%APPDATA%\.minecraft\mods" >nul 2>&1
    copy /y "build\libs\chaoslive-mod-1.0.0.jar" "%APPDATA%\.minecraft\mods\" >nul
    echo.
    echo [OK] ¡Mod instalado exitosamente en %APPDATA%\.minecraft\mods!
)
goto finish

:build_error
color 0C
echo.
echo [ERROR] Hubo un problema al compilar el mod.
echo Asegurate de tener instalado JDK 17 o superior (https://adoptium.net/)
echo.
pause
exit /b 1

:finish
echo.
echo Presiona cualquier tecla para cerrar esta ventana.
pause >nul
