param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$pythonExe = (Resolve-Path -LiteralPath $Python).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendRoot = (Resolve-Path (Join-Path $repoRoot "backend")).Path
$buildDir = Join-Path $backendRoot "build"
$distDir = Join-Path $backendRoot "dist"
$releaseDir = Join-Path $backendRoot "release"
$stageDir = Join-Path $releaseDir "ResearchOS-Engine-Windows-x64"
$zipPath = Join-Path $releaseDir "ResearchOS-Engine-Windows-x64.zip"
$sumPath = Join-Path $releaseDir "SHA256SUMS.txt"

foreach ($path in @($buildDir, $distDir, $stageDir, $zipPath, $sumPath)) {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}

Push-Location $backendRoot
try {
  & $pythonExe -m PyInstaller --noconfirm --clean research-os-engine.spec
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed with exit code $LASTEXITCODE" }
  $engine = Join-Path $distDir "ResearchOS-Engine\ResearchOS-Engine.exe"
  if (-not (Test-Path -LiteralPath $engine)) { throw "Expected Engine artifact was not created: $engine" }
  & $pythonExe tests/packaged_smoke.py --engine $engine
  if ($LASTEXITCODE -ne 0) { throw "Packaged Engine smoke failed with exit code $LASTEXITCODE" }
  New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $distDir "ResearchOS-Engine") -Destination $stageDir -Recurse
  Compress-Archive -LiteralPath (Join-Path $stageDir "ResearchOS-Engine") -DestinationPath $zipPath -Force
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $sumPath -Value "$hash  ResearchOS-Engine-Windows-x64.zip" -NoNewline
  $distSize = (Get-ChildItem -LiteralPath (Join-Path $distDir "ResearchOS-Engine") -Recurse -File | Measure-Object Length -Sum).Sum
  $zipSize = (Get-Item -LiteralPath $zipPath).Length
  Write-Host "Engine artifact: $engine"
  Write-Host "Dist size: $distSize bytes"
  Write-Host "Zip size: $zipSize bytes"
  Write-Host "SHA-256: $hash"
} finally {
  Pop-Location
}
