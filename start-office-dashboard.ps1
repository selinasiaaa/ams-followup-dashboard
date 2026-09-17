param(
    [string]$ServerIp = ""
)

$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot
$backendDir = Join-Path $projectDir "sql-bi-server"
$logDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Stop-ListenerOnPort {
    param([int]$Port)

    $processIds = netstat -ano -p tcp |
        Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$" |
        ForEach-Object { [int]$_.Matches[0].Groups[1].Value } |
        Sort-Object -Unique

    foreach ($processId in $processIds) {
        Write-Host "Stopping the existing process on port $Port (PID $processId)..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction Stop
    }
}

# Restart only the two ports owned by this dashboard workflow. This prevents an
# old localhost-only Vite or Uvicorn process from blocking the LAN services.
Stop-ListenerOnPort -Port 8010
Stop-ListenerOnPort -Port 5174
Start-Sleep -Milliseconds 750

if (-not $ServerIp) {
    $socket = [System.Net.Sockets.UdpClient]::new()
    try {
        $socket.Connect("8.8.8.8", 65530)
        $ServerIp = ([System.Net.IPEndPoint]$socket.Client.LocalEndPoint).Address.ToString()
    }
    finally {
        $socket.Dispose()
    }
}

if ($ServerIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw "Could not determine the server PC IPv4 address. Run: .\start-office-dashboard.ps1 -ServerIp 192.168.x.x"
}

$pythonCandidates = @(
    "C:\Users\amsof\Documents\Codex\Python313Embed\python.exe",
    (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$pythonExe = $pythonCandidates | Select-Object -First 1
if (-not $pythonExe) {
    throw "Python was not found. Install Python or update the Python path in this script."
}

$nodeExe = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $nodeExe) {
    throw "Node.js was not found. Install Node.js before starting the React website."
}

$viteScript = Join-Path $projectDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $viteScript)) {
    throw "Vite dependencies are missing. Run npm install in the project folder first."
}

$previousApiUrl = $env:VITE_SQL_BI_API_URL
$previousOrigins = $env:AMS_SQL_BI_ALLOWED_ORIGINS
$env:VITE_SQL_BI_API_URL = "http://${ServerIp}:8010"
$env:AMS_SQL_BI_ALLOWED_ORIGINS = "http://${ServerIp}:5174,http://127.0.0.1:5174,http://localhost:5174"

$backendOut = Join-Path $logDir "sql-bi-backend.out.log"
$backendErr = Join-Path $logDir "sql-bi-backend.err.log"
$frontendOut = Join-Path $logDir "dashboard-frontend.out.log"
$frontendErr = Join-Path $logDir "dashboard-frontend.err.log"

try {
    $backend = Start-Process -FilePath $pythonExe `
        -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8010' `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput $backendOut `
        -RedirectStandardError $backendErr `
        -WindowStyle Hidden `
        -PassThru

    $frontend = Start-Process -FilePath $nodeExe `
        -ArgumentList 'node_modules\vite\bin\vite.js','--host','0.0.0.0','--port','5174' `
        -WorkingDirectory $projectDir `
        -RedirectStandardOutput $frontendOut `
        -RedirectStandardError $frontendErr `
        -WindowStyle Hidden `
        -PassThru

    Start-Sleep -Seconds 3
    if ($backend.HasExited) {
        throw "SQL BI backend could not start. Check $backendErr. Port 8010 may already be in use."
    }
    if ($frontend.HasExited) {
        throw "Website could not start. Check $frontendErr. Port 5174 may already be in use."
    }

    Write-Host ""
    Write-Host "AMS dashboard is running." -ForegroundColor Green
    Write-Host "On this PC:    http://127.0.0.1:5174"
    Write-Host "On other PCs:  http://${ServerIp}:5174" -ForegroundColor Cyan
    Write-Host "SQL BI API:    http://${ServerIp}:8010"
    Write-Host ""
    Write-Host "Keep this window open. Press Ctrl+C to stop both services."

    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 2
    }
    if ($backend.HasExited) { Write-Warning "SQL BI backend stopped. Check $backendErr" }
    if ($frontend.HasExited) { Write-Warning "Website stopped. Check $frontendErr" }
}
finally {
    if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
    if ($frontend -and -not $frontend.HasExited) { Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue }
    $env:VITE_SQL_BI_API_URL = $previousApiUrl
    $env:AMS_SQL_BI_ALLOWED_ORIGINS = $previousOrigins
}
