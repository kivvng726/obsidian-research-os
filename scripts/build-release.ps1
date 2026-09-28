param([string]$Version = "0.6.0-beta.2", [string]$Python = ".\\backend\\.venv\\Scripts\\python.exe", [string]$TestVault = "")

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonExe = (Resolve-Path -LiteralPath (Join-Path $root $Python)).Path
if ([string]::IsNullOrWhiteSpace($TestVault)) { $TestVault = $env:RESEARCH_OS_TEST_VAULT }
if ([string]::IsNullOrWhiteSpace($TestVault)) { throw "A dedicated -TestVault path is required for npm run build:test." }
$env:RESEARCH_OS_TEST_VAULT = $TestVault
$release = Join-Path $root "release\v$Version"
$stage = Join-Path $release ".staging"
$pluginDir = Join-Path $stage "research-os"
$pluginZip = Join-Path $release "ResearchOS-Plugin-v$Version.zip"
$engineZip = Join-Path $release "ResearchOS-Engine-Windows-x64-v$Version.zip"
$sum = Join-Path $release "SHA256SUMS.txt"

Write-Host "Working tree status:"; git -C $root status --short
node (Join-Path $root "scripts\check-release-version.mjs") $Version

foreach ($path in @($release)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force } }
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

Push-Location $root
try {
  npm test; if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
  npm run build:test; if ($LASTEXITCODE -ne 0) { throw "npm run build:test failed" }
  Push-Location (Join-Path $root "backend")
  try { & $pythonExe -m pytest; if ($LASTEXITCODE -ne 0) { throw "backend pytest failed" } }
  finally { Pop-Location }

  $golden = (Get-FileHash -LiteralPath (Join-Path $root ".obsidian\plugins\research-os\main.js") -Algorithm SHA256).Hash
  & (Join-Path $root "node_modules\.bin\esbuild.cmd") ".obsidian/plugins/research-os/main.source.js" --bundle --platform=node --format=cjs --external:obsidian --outfile="$pluginDir\main.js"
  if ($LASTEXITCODE -ne 0) { throw "Plugin release build failed" }
  foreach ($file in @("manifest.json", "styles.css", "forest.jpg")) { Copy-Item -LiteralPath (Join-Path $root ".obsidian\plugins\research-os\$file") -Destination $pluginDir }
  if ((Get-FileHash -LiteralPath (Join-Path $root ".obsidian\plugins\research-os\main.js") -Algorithm SHA256).Hash -ne $golden) { throw "Golden main.js changed" }
  if (Select-String -LiteralPath (Join-Path $pluginDir "main.js") -Pattern 'require\("\./' -Quiet) { throw "Release bundle has unresolved local runtime modules" }
  foreach ($required in @("main.js", "manifest.json", "styles.css", "forest.jpg")) { if (-not (Test-Path -LiteralPath (Join-Path $pluginDir $required))) { throw "Missing plugin runtime file: $required" } }
  Compress-Archive -LiteralPath $pluginDir -DestinationPath $pluginZip -Force

  & (Join-Path $root "scripts\build-engine-windows.ps1") -Python $pythonExe
  $builtEngine = Join-Path $root "backend\release\ResearchOS-Engine-Windows-x64.zip"
  Copy-Item -LiteralPath $builtEngine -Destination $engineZip
  Copy-Item -LiteralPath (Join-Path $root "RELEASE_NOTES.md") -Destination (Join-Path $release "RELEASE_NOTES.md")
  $lines = @()
  $lines += (Get-FileHash -LiteralPath $pluginZip -Algorithm SHA256).Hash.ToLowerInvariant() + "  " + [IO.Path]::GetFileName($pluginZip)
  $lines += (Get-FileHash -LiteralPath $engineZip -Algorithm SHA256).Hash.ToLowerInvariant() + "  " + [IO.Path]::GetFileName($engineZip)
  Set-Content -LiteralPath $sum -Value $lines
  Remove-Item -LiteralPath $stage -Recurse -Force
  Write-Host "Release artifacts:"; Get-ChildItem -LiteralPath $release | Select-Object Name,Length
} finally { Pop-Location }
