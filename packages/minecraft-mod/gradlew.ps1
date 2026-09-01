# =============================================================================
# Gradle Wrapper PowerShell Script for Windows
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs
)

$ErrorActionPreference = 'Stop'
$AppHome = $PSScriptRoot
$Classpath = Join-Path $AppHome 'gradle\wrapper\gradle-wrapper.jar'

if (-not (Test-Path $Classpath)) {
    Write-Error "Cannot find Gradle wrapper JAR at: $Classpath"
    exit 1
}

# 1. Locate Java 17+
$JavaExe = $null

# Check JAVA_HOME
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $JavaExe = "$env:JAVA_HOME\bin\java.exe"
}

# Check Minecraft Launcher bundled Java 17 (gamma)
if (-not $JavaExe) {
    $mcCandidates = @(
        "$env:LOCALAPPDATA\Packages\Microsoft.4297127D64C57_8wekyb3d8bbwe\LocalCache\Local\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\java.exe",
        "C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\java.exe",
        "$env:APPDATA\.minecraft\runtime\java-runtime-gamma\windows\java-runtime-gamma\bin\java.exe"
    )
    foreach ($candidate in $mcCandidates) {
        if (Test-Path $candidate) {
            $JavaExe = $candidate
            break
        }
    }
}

# Check JDK 17 installed in Program Files
if (-not $JavaExe) {
    $jdkCandidates = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-17*", "C:\Program Files\Java\jdk-17*", "C:\Program Files\Microsoft\jdk-17*" -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "bin\java.exe" }
    foreach ($candidate in $jdkCandidates) {
        if (Test-Path $candidate) {
            $JavaExe = $candidate
            break
        }
    }
}

# Fallback to system java in PATH
if (-not $JavaExe) {
    $found = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($found) {
        $JavaExe = $found.Source
    }
}

if (-not $JavaExe) {
    Write-Host ""
    Write-Host "ERROR: No Java installation found (Java 17 required for Minecraft 1.20.1 Fabric)." -ForegroundColor Red
    Write-Host "Please install JDK 17 with: winget install EclipseAdoptium.Temurin.17.jdk" -ForegroundColor Yellow
    Write-Host "Or run Compilar-Mod.bat which will attempt to auto-detect your Minecraft launcher Java." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$DefaultJvmOpts = @('-Xmx64m', '-Xms64m')
$GradleAppName = '-Dorg.gradle.appname=gradlew'

# Execute Gradle
& $JavaExe $DefaultJvmOpts $GradleAppName -classpath $Classpath org.gradle.wrapper.GradleWrapperMain @GradleArgs
exit $LASTEXITCODE
