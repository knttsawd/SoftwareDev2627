# Sets up StudyApp on a Windows Server VM, serving the website and API on port 80.
# Run it again after copying in new code: it rebuilds and restarts the service.
#
# In PowerShell as Administrator, from the project folder:
#   powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
#
# Needs Node.js 22.13 or newer installed from nodejs.org (the default install folder).

$ErrorActionPreference = 'Stop'

$WINSW_URL = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$PORT = 80
$DATA_FOLDER = 'C:/StudyAppData'
$SERVICE_ID = 'studyapp'

$project_root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$server_folder = Join-Path $project_root 'server'
$service_exe = Join-Path $PSScriptRoot 'studyapp-service.exe'
$node_exe = Join-Path $env:ProgramFiles 'nodejs\node.exe'

function Write-Step($message) { Write-Host "`n== $message" -ForegroundColor Cyan }

# Runs a native command and stops the script if it fails.
function Invoke-Checked($description, [scriptblock]$command) {
    & $command
    if ($LASTEXITCODE -ne 0) { throw "$description failed (exit code $LASTEXITCODE)" }
}

$is_admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $is_admin) { throw 'Run this in PowerShell opened as Administrator.' }

Write-Step 'Checking Node.js'
if (-not (Test-Path $node_exe)) { throw "Node.js not found at $node_exe. Install Node.js 24 LTS from https://nodejs.org" }
$node_version = [version]((& $node_exe -v).TrimStart('v'))
if ($node_version -lt [version]'22.13.0') { throw "Node.js $node_version is too old; StudyApp needs 22.13 or newer." }
Write-Host "Node.js $node_version"

Write-Step 'Installing packages and building the website'
Push-Location $project_root
try {
    Invoke-Checked 'npm install' { npm.cmd run install:all }
    Invoke-Checked 'Website build' { npm.cmd run build }
} finally {
    Pop-Location
}

Write-Step 'Settings (server\.env)'
$env_path = Join-Path $server_folder '.env'
if (Test-Path $env_path) {
    Write-Host 'server\.env already exists; leaving it as it is.'
} else {
    $settings = Get-Content (Join-Path $server_folder '.env.example')
    $settings = $settings -replace '^PORT=.*', "PORT=$PORT"
    $settings = $settings -replace '^DATABASE_PATH=.*', "DATABASE_PATH=$DATA_FOLDER/studyapp.db"
    $settings = $settings -replace '^UPLOADS_PATH=.*', "UPLOADS_PATH=$DATA_FOLDER/uploads"
    # WriteAllLines saves without a byte order mark, which Node's .env reader needs.
    [System.IO.File]::WriteAllLines($env_path, [string[]]$settings)
    Write-Host "Created server\.env (port $PORT, data in $DATA_FOLDER). Add AI keys there if you want real AI."
}

Write-Step 'Windows service'
if (-not (Test-Path $service_exe)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $WINSW_URL -OutFile $service_exe -UseBasicParsing
    Write-Host 'Downloaded WinSW.'
}
$service = Get-Service -Name $SERVICE_ID -ErrorAction SilentlyContinue
if ($service -and $service.Status -ne 'Stopped') {
    Invoke-Checked 'Stopping the service' { & $service_exe stop }
}

$port_owner = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($port_owner) {
    $process_name = (Get-Process -Id $port_owner.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    throw "Port $PORT is already used by '$process_name' (process $($port_owner.OwningProcess)). If it's IIS, stop it with: Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled"
}

if (-not $service) {
    Invoke-Checked 'Installing the service' { & $service_exe install }
}
Invoke-Checked 'Starting the service' { & $service_exe start }

Write-Step 'Windows Firewall'
if (Get-NetFirewallRule -DisplayName 'StudyApp HTTP' -ErrorAction SilentlyContinue) {
    Write-Host 'Rule already exists.'
} else {
    New-NetFirewallRule -DisplayName 'StudyApp HTTP' -Direction Inbound -Protocol TCP -LocalPort $PORT -Action Allow | Out-Null
    Write-Host "Allowed inbound TCP $PORT."
}

Write-Step 'Checking it responds'
$health = $null
foreach ($attempt in 1..15) {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$PORT/api/health" -UseBasicParsing
        break
    } catch {}
}
if ($health.status -ne 'ok') {
    throw "The service didn't answer on port $PORT. See the logs in $(Join-Path $PSScriptRoot 'logs')"
}

Write-Host "`nStudyApp is running on port $PORT." -ForegroundColor Green
Write-Host 'Last step, once: in the Azure portal, open the VM > Networking and add an inbound port rule for HTTP (TCP 80).'
