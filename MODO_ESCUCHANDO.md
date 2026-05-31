# Modo "Escuchando" — recorrido de ejecución en vivo

El modo **Escuchando** muestra, en tiempo real y con la estética del modo Foco,
qué clases de una app Java externa se van llamando mientras la app corre. No
analiza código estático: recibe los *spans* que emite el **agente de
OpenTelemetry** y dibuja el árbol de llamadas a medida que ocurre.

```
App Java + javaagent OTel  ──OTLP/HTTP JSON──▶  CodeMapper backend (:8090)
                                                /v1/traces  (ingesta)
                                                     │  fan-out SSE
                                                     ▼
                                  CodeMapper frontend  /escuchar  (:3000)
```

## 1. Arrancá CodeMapper

- **Backend** (puerto **8090**):
  ```bash
  cd codemapper-backend
  ./mvnw spring-boot:run
  ```
- **Frontend** (puerto 3000):
  ```bash
  cd codemapper-frontend
  pnpm dev   # o npm run dev
  ```
- Abrí el frontend, entrá a la pestaña **Escuchando** → **Abrir modo
  Escuchando** (ruta `/escuchar`) y apretá **Iniciar**. Quedás escuchando.

> El puerto del backend de CodeMapper es **8090**. Tu app de prueba corre en
> **otro** puerto (el que use, p. ej. 8080) — son procesos distintos.

## Demo rápida (sin tu propia app)

El repo trae una app de demo ya instrumentada en `demo-app/` (Java puro, sin
frameworks). Con el backend de CodeMapper corriendo:

```powershell
cd demo-app
.\correr-demo.ps1
```

Después: abrí `http://localhost:3000/escuchar` → **Iniciar** → en la barra URL de
abajo pegale a `http://localhost:8085/login` (camino OK) y a
`http://localhost:8085/checkout` (lanza una excepción → nodo rojo con stacktrace).
Vas a ver el recorrido `LoginController → AuthService → UserRepository/TokenService`
y el de checkout `OrderController → OrderService → PaymentGateway` armarse en vivo.

## 2. Conseguí el agente de OpenTelemetry (para tu propia app)

Descargá el JAR del agente (una sola vez):

```bash
curl -L -o opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar
```

## 3. Arrancá tu app de prueba apuntando a CodeMapper

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=none \
  -Dotel.logs.exporter=none \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -Dotel.exporter.otlp.endpoint=http://localhost:8090 \
  -Dotel.service.name=mi-app-de-prueba \
  -jar la-app-de-prueba.jar
```

Detalles que importan:

- **`protocol=http/protobuf`** — el agente Java de OpenTelemetry **solo** exporta
  OTLP en `grpc` o `http/protobuf` (NO soporta `http/json`). CodeMapper acepta
  el protobuf en `/v1/traces` y lo parsea. (También acepta OTLP/JSON para
  herramientas que lo manden, pero ningún agente Java manda JSON.)
- **`endpoint=http://localhost:8090`** — es la URL *base*. El agente le agrega
  `/v1/traces` solo. (Si en cambio usás
  `-Dotel.exporter.otlp.traces.endpoint=...`, ahí SÍ tenés que poner la ruta
  completa `http://localhost:8090/v1/traces`.)
- `metrics`/`logs` en `none` para no mandar ruido que CodeMapper ignora igual.

Ahora pegale a un endpoint de tu app (`curl http://localhost:8080/...` o desde
el navegador). En `/escuchar` vas a ver aparecer en el centro la clase de
entrada y, hacia afuera en anillos, las clases que se van llamando.

## 4. Ver **método por método** (no solo saltos de framework)

Por defecto el agente instrumenta **frameworks** (Spring MVC, JDBC, clientes
HTTP…), así que vas a ver los saltos grandes pero **no** tus métodos internos.
Para que aparezcan los atributos `code.namespace` / `code.function` que
CodeMapper usa como clase + método, tenés **dos** opciones:

### Opción A — instrumentar métodos por configuración (sin tocar código)

```bash
  -Dotel.instrumentation.methods.include=\
com.miapp.UserService[validateLogin,findById];com.miapp.OrderService[place]
```

Formato: `paquete.Clase[metodo1,metodo2];otra.Clase[metodo]`. Verboso, pero no
requiere recompilar.

### Opción B — anotaciones `@WithSpan` (recomendado para demos)

Agregá la dependencia:

```xml
<dependency>
  <groupId>io.opentelemetry.instrumentation</groupId>
  <artifactId>opentelemetry-instrumentation-annotations</artifactId>
  <version>2.x</version>
</dependency>
```

y anotá los métodos que quieras ver:

```java
import io.opentelemetry.instrumentation.annotations.WithSpan;

@WithSpan
public boolean validateLogin(String user, String pass) { ... }
```

Cada método anotado genera un span con `code.namespace` = la clase y
`code.function` = el método, y CodeMapper lo dibuja como pill dentro del nodo de
esa clase.

## 5. Errores

Si en la ejecución se lanza una excepción, el span llega con `status=ERROR`
(o con un evento `exception`). El nodo de esa clase se pinta de **rojo** y, al
hacerle click, se abre un panel lateral con `type`, `message` y el `stacktrace`
completo. Ese es el punto donde el recorrido se rompió.

## Notas técnicas / seguridad

- `/v1/traces` es un POST **abierto** que reenvía lo recibido a cualquier
  pestaña conectada a `/api/trace/stream`. Es una herramienta de **desarrollo
  local**: dejala escuchando en `localhost`, no la expongas a internet.
- El stream SSE es de tipo *broadcast* y largo: manda un heartbeat cada 15s para
  no morir en idle. Podés tener varias pestañas escuchando a la vez.
- El stacktrace se renderiza como **texto plano** (React lo escapa) — nunca como
  HTML.
- CodeMapper deduplica nodos por clase y agrupa los spans en ventanas de 100ms
  antes de redibujar, así un pico de spans no traba la UI.
