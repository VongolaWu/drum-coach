param(
  [Parameter(Mandatory = $false)]
  [string]$TargetDir = "",

  [Parameter(Mandatory = $false)]
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $projectRoot "server-deploy"
}

$resolvedTargetDir = [System.IO.Path]::GetFullPath($TargetDir)

Write-Host "Building project..." -ForegroundColor Cyan
Push-Location $projectRoot
try {
  npm run build | Out-Host
}
finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $distDir)) {
  throw "Build output not found: $distDir"
}

if ($Clean -and (Test-Path -LiteralPath $resolvedTargetDir)) {
  Write-Host "Cleaning target directory: $resolvedTargetDir" -ForegroundColor Yellow
  Get-ChildItem -LiteralPath $resolvedTargetDir -Force | Remove-Item -Recurse -Force
}

if (-not (Test-Path -LiteralPath $resolvedTargetDir)) {
  New-Item -ItemType Directory -Path $resolvedTargetDir | Out-Null
}

Write-Host "Copying dist to: $resolvedTargetDir" -ForegroundColor Cyan
Copy-Item -Path (Join-Path $distDir "*") -Destination $resolvedTargetDir -Recurse -Force

Write-Host "Deployment completed." -ForegroundColor Green
Write-Host "Target: $resolvedTargetDir"
