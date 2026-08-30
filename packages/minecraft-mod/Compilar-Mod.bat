@echo off
setlocal EnableExtensions
title Compilador del Mod de Minecraft Fabric 1.20.1
color 0B

echo =========================================================================
echo             COMPILADOR DEL MOD DE MINECRAFT (FABRIC 1.20.1)
echo =========================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: 1. Buscar Java 17 compatible (Minecraft Launcher o JDK 17)
:: Gradle 8.6 requiere Java 17 a 21 (Java 22+ no es compatible).

if exist "%LOCALAPPDATA%\Packages\Microsoft.4297127D64C57_8wekyb3d8bbwe\LocalCache\Local\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\javac.exe" (
    set "JAVA_HOME=%LOCALAPPDATA%\Packages\Microsoft.4297127D64C57_8wekyb3d8bbwe\LocalCache\Local\runtime\java-runtime-gamma\windows\java-runtime-gamma"
    goto java_found
)

if exist "C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\javac.exe" (
    set "JAVA_HOME=C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-gamma\windows\java-runtime-gamma"
    goto java_found
)

if exist "%APPDATA%\.minecraft\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\javac.exe" (
    set "JAVA_HOME=%APPDATA%\.minecraft\runtime\java-runtime-gamma\windows\java-runtime-gamma"
    goto java_found
)

for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-17*" "C:\Program Files\Java\jdk-17*" "C:\Program Files\Microsoft\jdk-17*") do (
    if exist "%%~D\bin\javac.exe" (
        set "JAVA_HOME=%%~D"
        goto java_found
    )
)

:java_found
if defined JAVA_HOME (
    echo [OK] Usando JDK compatible en: %JAVA_HOME%
    set "PATH=%JAVA_HOME%\bin;%PATH%"
) else (
    echo [AVISO] Usando Java del sistema. Si falla con version 70, necesitas instalar JDK 17.
)

echo.
echo [1/2] Compilando mod con Gradle Fabric Loom...
call gradlew.bat build

if errorlevel 1 goto build_error

echo.
echo [2/2] ¡Compilacion exitosa!
if exist "build\libs\chaoslive-mod-1.0.0.jar" (
    echo Mod generado en: build\libs\chaoslive-mod-1.0.0.jar
    echo.
    echo Copiando automaticamente a tu carpeta de Minecraft (%APPDATA%\.minecraft\mods)...
    mkdir "%APPDATA%\.minecraft\mods" >nul 2>&1
    copy /y "build\libs\chaoslive-mod-1.0.0.jar" "%APPDATA%\.minecraft\mods\" >nul
    echo.
    echo [OK] ¡Mod instalado exitosamente en tu Minecraft!
)
goto finish

:build_error
color 0C
echo.
echo =========================================================================
echo                         ERROR DE COMPILACION
echo =========================================================================
echo Tu sistema tiene instalada una version de Java experimental (Java 26 / v70)
echo que Gradle no soporta todavia. Minecraft 1.20.1 y Fabric requieren Java 17.
echo.
echo Solucion rapida:
echo 1. Descarga e instala JDK 17 (LTS) desde:
echo    https://adoptium.net/temurin/releases/?version=17
echo    (o ejecuta en PowerShell: winget install EclipseAdoptium.Temurin.17.jdk)
echo 2. Vuelve a ejecutar este archivo Compilar-Mod.bat
echo.
echo Opcional (Sin compilar ni mods):
echo Si juegas en un servidor con RCON (server.properties: enable-rcon=true),
echo ¡Chaos-Live funciona directamente sin necesidad de instalar ningun mod!
echo =========================================================================
echo.
pause
exit /b 1

:finish
echo.
echo Presiona cualquier tecla para cerrar esta ventana.
pause >nul
