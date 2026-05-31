# Documento CodeMapper — Detalle Técnico y Funcional

> Documentación técnica y funcional completa de la aplicación **CodeMapper** (rebrand visual a **"MapperView" / "Marco Polo"**).
> Enfoque: **qué hace** y **cómo funciona**, a nivel funcional y técnico. (No se cubren aspectos de seguridad/vulnerabilidades por pedido explícito.)
> Fecha de elaboración: 2026-05-31.

---

## 1. ¿Qué es CodeMapper?

**CodeMapper** es un **visualizador interactivo de proyectos Java**. Parsea el código fuente con JavaParser (Symbol Solver) y dibuja, **en tiempo real y de forma progresiva (streaming SSE)**, un mapa navegable de clases y de sus conexiones.

La idea central es convertir el "camino mental" de comprensión de un sistema en **documentación visual viva**: ver de un vistazo cómo se relacionan las clases, qué llama a qué, qué impacto tendría un cambio, e incluso **escuchar** la ejecución real de la app y dibujar lo que pasa.

El producto está pensado para llevarse a una empresa con proyectos diversos (objetivo multi-framework). Hoy está dividido en tiers comerciales **FREE / PRO / DIAMANTE**; FREE y PRO son plenamente funcionales mediante un toggle de demo (`?demo=pro`), a la espera de autenticación y billing reales.

### Módulos / experiencias principales

| Módulo | Ruta | Qué hace |
|--------|------|----------|
| **Mapa general** | `/map/{sessionId}` | Grafo completo del proyecto (clases + conexiones), por capas. |
| **FOCO / Marco Polo** | `/map/{id}?mode=focus` | Análisis radial centrado en una clase y sus dependencias de nivel 1. |
| **Foco al Método** | `mode=focus-method` | Igual que FOCO pero centrado en un método: quién lo invoca / a quién invoca. |
| **Bitácora Marco Polo** | (panel flotante) | Registra el recorrido de navegación del dev como árbol visual. |
| **Escuchar (en vivo)** | `/escuchar` | Recibe trazas OpenTelemetry de la app corriendo y dibuja el call-graph en vivo como anillos concéntricos. |
| **IA.Grafo** | `/ia-grafo` | Chat con Claude que dibuja el impacto de un cambio pedido en lenguaje natural y genera diffs aplicables. |

---

## 2. Stack tecnológico

### Backend (`codemapper-backend/`)
| Componente | Tecnología |
|------------|------------|
| Lenguaje / runtime | Java 17 |
| Framework | Spring Boot 3.5.0 (Web + Validation) |
| Parsing | JavaParser 3.26.4 con **Symbol Solver** |
| Streaming | Server-Sent Events (SSE) vía `SseEmitter` |
| Clonado de repos | JGit 6.10 |
| Descompresión | Apache Commons Compress 1.27 |
| Generación de PDF | OpenPDF 1.3.34 (fork LGPL/MPL de iText) |
| Trazas | OTLP (OpenTelemetry) protobuf + JSON |
| Boilerplate | Lombok |
| Puerto | **8090** |

### Frontend (`codemapper-frontend/`)
| Componente | Tecnología |
|------------|------------|
| Framework | Next.js 15.1 + React 19 + TypeScript 5.7 |
| Estilos | Tailwind CSS v4 + shadcn/ui (Radix) |
| Grafos | React Flow / XYFlow 12 |
| Layout | Dagre |
| Estado | Zustand 5 (con `persist`) |
| Animación | Framer Motion 11 + animaciones CSS |
| Editor de código | Monaco Editor |
| Export imagen | html-to-image |
| HTTP | Axios (con interceptor de toasts) |
| Notificaciones | Sonner |
| IA | SDK de Anthropic (Claude) en API Routes de Next |
| Puerto | **3000** |

### Testing
- **JUnit** (Spring Boot Test) en backend.
- **Vitest** + Testing Library + jsdom para unit tests de frontend.
- **Playwright** para E2E (corre con navegador **visible**, `slowMo: 200`), validando contra un proyecto real (`backend-reserva`, read-only).

**Tamaño aproximado (sin tests):** Backend ~6.500 líneas de Java; Frontend ~13.850 líneas de TS/TSX (más lo agregado por IA.Grafo y Escuchar).

---

## 3. Arquitectura general

```
Usuario (browser)
   │  POST /api/analyze/{upload|path|github|focus|focus-method}
   ▼
AnalyzeController ──► AnalysisService ──► SessionService (crea sesión, devuelve sessionId)
   │
   │  GET /api/analyze/stream/{sessionId}  (SSE)
   ▼
AnalysisService.openStream() ──► según modo:
        FULL          → JavaParserService.parseProject()
        FOCUS         → FocusTracerService.traceFocus()
        FOCUS_METHOD  → FocusMethodTracerService.traceMethod()
   │
   ▼  emite eventos SSE uno por uno (con stagger)
Frontend (useSSE hook) ──► graphStore (Zustand) ──► React Flow render progresivo
```

**Flujo clave:** el `POST /analyze/*` solo **crea la sesión** y devuelve un `sessionId`; el análisis pesado ocurre de forma asíncrona en un `ExecutorService` y se transmite por SSE. El frontend navega **inmediatamente** al mapa con un `sessionId="pending"` y consume la promesa en vuelo, eliminando la pantalla en blanco entre el click y el streaming.

---

## 4. Backend — Funcionalidades

### 4.1. Puntos de entrada de análisis (`AnalyzeController`)
Todos aceptan `demoMode=pro` para bypassear límites FREE.

| Endpoint | Método | Qué hace |
|----------|--------|----------|
| `/api/analyze/upload` | POST (multipart) | Sube un `.java` suelto o un `.zip` con `pom.xml`. |
| `/api/analyze/path` | POST | **Solo dev local** — analiza una carpeta del disco por ruta absoluta. |
| `/api/analyze/github` | POST | Clona un repo con JGit y lo analiza. |
| `/api/analyze/focus` | POST | Modo **Marco Polo / FOCO**: análisis centrado en una clase. |
| `/api/analyze/focus-method` | POST | Modo **Foco al Método**: análisis centrado en un método. |
| `/api/analyze/focus/{id}/expand` | POST | **PRO** — expande una periférica a profundidad 2. |
| `/api/analyze/focus/{id}/impact` | GET | "Simular cambio" — impacto transitivo (BFS, depth 1–6). |
| `/api/analyze/stream/{id}` | GET (SSE) | Stream de eventos de análisis. |
| `/api/analyze/source/{id}/{classId}` | GET | Devuelve el código fuente de una clase. |
| `/api/analyze/session/{id}` | DELETE | Borra la sesión. |

### 4.2. Pipeline de parsing (modo FULL — `JavaParserService`)
1. Detecta la versión de Java (`JavaVersionDetector`, lee `pom.xml`/`build.gradle`; fallback a `BLEEDING_EDGE`).
2. Configura el **Symbol Solver** (`SymbolSolverConfigurer`) con los source roots y el language level detectado.
3. Recorre el árbol de archivos (`walkFileTree`) excluyendo carpetas irrelevantes (`ProjectInfoUtils.shouldExclude`).
4. Aplica el **límite FREE de 100 archivos** (`free-max-files`), bypasseado si `isPro`.
5. Por cada archivo, emite eventos en orden: `package_found` → `class_found` → `fields_parsed` → `methods_parsed` (con `Thread.sleep(40)` para dar efecto de streaming progresivo).
6. Resuelve conexiones con `ConnectionResolver` y emite `connection_found`.
7. Cierra con `session_complete` (totales + duración).

**Extractores modulares** (`parser/`): `ClassExtractor`, `FieldExtractor`, `MethodExtractor`, `ConnectionResolver`, `BehaviorAnnotationExtractor`, `SymbolSolverConfigurer`.

### 4.3. Modo FOCO / Marco Polo (`FocusTracerService`)
Tracer de **dependencias de nivel 1** alrededor de una clase. Detecta y clasifica las conexiones:

- `EXTENDS`, `IMPLEMENTS` — herencia.
- `CALLED_BY` / `CALLS` — quién la llama / a quién llama.
- `USES_PROPERTIES` — archivos de configuración referenciados.
- `INVOKES_METHOD` / `INVOKES_OUTGOING` — invocaciones concretas de método.

**Características destacadas:**
- **Una arista por método invocado** (no una genérica por clase): dedupea por método invocado en la periférica.
- **Muestreo proporcional** (`proportionalSample`): el cap FREE de 10 conexiones **no toma "las primeras 10"** — reserva ≥1 slot por tipo de conexión presente y reparte el resto proporcionalmente (no se pierden los 2 `CALLS` cuando hay 30 `CALLED_BY`).
- **Pasada P2 "deep body analysis"**: además del análisis por firma, camina el cuerpo de cada método para detectar invocaciones que la firma no captura.
- **Conexiones bidireccionales**: una misma periférica puede emitir `CALLED_BY` + `CALLS` simultáneamente, alimentando las curvas bidi del frontend.
- **Diagnósticos**: emite `UnresolvedReferenceEvent` (UNRESOLVED / FALSE_NEGATIVE / UNPARSEABLE) para casos que el Symbol Solver no resuelve, que se surfacean en el `DiagnosticsPanel`.

### 4.4. Modo Foco al Método (`FocusMethodTracerService`)
Análisis centrado en un **método específico** (no en una clase entera). Distingue:
- **QUIÉN LO INVOCA** (callers, `INVOKES_METHOD`).
- **A QUIÉN INVOCA** (callees, `INVOKES_OUTGOING`).

### 4.5. Expansión a profundidad 2 (PRO — `expandPeripheral`)
- Reutiliza `FocusTracerService` con la periférica como sub-foco transitorio (`pro=true` para no truncar).
- Filtra los FQN ya presentes en la sesión padre → solo devuelve nodos nuevos.
- FREE recibe **HTTP 403** con `ProRequiredException` → mensaje "Función disponible en PRO".

### 4.6. Análisis de impacto / "Simular cambio" (`ImpactAnalysisService`)
- Construye el **callgraph inverso** caminando todo `.java` del proyecto (mapea `callee FQN → Set<caller FQN>`).
- Corre **BFS hacia atrás** desde la clase foco (depth configurable 1–6, default 4) → callers directos + transitivos con distancia en hops.
- **Detección de ciclos**: BFS forward para ver si el foco vuelve a sí mismo.
- **Partición de tests**: identifica callers que viven bajo `/src/test/java/`.
- Devuelve `ImpactReport`: callers directos, callers transitivos, tests afectados, flag de ciclos.
- FREE recibe solo contadores + flag de ciclo; PRO recibe las **listas completas de FQN** que alimentan el overlay de resaltado.

### 4.7. Enlace cross-stack (`CrossStackLinker` + `MobileEndpointScanner`)
Conecta el **front-end** (React, React-Native, JSP) con el **backend** (Spring, Struts) mediante análisis estático, haciendo visible el flujo cross-stack en el grafo.

- **Detección de tipo de front** leyendo `package.json` (web vs React-Native).
- **`MobileEndpointScanner`** detecta llamadas HTTP por regex sobre el código fuente:
  - `api.get/post/...('/path')`, `fetch/axios('/path')`, `$.get/$.post(...)` (jQuery), `XMLHttpRequest.open(...)`, `<form action="/path">` (HTML legacy).
  - Atribuye cada call a su función wrapper exportada y a las pantallas que la usan.
- **Matching verb+path** contra endpoints Spring (`@GetMapping/@PostMapping/...`) y acciones Struts (`struts.xml` / `struts-config.xml`, Struts 1 y 2).
- **Normalización de paths**: `/api/users/{id}` ≡ `/users/{}`, `/users.do` ≡ `/users`.
- Emite nodos `WEB_SCREEN` y aristas `HTTP_CALL`; muestra incluso pantallas "huérfanas" (sin match de backend) para reflejar la superficie completa. Cap de 200 nodos web.

> Test: `CrossStackLinkerStrutsTest` valida un form JSP → acción Struts (sin anotaciones Spring).

### 4.8. Chips de comportamiento (`BehaviorAnnotationExtractor` + `BehaviorChip`)
Detecta anotaciones que cambian la semántica en runtime y las renderiza como "chips" bajo el nodo foco:
`@Transactional`, `@Cacheable`, `@CacheEvict`, `@CachePut`, `@Caching`, `@Async`, `@Scheduled`, `@EventListener`, `@TransactionalEventListener`, `@Retryable`, `@Recover`, `@Lock`.

- Dos niveles: **class-level** (aplica a toda la clase) y **method-level** (específica de un método; el click navega al cuerpo).
- Extrae el valor: `@Cacheable("auth")` → `auth`; `@Scheduled(fixedRate=5000)` → `fixedRate=5000`.

### 4.9. Cobertura Jacoco (`JacocoReportParser` + `JacocoCoverage`)
- Busca `jacoco.xml` en rutas estándar (Maven `target/site/jacoco/`, Gradle `build/reports/jacoco/`).
- Parsea counters `<counter type="LINE" .../>` → cobertura % por clase y por método.
- Alimenta el `CoverageDonut` clickeable del nodo central.

### 4.10. Generador de comentarios (`FocoCommentEngine`)
Genera explicaciones cortas **sin LLM** (heurísticas) para el PDF de FOCO, según reglas:
cross-package vs same-package, llamada a `@Repository`, `@Controller` como punto de entrada, composición de `@Service`, dependencia por interfaz, uso de properties, clase grande (>15 métodos o >10 campos), etc. Las reglas se unen con " · ".

### 4.11. Exportación a PDF (`ExportController` + servicios `Foco*PdfService`)
Tres endpoints de export, todos **stateless** (el frontend envía el estado que el usuario ve, garantizando que el PDF refleje la UI, incluido el límite FREE):
- `/api/foco/export/pdf` — reporte de conexiones FOCO.
- `/api/foco/export/method-pdf` — reporte de Foco al Método.
- `/api/foco/export/diagnostics-pdf` — contenido del DiagnosticsPanel.

Los nombres de archivo incluyen sufijo `FREE`/`PRO`.

### 4.12. Utilidades de proyecto
- **`JavaVersionDetector`** — extrae la versión Java objetivo de `pom.xml`/`build.gradle` (normaliza `1.8`→`8`).
- **`GitService`** — clonado de repos remotos vía JGit.
- **`ZipService`** — extracción de ZIP + `findClosestPom()` para multi-módulos.

### 4.13. Gestión de sesiones (`SessionService`)
- Sesiones en memoria con `sessionId` (UUID), timeout de 120 min y limpieza periódica.
- Modos: `FULL`, `FOCUS`, `FOCUS_METHOD`.
- Manejo de archivos temporales: subidas/clones se limpian; los análisis por `path` no son dueños de los archivos (`ownsFiles=false`).

### 4.14. Configuración y manejo de errores
- **CORS** y **WebConfig** configurados.
- `GlobalExceptionHandler` centraliza errores → respuestas JSON con `message` (transformado en toast por el interceptor de axios).
- Excepciones de dominio: `ProRequiredException` (403), `SessionNotFoundException` (404).
- **`application.yml`:**
  ```yaml
  server.port: 8090
  codemapper:
    upload-dir: ./tmp-uploads
    session-timeout: 120     # minutos
    cleanup-interval: 30     # minutos
    limits:
      free-max-files: 100
      focus-max-connections: 10
      focus-method-max-connections: 10
  ```

---

## 5. Frontend — Funcionalidades

### 5.1. Home (`app/page.tsx`)
- Branding "MapperView" con efectos visuales (glow bordó, grid plateado, scan-line CRT animada, logo de nodos en topología de diamante).
- Respeta `prefers-reduced-motion`.
- `UploadTabs` con los distintos modos de entrada.

### 5.2. Modos de carga (`components/upload/`)
- `UploadZone` — drag & drop de `.java`/`.zip`.
- `LocalPathInput` — ruta local (dev).
- `GitHubInput` — URL de repo.
- `FocusInput` — projectPath + focusFile para Marco Polo.
- Tabs separadas para FREE y "Marco Polo PRO".

### 5.3. Vista de mapa (`app/map/[sessionId]/page.tsx`)
- Consume el SSE vía `useSSE` y alimenta el `graphStore`.
- Soporta `sessionId="pending"` para navegación inmediata (resuelve la promesa en vuelo y hace `router.replace` a la URL real).

### 5.4. Grafos (React Flow — `components/graph/`)

**Grafo general:**
- `CodeGraph` + `ClassNode` con layout por capas (Dagre).
- Filtros, búsqueda, leyendas, badge de versión Java.

**Grafo FOCO (`FocusGraph`):**
- **Layout radial**: clase central + N periféricas en estrella; edges flotantes sin handles cardinales.
- `FocusCenterNode` — variables y métodos como pills, animación CSS de entrada, `CoverageDonut` Jacoco clickeable.
- `FocusPeripheralNode` — con `data-testid`/`data-direction`/`data-connection-type` para testabilidad.
- `FocusEdge` — color por tipo, label siempre visible, hover prominente, animación de stroke-draw basada en **wall-clock** (`firstSeenAt`) para sobrevivir remounts de React Flow.

**Sofisticación visual de aristas (FOCO):**
- **Aristas paralelas curvadas** (Bézier cuadrática) con offset perpendicular `(siblingIndex - (N-1)/2) × 28px`.
- **Filtro direccional** `[Todo] [←Entra] [Sale→]`: incoming = `CALLED_BY ∪ INVOKES_METHOD ∪ EXTENDS ∪ IMPLEMENTS`; outgoing = `CALLS ∪ INVOKES_OUTGOING ∪ USES_PROPERTIES`. Se aplica como **intersección** con los demás filtros.
- **Tipo de relación** con iconos lucide y tooltip ES: Invocación (Zap) > Instanciación (Plus) > Inyección (Plug) > Declaración (Box). Override: campos `@Mock`/`@MockBean`/`@SpyBean`/`@InjectMocks` fuerzan INJECTION.
- **Aristas bidireccionales**: dos curvas separadas (curvature +1 outgoing / -1 incoming).
- **Expansión depth-2 (PRO)**: nodos en sub-arco de 60° centrado en la dirección radial del padre, geometría depth-1 congelada, aristas depth-2 con menor grosor/opacidad (×0.7).

La lógica de agrupamiento de aristas está extraída a un **módulo puro** testeable (`focusGraphGrouping.ts`).

**Grafo Foco al Método (`FocusMethodGraph` + `FocusMethodCenterNode`).**

### 5.5. Bitácora de Marco Polo (`components/marcopolo/`)
Árbol radial que **registra el recorrido del dev** mientras navega de clase en clase — convierte el "camino mental" de comprensión en documentación visual.
- `bitacoraStore.ts` — Zustand + persist a `sessionStorage`. Modelo: árbol activo (origen + nodos + edges + activeNodeId + posición del panel + ventana PiP) + `archived[]` de árboles pasados.
- `Bitacora.tsx` — panel flotante draggable + resizable + portal a **Document Picture-in-Picture** (ventana flotante real en Chrome/Edge 116+) con botones "Sacar afuera" y "Maximizar".
- `BitacoraNode` / `BitacoraEdge` — nodos rectangulares, edges bezier con offset paralelo, labels `fromMethod() → toMethod()`.
- `BitacoraIndicator` — chip toggle junto al indicador de streaming.
- `ArbolHistorialBlock` — lista de árboles archivados (read-only, con borrado).
- Captura automática de saltos desde eventos SSE y clicks en la sheet.
- **Export PNG** del árbol vía html-to-image.
- Persiste F5 (sessionStorage); se pierde al cerrar la tab.

### 5.6. Sidebar y paneles
- `ClassDetailSheet` — detalle de clase con código (Monaco), métodos/campos, botones de FOCO SCANER y Foco al Método.
- `DiagnosticsPanel` — UNRESOLVED/FALSE_NEGATIVE/UNPARSEABLE + su export PDF.
- `FilterPanel`, `EdgeLegend`, `ClassKindLegend`, `FocusConnectionLegend`.
- `ImpactSimulationButton` — overlay de "Simular cambio" que ilumina caminos.
- `JavaVersionBadge`, `BehaviorChipBar`.

### 5.7. Pantallas de carga y modales (`components/loading/`)
- `AnalysisLoadingScreen`, `InlineGraphLoading`, `StreamingIndicator`.
- `FocusLimitReachedModal` / `LimitReachedModal` — modales educativos al alcanzar el límite FREE.
- `FocusScanConfirmModal`.

### 5.8. Sistema de tiers FREE/PRO en el cliente (`lib/api.ts`)
- `resolveDemoMode()` lee `?demo=pro` de la URL y lo persiste en `sessionStorage` (key `cm-demo-mode`).
- Mirror de límites del backend (`FREE_TIER_FILE_LIMIT = 100`) para hints de UX.
- Interceptor de axios → todos los errores se muestran como toast con el `message` del backend.

---

## 6. Módulo "Escuchar" (Listening / trazas en vivo)

Modo de ejecución en vivo que **captura trazas OpenTelemetry** de un servicio corriendo y **dibuja el call-graph dinámicamente** como **anillos concéntricos** (cada anillo = una profundidad de llamada).

### 6.1. Flujo general
```
OTel Agent (app del usuario)
   │ POST /v1/traces (OTLP protobuf o JSON)
   ▼
TraceController.ingest() ──► OtlpProtobufParser | OtlpTraceParser (→ TraceSpanDto)
   │
   ▼
TraceBroadcaster.broadcast() (fan-out SSE)
   │  GET /api/trace/stream
   ▼
EventSource (useTraceStream) ──► listeningStore.ingest() (reconstruye grafo)
   ▼
ListeningGraph (anillos + nodos + edges)
```

### 6.2. Experiencia de usuario
- Pantalla `/escuchar` con campo "¿Qué servicio querés escuchar?" (acepta una URL o parte de ella, ej. `localhost:5180`, `/checkout`).
- Campos opcionales: **ruta del front** (escanea pantallas web/mobile que disparan cada request) y **ruta del backend** (permite abrir el código fuente de una clase Java al clickearla).
- **4 fases visuales**: INICIAL (ondas suaves) → ESCUCHANDO (ondas intensas/parpadeantes) → DIBUJANDO (llega el primer span, emerge el grafo) → ERROR (nodo rojo + panel con stacktrace).
- Botones: **Escuchar**, **Detener**, **Resetear** (limpia grafo pero sigue escuchando), **PDF** (snapshot + tabla).
- **Filtrado dinámico** sin re-request: tabs `Todo / Web / Java` y campo "Filtro URL" se aplican contra los spans ya recibidos.

### 6.3. Backend de trazas
- **`POST /v1/traces`** — ingest OTLP/HTTP (protobuf o JSON). Siempre responde `200 {}` aunque el payload falle, para no desalentar al agente OTel.
- **`GET /api/trace/stream`** — SSE con timeout de 24h; eventos `listening`, `span`, y heartbeat `:ping` cada 15s (evita que proxies corten conexiones idle).
- **`POST /api/trace/export/pdf`** — export stateless (nodos visibles + snapshot PNG).
- **`POST /api/trace/frontend-scan`** — detecta pantallas React/React Native y sus endpoints.
- **`POST /api/trace/source`** — resuelve el código fuente de una clase Java por FQCN.
- **`POST /api/trace/method-calls`** — análisis estático: qué clases llama un método.

**`TraceBroadcaster`** mantiene una lista `CopyOnWriteArrayList<SseEmitter>`, difunde cada span serializado a todos los emitters, limpia los muertos y emite heartbeat programado.

**Parsers OTLP** (`OtlpTraceParser` JSON, `OtlpProtobufParser` protobuf) — null-tolerantes; extraen `code.namespace` (FQCN), `code.function` (método), atributos HTTP (`url.full`/`server.address`/`http.route`), status (OK/ERROR/UNSET) y detalle de excepción. Salida: **`TraceSpanDto`** (traceId, spanId, parentSpanId, fqcn, className, method, httpUrl, status, startUnixNano, durationMs, error{type,message,stacktrace}).

### 6.4. Construcción y visualización del grafo (frontend)
- **`useTraceStream`** — abre `EventSource`, bufferea spans y los **flushea cada 100ms** (batching) hacia `ingest()`.
- **`useListeningStore`** (Zustand) — acumula spans flat; `buildTraceGraph` (función **pura**) reconstruye TODO el grafo desde cero en cada ingest:
  - Maneja **out-of-order**, **bridging** (ignora spans sin `className` pero camina a través de ellos: `Controller → (DispatcherServlet) → Service` produce `Controller → Service`), **URL filtering** y **view filtering** (recomputa profundidades).
- **`ClassNode`** — className, isHttp, fqcn, methods[], status, depth (BFS), order (secuencia por startNano), hitCount, error, isScreen/screenKind.
- **`ListeningGraph`** — layout radial: centro (depth 0) + anillos (`ringRadius = depth*420`), nodos por ángulo en orden de `firstSeen`.
- **`ListeningNode`** — estados normal / errored (rojo, breathing) / screen (📱 mobile verde, 🌐 web azul) / HTTP entry; pills de métodos, contador `×N`, badge de orden 1→2→3.
- **`ListeningEdge`** — animación stroke-draw (delay 300ms, stagger 280ms, duración 1400ms), label con métodos + `×N`, icono `⇄` si es bidireccional.
- **`ConcentricWaves`** — fondo de ondas (6.5s suave en INICIAL, 3s brillante al estar "armado").
- **Paneles**: `ListeningOrderPanel` (orden de ejecución + ver código), `ListeningErrorPanel` (tipo + mensaje + stacktrace), `ListeningSourceSheet` (Monaco read-only).

### 6.5. Escaneo de front y orígenes mobile
- **`scanFrontendScreens(path)`** — escanea React/React-Native buscando `apiX.post/get(...)`, devuelve `ScreenCall{verb, path, screenName, mobile}`.
- **`MobileOriginDto`** — vincula una pantalla mobile (screen + apiFunction + apiFile) a un controller Java (attachFqcn) para excepciones que tocan mobile.

---

## 7. Módulo "IA.Grafo" (chat con Claude → grafo de impacto + diffs)

Permite pedir un cambio de código **en lenguaje natural** y obtener: (1) un **grafo visual** de los archivos/clases afectados y por qué, (2) **diffs aplicables** (search/replace exacto) que se revisan y aplican con un clic.

> **Restricción de auth:** IA.Grafo usa una **API key de la Consola de Anthropic**, no OAuth ("Sign in with Claude" para apps de terceros está prohibido por ToS).

### 7.1. Dos modos de operación

**Modo API (agéntico):**
```
Usuario escribe el pedido → POST /api/ia/chat (projectPath, prompt, history)
   ▼
runAgent(apiKey) — loop agéntico con Claude usando tools:
   - read_file / list_dir / grep (solo lectura del proyecto)
   - report_plan (UNA vez): { summary, nodes[], edges[] }
   - propose_diff (por cada cambio): { file, reason, oldString exacto, newString }
   ▼  (valida que oldString existe en el archivo — anti-alucinación)
Eventos NDJSON al cliente: text | step | plan | diff | done | error
   ▼
PlanGraph dibuja el grafo + DiffViewer lista los cambios
   ▼
"Aplicar todo" → POST /api/ia/apply → search/replace DETERMINISTA (NO llama a Claude)
```

**Modo manual (copiar/pegar, sin API key):**
```
"Generar prompt" → POST /api/ia/manual/prompt
   buildManualPrompt: rankea archivos por relevancia al pedido,
   incluye top 8 (máx 120KB) + árbol del proyecto → prompt autocontenido
   ▼
Usuario pega el prompt en claude.ai → copia la respuesta JSON
   ▼
"Dibujar el grafo" → parseManualResponse extrae { plan, diffs }
   ▼
Mismo render y aplicación que el modo API
```

### 7.2. API Routes (Next.js)
| Endpoint | Propósito |
|----------|-----------|
| `POST /api/ia/chat` | Chat agéntico con streaming NDJSON. |
| `POST /api/ia/apply` | Aplica los diffs (search/replace determinista, sin LLM). |
| `GET/POST/DELETE /api/ia/key` | Gestión de API key (cookie httpOnly; el GET solo devuelve `{hasKey}`). |
| `POST /api/ia/source` | Lee el código fuente de un archivo del proyecto. |
| `POST /api/ia/manual/prompt` | Genera el prompt autocontenido del modo manual. |

### 7.3. Modelo y configuración
- Modelo por defecto: **`claude-opus-4-8`** (env `IA_GRAFO_MODEL`; admite otros modelos de Anthropic).
- Límites del agente: `MAX_TURNS=28`, `MAX_FILE_BYTES=200KB`, `MAX_GREP_MATCHES=80`, max 8000 tokens por mensaje.
- Modo manual: `MAX_TREE_FILES=600`, `MAX_RELEVANT_FILES=8`, `MAX_TOTAL_CONTEXT=120KB`.

### 7.4. Componentes y tipos
- **Componentes**: `IaChatPanel`, `IaKeyGate`, `ManualRelayPanel`, `PlanGraph` (React Flow + Dagre), `PlanNode`, `PlanEdge`, `DiffViewer`, `PlanSourceSheet` (Monaco read-only). Estado en `iaGrafoStore` (Zustand).
- **Roles de nodo** (color): `objetivo` (rojo), `caller` (azul), `dependencia` (gris), `test` (verde), `config` (naranja).
- **Interacción del grafo**: click → abre código; doble-click → resalta vecinos; spread control `+/−`.
- **Tipos**: `PlanNode{id,label,role,file?,fqcn?,anchorLine?,summary?}`, `PlanEdge{from,to,reason,changeKind?}`, `ChangePlan{summary,nodes,edges}`, `ProposedDiff{file,reason,oldString,newString}`.
- **Anti-alucinación**: antes de proponer y antes de aplicar, se verifica que `oldString` existe textualmente en el archivo; el apply reemplaza solo la **primera** ocurrencia.

---

## 8. Testing y validación

### 8.1. Backend (JUnit)
- `FocusTracerPerMethodTest` — una arista por método invocado.
- `FocusTracerReferenceKindTest` — clasificación de tipo de relación.
- `FocusExpandControllerTest` — endpoint de expansión PRO.
- `FocusTracerBidirectionalTest` — emisión bidi.
- `ExceptionTraceParserTest`, `OtlpTraceParserTest`, `OtlpProtobufParserTest`, `CrossStackLinkerStrutsTest`, `DiagnosticsPdfSmokeTest`.
- `FocusTestFixtures` — fixtures sintéticas en temp dirs, borradas en `@AfterEach` (nunca tocan el proyecto real).

### 8.2. Frontend (Vitest)
- `FocusDirectionFilter.test`, `FocusEdge.referenceKind.test`, `FocusGraph.bidirectional.test`, `FocusGraph.perMethod.test`, `FocusPeripheralExpand.test`, `graphStore.directionFilter.test`.

### 8.3. E2E (Playwright, navegador visible)
Corren contra el proyecto real **backend-reserva**:
- `01-focus-per-method`, `02-focus-direction`, `03-focus-reference-kind`, `04-focus-expand`, `05-focus-bidirectional`, `smoke`.

### 8.4. Orquestación (`scripts/`)
- `validate.ps1` — mata listeners en :8090/:3000, levanta backend + frontend, corre las tres suites y reporta **ALL GREEN**. Soporta `-TestFilter`.
- `loop-infinito.ps1` — bootstrap de la infraestructura de testing.

---

## 9. Cómo correr

**Backend:**
```bash
cd codemapper-backend
mvn spring-boot:run        # arranca en :8090
```

**Frontend:**
```bash
cd codemapper-frontend
pnpm install
pnpm dev                   # arranca en :3000
```

**Validación completa (Windows/PowerShell):**
```powershell
pwsh -File scripts/validate.ps1
```

**Acceso PRO en demo:** agregar `?demo=pro` a la URL del mapa:
```
http://localhost:3000/map/<sessionId>?mode=focus&demo=pro
```

**IA.Grafo:** abrir `http://localhost:3000/ia-grafo` y, para el modo API, cargar la API key de la Consola de Anthropic (o usar el modo manual sin key).

**Escuchar:** abrir `http://localhost:3000/escuchar`, apuntar el agente OpenTelemetry de la app al backend (`POST /v1/traces` en :8090) y presionar "Escuchar".

---

## 10. Tiers comerciales (FREE / PRO / DIAMANTE)

- **FREE** — análisis con límites (100 archivos, 10 conexiones FOCO, contadores de impacto sin listas).
- **PRO** — expansión depth-2, listas completas de impacto, sin truncado de muestreo. Hoy accesible vía `?demo=pro` (falta auth/billing real).
- **DIAMANTE** (visión a futuro) — IA conversacional, documentación integrada (PDF/MD/Confluence cruzada con el grafo), multi-lenguaje.

> **Nota de naming:** el producto está en rebrand visual a "Marco Polo" / "MapperView", pero los identificadores internos siguen siendo `Focus*`, `focusMode`, `bitacora*` (decisión consciente; el rename completo queda para una pasada de refactor aparte).

---

## 11. Roadmap / pendientes conocidos

🔲 **Autenticación real** (login, cuota de búsquedas/semana) — base de todo el gating.
🔲 **Billing real (Stripe)** — hoy PRO vía `?demo=pro`.
🔲 **Persistencia de bitácoras en la nube** y compartir por link (hoy solo sessionStorage).
🔲 **Modo Verificación de Diff** sobre PRs (el motor de impacto ya existe).
🔲 **Detección multi-stack más amplia** (adapters por framework; Struts/XML en progreso).
🔲 **Vista end-to-end por capas** (HTML→JS→endpoint→Service→Repository→DB) y **recorrido inverso desde DB**.
🔲 **Documentación integrada** (pilar DIAMANTE).
🔲 **Multi-lenguaje** (COBOL, C#, .NET, PHP, Python, Node/TS).
```
