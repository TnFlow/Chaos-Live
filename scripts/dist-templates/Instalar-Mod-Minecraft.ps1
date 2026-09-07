# =============================================================================
# Chaos-Live - Instalador del mod de Fabric 1.20.1
#
# Copia el mod compilado a la carpeta de mods. Busca en todos los lanzadores
# habituales, no solo en la carpeta de Minecraft normal: la version anterior
# miraba unicamente %APPDATA%\.minecraft y le decia "no se detecto Minecraft" a
# cualquiera que jugase con CurseForge, Prism o Modrinth.
# =============================================================================
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Chaos-Live - Instalador del Mod"

$RootDir = $PSScriptRoot
Set-Location $RootDir
. (Join-Path $RootDir "Comun.ps1")

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "        INSTALADOR DEL MOD DE FABRIC PARA MINECRAFT 1.20.1" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. El .jar ---
$Jar = Get-ChildItem (Join-Path $RootDir "minecraft-mod\build\libs") -Filter "*.jar" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*sources*" } |
    Select-Object -First 1

if (-not $Jar) {
    Write-Host "[!] El mod todavia no esta compilado." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Para compilarlo necesitas un JDK 17:" -ForegroundColor White
    Write-Host "      https://adoptium.net/temurin/releases/?version=17" -ForegroundColor Cyan
    Write-Host "    Y despues ejecutar: minecraft-mod\Compilar-Mod.bat" -ForegroundColor White
    Write-Host ""
    Write-Host "    Si prefieres no instalar nada de esto, puedes jugar con RCON en un" -ForegroundColor DarkGray
    Write-Host "    servidor y olvidarte del mod. Ver LEEME-INSTRUCCIONES.txt." -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

Write-Host "[OK] Mod compilado encontrado: $($Jar.Name)" -ForegroundColor Green
Write-Host ""

# --- 2. Donde instalarlo ---
$Carpetas = @(Get-CarpetasDeMods)

if ($Carpetas.Count -eq 0) {
    Write-Host "[!] No se ha encontrado ninguna carpeta de mods." -ForegroundColor Yellow
    Write-Host "    Se han mirado Minecraft normal, CurseForge, Prism y Modrinth." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    Copia este archivo a mano en la carpeta 'mods' de tu instancia:" -ForegroundColor White
    Write-Host "      $($Jar.FullName)" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

$Destinos = $Carpetas
if ($Carpetas.Count -gt 1) {
    Write-Host "Se han encontrado varias instalaciones de Minecraft:" -ForegroundColor White
    Write-Host ""
    for ($i = 0; $i -lt $Carpetas.Count; $i++) {
        Write-Host "  [$($i + 1)] $($Carpetas[$i].Lanzador)" -ForegroundColor White
        Write-Host "      $($Carpetas[$i].Ruta)" -ForegroundColor DarkGray
    }
    Write-Host "  [T] Todas" -ForegroundColor White
    Write-Host ""
    $eleccion = Read-Host "Donde lo instalo? (numero, o T para todas) [T]"

    if ($eleccion -match '^\d+$') {
        $indice = [int]$eleccion - 1
        if ($indice -ge 0 -and $indice -lt $Carpetas.Count) {
            $Destinos = @($Carpetas[$indice])
        } else {
            Write-Host "[!] Numero fuera de rango; se instalara en todas." -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# --- 3. Copiar ---
foreach ($destino in $Destinos) {
    try {
        # Se borran las versiones anteriores del mod: dos copias distintas en la
        # misma carpeta hacen que Fabric no arranque.
        Get-ChildItem $destino.Ruta -Filter "*chaos-live*.jar" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne $Jar.Name } |
            Remove-Item -Force -ErrorAction SilentlyContinue

        Copy-Item $Jar.FullName $destino.Ruta -Force
        Write-Host "[OK] Instalado en $($destino.Lanzador)" -ForegroundColor Green

        $fabricApi = Get-ChildItem $destino.Ruta -Filter "*fabric-api*.jar" -ErrorAction SilentlyContinue
        if (-not $fabricApi) {
            Write-Host "     [!] Falta Fabric API en esta instancia. Sin ella el mod no carga." -ForegroundColor Yellow
            Write-Host "         https://modrinth.com/mod/fabric-api  (version 1.20.1)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "[X] No se pudo copiar a $($destino.Ruta)" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "  Abre Minecraft 1.20.1 con Fabric y entra a tu mundo." -ForegroundColor Green
Write-Host "  El mod se conecta solo a Chaos-Live, sin abrir ningun puerto." -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Pulsa Enter para cerrar"
