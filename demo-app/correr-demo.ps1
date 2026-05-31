# ============================================================
#  Arranca la app de demo instrumentada con el agente de OpenTelemetry,
#  apuntando las trazas a CodeMapper (http://localhost:8090).
#
#  Es una app Java de verdad (no simulada): cada vez que le pegás a un
#  endpoint, el agente manda las trazas reales a CodeMapper y el modo
#  "Escuchando" dibuja el recorrido en vivo.
#
#  USO:
#    1. Tené el backend de CodeMapper corriendo en :8090
#    2. Ejecutá:   .\correr-demo.ps1
#    3. Abrí http://localhost:3000/escuchar, apretá Iniciar
#    4. En la barra URL de esa pantalla, pegale a:
#         http://localhost:8085/login      (camino OK)
#         http://localhost:8085/checkout   (lanza excepcion -> nodo rojo)
# ============================================================

$ErrorActionPreference = "Stop"
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$agent = Join-Path $here "..\opentelemetry-javaagent.jar"
$port  = 8085

if (-not (Test-Path $agent)) {
    Write-Host "No encuentro el agente en $agent" -ForegroundColor Red
    Write-Host "Descargalo con:" -ForegroundColor Yellow
    Write-Host "  curl -L -o opentelemetry-javaagent.jar https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar"
    exit 1
}

# Métodos a instrumentar (clase[metodo;...]) — así el agente crea un span por
# cada método con code.namespace/code.function, que es lo que CodeMapper mapea
# a clase + pill de método.
$include = @(
  "com.demoapp.LoginController[login]",
  "com.demoapp.AuthService[authenticate]",
  "com.demoapp.UserRepository[findByEmail]",
  "com.demoapp.TokenService[issueToken]",
  "com.demoapp.OrderController[checkout]",
  "com.demoapp.OrderService[place]",
  "com.demoapp.PaymentGateway[charge]"
) -join ";"

Write-Host "Compilando demo..." -ForegroundColor Cyan
javac -d $here (Join-Path $here "DemoApp.java")

Write-Host "Arrancando demo instrumentada en http://localhost:$port" -ForegroundColor Green
Write-Host "(Ctrl+C para frenar)" -ForegroundColor DarkGray

java "-javaagent:$agent" `
  "-Dotel.service.name=demo-app" `
  "-Dotel.traces.exporter=otlp" `
  "-Dotel.metrics.exporter=none" `
  "-Dotel.logs.exporter=none" `
  "-Dotel.exporter.otlp.protocol=http/protobuf" `
  "-Dotel.exporter.otlp.endpoint=http://localhost:8090" `
  "-Dotel.bsp.schedule.delay=500" `
  "-Dotel.instrumentation.methods.include=$include" `
  -cp $here com.demoapp.DemoApp $port
