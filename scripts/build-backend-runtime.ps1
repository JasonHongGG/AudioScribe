param(
    [string]$BackendPython = "",
    [string]$FfmpegExe = "",
    [string]$FfprobeExe = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[build-backend-runtime] $Message"
}

function Resolve-CommandPath {
    param([Parameter(Mandatory = $true)][string]$CommandName)

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    return $command.Source
}

function Remove-PathIfExists {
    param([Parameter(Mandatory = $true)][string]$PathValue)

    if (Test-Path -LiteralPath $PathValue) {
        Remove-Item -LiteralPath $PathValue -Recurse -Force
    }
}

function Invoke-RobocopyMirror {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    & robocopy $Source $Destination /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        throw "robocopy failed from '$Source' to '$Destination' with exit code $exitCode"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$uiSrcTauriDir = Join-Path $repoRoot 'ui/src-tauri'
$resourcesDir = Join-Path $uiSrcTauriDir 'resources'
$runtimeDir = Join-Path $resourcesDir 'backend-runtime'
$pythonOutDir = Join-Path $runtimeDir 'python'
$appOutDir = Join-Path $runtimeDir 'app'
$sitePackagesOutDir = Join-Path $runtimeDir 'site-packages'
$ffmpegOutDir = Join-Path $resourcesDir 'ffmpeg'

if (-not $BackendPython) {
    $BackendPython = Join-Path $backendDir '.venv/Scripts/python.exe'
}

if (-not (Test-Path -LiteralPath $BackendPython)) {
    throw "Backend Python executable not found at '$BackendPython'. Run 'uv sync' in backend first or pass -BackendPython explicitly."
}

$ffmpegExePath = if ($FfmpegExe) { $FfmpegExe } elseif ($env:AUDIOSCRIBE_FFMPEG_EXE) { $env:AUDIOSCRIBE_FFMPEG_EXE } else { Resolve-CommandPath 'ffmpeg.exe' }
$ffprobeExePath = if ($FfprobeExe) { $FfprobeExe } elseif ($env:AUDIOSCRIBE_FFPROBE_EXE) { $env:AUDIOSCRIBE_FFPROBE_EXE } else { Resolve-CommandPath 'ffprobe.exe' }

if (-not $ffmpegExePath -or -not (Test-Path -LiteralPath $ffmpegExePath)) {
    throw "ffmpeg.exe was not found. Add it to PATH or pass -FfmpegExe explicitly."
}

if (-not $ffprobeExePath -or -not (Test-Path -LiteralPath $ffprobeExePath)) {
    throw "ffprobe.exe was not found. Add it to PATH or pass -FfprobeExe explicitly."
}

Write-Step "Resolving Python base installation"
$pythonInfoJson = & $BackendPython -c "import json, pathlib, sys; print(json.dumps({'base_prefix': sys.base_prefix, 'version': '.'.join(map(str, sys.version_info[:3])), 'executable': sys.executable, 'site_packages': str(pathlib.Path(sys.prefix) / 'Lib' / 'site-packages')}))"
if (-not $pythonInfoJson) {
    throw 'Failed to inspect backend Python runtime.'
}
$pythonInfo = $pythonInfoJson | ConvertFrom-Json
$pythonBaseDir = $pythonInfo.base_prefix
$venvSitePackagesDir = $pythonInfo.site_packages

if (-not (Test-Path -LiteralPath $pythonBaseDir)) {
    throw "Python base installation directory not found at '$pythonBaseDir'."
}

if (-not (Test-Path -LiteralPath $venvSitePackagesDir)) {
    throw "Virtual environment site-packages directory not found at '$venvSitePackagesDir'."
}

$audioscribePackageDir = Join-Path $backendDir 'audioscribe'
if (-not (Test-Path -LiteralPath $audioscribePackageDir)) {
    throw "Backend package directory not found at '$audioscribePackageDir'."
}

Write-Step "Preparing resource directories"
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null
Remove-PathIfExists -PathValue $runtimeDir
Remove-PathIfExists -PathValue $ffmpegOutDir

Write-Step "Copying Python runtime from $pythonBaseDir"
Invoke-RobocopyMirror -Source $pythonBaseDir -Destination $pythonOutDir

Write-Step "Copying backend package"
Invoke-RobocopyMirror -Source $audioscribePackageDir -Destination (Join-Path $appOutDir 'audioscribe')

Write-Step "Copying backend dependencies from $venvSitePackagesDir"
Invoke-RobocopyMirror -Source $venvSitePackagesDir -Destination $sitePackagesOutDir

Write-Step "Copying ffmpeg tools"
New-Item -ItemType Directory -Force -Path $ffmpegOutDir | Out-Null
Copy-Item -LiteralPath $ffmpegExePath -Destination (Join-Path $ffmpegOutDir 'ffmpeg.exe') -Force
Copy-Item -LiteralPath $ffprobeExePath -Destination (Join-Path $ffmpegOutDir 'ffprobe.exe') -Force

$manifest = [ordered]@{
    builtAt = [DateTimeOffset]::UtcNow.ToString('o')
    pythonVersion = $pythonInfo.version
    backendPython = (Resolve-Path -LiteralPath $BackendPython).Path
    pythonBaseDir = (Resolve-Path -LiteralPath $pythonBaseDir).Path
    sitePackagesDir = (Resolve-Path -LiteralPath $venvSitePackagesDir).Path
    ffmpegExe = (Resolve-Path -LiteralPath $ffmpegExePath).Path
    ffprobeExe = (Resolve-Path -LiteralPath $ffprobeExePath).Path
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runtimeDir 'manifest.json') -Encoding UTF8

Write-Step "Validating bundled runtime imports"
$bundledPython = Join-Path $pythonOutDir 'python.exe'
$bundledAppDir = $appOutDir
$bundledSitePackagesDir = $sitePackagesOutDir

$validationEnv = @{
    PYTHONHOME = $pythonOutDir
    PYTHONPATH = "$bundledAppDir;$bundledSitePackagesDir"
    PYTHONNOUSERSITE = '1'
}

$env:PYTHONHOME = $validationEnv.PYTHONHOME
$env:PYTHONPATH = $validationEnv.PYTHONPATH
$env:PYTHONNOUSERSITE = $validationEnv.PYTHONNOUSERSITE
try {
    & $bundledPython -c "import audioscribe.server; import faster_whisper; print('ok')" | Out-Null
} finally {
    Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    Remove-Item Env:PYTHONNOUSERSITE -ErrorAction SilentlyContinue
}

Write-Step "Bundled backend runtime is ready at $runtimeDir"