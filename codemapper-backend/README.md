# CodeMapper Backend

Spring Boot service that parses Java projects and exposes their structure (classes, fields, methods, connections) as Server-Sent Events. Used as the parsing engine behind the CodeMapper visual frontend.

## Requisitos
- Java 17
- Maven 3.8+
- (Opcional) Git instalado en el sistema si se usan repos `https://...` privados — los públicos ya andan vía JGit embebido.

## Cómo correr

```bash
mvn spring-boot:run
```

La app levanta en **http://localhost:8090**.

CORS habilitado para `http://localhost:3000` (frontend Next.js).

## Endpoints

Todos viven bajo `/api/analyze`.

### 1) `POST /api/analyze/upload`
Sube un `.java` suelto o un `.zip` de proyecto Maven.

```bash
curl -X POST http://localhost:8090/api/analyze/upload \
  -F "file=@./mi-proyecto.zip"
```

Respuesta:
```json
{ "sessionId": "...", "projectName": "...", "totalFiles": 42 }
```

### 2) `POST /api/analyze/path` *(solo desarrollo local)*
Analiza una carpeta del filesystem sin copiar archivos.

```bash
curl -X POST http://localhost:8090/api/analyze/path \
  -H "Content-Type: application/json" \
  -d "{\"absolutePath\":\"C:\\\\Users\\\\ariel\\\\Reserva\\\\backend-reserva\"}"
```

### 3) `POST /api/analyze/github`
Clona un repo público con JGit y lo analiza.

```bash
curl -X POST http://localhost:8090/api/analyze/github \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"https://github.com/spring-projects/spring-petclinic.git\"}"
```

### 4) `GET /api/analyze/stream/{sessionId}`
Stream SSE con el progreso del parseo. Eventos emitidos:

| event              | payload                                                                     |
|--------------------|------------------------------------------------------------------------------|
| `session_start`    | `{ totalFiles, projectName, startTime }`                                     |
| `package_found`    | `{ packageName }`                                                            |
| `class_found`      | `{ id, name, fullyQualifiedName, packageName, type, annotations[], filePath, lineCount, modifiers[] }` |
| `fields_parsed`    | `{ classId, fields[] }`                                                      |
| `methods_parsed`   | `{ classId, methods[] }`                                                     |
| `connection_found` | `{ from, to, type, label }`                                                  |
| `session_complete` | `{ totalClasses, totalConnections, durationMs }`                             |
| `error`            | `{ message, classId, filePath }`                                             |

```bash
curl -N -H "Accept: text/event-stream" http://localhost:8090/api/analyze/stream/<sessionId>
```

### 5) `GET /api/analyze/source/{sessionId}/{classId}`
Devuelve el código fuente completo de una clase ya parseada.

```bash
curl http://localhost:8090/api/analyze/source/<sessionId>/<classId>
```

### 6) `DELETE /api/analyze/session/{sessionId}`
Limpia archivos temporales (si la sesión los posee) y borra la sesión en memoria.

```bash
curl -X DELETE http://localhost:8090/api/analyze/session/<sessionId>
```

## Tipos de conexión detectados
- `EXTENDS`
- `IMPLEMENTS`
- `COMPOSITION` (campos cuyo tipo es una clase del proyecto)
- `DEPENDENCY_INJECTION` (campos `@Autowired` / `@Inject` / `@Resource`, o constructores en clases `@Service`/`@Component`/`@RestController`/`@Repository`/`@Controller`)
- `METHOD_CALL` *(reservado para v2)*
- `ANNOTATION_USAGE` *(reservado)*

## Configuración

`src/main/resources/application.yml`:

```yaml
server.port: 8090
codemapper:
  upload-dir: ./tmp-uploads
  session-timeout-minutes: 120
  cleanup-interval-minutes: 30
spring.servlet.multipart:
  max-file-size: 100MB
  max-request-size: 100MB
```

## Prueba contra `backend-reserva`

```bash
# 1) Crear sesión apuntando al backend de Reserva
curl -X POST http://localhost:8090/api/analyze/path \
  -H "Content-Type: application/json" \
  -d "{\"absolutePath\":\"C:\\\\Users\\\\ariel\\\\Reserva\\\\backend-reserva\"}"

# 2) Suscribirse al stream con el sessionId que devolvió el paso anterior
curl -N -H "Accept: text/event-stream" \
  http://localhost:8090/api/analyze/stream/<sessionId>
```
