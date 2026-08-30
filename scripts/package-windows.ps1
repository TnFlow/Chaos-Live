# =============================================================================
# Chaos-Live — Windows Distribution Packager
# =============================================================================
$ErrorActionPreference = "Stop"

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
$ReleaseDir = Join-Path $RootDir "release\Chaos-Live-v1.0.0-Windows"
$ZipFile = Join-Path $RootDir "release\Chaos-Live-v1.0.0-Windows.zip"

Write-Host ">>> Building Chaos-Live Monorepo Packages..." -ForegroundColor Cyan
Set-Location $RootDir
npm run build

Write-Host ">>> Bundling Server with esbuild..." -ForegroundColor Cyan
npx esbuild packages/app/src/main.ts --bundle --platform=node --format=esm --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="$ReleaseDir\app\bundle.mjs" --external:@prisma/client --external:.prisma

Write-Host ">>> Copying Web Overlay & Dashboard..." -ForegroundColor Cyan
Copy-Item -Recurse -Force "$RootDir\packages\overlay\dist\*" "$ReleaseDir\overlay\"

Write-Host ">>> Syncing Rules & Configuration..." -ForegroundColor Cyan
Copy-Item -Force "$RootDir\packages\app\config\rules.json" "$ReleaseDir\config\rules.json"

Write-Host ">>> Creating ZIP Archive: $ZipFile..." -ForegroundColor Cyan
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
Compress-Archive -Path $ReleaseDir -DestinationPath $ZipFile -Force

$SizeMB = [math]::Round((Get-Item $ZipFile).Length / 1MB, 2)
Write-Host ">>> [SUCCESS] Package created: $ZipFile ($SizeMB MB)" -ForegroundColor Green
