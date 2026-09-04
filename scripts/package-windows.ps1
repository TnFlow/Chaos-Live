# =============================================================================
# Chaos-Live — Windows Distribution Packager
# =============================================================================
$ErrorActionPreference = "Stop"

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName

# La version sale del package.json raiz: antes estaba escrita a mano aqui y
# quedo desincronizada con los paquetes (release v1.0.0 sobre paquetes 0.1.0).
$Version = (Get-Content (Join-Path $RootDir "package.json") -Raw | ConvertFrom-Json).version
$ReleaseName = "Chaos-Live-v$Version-Windows"
Write-Host ">>> Empaquetando $ReleaseName" -ForegroundColor Cyan

$ReleaseDir = Join-Path $RootDir "release\$ReleaseName"
$ZipFile = Join-Path $RootDir "release\$ReleaseName.zip"

# Limpiar restos de un empaquetado anterior: sin esto, los ficheros que se
# eliminan del proyecto sobreviven dentro de release\ y acaban en el ZIP.
#
# Se conserva lo que NO genera este script y pertenece a quien usa la carpeta:
# el runtime portable, la base de datos del directo, su .env con credenciales
# reales y los registros. Borrarlos aqui destruiria datos del streamer.
$Preserve = @("bin", "data", "logs", ".env")
if (Test-Path $ReleaseDir) {
    Get-ChildItem -Path $ReleaseDir -Force |
        Where-Object { $Preserve -notcontains $_.Name -and $_.Name -ne "minecraft-mod" } |
        Remove-Item -Recurse -Force

    # El mod se refresca por dentro: las cachas de Gradle (.gradle y build)
    # generan rutas mas largas que el limite de Windows y no se pueden borrar.
    # Ya quedan fuera del ZIP, asi que basta con no tocarlas.
    $ModDir = Join-Path $ReleaseDir "minecraft-mod"
    if (Test-Path $ModDir) {
        $ModCaches = @(".gradle", "build")
        Get-ChildItem -Path $ModDir -Force |
            Where-Object { $ModCaches -notcontains $_.Name } |
            Remove-Item -Recurse -Force
    }
}
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

Write-Host ">>> Building Chaos-Live Monorepo Packages..." -ForegroundColor Cyan
Set-Location $RootDir
npm run build

Write-Host ">>> Bundling Server with esbuild..." -ForegroundColor Cyan
npx esbuild packages/app/src/main.ts --bundle --platform=node --format=esm --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="$ReleaseDir\app\bundle.mjs" --external:@prisma/client --external:.prisma

Write-Host ">>> Copying Web Overlay & Dashboard..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$ReleaseDir\overlay" | Out-Null
Copy-Item -Recurse -Force "$RootDir\packages\overlay\dist\*" "$ReleaseDir\overlay\"

Write-Host ">>> Syncing Rules & Configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$ReleaseDir\config" | Out-Null
Copy-Item -Force "$RootDir\packages\app\config\rules.json" "$ReleaseDir\config\rules.json"
Copy-Item -Force "$RootDir\.env.example" "$ReleaseDir\.env.example"

# El bundle marca @prisma/client como externo, asi que el cliente generado (con
# su motor de consultas nativo) tiene que viajar en la distribucion. Sin esto el
# servidor arranca y muere al primer acceso a la base de datos.
Write-Host ">>> Copying Prisma client..." -ForegroundColor Cyan
$PrismaTargets = @(
    @{ Source = "$RootDir\node_modules\@prisma\client"; Dest = "$ReleaseDir\node_modules\@prisma\client" },
    @{ Source = "$RootDir\node_modules\.prisma\client"; Dest = "$ReleaseDir\node_modules\.prisma\client" }
)
foreach ($target in $PrismaTargets) {
    if (-not (Test-Path $target.Source)) {
        throw "No se encontro $($target.Source). Ejecuta 'npx prisma generate' antes de empaquetar."
    }
    New-Item -ItemType Directory -Force -Path $target.Dest | Out-Null
    Copy-Item -Recurse -Force "$($target.Source)\*" $target.Dest
}

if (-not (Test-Path "$ReleaseDir\bin\node.exe")) {
    Write-Host "[AVISO] No hay bin\node.exe en la distribucion: el lanzador usara el Node del sistema." -ForegroundColor Yellow
}

# Los lanzadores viven en scripts\dist-templates (versionados). Antes solo
# existian dentro de release\, que esta en .gitignore, asi que empaquetar en
# otra maquina producia una distribucion sin forma de arrancarla.
Write-Host ">>> Copying launcher scripts..." -ForegroundColor Cyan
Copy-Item -Force "$RootDir\scripts\dist-templates\*" "$ReleaseDir\"

Write-Host ">>> Syncing Minecraft Mod Wrapper..." -ForegroundColor Cyan
$ModReleaseDir = "$ReleaseDir\minecraft-mod"
New-Item -ItemType Directory -Force -Path "$ModReleaseDir\gradle\wrapper" | Out-Null
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradle\wrapper\gradle-wrapper.jar" "$ModReleaseDir\gradle\wrapper\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradle\wrapper\gradle-wrapper.properties" "$ModReleaseDir\gradle\wrapper\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\Compilar-Mod.bat" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradlew.bat" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradlew.ps1" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradlew" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\build.gradle" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\settings.gradle" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\gradle.properties" "$ModReleaseDir\"
Copy-Item -Force "$RootDir\packages\minecraft-mod\README.md" "$ModReleaseDir\"
New-Item -ItemType Directory -Force -Path "$ModReleaseDir\src" | Out-Null
Copy-Item -Recurse -Force "$RootDir\packages\minecraft-mod\src\*" "$ModReleaseDir\src\"

Write-Host ">>> Creating ZIP Archive: $ZipFile..." -ForegroundColor Cyan
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
# Se excluye lo que es privado de esta maquina: el .env con las credenciales
# reales, la base de datos del directo y los registros. Solo viaja el
# .env.example, que el lanzador copia a .env en el equipo de destino.
tar.exe --exclude="minecraft-mod/.gradle" --exclude="minecraft-mod/build" --exclude=".env" --exclude="data" --exclude="logs" -a -c -f $ZipFile -C $ReleaseDir *

$SizeMB = [math]::Round((Get-Item $ZipFile).Length / 1MB, 2)
Write-Host ">>> [SUCCESS] Package created: $ZipFile ($SizeMB MB)" -ForegroundColor Green
