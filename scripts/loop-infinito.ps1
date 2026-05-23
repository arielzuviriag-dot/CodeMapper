[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 5)]
    [int]$Point,

    # Override del filtro automático (regex pasado a Playwright -g).
    # Por defecto se usa "0$Point-" para matchear "01-*.spec.ts" etc.
    [string]$Filter = ''
)

$ErrorActionPreference = 'Continue'

$root        = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validate    = Join-Path $PSScriptRoot 'validate.ps1'
$progresoMd  = Join-Path $root 'PROGRESO.md'

if (-not (Test-Path -LiteralPath $validate)) {
    Write-Host "loop-infinito: no se encuentra $validate" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Filter)) {
    # Convención: punto N → tests cuyo archivo empieza con "0N-".
    $Filter = ('0{0}-' -f $Point)
}

function Append-Progreso {
    param([string]$Line)
    Add-Content -LiteralPath $progresoMd -Value $Line -Encoding utf8
}

$iter = 0
while ($true) {
    $iter++
    $ts = Get-Date -Format 'HH:mm:ss'
    Append-Progreso "[$ts] Iter $iter punto $Point (filter='$Filter')"
    Write-Host "[loop] iter $iter punto $Point filter='$Filter'"

    # Capturamos stderr+stdout en una sola tubería para grabar el motivo de falla.
    $logFile = Join-Path $env:TEMP ("loop-p{0}-i{1}.log" -f $Point, $iter)
    $psHost = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { 'pwsh.exe' } else { 'powershell.exe' }
    $proc = Start-Process -FilePath $psHost `
        -ArgumentList '-NoProfile', '-NonInteractive', '-File', $validate, '-TestFilter', $Filter `
        -WorkingDirectory $root `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError ($logFile + '.err')
    $proc.WaitForExit()
    $code = $proc.ExitCode

    if ($code -eq 0) {
        Append-Progreso "[$ts] Punto $Point VERDE en iter $iter"
        Write-Host "[loop] Punto $Point VERDE en iter $iter" -ForegroundColor Green
        break
    }

    $tail = ''
    if (Test-Path -LiteralPath $logFile) {
        $tail = (Get-Content -LiteralPath $logFile -Tail 20 -ErrorAction SilentlyContinue) -join ' | '
    }
    Append-Progreso "[$ts] Falló iter $iter (exit $code): $tail"
    Write-Host "[loop] iter $iter falló (exit $code) — reintentando..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
