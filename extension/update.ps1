# Coupang Manager Extension Auto Updater
$ErrorActionPreference = 'Stop'

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Coupang Manager Extension - Auto Updater" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$zipUrl = "https://github.com/super887/coupang-manager/archive/refs/heads/main.zip"
$tmpZip = Join-Path $env:TEMP "cp_mgr_latest.zip"
$tmpDir = Join-Path $env:TEMP "cp_mgr_extracted"

$targetDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $targetDir "manifest.json")) -and (Test-Path (Join-Path $targetDir "extension"))) {
    $targetDir = Join-Path $targetDir "extension"
}

try {
    Write-Host "[1/3] Downloading latest files from GitHub..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object Net.WebClient
    $wc.DownloadFile($zipUrl, $tmpZip)

    Write-Host "[2/3] Extracting and updating extension files..." -ForegroundColor Yellow
    if (Test-Path $tmpDir) {
        Remove-Item $tmpDir -Recurse -Force
    }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force

    $sourceExtDir = Join-Path $tmpDir "coupang-manager-main\extension"
    if (-not (Test-Path $sourceExtDir)) {
        throw "Could not find extension directory in downloaded archive."
    }

    # Do not overwrite currently running scripts (.bat, .ps1)
    Get-ChildItem -Path $sourceExtDir | Where-Object { $_.Extension -notin @('.bat', '.ps1') } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $targetDir -Recurse -Force
    }

    Write-Host ""
    Write-Host "[3/3] Update Completed Successfully!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  * Target Path: $targetDir"
    Write-Host ""
    Write-Host "  [Next Steps]" -ForegroundColor Yellow
    Write-Host "  1. Open chrome://extensions in Chrome"
    Write-Host "  2. Click the Refresh (Reload) button on Coupang Manager card"
    Write-Host "  3. Check that the version is 1.2.1"
    Write-Host "===================================================" -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Write-Host "[ERROR] Update failed: $_" -ForegroundColor Red
}
finally {
    if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host ""
    $null = Read-Host "Press Enter to exit..."
}
