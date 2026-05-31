# Llevar "Escuchando" a cualquier app Java (ej. en tu trabajo)

Objetivo: que cuando arranques **tu** app Java (ej. la plataforma posnet) desde
VSCode, puedas ver en CodeMapper, en vivo, las clases Java que va llamando.

Son 3 piezas. Una sola vez configurás, después es automático.

---

## 1. Tener CodeMapper escuchando
En la máquina donde quieras ver el mapa, corré el backend de CodeMapper (el que
recibe las trazas) y el frontend. El backend escucha en el puerto **8090**.

Si tu app posnet corre en **otra** máquina/servidor, anotá la IP de la máquina
de CodeMapper (ej. `http://192.168.1.50:8090`); la vas a usar abajo.

## 2. Tener el agente
Copiá el archivo `opentelemetry-javaagent.jar` a tu máquina del trabajo (es el
mismo que ya está en esta carpeta). Anotá su ruta, ej:
`C:\agentes\opentelemetry-javaagent.jar`

## 3. Que VSCode arranque posnet CON el agente

La forma **más universal** (no importa cómo la levantes): seteá la variable de
entorno `JAVA_TOOL_OPTIONS` antes de abrir VSCode. Cualquier app Java que
arranque va a tomar el agente sola.

### Opción A — variable de entorno (la más simple, sirve para todo)
En una terminal PowerShell, y desde ahí abrí VSCode (`code .`):

```powershell
$env:JAVA_TOOL_OPTIONS = "-javaagent:C:\agentes\opentelemetry-javaagent.jar " +
  "-Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none " +
  "-Dotel.exporter.otlp.protocol=http/protobuf " +
  "-Dotel.exporter.otlp.endpoint=http://localhost:8090 " +
  "-Dotel.service.name=posnet " +
  "-Dotel.instrumentation.methods.include=com.tuempresa.posnet.SomeController[metodo];com.tuempresa.posnet.SomeService[metodo]"
code .
```
(Cambiá la ruta del agente, el `endpoint` si CodeMapper está en otra máquina, y
el `methods.include` por tus clases — ver más abajo.)

### Opción B — en el `launch.json` de VSCode (si usás run configs)
En `.vscode/launch.json`, en tu configuración de tipo `java`, agregá `vmArgs`:

```json
{
  "type": "java",
  "name": "posnet",
  "request": "launch",
  "mainClass": "com.tuempresa.posnet.Application",
  "vmArgs": "-javaagent:C:/agentes/opentelemetry-javaagent.jar -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none -Dotel.exporter.otlp.protocol=http/protobuf -Dotel.exporter.otlp.endpoint=http://localhost:8090 -Dotel.service.name=posnet -Dotel.instrumentation.methods.include=com.tuempresa.posnet.SomeController[metodo]"
}
```

### Opción C — si la levantás con Maven (`mvn spring-boot:run`)
```
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-javaagent:C:/agentes/opentelemetry-javaagent.jar -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none -Dotel.exporter.otlp.protocol=http/protobuf -Dotel.exporter.otlp.endpoint=http://localhost:8090 -Dotel.instrumentation.methods.include=com.tuempresa.posnet.SomeService[metodo]"
```

### Opción D — si corre en JBoss / WildFly
El agente se agrega al arranque del servidor, no a una app puntual. Editá
`bin/standalone.conf.bat` (Windows) o `bin/standalone.conf` (Linux) y sumá al
final, dentro de `JAVA_OPTS`:

```bat
rem  standalone.conf.bat (Windows)
set "JAVA_OPTS=%JAVA_OPTS% -javaagent:C:\agentes\opentelemetry-javaagent.jar"
set "JAVA_OPTS=%JAVA_OPTS% -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none"
set "JAVA_OPTS=%JAVA_OPTS% -Dotel.exporter.otlp.protocol=http/protobuf"
set "JAVA_OPTS=%JAVA_OPTS% -Dotel.exporter.otlp.endpoint=http://localhost:8090"
set "JAVA_OPTS=%JAVA_OPTS% -Dotel.service.name=posnet"
set "JAVA_OPTS=%JAVA_OPTS% -Dotel.instrumentation.methods.include=com.tuempresa.posnet.SomeService[metodo]"
```
```bash
#  standalone.conf (Linux)
JAVA_OPTS="$JAVA_OPTS -javaagent:/opt/agentes/opentelemetry-javaagent.jar \
  -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -Dotel.exporter.otlp.endpoint=http://localhost:8090 \
  -Dotel.service.name=posnet \
  -Dotel.instrumentation.methods.include=com.tuempresa.posnet.SomeService[metodo]"
```
Reiniciás JBoss y todas las apps desplegadas quedan instrumentadas. (Si lo
levantás desde VSCode, igual sirve la **Opción A** con `JAVA_TOOL_OPTIONS` — el
JVM la toma sin tocar JBoss.)

---

## Ver TUS clases (no solo los saltos de framework)
Por defecto el agente muestra los bordes (peticiones HTTP, base de datos). Para
ver tus métodos internos, decile cuáles con `methods.include`:

```
-Dotel.instrumentation.methods.include=paquete.Clase[metodo1,metodo2];otra.Clase[metodo]
```
Formato: `paquete.Clase[m1,m2]` separando clases con `;`.

**Alternativa sin listar uno por uno:** anotá los métodos que te interesan con
`@WithSpan` (agregando la dependencia
`io.opentelemetry.instrumentation:opentelemetry-instrumentation-annotations`).
Cada método anotado aparece solo.

---

## Usarlo
1. Arrancá posnet desde VSCode (ya con el agente, por A/B/C).
2. Abrí CodeMapper → `/escuchar` → **Iniciar**.
3. Poné la URL de posnet (ej. `http://localhost:8080/`) y **Escuchar**
   (o dejalo vacío para escuchar todo).
4. Usá posnet (pegale a un endpoint, navegá) → en CodeMapper se van dibujando
   las clases Java que llama, en orden.

> Nota: el agente y CodeMapper se hablan por red. Si están en la misma máquina,
> `localhost:8090`. Si posnet corre en un server, poné la IP de la máquina de
> CodeMapper en `otel.exporter.otlp.endpoint`.
