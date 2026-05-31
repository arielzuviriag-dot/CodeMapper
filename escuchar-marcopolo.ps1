# ============================================================
#  Genera una URL para "escuchar" a CodeMapper ejecutando Marco Polo.
#
#  Requiere la 2da instancia del backend (instrumentada) corriendo en :8091.
#  Para arrancarla (una sola vez), desde codemapper-backend:
#
#    $env:INC = "com.codemapper.controller.AnalyzeController[analyzeFocus,stream];com.codemapper.service.AnalysisService[handleFocus,openStream,expandPeripheral,computeImpact];com.codemapper.service.FocusTracerService[traceFocus];com.codemapper.service.JavaParserService[parseProject];com.codemapper.parser.ConnectionResolver[resolve];com.codemapper.service.SessionService[createSession,getSession]"
#    java "-javaagent:..\opentelemetry-javaagent.jar" `
#      "-Dotel.service.name=codemapper-marcopolo" `
#      "-Dotel.traces.exporter=otlp" "-Dotel.metrics.exporter=none" "-Dotel.logs.exporter=none" `
#      "-Dotel.exporter.otlp.protocol=http/protobuf" `
#      "-Dotel.exporter.otlp.endpoint=http://localhost:8090" `
#      "-Dotel.bsp.schedule.delay=500" `
#      "-Dotel.instrumentation.spring-scheduling.enabled=false" `
#      "-Dotel.instrumentation.methods.include=$env:INC" `
#      -jar target\codemapper-backend-0.0.1-SNAPSHOT.jar --server.port=8091
#
#  Después corré ESTE script para obtener la URL a pegar en Escuchando.
# ============================================================

param(
  [string]$focusFile = "src/main/java/com/codemapper/service/AnalysisService.java"
)

$body = @{
  projectPath = "C:/Users/ariel/CodeMapper/codemapper-backend"
  focusFile   = $focusFile
  demoMode    = "pro"
} | ConvertTo-Json

try {
    $resp = Invoke-RestMethod -Uri "http://localhost:8091/api/analyze/focus" -Method Post `
        -ContentType "application/json" -Body $body
} catch {
    Write-Host "No pude contactar la instancia instrumentada en :8091." -ForegroundColor Red
    Write-Host "Arrancala primero (ver el comentario arriba de este script)." -ForegroundColor Yellow
    exit 1
}

$url = "http://localhost:8091/api/analyze/stream/$($resp.sessionId)"
Write-Host ""
Write-Host "  Pegá esta URL en http://localhost:3000/escuchar (despues de Iniciar):" -ForegroundColor Cyan
Write-Host "  $url" -ForegroundColor Green
Write-Host ""
Write-Host "  Vas a ver: AnalyzeController -> AnalysisService -> SessionService + FocusTracerService" -ForegroundColor DarkGray
