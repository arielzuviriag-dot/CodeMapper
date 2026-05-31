# ============================================================
#  Demo del modo "Escuchando" SIN una app Java real.
#
#  Simula una ejecución mandando spans OTLP al backend de
#  CodeMapper, igual que lo haría el agente de OpenTelemetry.
#  Sirve para VER el modo Escuchando funcionando sin instrumentar
#  ninguna app.
#
#  CÓMO USARLO:
#   1. Tené el backend corriendo en http://localhost:8090
#   2. Abrí en el navegador  http://localhost:3000/escuchar
#   3. Apretá el botón "Iniciar"
#   4. Ejecutá este script:   .\enviar-traza-demo.ps1
#   5. Mirá cómo aparecen las clases una por una en la web.
# ============================================================

$endpoint = "http://localhost:8090/v1/traces"

function Send-Batch($spans) {
    $body = @{ resourceSpans = @(@{ scopeSpans = @(@{ spans = $spans }) }) } | ConvertTo-Json -Depth 12
    try {
        Invoke-RestMethod -Uri $endpoint -Method Post -ContentType "application/json" -Body $body | Out-Null
        Write-Host "  -> enviado ($($spans.Count) span/s)" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: no pude contactar $endpoint. Esta el backend corriendo?" -ForegroundColor Red
        exit 1
    }
}

function Attr($k, $v) { @{ key = $k; value = @{ stringValue = $v } } }
function CodeAttrs($fqcn, $fn) { @( (Attr "code.namespace" $fqcn), (Attr "code.function" $fn) ) }

Write-Host "Enviando una ejecucion simulada a $endpoint ..." -ForegroundColor Cyan
Write-Host "(Asegurate de haber apretado 'Iniciar' en http://localhost:3000/escuchar)" -ForegroundColor Yellow
Start-Sleep -Seconds 1

# 1) Clase de entrada (raiz: sin parentSpanId)
Send-Batch @(@{
    traceId = "demo1"; spanId = "1"; name = "UserController.login"
    startTimeUnixNano = "1000000000"; endTimeUnixNano = "1025000000"
    status = @{ code = 1 }
    attributes = (CodeAttrs "com.app.web.UserController" "login")
})
Start-Sleep -Seconds 1

# 2) Un salto de framework SIN clase (se "puentea": no genera nodo) + el service
Send-Batch @(
    @{ traceId = "demo1"; spanId = "2"; parentSpanId = "1"; name = "GET /db"; attributes = @() },
    @{ traceId = "demo1"; spanId = "3"; parentSpanId = "2"; name = "UserService.validate"
       startTimeUnixNano = "1002000000"; endTimeUnixNano = "1018000000"; status = @{ code = 1 }
       attributes = (CodeAttrs "com.app.svc.UserService" "validate") }
)
Start-Sleep -Seconds 1

# 3) El service llama a una cache (OK)
Send-Batch @(@{
    traceId = "demo1"; spanId = "4"; parentSpanId = "3"; name = "CacheClient.get"
    startTimeUnixNano = "1003000000"; endTimeUnixNano = "1003500000"; status = @{ code = 1 }
    attributes = (CodeAttrs "com.app.infra.CacheClient" "get")
})
Start-Sleep -Seconds 1

# 4) ...y a un repositorio que LANZA una excepcion (nodo rojo + stacktrace)
Send-Batch @(@{
    traceId = "demo1"; spanId = "5"; parentSpanId = "3"; name = "UserRepository.findByEmail"
    startTimeUnixNano = "1004000000"; endTimeUnixNano = "1005000000"
    status = @{ code = "STATUS_CODE_ERROR" }
    attributes = (CodeAttrs "com.app.repo.UserRepository" "findByEmail")
    events = @(@{
        name = "exception"
        attributes = @(
            (Attr "exception.type" "java.lang.NullPointerException"),
            (Attr "exception.message" "email was null in findByEmail"),
            (Attr "exception.stacktrace" "java.lang.NullPointerException`n`tat com.app.repo.UserRepository.findByEmail(UserRepository.java:42)`n`tat com.app.svc.UserService.validate(UserService.java:21)")
        )
    })
})

Write-Host ""
Write-Host "Listo. En la web deberias ver: UserController (entrada) -> UserService -> CacheClient y UserRepository (en rojo)." -ForegroundColor Cyan
Write-Host "Clickea el nodo rojo 'UserRepository' para ver el stacktrace." -ForegroundColor Cyan
