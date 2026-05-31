# Estado del Proyecto — CodeMapper / MapperView ("Marco Polo")

> Documento de inventario: **qué está hecho y qué funciona bien**, a fecha 2026-05-29.
> Generado a partir del análisis del código fuente (backend + frontend), tests y documentación interna.

---

## 1. Resumen ejecutivo

**CodeMapper** (en rebrand visual a **"MapperView" / "Marco Polo"**) es un **visualizador interactivo de proyectos Java**. Parsea el código fuente con JavaParser y dibuja, en tiempo real y de forma progresiva (streaming), un mapa navegable de clases y sus conexiones.

El producto está dividido en tiers comerciales (**FREE / PRO / DIAMANTE**); hoy FREE y PRO son **plenamente funcionales** mediante un toggle de demo (`?demo=pro`), a la espera de autenticación y billing reales.

**Tamaño del código (sin contar tests):**
- Backend: **~6.500 líneas** de Java (Spring Boot 3.5).
- Frontend: **~13.850 líneas** de TypeScript/TSX (Next.js 15).

**Estado de testing:** todo en verde end-to-end.
- JUnit: **13/13** ✅
- Vitest (unit frontend): **28/28** (6 archivos) ✅
- Playwright (E2E con navegador visible): **7/7** ✅
- Validación completa orquestada por `scripts/validate.ps1` → **ALL GREEN**, exit code 0.

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
| Animación | Framer Motion 11 |
| Editor de código | Monaco Editor |
| Export imagen | html-to-image |
| HTTP | Axios (con interceptor de toasts) |
| Notificaciones | Sonner |
| Puerto | **3000** |

### Testing
- **JUnit** (Spring Boot Test) en backend.
- **Vitest** + Testing Library + jsdom para unit tests de frontend.
- **Playwright** para E2E (corre con navegador **visible**, `slowMo: 200`), validando contra el proyecto real `C:/Users/ariel/Reserva/backend-reserva` (read-only, 292 archivos `.java`).

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

**Flujo clave:** el `POST /analyze/*` solo **crea la sesión** y devuelve un `sessionId`; el análisis pesado ocurre de forma asíncrona en un `ExecutorService` y se transmite por SSE. El frontend navega **inmediatamente** al mapa con un `sessionId` "pending" y consume la promesa en vuelo para eliminar la pantalla en blanco entre el click y el streaming.

---

## 4. Funcionalidades del Backend

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

**Validaciones robustas:** las rutas FOCO verifican que el archivo exista, sea `.java`, sea regular y **viva dentro del proyecto** (`focus.startsWith(root)` — previene path traversal).

**Manejo de errores en SSE:** si la sesión no existe, en lugar de romper el content-type (`text/event-stream`), devuelve un emitter de vida corta con un único evento `error` que el frontend ya sabe renderizar limpiamente.

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
Tracer de **dependencias de nivel 1** alrededor de una clase. Detecta y clasifica las conexiones con la clase central:

- `EXTENDS`, `IMPLEMENTS` — herencia.
- `CALLED_BY` / `CALLS` — quién la llama / a quién llama.
- `USES_PROPERTIES` — archivos de configuración referenciados.
- `INVOKES_METHOD` / `INVOKES_OUTGOING` — invocaciones concretas de método.

**Características destacadas:**
- **Una arista por método invocado** (no una genérica por clase): dedupea por método invocado en la periférica.
- **Muestreo proporcional** (`proportionalSample`): el cap FREE de 10 conexiones **no toma "las primeras 10"** — reserva ≥1 slot por tipo de conexión presente y reparte el resto proporcionalmente (no se pierden los 2 `CALLS` cuando hay 30 `CALLED_BY`).
- **Pasada P2 "deep body analysis"**: además del análisis por firma, camina el cuerpo de cada método para detectar invocaciones que la firma no captura.
- **Conexiones bidireccionales**: el pass-1 dejó de ser mutuamente excluyente — una misma periférica puede emitir `CALLED_BY` + `CALLS` simultáneamente, alimentando las curvas bidi del frontend.
- **Diagnósticos**: emite `UnresolvedReferenceEvent` (UNRESOLVED / FALSE_NEGATIVE / UNPARSEABLE) para casos que el Symbol Solver no resuelve, que se surface en el `DiagnosticsPanel`.

### 4.4. Modo Foco al Método (`FocusMethodTracerService`)
Análisis centrado en un **método específico** (no en una clase entera). Distingue:
- **QUIÉN LO INVOCA** (callers, `INVOKES_METHOD`).
- **A QUIÉN INVOCA** (callees, `INVOKES_OUTGOING`).

### 4.5. Expansión a profundidad 2 (PRO — `expandPeripheral`)
- Reutiliza `FocusTracerService` con la periférica como sub-foco transitorio (`pro=true` para no truncar).
- Filtra los FQN ya presentes en la sesión padre → solo devuelve nodos nuevos.
- FREE recibe **HTTP 403** con `ProRequiredException` → mensaje "Función disponible en PRO".

### 4.6. Análisis de impacto / "Simular cambio" (`ImpactAnalysisService`)
- Re-camina el proyecto para construir el **callgraph inverso** y corre BFS (depth configurable 1–6, default 4).
- Devuelve `ImpactReport`: callers directos, callers transitivos, tests afectados, flag de ciclos.
- FREE recibe solo contadores + flag de ciclo; PRO recibe las **listas completas de FQN** que alimentan el overlay de resaltado.

### 4.7. Cobertura Jacoco (`JacocoReportParser`)
- Detecta y parsea `jacoco.xml` si el proyecto lo tiene corrido.
- Cobertura por clase y por método → alimenta el `CoverageDonut` en el nodo central.

### 4.8. Exportación a PDF (`ExportController` + servicios `Foco*PdfService`)
Tres endpoints de export, todos **stateless** (el frontend envía el estado que el usuario ve, garantizando que el PDF refleje la UI, incluido el límite FREE):
- `/api/foco/export/pdf` — reporte de conexiones FOCO.
- `/api/foco/export/method-pdf` — reporte de Foco al Método ("QUIÉN LO INVOCA" / "A QUIÉN INVOCA").
- `/api/foco/export/diagnostics-pdf` — contenido del DiagnosticsPanel.

Los nombres de archivo incluyen sufijo `FREE`/`PRO`. Existe también `FocoCommentEngine` que genera comentarios/descripciones legibles.

### 4.9. Gestión de sesiones (`SessionService`)
- Sesiones en memoria con `sessionId` (UUID), timeout de 120 min y limpieza periódica (configurada en `application.yml`).
- Modos: `FULL`, `FOCUS`, `FOCUS_METHOD`.
- Manejo de archivos temporales: las subidas/clones se limpian; los análisis por `path` no son dueños de los archivos (`ownsFiles=false`).

### 4.10. Configuración y manejo de errores
- **CORS** y **WebConfig** configurados.
- `GlobalExceptionHandler` centraliza errores → respuestas JSON con `message` (que el interceptor de axios transforma en toast).
- Excepciones de dominio: `ProRequiredException` (403), `SessionNotFoundException` (404).
- Límites en `application.yml`: `free-max-files: 100`, `focus-max-connections: 10`, `focus-method-max-connections: 10`.

---

## 5. Funcionalidades del Frontend

### 5.1. Home (`app/page.tsx`)
- Branding "MapperView" con efectos visuales (glow bordó, grid plateado, scan-line CRT animada, logo de nodos en topología de diamante).
- Respeta `prefers-reduced-motion`.
- `UploadTabs` con los distintos modos de entrada.

### 5.2. Modos de carga (`components/upload/`)
- `UploadZone` — drag & drop de `.java`/`.zip`.
- `LocalPathInput` — ruta local (dev).
- `GitHubInput` — URL de repo.
- `FocusInput` — projectPath + focusFile para Marco Polo.
- Tabs separadas para FREE y "Marco Polo PRO" (esta última temporal hasta que exista billing).

### 5.3. Vista de mapa (`app/map/[sessionId]/page.tsx`)
- Consume el SSE vía `useSSE` y alimenta el `graphStore`.
- Soporta `sessionId="pending"` para navegación inmediata (resuelve la promesa en vuelo y hace `router.replace` a la URL real).

### 5.4. Grafos (React Flow — `components/graph/`)
**Grafo general:**
- `CodeGraph` + `ClassNode` con layout por capas (Dagre).
- Filtros, búsqueda, leyendas, badge de versión Java.

**Grafo FOCO (`FocusGraph`):**
- **Layout radial**: clase central + N periféricas en estrella; edges flotantes sin handles cardinales.
- `FocusCenterNode` — variables y métodos como pills, animación CSS de entrada (migrada desde Framer Motion para evitar reinicios por re-render), `CoverageDonut` Jacoco clickeable.
- `FocusPeripheralNode` — con `data-testid`/`data-direction`/`data-connection-type` para testabilidad.
- `FocusEdge` — color por tipo, label siempre visible, hover prominente, animación de stroke-draw basada en **wall-clock** (`firstSeenAt`) para sobrevivir remounts de React Flow.

**Sofisticación visual de aristas (FOCO):**
- **Aristas paralelas curvadas** (Bézier cuadrática) con offset perpendicular `(siblingIndex - (N-1)/2) × 28px` — para que `save()` y `delete()` no se pisen visualmente.
- **Filtro direccional** `[Todo] [←Entra] [Sale→]` (`FocusDirectionFilter` + `focusDirection.ts`): incoming = `CALLED_BY ∪ INVOKES_METHOD ∪ EXTENDS ∪ IMPLEMENTS`; outgoing = `CALLS ∪ INVOKES_OUTGOING ∪ USES_PROPERTIES`. Se aplica como **intersección** con los demás filtros.
- **Tipo de relación** con iconos lucide y tooltip ES: Invocación (Zap) > Instanciación (Plus) > Inyección (Plug) > Declaración (Box). Override clave: campos `@Mock`/`@MockBean`/`@SpyBean`/`@InjectMocks` fuerzan INJECTION (los stubs de test no son acoplamiento productivo).
- **Aristas bidireccionales**: cuando una periférica tiene entrada y salida, se dibujan **dos curvas separadas** (curvature +1 outgoing / -1 incoming) en lugar de líneas superpuestas.
- **Expansión depth-2 (PRO)**: nodos en sub-arco de 60° centrado en la dirección radial del padre, con la geometría depth-1 **congelada** (no se rebalancea el ring), y aristas depth-2 con menor grosor/opacidad (×0.7) para que el ring primario domine.

La lógica de agrupamiento de aristas está extraída a un **módulo puro** (`focusGraphGrouping.ts`) testeable sin contexto de React Flow.

**Grafo Foco al Método (`FocusMethodGraph` + `FocusMethodCenterNode`).**

### 5.5. Bitácora de Marco Polo (`components/marcopolo/`)
Árbol radial que **registra el recorrido del dev** mientras navega de clase en clase — convierte el "camino mental" de comprensión en documentación visual.
- `bitacoraStore.ts` — Zustand + persist a `sessionStorage`. Modelo: árbol activo (origen + nodos + edges + activeNodeId + posición del panel + ventana PiP) + `archived[]` de árboles pasados.
- `Bitacora.tsx` — panel flotante draggable + resizable + portal a **Document Picture-in-Picture** (ventana flotante real en Chrome/Edge 116+) con botones "Sacar afuera" y "Maximizar" (fullscreen).
- `BitacoraNode` / `BitacoraEdge` — nodos rectangulares, edges bezier con offset paralelo, labels `fromMethod() → toMethod()`.
- `BitacoraIndicator` — chip toggle junto al indicador de streaming.
- `ArbolHistorialBlock` — lista de árboles archivados (read-only, con borrado).
- Captura automática de saltos desde los eventos SSE y los click en la sheet.
- **Export PNG** del árbol vía html-to-image.
- Persistencia: sobrevive F5 (sessionStorage), se pierde al cerrar la tab.

### 5.6. Sidebar y paneles (`components/sidebar/`, `components/graph/`)
- `ClassDetailSheet` — detalle de clase con código (Monaco), métodos/campos, botones de FOCO SCANER y Foco al Método.
- `ProjectStats`, `ParseProgress`.
- `DiagnosticsPanel` — surface de UNRESOLVED/FALSE_NEGATIVE/UNPARSEABLE con su propio export PDF.
- `FilterPanel`, `EdgeLegend`, `ClassKindLegend`, `FocusConnectionLegend` — filtros y toggles de visibilidad por tipo.
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

## 6. Testing y validación

### 6.1. Tests backend (JUnit — 13/13 ✅)
- `FocusTracerPerMethodTest` (2) — una arista por método invocado.
- `FocusTracerReferenceKindTest` (6) — clasificación de tipo de relación.
- `FocusExpandControllerTest` (4) — endpoint de expansión PRO.
- `FocusTracerBidirectionalTest` (1) — emisión bidi.
- `FocusTestFixtures` — fixtures sintéticas creadas en temp dirs, borradas en `@AfterEach` (nunca tocan el proyecto real).

### 6.2. Tests unitarios frontend (Vitest — 28/28, 6 archivos ✅)
- `FocusDirectionFilter.test`, `FocusEdge.referenceKind.test`, `FocusGraph.bidirectional.test`, `FocusGraph.perMethod.test`, `FocusPeripheralExpand.test`, `graphStore.directionFilter.test`.

### 6.3. Tests E2E (Playwright, navegador visible — 7/7 ✅)
Corren contra el proyecto real **backend-reserva** (~4.8 min):
- `01-focus-per-method` — aristas con nombres de método distintos.
- `02-focus-direction` — control direccional en sus 3 estados.
- `03-focus-reference-kind` — iconos + tooltips ES.
- `04-focus-expand` — expansión depth-2 PRO + variante FREE.
- `05-focus-bidirectional` — dos curvas separadas (no superpuestas).
- `smoke` — el frontend responde.

### 6.4. Orquestación (`scripts/`)
- `validate.ps1` — mata listeners en :8090/:3000, levanta backend + frontend, corre las tres suites y reporta **ALL GREEN**. Soporta `-TestFilter`.
- `loop-infinito.ps1` — bootstrap de la infraestructura de testing.

---

## 7. Lo que está sólido (highlights)

✅ **Streaming progresivo SSE real** — el grafo se dibuja nodo por nodo, no de golpe.
✅ **Symbol Solver configurado correctamente** con detección de versión Java y fallback robusto.
✅ **Modo FOCO maduro** — 5 puntos de pulido completados y verificados E2E (per-method, direccional, tipo de relación, expansión PRO, bidi).
✅ **Muestreo proporcional inteligente** en el cap FREE (no pierde tipos de conexión minoritarios).
✅ **Bitácora con Document PiP** — feature diferencial y técnicamente avanzado.
✅ **Análisis de impacto** funcional (BFS sobre callgraph inverso) — base lista para el modo diff.
✅ **Cobertura Jacoco** integrada al grafo.
✅ **Export PDF stateless** que refleja exactamente lo que ve el usuario.
✅ **Sistema FREE/PRO** completo a nivel features (solo falta auth/billing).
✅ **Suite de tests verde en tres niveles** (unit backend, unit frontend, E2E con navegador real).
✅ **Validaciones de seguridad de paths** (anti path-traversal) y manejo de errores cuidado en SSE.

---

## 8. Lo que NO está hecho (límites conocidos)

Según el `ROADMAP.md`, queda pendiente:

🔲 **Autenticación real** — login obligatorio, cuota de 10 búsquedas/semana, mensajes de uso FREE. Todo el gating de cuota depende de esto.
🔲 **Billing real (Stripe)** — hoy PRO se accede vía `?demo=pro`.
🔲 **Persistencia de bitácoras en la nube** y **compartir por link** (hoy solo sessionStorage).
🔲 **Modo Verificación de Diff** — el motor de impacto ya existe; falta exponerlo sobre diffs/PRs (clave estratégica para PRO).
🔲 **Detección de tipo de proyecto / multi-stack** (package.json, pubspec, etc.).
🔲 **Vista end-to-end por capas** (HTML→JS→endpoint→Service→Repository→DB) — solo está resuelto el tramo Java (Controller→Service→Repository).
🔲 **Recorrido inverso desde DB** (tabla → endpoint → frontend).
🔲 **Documentación integrada** (indexar PDF/MD/Confluence y cruzarla con el grafo) — pilar de DIAMANTE.
🔲 **Multi-lenguaje** (COBOL, C#, .NET, PHP, Python, Node/TS).
🔲 **IA conversacional** (tier DIAMANTE).

> **Nota de naming:** el producto está en rebrand visual a "Marco Polo" / "MapperView", pero los identificadores internos siguen siendo `Focus*`, `focusMode`, `bitacora*` (decisión consciente; el rename completo queda para una pasada de refactor aparte).

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

**Acceso PRO en demo:** agregar `?demo=pro` a la URL del mapa.
```
http://localhost:3000/map/<sessionId>?mode=focus&demo=pro
```
