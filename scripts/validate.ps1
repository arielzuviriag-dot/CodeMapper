[CmdletBinding()]
param(
    # Filtro opcional para tests E2E de Playwright (regex sobre nombre de archivo).
    # Ej: -TestFilter '01-' o -TestFilter 'subtipos.spec'
    [string]$TestFilter = '',
    # Si se setea, salta `pnpm test` (vitest) — útil cuando un punto solo tiene E2E.
    [switch]$SkipUnit,
    # Si se setea, salta `mvn -q test` — útil cuando todo el punto es frontend.
    [switch]$SkipBackendTest
)

$ErrorActionPreference = 'Stop'

$root        = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir  = Join-Path $root 'codemapper-backend'
$frontendDir = Join-Path $root 'codemapper-frontend'
$reservaDir  = 'C:/Users/ariel/Reserva/backend-reserva'

function Stop-PortListeners {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            try {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    } catch {}
}

function Wait-Port {
    param([int]$Port, [int]$TimeoutSec = 120)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $ok  = $iar.AsyncWaitHandle.WaitOne(1500)
            if ($ok -and $client.Connected) {
                $client.Close()
                return $true
            }
        } catch {} finally {
            if ($client) { try { $client.Close() } catch {} }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

Write-Host "[validate] killing :8090 / :3000 listeners..."
Stop-PortListeners 8090
Stop-PortListeners 3000

# ─── Reserva sanity ─────────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $reservaDir)) {
    Write-Host "[validate] ERROR: Reserva no existe en $reservaDir" -ForegroundColor Red
    exit 1
}
$reservaJavaCount = (Get-ChildItem -LiteralPath $reservaDir -Filter '*.java' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
if ($reservaJavaCount -le 10) {
    Write-Host "[validate] ERROR: Reserva tiene $reservaJavaCount .java (esperado >10)" -ForegroundColor Red
    exit 1
}
Write-Host "[validate] Reserva OK: $reservaJavaCount .java"

$backendProc  = $null
$frontendProc = $null
$exitCode     = 0

try {
    # ─── Backend ─────────────────────────────────────────────────────────────
    Write-Host "[validate] starting backend (mvn spring-boot:run)..."
    $mvnCmd = Join-Path $backendDir 'mvnw.cmd'
    if (-not (Test-Path -LiteralPath $mvnCmd)) {
        throw "mvnw.cmd no encontrado en $backendDir"
    }
    $backendProc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "`"$mvnCmd`" -q spring-boot:run" `
        -WorkingDirectory $backendDir `
        -WindowStyle Hidden `
        -PassThru
    if (-not (Wait-Port -Port 8090 -TimeoutSec 180)) {
        throw "Backend no levantó en 180s (puerto 8090 cerrado)"
    }
    Write-Host "[validate] backend up :8090 (pid $($backendProc.Id))"

    # ─── Frontend ────────────────────────────────────────────────────────────
    Write-Host "[validate] starting frontend (pnpm dev)..."
    $frontendProc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'pnpm dev' `
        -WorkingDirectory $frontendDir `
        -WindowStyle Hidden `
        -PassThru
    if (-not (Wait-Port -Port 3000 -TimeoutSec 180)) {
        throw "Frontend no levantó en 180s (puerto 3000 cerrado)"
    }
    Write-Host "[validate] frontend up :3000 (pid $($frontendProc.Id))"

    # ─── Backend tests ───────────────────────────────────────────────────────
    if (-not $SkipBackendTest) {
        Write-Host "[validate] mvn -q test..."
        Push-Location $backendDir
        try {
            & cmd.exe /c "`"$mvnCmd`" -q test"
            if ($LASTEXITCODE -ne 0) { throw "mvn -q test falló (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
    } else {
        Write-Host "[validate] skipping mvn test (-SkipBackendTest)"
    }

    # ─── Frontend unit tests (vitest) ────────────────────────────────────────
    if (-not $SkipUnit) {
        Write-Host "[validate] pnpm test (vitest)..."
        Push-Location $frontendDir
        try {
            & cmd.exe /c 'pnpm test'
            if ($LASTEXITCODE -ne 0) { throw "pnpm test falló (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
    } else {
        Write-Host "[validate] skipping pnpm test (-SkipUnit)"
    }

    # ─── Frontend E2E (playwright) ───────────────────────────────────────────
    Write-Host "[validate] pnpm test:e2e (filter='$TestFilter')..."
    Push-Location $frontendDir
    try {
        if ([string]::IsNullOrWhiteSpace($TestFilter)) {
            & cmd.exe /c 'pnpm test:e2e'
        } else {
            & cmd.exe /c "pnpm test:e2e -- -g `"$TestFilter`""
        }
        if ($LASTEXITCODE -ne 0) { throw "pnpm test:e2e falló (exit $LASTEXITCODE)" }
    } finally { Pop-Location }

    Write-Host "[validate] ALL GREEN" -ForegroundColor Green
}
catch {
    Write-Host "[validate] FAILED: $_" -ForegroundColor Red
    $exitCode = 1
}
finally {
    Write-Host "[validate] cleanup..."
    if ($frontendProc) {
        try { Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    if ($backendProc) {
        try { Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Stop-PortListeners 8090
    Stop-PortListeners 3000
}

exit $exitCode
