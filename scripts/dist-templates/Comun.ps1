# =============================================================================
# Chaos-Live - Funciones compartidas por los scripts de la distribucion
#
# Se cargan con dot-sourcing (". .\Comun.ps1"). Viven aqui y no dentro de cada
# script porque el instalador y el instalador del mod necesitan lo mismo: saber
# donde tiene el streamer sus carpetas de mods, y tocar el .env sin destruirlo.
# =============================================================================

<#
    Carpetas de mods de todos los lanzadores habituales, no solo la de vanilla.

    Mucha gente juega con CurseForge, Prism o Modrinth, donde cada instancia
    tiene su propia carpeta de mods. Mirando solo %APPDATA%\.minecraft se le
    decia "no se ve Minecraft" a alguien que lo tenia perfectamente instalado, y
    se le mandaba a copiar el mod a mano sin decirle a donde.
#>
function Get-CarpetasDeMods {
    $carpetas = @()

    $vanilla = Join-Path $env:APPDATA ".minecraft\mods"
    if (Test-Path $vanilla) {
        $carpetas += [pscustomobject]@{ Ruta = $vanilla; Lanzador = "Minecraft (vanilla/Fabric)" }
    }

    $raicesCurse = @(
        (Join-Path $env:USERPROFILE "curseforge\minecraft\Instances"),
        (Join-Path $env:USERPROFILE "Documents\curseforge\minecraft\Instances")
    )
    foreach ($raiz in $raicesCurse) {
        if (Test-Path $raiz) {
            foreach ($inst in (Get-ChildItem $raiz -Directory -ErrorAction SilentlyContinue)) {
                $m = Join-Path $inst.FullName "mods"
                if (Test-Path $m) {
                    $carpetas += [pscustomobject]@{ Ruta = $m; Lanzador = "CurseForge - $($inst.Name)" }
                }
            }
        }
    }

    $prism = Join-Path $env:APPDATA "PrismLauncher\instances"
    if (Test-Path $prism) {
        foreach ($inst in (Get-ChildItem $prism -Directory -ErrorAction SilentlyContinue)) {
            $m = Join-Path $inst.FullName ".minecraft\mods"
            if (Test-Path $m) {
                $carpetas += [pscustomobject]@{ Ruta = $m; Lanzador = "Prism - $($inst.Name)" }
            }
        }
    }

    $modrinth = Join-Path $env:APPDATA "ModrinthApp\profiles"
    if (Test-Path $modrinth) {
        foreach ($inst in (Get-ChildItem $modrinth -Directory -ErrorAction SilentlyContinue)) {
            $m = Join-Path $inst.FullName "mods"
            if (Test-Path $m) {
                $carpetas += [pscustomobject]@{ Ruta = $m; Lanzador = "Modrinth - $($inst.Name)" }
            }
        }
    }

    return $carpetas
}

<#
    Escribe una clave en el .env sin destruir el resto.

    "Configurar-Streamer.bat" reescribia el fichero entero cada vez, asi que
    cualquier ajuste que el streamer hubiera puesto a mano (otro puerto, la ruta
    de la base de datos, el nivel de log) desaparecia al volver a configurar el
    usuario de TikTok.
#>
function Set-ClaveEnv {
    param([string]$RutaEnv, [string]$Clave, [string]$Valor)

    if (-not (Test-Path $RutaEnv)) {
        New-Item -ItemType File -Path $RutaEnv -Force | Out-Null
    }

    $lineas = @(Get-Content $RutaEnv -ErrorAction SilentlyContinue)
    $encontrada = $false
    $salida = foreach ($linea in $lineas) {
        if ($linea -match "^\s*$Clave\s*=") {
            $encontrada = $true
            "$Clave=$Valor"
        } else {
            $linea
        }
    }

    if (-not $encontrada) { $salida = @($salida) + "$Clave=$Valor" }
    Set-Content -Path $RutaEnv -Value $salida -Encoding utf8
}

<# Lee una clave del .env. Cadena vacia si no esta. #>
function Get-ValorEnv {
    param([string]$RutaEnv, [string]$Clave)
    if (-not (Test-Path $RutaEnv)) { return "" }
    $linea = Select-String -Path $RutaEnv -Pattern "^\s*$Clave\s*=\s*(.*)$" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($linea) { return $linea.Matches[0].Groups[1].Value.Trim() }
    return ""
}
