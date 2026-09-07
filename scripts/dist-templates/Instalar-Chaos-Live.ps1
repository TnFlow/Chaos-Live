# =============================================================================
# Chaos-Live - Instalador y comprobacion del equipo
#
# Deja el PC del streamer listo para el directo y, sobre todo, avisa de lo que
# falta ANTES de estar en vivo. Se puede volver a ejecutar cuantas veces haga
# falta: no pisa nada que ya este bien.
#
# Normalmente no hace falta abrirlo a mano: "Iniciar-Chaos-Live.bat" lo ejecuta
# solo la primera vez, o cuando detecta que algo se ha quedado a medias.
#
# Lo que arregla de verdad, y no solo comprueba:
#   - La base de datos. El lanzador creaba un fichero vacio, que para SQLite no
#     es una base de datos sino cero bytes: no tiene tablas. La app no se caia
#     por eso (los errores de escritura se tragan a proposito para no tumbar un
#     directo), pero nada se guardaba: el historial salia siempre vacio y las
#     metas volvian a cero en cada reinicio, sin un solo mensaje de error. Aqui
#     se copia una base ya creada con su esquema.
#   - El .env. Se le anaden las claves que falten sin tocar las que el streamer
#     ya haya puesto.
# =============================================================================
param(
    # Lo llama el lanzador: sin prueba de arranque (va a arrancar el servidor de
    # verdad justo despues) y sin esperar a que pulsen Enter.
    [switch]$Rapido,
    # Solo la parte de configuracion, para "Configurar-Streamer.bat".
    [switch]$SoloConfigurar
)

$ErrorActionPreference = "Continue"
if (-not $Rapido) { $Host.UI.RawUI.WindowTitle = "Chaos-Live - Instalador" }

$RootDir = $PSScriptRoot
Set-Location $RootDir

$script:Problemas = @()
$script:Avisos = @()

function Write-Titulo {
    param([string]$Texto)
    Write-Host ""
    Write-Host "-------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  $Texto" -ForegroundColor Cyan
    Write-Host "-------------------------------------------------------------------------" -ForegroundColor DarkGray
}

function Write-Ok {
    param([string]$Texto)
    Write-Host "  [OK]   $Texto" -ForegroundColor Green
}

function Write-Aviso {
    param([string]$Texto, [string]$Solucion)
    Write-Host "  [!]    $Texto" -ForegroundColor Yellow
    if ($Solucion) { Write-Host "         $Solucion" -ForegroundColor DarkGray }
    $script:Avisos += $Texto
}

function Write-Fallo {
    param([string]$Texto, [string]$Solucion)
    Write-Host "  [X]    $Texto" -ForegroundColor Red
    if ($Solucion) { Write-Host "         $Solucion" -ForegroundColor DarkGray }
    $script:Problemas += $Texto
}

$EnvFile = Join-Path $RootDir ".env"

. (Join-Path $RootDir "Comun.ps1")

<#
    Pregunta el usuario de TikTok y lo guarda.

    Antes vivia en "Configurar-Streamer.bat", un boton mas que el streamer tenia
    que saber que existia. Ahora se pregunta sola la primera vez.
#>
function Invoke-Configuracion {
    $actual = Get-ValorEnv $EnvFile "TIKTOK_USERNAME"
    if ($actual -and $actual -ne "your_tiktok_username") {
        Write-Ok "Tu canal ya esta configurado: @$actual"
        return
    }

    Write-Host ""
    Write-Host "  Vamos a configurar tu canal (puedes dejarlo vacio y hacerlo luego)." -ForegroundColor White
    $usuario = Read-Host "  Tu usuario de TikTok LIVE, sin la @"
    $usuario = $usuario.Trim().TrimStart('@')

    if ($usuario) {
        Set-ClaveEnv $EnvFile "TIKTOK_USERNAME" $usuario
        Set-ClaveEnv $EnvFile "USE_MOCK" "false"
        Write-Ok "Configurado el canal @$usuario. Chaos-Live se conectara a tu directo."
    } else {
        Set-ClaveEnv $EnvFile "USE_MOCK" "true"
        Write-Ok "Sin usuario: Chaos-Live arranca en modo simulacion, para que puedas probarlo."
        Write-Host "         Cuando quieras ponerlo, ejecuta 'Configurar-Streamer.bat'." -ForegroundColor DarkGray
    }
}

if (-not $Rapido) {
    Write-Host "=========================================================================" -ForegroundColor Cyan
    Write-Host "              CHAOS-LIVE - INSTALADOR" -ForegroundColor Cyan
    Write-Host "        Comprueba que este PC puede dar el directo" -ForegroundColor Cyan
    Write-Host "=========================================================================" -ForegroundColor Cyan
}

if ($SoloConfigurar) {
    Write-Titulo "Configuracion de tu canal"
    # Se fuerza la pregunta aunque ya hubiera un usuario: para eso lo ha abierto.
    Set-ClaveEnv $EnvFile "TIKTOK_USERNAME" ""
    Invoke-Configuracion
    Write-Host ""
    Read-Host "Pulsa Enter para cerrar"
    exit 0
}

# -----------------------------------------------------------------------------
Write-Titulo "1 de 7  El paquete esta completo"
# -----------------------------------------------------------------------------
# Un ZIP a medio descomprimir es la causa mas tonta de que nada arranque, y el
# sintoma (una consola que se cierra sola) no dice nada.
$Imprescindibles = @(
    @{ Ruta = "app\bundle.mjs";                    Que = "el servidor" },
    @{ Ruta = "overlay\index.html";                Que = "el overlay" },
    @{ Ruta = "config\rules.json";                 Que = "las reglas de regalos" },
    @{ Ruta = "node_modules\.prisma\client";       Que = "el motor de base de datos" },
    @{ Ruta = "Iniciar-Chaos-Live.bat";            Que = "el lanzador" }
)
$FaltaAlgo = $false
foreach ($item in $Imprescindibles) {
    if (-not (Test-Path (Join-Path $RootDir $item.Ruta))) {
        Write-Fallo "Falta $($item.Que) ($($item.Ruta))" "Vuelve a descomprimir el ZIP entero, sin abrirlo desde dentro del explorador."
        $FaltaAlgo = $true
    }
}
if (-not $FaltaAlgo) { Write-Ok "Estan todas las piezas de la distribucion." }

# -----------------------------------------------------------------------------
Write-Titulo "2 de 7  Node.js"
# -----------------------------------------------------------------------------
$NodeBin = Join-Path $RootDir "bin\node.exe"
$NodeOrigen = "incluido en el paquete"
if (-not (Test-Path $NodeBin)) {
    $NodeBin = "node"
    $NodeOrigen = "instalado en el sistema"
}
$NodeVersion = $null
try { $NodeVersion = (& $NodeBin --version) } catch { }

if (-not $NodeVersion) {
    Write-Fallo "No hay Node.js ni en bin\node.exe ni en el sistema." "Instalalo desde https://nodejs.org/ (version 18 o superior) y vuelve a ejecutar este instalador."
} else {
    $Mayor = 0
    if ($NodeVersion -match '^v(\d+)\.') { $Mayor = [int]$Matches[1] }
    if ($Mayor -lt 18) {
        Write-Fallo "Node $NodeVersion es demasiado antiguo ($NodeOrigen)." "Chaos-Live necesita la 18 o superior. Actualizalo desde https://nodejs.org/"
    } else {
        Write-Ok "Node $NodeVersion ($NodeOrigen)."
    }
}

# -----------------------------------------------------------------------------
Write-Titulo "3 de 7  Configuracion (.env)"
# -----------------------------------------------------------------------------
$EnvExample = Join-Path $RootDir ".env.example"

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile -Force
        Write-Ok "Creado .env a partir de .env.example."
    } else {
        New-Item -ItemType File -Path $EnvFile -Force | Out-Null
        Write-Ok "Creado .env vacio."
    }
}

# Claves que el servidor necesita para arrancar con sentido. Solo se anaden las
# que falten: si el streamer ya configuro su usuario o cambio un puerto, eso
# manda y no se toca.
$ClavesRequeridas = [ordered]@{
    "WS_PORT"      = "8080"
    "OVERLAY_PORT" = "8081"
    "DATABASE_URL" = "file:./data/chaos-live.db"
    "LOG_LEVEL"    = "info"
    "USE_MOCK"     = "true"
}

$Contenido = @(Get-Content $EnvFile -ErrorAction SilentlyContinue)
$Anadidas = @()
foreach ($clave in $ClavesRequeridas.Keys) {
    $existe = $Contenido | Where-Object { $_ -match "^\s*$clave\s*=" }
    if (-not $existe) {
        Add-Content -Path $EnvFile -Value "$clave=$($ClavesRequeridas[$clave])" -Encoding utf8
        $Anadidas += $clave
    }
}
if ($Anadidas.Count -gt 0) {
    Write-Ok "Anadidas al .env las claves que faltaban: $($Anadidas -join ', ')."
} else {
    Write-Ok "El .env ya tiene todo lo necesario."
}

Invoke-Configuracion

# -----------------------------------------------------------------------------
Write-Titulo "4 de 7  Base de datos"
# -----------------------------------------------------------------------------
# El esquema no se puede crear aqui: haria falta la herramienta de Prisma, que
# pesa mas que el resto del paquete junto. Se copia una base ya creada y vacia
# que viaja en el ZIP.
$DataDir = Join-Path $RootDir "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

$DbFile = Join-Path $DataDir "chaos-live.db"
$Plantilla = Join-Path $RootDir "config\database-template.db"

$DbVacia = $false
if (Test-Path $DbFile) {
    $DbVacia = ((Get-Item $DbFile).Length -eq 0)
}

if (-not (Test-Path $Plantilla)) {
    Write-Aviso "El paquete no trae la plantilla de base de datos." "El directo funcionara, pero el historial saldra vacio y las metas no sobreviviran a un reinicio."
} elseif (-not (Test-Path $DbFile) -or $DbVacia) {
    Copy-Item $Plantilla $DbFile -Force
    if ($DbVacia) {
        Write-Ok "La base de datos estaba vacia (0 bytes) y se ha rehecho con su esquema."
    } else {
        Write-Ok "Base de datos creada en data\chaos-live.db."
    }
} else {
    $KB = [math]::Round((Get-Item $DbFile).Length / 1KB, 1)
    Write-Ok "Ya existe tu base de datos ($KB KB). No se toca: dentro esta tu historial."
}

# -----------------------------------------------------------------------------
Write-Titulo "5 de 7  Puertos libres"
# -----------------------------------------------------------------------------
# Si otro programa ocupa el puerto, el servidor muere al arrancar con
# EADDRINUSE y la ventana se cierra sin que de tiempo a leer nada.
function Test-PuertoLibre {
    param([int]$Puerto)
    $enUso = Get-NetTCPConnection -State Listen -LocalPort $Puerto -ErrorAction SilentlyContinue
    return ($null -eq $enUso)
}

function Get-PuertoDelEnv {
    param([string]$Clave, [int]$PorDefecto)
    $valor = Get-ValorEnv $EnvFile $Clave
    if ($valor -match '^\d+$') { return [int]$valor }
    return $PorDefecto
}

$PuertoPanel = Get-PuertoDelEnv "WS_PORT" 8080
$PuertoOverlay = Get-PuertoDelEnv "OVERLAY_PORT" 8081

foreach ($p in @(@{N=$PuertoPanel; Q="el panel"}, @{N=$PuertoOverlay; Q="el overlay"})) {
    if (Test-PuertoLibre $p.N) {
        Write-Ok "Puerto $($p.N) libre (para $($p.Q))."
    } else {
        Write-Aviso "El puerto $($p.N) ya esta ocupado (lo necesita $($p.Q))." "Puede ser otra copia de Chaos-Live abierta. Cierrala, o cambia el puerto en el .env."
    }
}

# -----------------------------------------------------------------------------
Write-Titulo "6 de 7  Minecraft"
# -----------------------------------------------------------------------------
$CarpetasMods = @(Get-CarpetasDeMods)

if ($CarpetasMods.Count -eq 0) {
    Write-Aviso "No se ha encontrado ninguna instalacion de Minecraft." "Se han mirado Minecraft normal, CurseForge, Prism y Modrinth. Si usas otro launcher, tendras que copiar el mod a mano. Tambien puedes usar RCON y olvidarte del mod."
} else {
    foreach ($c in $CarpetasMods) {
        Write-Ok "Encontrado: $($c.Lanzador)"
    }

    $conChaos = $CarpetasMods | Where-Object { Get-ChildItem $_.Ruta -Filter "*chaos*.jar" -ErrorAction SilentlyContinue }
    if ($conChaos) {
        Write-Ok "El mod de Chaos-Live ya esta instalado en $($conChaos.Count) instancia(s)."
    } else {
        Write-Aviso "El mod de Chaos-Live todavia no esta instalado." "Ejecuta 'Instalar-Mod-Minecraft.bat' cuando lo hayas compilado."
    }

    $conFabricApi = $CarpetasMods | Where-Object { Get-ChildItem $_.Ruta -Filter "*fabric-api*.jar" -ErrorAction SilentlyContinue }
    if (-not $conFabricApi) {
        Write-Aviso "No se ve Fabric API en ninguna instancia." "Descargala para 1.20.1 de https://modrinth.com/mod/fabric-api y dejala en la carpeta de mods."
    } else {
        Write-Ok "Fabric API instalada."
    }
}

# El .jar del mod no viaja compilado en el ZIP: hay que construirlo aqui, y para
# eso hace falta un JDK 17. Sin el, 'Compilar-Mod.bat' falla con un error de
# Gradle que no dice que el problema es Java.
$ModJar = Get-ChildItem (Join-Path $RootDir "minecraft-mod\build\libs") -Filter "*.jar" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*sources*" }

if ($ModJar) {
    Write-Ok "El mod ya esta compilado."
} else {
    $JavaVersion = $null
    try {
        $salida = & java -version 2>&1 | Out-String
        if ($salida -match 'version "(\d+)') { $JavaVersion = [int]$Matches[1] }
    } catch { }

    if ($null -eq $JavaVersion) {
        Write-Aviso "El mod no esta compilado y no hay Java en este PC." "Necesitas un JDK 17: https://adoptium.net/temurin/releases/?version=17  (o usa RCON y olvidate del mod)."
    } elseif ($JavaVersion -lt 17) {
        Write-Aviso "El mod no esta compilado y tu Java es la version $JavaVersion." "Hace falta la 17 o superior: https://adoptium.net/temurin/releases/?version=17"
    } else {
        Write-Aviso "El mod no esta compilado, pero tienes Java $JavaVersion y puedes hacerlo." "Ejecuta 'minecraft-mod\Compilar-Mod.bat' y luego 'Instalar-Mod-Minecraft.bat'."
    }
}

# -----------------------------------------------------------------------------
if ($Rapido) {
    # Lo llama el lanzador, que va a arrancar el servidor de verdad justo
    # despues: repetir aqui una prueba de arranque solo alargaria la espera.
    Write-Host ""
    if ($script:Problemas.Count -gt 0) {
        Write-Host "  [X] Hay $($script:Problemas.Count) problema(s) que impediran arrancar." -ForegroundColor Red
    }
    exit 0
}

Write-Titulo "7 de 7  Prueba de arranque"
# -----------------------------------------------------------------------------
# Todo lo anterior puede estar bien y el servidor no levantar igualmente. Se
# arranca de verdad, en puertos apartados para no chocar con nada, y se espera a
# que conteste.
if ($script:Problemas.Count -gt 0) {
    Write-Host "  [-]    Saltada: primero hay que resolver los problemas de arriba." -ForegroundColor DarkGray
} else {
    $PuertoPrueba = 8971
    $PuertoPruebaOverlay = 8972
    Write-Host "  Arrancando el servidor un momento..." -ForegroundColor DarkGray

    $env:NODE_ENV = "production"
    $env:STATIC_DIR = Join-Path $RootDir "overlay"
    # Absoluta, por lo mismo que en el lanzador: un DATABASE_URL relativo lo
    # resuelve Prisma contra una carpeta que en este PC no existe.
    $env:DATABASE_URL = "file:" + ($DbFile -replace '\\', '/')
    $env:WS_PORT = "$PuertoPrueba"
    $env:OVERLAY_PORT = "$PuertoPruebaOverlay"
    $env:USE_MOCK = "true"
    # Simulacion acelerada: con el intervalo por defecto (2,5s) apenas salen
    # eventos en la ventana de la prueba, y muchos no casan con ninguna regla,
    # asi que la comprobacion de guardado daba un falso negativo.
    $env:MOCK_INTERVAL_MS = "600"
    $env:LOG_TO_FILE = "false"

    $proceso = Start-Process -FilePath $NodeBin `
        -ArgumentList (Join-Path $RootDir "app\bundle.mjs") `
        -WorkingDirectory $RootDir -PassThru -WindowStyle Hidden

    $respondio = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$PuertoPrueba/api/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $respondio = $true; break }
        } catch { }
    }

    $overlayRespondio = $false
    $guardaEnDisco = $false
    if ($respondio) {
        try {
            $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:$PuertoPruebaOverlay/?view=overlay" -UseBasicParsing -TimeoutSec 3
            if ($r2.StatusCode -eq 200) { $overlayRespondio = $true }
        } catch { }

        # La simulacion va generando regalos; en cuanto uno de ellos dispara una
        # regla, la accion completada tiene que quedar registrada.
        Write-Host "  Comprobando que se guarda en disco..." -ForegroundColor DarkGray
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 700
            try {
                $h = Invoke-WebRequest -Uri "http://127.0.0.1:$PuertoPrueba/api/history" -UseBasicParsing -TimeoutSec 2
                $datos = $h.Content | ConvertFrom-Json
                if ($datos.total -gt 0) { $guardaEnDisco = $true; break }
            } catch { }
        }
    }

    if (-not $proceso.HasExited) {
        Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:\WS_PORT, Env:\OVERLAY_PORT, Env:\USE_MOCK, Env:\MOCK_INTERVAL_MS, Env:\LOG_TO_FILE -ErrorAction SilentlyContinue

    if ($respondio) {
        Write-Ok "El servidor arranca y responde."
        if ($overlayRespondio) {
            Write-Ok "El overlay se sirve correctamente."
        } else {
            Write-Fallo "El servidor arranca pero el overlay no responde." "Revisa que la carpeta 'overlay' este completa."
        }

        # Comprobar que ademas GUARDA. Es el fallo que mas caro sale porque no da
        # ningun error: la app funciona, el directo va, y al terminar resulta que
        # el historial esta vacio.
        if ($guardaEnDisco) {
            Write-Ok "La base de datos guarda correctamente (historial y metas)."
        } else {
            Write-Aviso "No se pudo confirmar que la base de datos guarde." "El directo funcionara igual, pero revisa DATABASE_URL en el .env: debe ser una ruta absoluta."
        }
    } else {
        Write-Fallo "El servidor no llego a responder." "Ejecuta 'Iniciar-Chaos-Live.bat' y lee lo que salga en la ventana."
    }
}

# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
if ($script:Problemas.Count -eq 0 -and $script:Avisos.Count -eq 0) {
    Write-Host "  TODO LISTO. Puedes dar el directo." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Abre 'Iniciar-Chaos-Live.bat' para empezar." -ForegroundColor Green
} elseif ($script:Problemas.Count -eq 0) {
    Write-Host "  LISTO PARA ARRANCAR, con $($script:Avisos.Count) cosa(s) pendiente(s)." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Chaos-Live funciona ya, pero repasa los avisos [!] de arriba:" -ForegroundColor Yellow
    foreach ($a in $script:Avisos) { Write-Host "    - $a" -ForegroundColor DarkYellow }
} else {
    Write-Host "  HAY $($script:Problemas.Count) PROBLEMA(S) QUE IMPIDEN ARRANCAR." -ForegroundColor Red
    Write-Host ""
    foreach ($p in $script:Problemas) { Write-Host "    - $p" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Resuelvelos y vuelve a ejecutar este instalador." -ForegroundColor Red
}
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Pulsa Enter para cerrar"
