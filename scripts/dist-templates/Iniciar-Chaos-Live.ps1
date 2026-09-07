# =============================================================================
# Chaos-Live - Lanzador con supervision
#
# Arranca el servidor y lo vuelve a levantar si se cae, para que una excepcion
# a mitad de un directo no deje al streamer sin efectos hasta que se de cuenta.
# Tambien espera a que el servidor responda antes de abrir el navegador: antes
# se abria de inmediato y el panel salia con error de conexion.
# =============================================================================
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Chaos-Live - Centro de Control"

$RootDir = $PSScriptRoot
Set-Location $RootDir

# Cuantas veces se reintenta antes de rendirse, y cuanto se espera entre intentos.
$MaxRestarts = 10
$RestartDelaysSeconds = @(2, 5, 10, 20, 30)

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "              CHAOS-LIVE - CENTRO DE CONTROL" -ForegroundColor Cyan
Write-Host "         Interaccion en tiempo real: TikTok -> Minecraft" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

# --- Runtime de Node ---
$NodeBin = Join-Path $RootDir "bin\node.exe"
if (-not (Test-Path $NodeBin)) {
    $NodeBin = "node"
    if ($null -eq (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] No se encontro Node.js ni en bin\node.exe ni en el sistema." -ForegroundColor Red
        Write-Host "        Instalalo desde https://nodejs.org/ y vuelve a intentarlo." -ForegroundColor Red
        Read-Host "Pulsa Enter para cerrar"
        exit 1
    }
}

# --- Primera vez: preparar el equipo ---
#
# El streamer solo tiene que conocer este boton. Si la instalacion esta a medias
# (recien descomprimida, o actualizada desde una version antigua), se ejecuta la
# preparacion completa antes de arrancar: crea el .env, pregunta el canal, deja
# la base de datos con su esquema y avisa de lo que falte.
$EnvFile = Join-Path $RootDir ".env"
$Instalador = Join-Path $RootDir "Instalar-Chaos-Live.ps1"
$DbEsperada = Join-Path $RootDir "data\chaos-live.db"

$SinPreparar = (-not (Test-Path $EnvFile)) -or
               (-not (Test-Path $DbEsperada)) -or
               ((Get-Item $DbEsperada -ErrorAction SilentlyContinue).Length -eq 0)

if ($SinPreparar -and (Test-Path $Instalador)) {
    Write-Host "[INFO] Primera vez por aqui: preparando el equipo..." -ForegroundColor Yellow
    & $Instalador -Rapido
    Write-Host ""
}

$EnvExample = Join-Path $RootDir ".env.example"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
    Copy-Item $EnvExample $EnvFile -Force
    Write-Host "[INFO] Creado .env inicial a partir de .env.example" -ForegroundColor Yellow
}

# --- Carpetas de datos y logs ---
$DataDir = Join-Path $RootDir "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

# La base de datos se copia de la plantilla que trae el paquete, nunca se crea
# vacia. Un fichero de cero bytes no es una base de datos sin tablas: es nada, y
# como los errores de escritura se tragan a proposito para no tumbar un directo,
# el streamer no veia ni un aviso. Simplemente el historial salia siempre vacio y
# las metas volvian a cero en cada reinicio.
$DbFile = Join-Path $DataDir "chaos-live.db"
$DbTemplate = Join-Path $RootDir "config\database-template.db"
$DbNecesitaEsquema = (-not (Test-Path $DbFile)) -or ((Get-Item $DbFile -ErrorAction SilentlyContinue).Length -eq 0)
if ($DbNecesitaEsquema -and (Test-Path $DbTemplate)) {
    Copy-Item $DbTemplate $DbFile -Force
    Write-Host "[INFO] Base de datos preparada en data\chaos-live.db" -ForegroundColor Yellow
} elseif ($DbNecesitaEsquema) {
    Write-Host "[!] Falta config\database-template.db: el historial y las metas no se guardaran." -ForegroundColor Yellow
    Write-Host "    Ejecuta 'Instalar-Chaos-Live.bat' para revisar la instalacion." -ForegroundColor DarkGray
}

$LogDir = Join-Path $RootDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$SupervisorLog = Join-Path $LogDir "lanzador.log"

$env:NODE_ENV = "production"
$env:STATIC_DIR = Join-Path $RootDir "overlay"
$env:LOG_DIR = $LogDir

# La ruta de la base de datos se pasa siempre absoluta.
#
# Prisma resuelve un `file:./algo.db` contra la carpeta del esquema, que queda
# grabada dentro del cliente generado al compilar. En el PC del streamer esa
# carpeta no existe, asi que un DATABASE_URL relativo apuntaba a la nada: la app
# arrancaba sin quejarse y no guardaba una sola fila. Se respeta el valor del
# .env solo si ya es absoluto, por si alguien quiere llevarse la base a otro
# disco.
$DbUrlEnv = ""
$dbLine = Select-String -Path $EnvFile -Pattern '^\s*DATABASE_URL\s*=\s*(.+)$' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($dbLine) { $DbUrlEnv = $dbLine.Matches[0].Groups[1].Value.Trim() }

if ($DbUrlEnv -match '^file:(/|[A-Za-z]:)') {
    $env:DATABASE_URL = $DbUrlEnv
} else {
    # Prisma quiere barras normales incluso en Windows.
    $env:DATABASE_URL = "file:" + ($DbFile -replace '\\', '/')
}

# Puertos: se leen del .env para sondear la salud y comprobar antes de arrancar
# que ninguno de los dos esta ocupado. El publico va detras del principal salvo
# que el .env diga otra cosa, igual que hace el servidor.
$Port = 8080
if (Test-Path $EnvFile) {
    $portLine = Select-String -Path $EnvFile -Pattern '^\s*WS_PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portLine) { $Port = [int]$portLine.Matches[0].Groups[1].Value }
    $overlayLine = Select-String -Path $EnvFile -Pattern '^\s*OVERLAY_PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($overlayLine) { $OverlayPort = [int]$overlayLine.Matches[0].Groups[1].Value }
}

if ($null -eq $OverlayPort) { $OverlayPort = $Port + 1 }

$DashboardUrl = "http://localhost:$Port/dashboard"
$OverlayUrl = "http://localhost:$Port/overlay"
$HealthUrl = "http://localhost:$Port/api/health"

Write-Host "[OK] Panel de control: $DashboardUrl" -ForegroundColor Green
Write-Host "[OK] Overlay para OBS: $OverlayUrl" -ForegroundColor Green
Write-Host "[OK] Registro del directo: $LogDir" -ForegroundColor Green
Write-Host ""
Write-Host "Pulsa Ctrl + C en esta ventana para detener Chaos-Live." -ForegroundColor Yellow
Write-Host ""

# El sondeo de salud va siempre a localhost: buscar un proxy solo anade segundos
# de espera a cada peticion. La barra de progreso de Invoke-WebRequest, igual.
$ProgressPreference = "SilentlyContinue"
[System.Net.WebRequest]::DefaultWebProxy = $null

# --- Comprobacion previa de puertos ---
#
# Si el puerto ya esta cogido, el servidor no arranca y punto: reintentarlo diez
# veces solo consigue que el streamer vea diez caidas seguidas y un panel con
# "no se pudo conectar". Se mira antes de arrancar, y se dice quien lo tiene.
function Get-DuenoDelPuerto {
    param([int]$Puerto)
    try {
        $conn = Get-NetTCPConnection -State Listen -LocalPort $Puerto -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $conn) { return $null }
        return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    } catch {
        return $null
    }
}

<#
    Devuelve $true si quien contesta en ese puerto es un Chaos-Live vivo.

    Se intenta varias veces a proposito. La primera peticion de un proceso de
    PowerShell recien creado tarda lo suyo (inicializacion de WinINET y
    deteccion automatica de proxy), asi que con un solo intento corto se daba
    por muerto un servidor que estaba perfectamente, y el streamer recibia un
    "el puerto lo usa otro programa: node" hablando de su propio Chaos-Live.
#>
function Test-ChaosLiveVivo {
    param([string]$Url)
    for ($i = 0; $i -lt 3; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"') { return $true }
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    return $false
}

foreach ($PuertoEnUso in @($Port, $OverlayPort)) {
    $dueno = Get-DuenoDelPuerto -Puerto $PuertoEnUso
    if ($null -eq $dueno) { continue }

    if (Test-ChaosLiveVivo -Url "http://localhost:$PuertoEnUso/api/health") {
        Write-Host "[INFO] Chaos-Live ya esta abierto (puerto $PuertoEnUso)." -ForegroundColor Yellow
        Write-Host "       No hace falta abrirlo dos veces: te llevo al panel." -ForegroundColor Yellow
        Start-Process $DashboardUrl
        Write-Host ""
        Write-Host "       Si lo que querias era reiniciarlo, cierra antes la otra ventana" -ForegroundColor DarkGray
        Write-Host "       de Chaos-Live (la que pone 'Centro de Control') con Ctrl + C." -ForegroundColor DarkGray
        Read-Host "Pulsa Enter para cerrar esta ventana"
        exit 0
    }

    Write-Host "[ERROR] El puerto $PuertoEnUso ya lo usa otro programa: $($dueno.ProcessName) (PID $($dueno.Id))." -ForegroundColor Red
    Write-Host "        Chaos-Live no puede arrancar mientras siga ocupado." -ForegroundColor Red
    if ($dueno.ProcessName -eq "node") {
        Write-Host "        Parece un Chaos-Live anterior que se quedo colgado sin responder." -ForegroundColor DarkGray
        Write-Host "        Puedes cerrarlo desde el Administrador de tareas (PID $($dueno.Id))." -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "        Que puedes hacer:" -ForegroundColor Yellow
    Write-Host "          1) Cerrar ese programa y volver a pulsar este boton." -ForegroundColor Yellow
    Write-Host "          2) Abrir el archivo .env y poner WS_PORT y OVERLAY_PORT en dos" -ForegroundColor Yellow
    Write-Host "             numeros libres, por ejemplo 8090 y 8091." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

$BundleFile = Join-Path $RootDir "app\bundle.mjs"
if (-not (Test-Path $BundleFile)) {
    Write-Host "[ERROR] No se encontro app\bundle.mjs. La distribucion esta incompleta." -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

# Espera a que el servidor responda y abre el navegador. Se lanza en segundo
# plano para no bloquear el arranque del propio servidor.
$browserOpened = $false
function Open-DashboardWhenReady {
    param([string]$Health, [string]$Dashboard)

    # El job corre en su propio runspace: lo que se ajusta fuera no llega aqui.
    $ProgressPreference = "SilentlyContinue"
    [System.Net.WebRequest]::DefaultWebProxy = $null

    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest -Uri $Health -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Start-Process $Dashboard
                return $true
            }
        } catch {
            # Todavia no escucha; seguir esperando.
        }
    }
    return $false
}

$restarts = 0
while ($true) {
    $startedAt = Get-Date

    if (-not $browserOpened) {
        $job = Start-Job -ScriptBlock ${function:Open-DashboardWhenReady} -ArgumentList $HealthUrl, $DashboardUrl
        $browserOpened = $true
    }

    & $NodeBin $BundleFile
    $exitCode = $LASTEXITCODE
    $ranForSeconds = ((Get-Date) - $startedAt).TotalSeconds

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "[OK] Chaos-Live se cerro correctamente." -ForegroundColor Green
        break
    }

    $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $message = "[$stamp] El servidor termino con codigo $exitCode tras $([math]::Round($ranForSeconds,1))s."
    Add-Content -Path $SupervisorLog -Value $message -Encoding utf8

    # 78 = el propio servidor avisa de que reintentar no arregla nada (puerto
    # ocupado, permisos). Ya ha explicado por pantalla que pasa; insistir solo
    # taparia ese mensaje con diez copias del mismo error.
    if ($exitCode -eq 78) {
        Write-Host ""
        Write-Host "[ERROR] Chaos-Live no puede arrancar con la configuracion actual." -ForegroundColor Red
        Write-Host "        El motivo esta unas lineas mas arriba." -ForegroundColor Red
        Write-Host "        Detalle completo en: $LogDir" -ForegroundColor DarkGray
        Read-Host "Pulsa Enter para cerrar"
        exit $exitCode
    }

    $restarts++
    if ($restarts -gt $MaxRestarts) {
        Write-Host ""
        Write-Host "[ERROR] Chaos-Live se ha caido $MaxRestarts veces seguidas. No se reintenta mas." -ForegroundColor Red
        Write-Host "        Revisa el detalle en: $LogDir" -ForegroundColor Red
        Read-Host "Pulsa Enter para cerrar"
        exit $exitCode
    }

    # Si aguanto un buen rato, la caida es puntual: reiniciar rapido.
    # Si murio enseguida, algo esta mal de verdad: espaciar los reintentos.
    if ($ranForSeconds -gt 60) { $restarts = 1 }
    $delayIndex = [Math]::Min($restarts - 1, $RestartDelaysSeconds.Length - 1)
    $delay = $RestartDelaysSeconds[$delayIndex]

    Write-Host ""
    Write-Host "[!] Chaos-Live se detuvo inesperadamente (codigo $exitCode)." -ForegroundColor Yellow
    Write-Host "    Reiniciando en $delay segundos... (intento $restarts de $MaxRestarts)" -ForegroundColor Yellow
    Write-Host "    El overlay y el panel se reconectan solos." -ForegroundColor DarkGray
    Start-Sleep -Seconds $delay
}
