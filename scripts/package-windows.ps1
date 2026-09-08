# =============================================================================
# Chaos-Live — Empaquetado de la aplicacion de Windows
#
# Dos fases:
#   1. Preparar el payload en release\electron-resources (servidor empaquetado,
#      cliente de Prisma, overlay compilado, plantillas y el mod ya construido).
#   2. Llamar a electron-builder, que produce el instalador y el portable.
#
# Con -SoloPayload se queda en la fase 1, que es lo que hace falta para probar
# la app sin instalarla: `npm run dev --workspace=packages/desktop` la lee de
# ahi mismo.
# =============================================================================
param(
    # Deja el payload listo y no llama a electron-builder.
    [switch]$SoloPayload,
    # Empaqueta sin el mod. Solo para salir del paso: la distribucion resultante
    # obliga al streamer a compilarselo, que es justo lo que veniamos a quitar.
    [switch]$SinMod
)

$ErrorActionPreference = "Stop"

<#
    Ejecuta una herramienta externa y falla solo si su codigo de salida lo dice.

    En PowerShell 5.1, cualquier cosa que un .exe escriba por stderr se envuelve
    en un ErrorRecord; con $ErrorActionPreference = "Stop" eso aborta el script
    aunque el programa haya terminado bien. Le pasaba a esbuild, que escribe su
    resumen ("bundle.mjs 3.1mb") por stderr: el empaquetado moria con un
    NativeCommandError que no era ningun fallo, y habia que saberselo.
#>
function Invoke-Nativo {
    param([scriptblock]$Comando, [string]$Descripcion)

    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # Lo que llega por stderr viene envuelto en un ErrorRecord: hay que sacar
        # el mensaje, porque escribir el objeto imprime
        # "System.Management.Automation.RemoteException" en vez del texto.
        & $Comando 2>&1 | ForEach-Object {
            $texto = if ($_ -is [System.Management.Automation.ErrorRecord]) {
                $_.Exception.Message
            } else {
                "$_"
            }
            if ($texto) { Write-Host $texto }
        }
    } finally {
        $ErrorActionPreference = $anterior
    }

    if ($LASTEXITCODE -ne 0) { throw "$Descripcion (codigo $LASTEXITCODE)." }
}

<#
    Deja lista la caja de herramientas de firma que electron-builder necesita.

    La descarga y descomprime el solo, pero su archivo trae dos enlaces
    simbolicos de macOS (libcrypto.dylib, libssl.dylib) y crear un enlace
    simbolico en Windows exige un privilegio que una sesion normal no tiene.
    Resultado: "Cannot create symbolic link", cuatro reintentos y a casa, aunque
    ni firmemos ni nos hagan falta esos dos ficheros para nada.

    Asi que se extrae aqui, saltandose la carpeta de macOS, y se deja en la ruta
    exacta de su cache: electron-builder la encuentra hecha y no vuelve a
    intentarlo. La alternativa seria pedirle a quien empaqueta que active el
    modo desarrollador de Windows, que es cambiarle un ajuste del sistema por
    dos ficheros que no se usan.
#>
function Initialize-WinCodeSign {
    $version = "2.6.0"
    $cache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
    $destino = Join-Path $cache "winCodeSign-$version"

    if (Test-Path (Join-Path $destino "windows-10")) { return }

    Write-Host ">>> Preparando las herramientas de firma (una sola vez)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $destino | Out-Null

    $archivo = Join-Path $env:TEMP "winCodeSign-$version.7z"
    if (-not (Test-Path $archivo)) {
        $url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-$version/winCodeSign-$version.7z"
        $anteriorProgreso = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $url -OutFile $archivo -UseBasicParsing
        $ProgressPreference = $anteriorProgreso
    }

    $7za = Join-Path $RootDir "node_modules\7zip-bin\win\x64\7za.exe"
    Invoke-Nativo {
        & $7za x -bd -y "-o$destino" $archivo "-xr!darwin" | Out-Null
    } "No se pudo preparar winCodeSign"

    if (-not (Test-Path (Join-Path $destino "windows-10"))) {
        throw "winCodeSign se descomprimio pero no aparecio windows-10\; revisa $destino."
    }
}

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
$Version = (Get-Content (Join-Path $RootDir "package.json") -Raw | ConvertFrom-Json).version
$Payload = Join-Path $RootDir "release\electron-resources"

Write-Host ">>> Empaquetando Chaos-Live v$Version" -ForegroundColor Cyan
Set-Location $RootDir

# -----------------------------------------------------------------------------
# Limpieza
#
# El payload se rehace entero. Aqui no vive nada del streamer —sus datos estan
# en %APPDATA%\Chaos-Live— asi que no hay nada que conservar, y arrastrar restos
# de un empaquetado anterior es como se cuelan ficheros que ya no existen.
# -----------------------------------------------------------------------------
if (Test-Path $Payload) { Remove-Item $Payload -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Payload | Out-Null

# -----------------------------------------------------------------------------
# 1. Compilar
# -----------------------------------------------------------------------------
Write-Host ">>> Compilando los paquetes..." -ForegroundColor Cyan
Invoke-Nativo { npm run build } "Fallo 'npm run build'"

Write-Host ">>> Empaquetando el servidor con esbuild..." -ForegroundColor Cyan
Invoke-Nativo {
    npx esbuild packages/app/src/main.ts --bundle --platform=node --format=esm `
        --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" `
        --outfile="$Payload\server\app\bundle.mjs" --external:@prisma/client --external:.prisma
} "Fallo el empaquetado con esbuild"

# -----------------------------------------------------------------------------
# 2. Overlay y configuracion
# -----------------------------------------------------------------------------
Write-Host ">>> Copiando el overlay y el panel..." -ForegroundColor Cyan
$OverlayDist = Join-Path $RootDir "packages\overlay\dist"
if (-not (Test-Path (Join-Path $OverlayDist "index.html"))) {
    throw "No hay build del overlay en packages\overlay\dist."
}
New-Item -ItemType Directory -Force -Path "$Payload\overlay" | Out-Null
Copy-Item -Recurse -Force "$OverlayDist\*" "$Payload\overlay\"

Write-Host ">>> Copiando las plantillas de configuracion..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$Payload\config" | Out-Null
Copy-Item -Force "$RootDir\packages\app\config\rules.json" "$Payload\config\rules.json"
Copy-Item -Force "$RootDir\.env.example" "$Payload\.env.example"

# El icono va dentro del payload y no como recurso suelto de electron-builder,
# para que la app lo encuentre en el mismo sitio empaquetada y sin empaquetar.
Copy-Item -Force "$RootDir\packages\desktop\resources\icon.ico" "$Payload\icon.ico"

# -----------------------------------------------------------------------------
# 3. Plantilla de la base de datos
#
# La app no lleva la herramienta de Prisma (pesa mas que el resto junto), asi
# que el esquema no se puede crear en el PC del streamer: viaja ya creado y
# vacio, y la app lo copia a su carpeta de datos la primera vez.
#
# Sin esto se creaba un fichero de cero bytes, que para SQLite no es una base de
# datos sin tablas sino nada en absoluto. La app no se caia —los errores de
# escritura se tragan a proposito para no tumbar un directo— pero no guardaba
# nada: historial siempre vacio y metas a cero en cada reinicio, sin un solo
# mensaje de error.
# -----------------------------------------------------------------------------
Write-Host ">>> Construyendo la plantilla de la base de datos..." -ForegroundColor Cyan
$DbTemplate = Join-Path $Payload "config\database-template.db"
$PrismaSchema = Join-Path $RootDir "packages\core\prisma\schema.prisma"
$env:DATABASE_URL = "file:$DbTemplate"
Invoke-Nativo {
    & node (Join-Path $RootDir "node_modules\prisma\build\index.js") db push `
        --skip-generate --accept-data-loss --schema=$PrismaSchema
} "Fallo 'prisma db push'"
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
if (-not (Test-Path $DbTemplate)) {
    throw "No se pudo crear config\database-template.db. Sin ella la app no persiste nada."
}

# -----------------------------------------------------------------------------
# 4. Cliente de Prisma
#
# El bundle marca @prisma/client como externo, asi que el cliente generado (con
# su motor de consultas nativo) tiene que viajar aparte. Va bajo server\, de
# forma que la resolucion de modulos desde server\app\bundle.mjs lo encuentre
# subiendo un nivel. Y queda fuera del asar, porque un .node no se puede cargar
# desde dentro de un archivo.
# -----------------------------------------------------------------------------
Write-Host ">>> Copiando el cliente de Prisma..." -ForegroundColor Cyan
foreach ($target in @(
    @{ Source = "$RootDir\node_modules\@prisma\client"; Dest = "$Payload\server\node_modules\@prisma\client" },
    @{ Source = "$RootDir\node_modules\.prisma\client"; Dest = "$Payload\server\node_modules\.prisma\client" }
)) {
    if (-not (Test-Path $target.Source)) {
        throw "No se encontro $($target.Source). Ejecuta 'npx prisma generate' antes de empaquetar."
    }
    New-Item -ItemType Directory -Force -Path $target.Dest | Out-Null
    Copy-Item -Recurse -Force "$($target.Source)\*" $target.Dest
}

# -----------------------------------------------------------------------------
# 5. El mod, ya compilado
#
# Antes el .jar no viajaba: el streamer tenia que instalarse un JDK 17 y
# ejecutar Compilar-Mod.bat. Ahora se construye aqui y la app lo instala en un
# boton. Si no hay JDK, esto **falla**: un aviso pasa desapercibido y produce
# una release que dice traer el mod y no lo trae, que es exactamente como se
# publicaron ZIPs sin el runtime de Node.
# -----------------------------------------------------------------------------
if ($SinMod) {
    Write-Host "[AVISO] -SinMod: la app saldra sin el mod y el streamer tendra que compilarselo." -ForegroundColor Yellow
} else {
    Write-Host ">>> Compilando el mod de Fabric..." -ForegroundColor Cyan
    $ModDir = Join-Path $RootDir "packages\minecraft-mod"

    Push-Location $ModDir
    $gradleOk = $true
    try {
        Invoke-Nativo { & (Join-Path $ModDir "gradlew.bat") build --quiet } "Fallo Gradle"
    } catch {
        $gradleOk = $false
    } finally {
        Pop-Location
    }

    if (-not $gradleOk) {
        throw @"
No se pudo compilar el mod de Fabric.

Hace falta un JDK 17 en esta maquina:
  https://adoptium.net/temurin/releases/?version=17

Si de verdad quieres publicar sin el mod, vuelve a ejecutarlo con -SinMod.
"@
    }

    $Jar = Get-ChildItem (Join-Path $ModDir "build\libs") -Filter "*.jar" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike "*sources*" -and $_.Name -notlike "*dev*" } |
        Select-Object -First 1
    if (-not $Jar) { throw "Gradle termino bien pero no aparecio ningun .jar en build\libs." }

    New-Item -ItemType Directory -Force -Path "$Payload\mod" | Out-Null
    Copy-Item -Force $Jar.FullName "$Payload\mod\"
    Write-Host "    Mod: $($Jar.Name)" -ForegroundColor DarkGray
}

$PayloadMB = [math]::Round(((Get-ChildItem $Payload -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 2)
Write-Host ">>> Payload listo en release\electron-resources ($PayloadMB MB)" -ForegroundColor Green

if ($SoloPayload) {
    Write-Host ">>> -SoloPayload: no se llama a electron-builder." -ForegroundColor Yellow
    Write-Host "    Para probar la app: npm run dev --workspace=packages/desktop" -ForegroundColor DarkGray
    exit 0
}

# -----------------------------------------------------------------------------
# 6. Instalador y portable
# -----------------------------------------------------------------------------
Write-Host ">>> Construyendo el instalador y el portable..." -ForegroundColor Cyan

# La distribucion va sin firmar: un certificado de firma de codigo cuesta
# dinero y de momento no lo hay. Windows ensenara "Mas informacion > Ejecutar de
# todas formas" la primera vez, y esta documentado en la guia del streamer.
#
# Hay que decirselo explicitamente a electron-builder: si no, busca un
# certificado en el almacen del sistema, y para eso se descarga y descomprime
# winCodeSign, un archivo que trae enlaces simbolicos de macOS. Crear un enlace
# simbolico en Windows exige privilegios que una sesion normal no tiene, asi que
# el empaquetado moria con "Cannot create symbolic link" cuatro veces seguidas.
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Initialize-WinCodeSign

Push-Location (Join-Path $RootDir "packages\desktop")
try {
    Invoke-Nativo { npx electron-builder --win --config electron-builder.yml } "Fallo electron-builder"
} finally {
    Pop-Location
}

Get-ChildItem (Join-Path $RootDir "release") -Filter "Chaos-Live*.exe" |
    ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 2)
        Write-Host ">>> [OK] $($_.Name) ($mb MB)" -ForegroundColor Green
    }
