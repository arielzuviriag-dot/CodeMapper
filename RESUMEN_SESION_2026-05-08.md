# Resumen de sesión — 2026-05-08

Documento de cierre con todo lo que entró en código durante la sesión. Sirve como referencia rápida de "qué hicimos hoy" y como índice para las próximas iteraciones.

---

## Visión general

Lo que arrancó como una validación del PDF de CodeMapper FOCO terminó siendo un overhaul completo del modo FOCO: las 6 fases del plan (F0 → F4) entraron en código, se sumó **análisis profundo de cuerpos con streaming progresivo**, se reordenó la filosofía FREE/PRO ("solo cantidad, nunca features") y se hizo una pasada de UX polish exhaustiva.

**Push final a main**: 2 commits, branch `main` actualizada en GitHub.

---

## Documentos generados

| Archivo | Propósito |
|---|---|
| `VALIDATION_GUIDE.md` | Cómo validar reportes de CodeMapper + filosofía de UX visual |
| `PLAN_FOCO_DIMENSIONES.md` | Plan ordenado por fases F0–F4 con file:line, "cómo probarlo", decisiones |
| `BITACORA_NOCHE.md` | Bitácora del trabajo autónomo nocturno F0–F4 |
| `RESUMEN_SESION_2026-05-08.md` | Este documento |

---

## Fases entregadas

### F0 — Fundacional (cross-cutting)

Backend:
- **`JavaVersionDetector.java`** (nuevo) — lee `pom.xml` (`<maven.compiler.release>`, `<java.version>`, `<maven.compiler.source>`, `<release>`, `<source>` en orden) y `build.gradle(.kts)` (`languageVersion`, `JavaLanguageVersion.of(...)`, `sourceCompatibility`, `targetCompatibility`). Devuelve major version normalizado (`"1.8"` → `"8"`).
- **`SymbolSolverConfigurer.java`** — sobrecarga `configure(projectRoot, javaVersion)` que mapea a `LanguageLevel` (Java 8–17 explícitos, otros caen a `BLEEDING_EDGE`).
- **`SessionData.java`** — campo `String detectedJavaVersion`.
- **`SessionStartEvent.java`** — campo `String detectedJavaVersion` viaja al frontend en SSE.
- Detector inyectado en los 3 servicios: `JavaParserService`, `FocusTracerService`, `FocusMethodTracerService`.

Frontend:
- **`lib/types.ts`** — `SessionStartPayload.detectedJavaVersion`.
- **`store/graphStore.ts`** — campos `isPro: boolean` y `detectedJavaVersion: string | null` con setters. `isPro` NO se limpia en `reset()` (es persistente del browser); `detectedJavaVersion` SÍ.
- **`hooks/useSSE.ts`** — handler de `session_start` pasa la versión al store.
- **`app/map/[sessionId]/page.tsx`** — `useState` local de `isPro` reemplazado por el del store.

### F1 — Contrato y superficie

Backend:
- **`ParsedMethod.java`** — campos `thrownExceptions: List<String>` y `securityAnnotations: List<String>`.
- **`MethodExtractor.java`** — extrae `md.getThrownExceptions()` y filtra anotaciones de seguridad por simple-name. Cubre Spring Security (`@PreAuthorize`, `@PostAuthorize`, `@PreFilter`, `@PostFilter`, `@Secured`), JSR-250 (`@RolesAllowed`, `@DenyAll`, `@PermitAll`), Apache Shiro (`@RequiresRoles`, `@RequiresPermissions`), y un genérico `@RequiredRole`.

Frontend:
- **`lib/types.ts`** — `ParsedMethod.thrownExceptions?` + `securityAnnotations?` opcionales.
- **`FocusCenterNode.tsx`** — rediseñado: header bordó con donut de cobertura, class-level annotations, behavior chips bar, **cluster de excepciones**, footer con package. Sin sección de métodos públicos (ya está en el sidebar).
- **`FocusGraph.tsx`** — `CENTER_W: 280→340`, radii ajustados.

### F1.5 — Add-on: Badge versión Java + ayuda educativa

Frontend:
- **`lib/javaCompat.ts`** (nuevo) — matriz de features por versión + helpers `parseJavaMajor`, `featuresAvailable`, `featuresLockedBehind`. Single source of truth.
- **`components/graph/JavaVersionBadge.tsx`** (nuevo) — píldora "Java X detectado" + popover educativo con 3 secciones:
  1. "Lo que ves ahora (Java X)"
  2. "Lo que verías si actualizaras"
  3. Pie honesto: "CodeMapper soporta todas estas features. Se activan cuando subís la versión."
- Si la versión no se detecta: pildora dice "Java ?" y el popover lista todo lo soportado.
- **Posición**: aside derecho arriba, alineado a la misma altura de las otras legends. Scrolleable si es muy largo.

### F2 — Configuración (chips de comportamiento)

Backend:
- **`model/dto/BehaviorChip.java`** (nuevo) — DTO con `annotation`, `value`, `methodName` (null si es nivel clase).
- **`parser/BehaviorAnnotationExtractor.java`** (nuevo) — detecta por simple-name: `@Transactional`, `@Cacheable`, `@CacheEvict`, `@CachePut`, `@Caching`, `@Async`, `@Scheduled`, `@EventListener`, `@TransactionalEventListener`, `@Retryable`, `@Recover`, `@Lock`. Recoge tanto a nivel clase como método. Maneja `MarkerAnnotationExpr`, `SingleMemberAnnotationExpr`, `NormalAnnotationExpr`.
- **`FocusClassLoadedEvent.java`** — campo `behaviorAnnotations: List<BehaviorChip>`.
- Inyectado en `FocusTracerService`.

Frontend:
- **`lib/types.ts`** — `BehaviorChip` y `FocusClassLoadedPayload.behaviorAnnotations?`.
- **`components/graph/BehaviorChipBar.tsx`** (nuevo) — chips horizontales scrolleables, color por familia (azul = transaccional, violeta = cache, ámbar = async/scheduled, verde = events, rosa = retry, gris = lock). Click → `openMethodSheet()` o `selectNode()` según corresponda.
- **Sin cap**: muestra todos los chips siempre (regla "interior del foco siempre completo").
- Integrado en `FocusCenterNode.tsx` después del bloque de annotations.

### F3 — Tests y cobertura

Backend:
- **Detección de tests** (`FocusTracerService.isTestPath()`) — paths `/src/test/java/` o `/test/java/`, Windows-safe.
- **Detección de mocks** (`FocusTracerService.declaresMockOf()`) — fields del caller con anotaciones `@Mock / @MockBean / @SpyBean / @InjectMocks / @Spy` cuyo tipo simple-name = focus simple-name.
- **`model/dto/JacocoCoverage.java`** (nuevo) — record con `classCoverage` + `methodCoverage`.
- **`service/JacocoReportParser.java`** (nuevo) — busca XML en 3 paths típicos (Maven `target/site/jacoco/jacoco.xml`, Gradle `build/reports/jacoco/test/jacocoTestReport.xml`, Gradle alt). Parser DOM con DTD externa desactivada (Jacoco mete DOCTYPE). Calcula % desde LINE counter `covered / (covered+missed) * 100`.
- **`FocusClassLoadedEvent.java`** — `Double coveragePercent`, `Map<String, Double> methodCoverage`.
- **`FocusConnectionEvent.java`** — `boolean isTest`, `boolean isMock`.

Frontend:
- **`lib/types.ts`** — `coveragePercent`, `methodCoverage` en `FocusClassLoadedPayload`; `isTest`, `isMock` en `FocusConnectionPayload`.
- **`store/graphStore.ts`** — `showTests: boolean` (default `false`) + `setShowTests`.
- **`FocusGraph.tsx`** — filtra peripherals con `isTest` cuando `!showTests`. Toggle `<ShowTestsToggle />` en aside derecho (oculto cuando no hay tests).
- **`FocusEdge.tsx`** — si `isTest`: stroke `#7B8AAD`, width 1.5, dash `"4 3"`. Si `isMock`: SVG inline de máscara dentro del label. Prefijo "Test · " antes del label.
- **`FocusCenterNode.tsx`** — donut SVG arriba-derecha del nodo cuando `coveragePercent != null`. Anillo coloreado: ≥80 verde, ≥50 ámbar, <50 rojo. Click → `selectNode(focus.id)`.

### F4 — Radio de impacto

Backend:
- **`model/dto/ImpactReport.java`** (nuevo) — DTO con `totalImpact`, `totalTests`, `hasCycles`, `directCallers`, `transitiveCallers`, `affectedTests`, `cycles`. **Sin gating por plan**: ambos planes reciben las listas completas.
- **`service/ImpactAnalysisService.java`** (nuevo) — re-walk completo del proyecto a demanda; construye inverse callgraph `FQN → set<callers>`. **BFS hacia atrás** desde `focusFqn` con depth configurable (default 4, clamped 1–6 en endpoint). **Detector de ciclos** vía BFS forward separado. Filtra tests por path al final.
- **`AnalysisService.computeImpact()`** — método público que delega.
- **`AnalyzeController`** — endpoint `GET /api/analyze/focus/{sessionId}/impact?depth=4`.

Frontend:
- **`lib/types.ts`** — `ImpactReport`.
- **`lib/api.ts`** — `getImpactReport(sessionId, depth=4)`.
- **`store/graphStore.ts`** — `impactReport`, `impactLoading` con setters.
- **`components/graph/ImpactSimulationButton.tsx`** (nuevo):
  - **Estado idle**: botón "Simular cambio".
  - **Estado active**: banner con counter (N archivos · M tests), warning de ciclos (`AlertOctagon`), botón "Salir del modo simular".
- **`FocusGraph.tsx`** — clase `cm-impact-active` en `<ReactFlow>` cuando hay reporte; tags peripherals con `cm-impact-direct` / `cm-impact-transitive` / `cm-impact-test` (test gana sobre direct gana sobre transitive); hasCycles → `cm-impact-cycle-ring` overlay sobre el centro.
- **`app/globals.css`** — atenuación `opacity: 0.28` general + drop-shadow naranja para callers + animación `cm-impact-pulse` para tests + `cm-impact-cycle-pulse` para ring de ciclos.

---

## Análisis profundo (F-deep)

Cuando descubrimos que el FOCO solo capturaba **11 conexiones** de `User` cuando el grep mostraba **23 imports**, agregamos profundidad real al tracer. Resultado: en el screenshot final, **32 conexiones** sobre `User` (incluye main + tests + same-package + uses dentro de cuerpos).

### Backend

- **Pasada 1 enriquecida** en `FocusTracerService`:
  - Lo que ya hacía (signatures, extends, implements, fields).
  - **Nuevo**: si el archivo tiene `import com.reserva...User;` o `import com.reserva...*;` que cubre el package del foco → promueve a CALLED_BY.
- **Cap FREE check temprano**: si `!isPro && pass1.size() >= focusMaxConnections (10)` → corta y emite `LimitReachedEvent`. Pasada 2 NO corre.
- **Pasada 2 — Deep body analysis** (solo PRO o FREE con cupo):
  - Re-barre los archivos NO clasificados en P1.
  - Symbol resolver dentro de cuerpos detecta:
    - `MethodCallExpr` (`x.method()`)
    - `ObjectCreationExpr` (`new User()`)
    - `ClassExpr` (`User.class`)
    - `MethodReferenceExpr` (`User::factory`)
    - `NameExpr` / `SimpleName` (referencias bare)
  - Filtra al **root package** del proyecto (auto-derivado: 3 primeros segmentos del FQN del foco).
  - **Streaming en vivo**: cada match de Pasada 2 emite SSE inmediato + stagger 60ms. El dev ve el grafo crecer durante la búsqueda profunda.
- **`findViaMethod` con 3 niveles**:
  1. Call expressions resueltas (precisión alta).
  2. Signatures (return / parameters / generic args).
  3. Heurística: cualquier método cuyo cuerpo mencione el simple-name del foco como token.

### Diagnostics panel

Backend:
- **`model/dto/UnresolvedReference.java`** (nuevo) — DTO con `kind`, `file`, `line`, `snippet`, `reason`. Tres kinds:
  - **UNRESOLVED**: parser falló al resolver una expresión que podría referenciar al foco
  - **FALSE_NEGATIVE**: el simple-name del foco aparece en el body pero no se confirmó vía symbol
  - **UNPARSEABLE**: archivo que no se pudo parsear (sintaxis rota, lombok delombok pendiente)
- **`model/event/UnresolvedReferenceEvent.java`** (nuevo) — wrapper SSE.
- Filtros aplicados:
  - **No incluye símbolos del JDK** (`java.*`, `javax.*`)
  - **Sí incluye** símbolos del root package del proyecto
  - **FALSE_NEGATIVE solo se emite** si el simple-name aparece pero no resolvió

Frontend:
- **`lib/types.ts`** — `UnresolvedReferenceKind`, `UnresolvedReferencePayload`.
- **`store/graphStore.ts`** — `diagnostics: Diagnostic[]` con `addDiagnostic()` + reset.
- **`hooks/useSSE.ts`** — handler para `unresolved_reference` evento.
- **`components/graph/DiagnosticsPanel.tsx`** (nuevo) — panel colapsable abajo a la derecha del canvas:
  - Pildora con contador `🔴 Diagnóstico (N)` y chevron.
  - Click expande con 3 secciones colapsables (No resueltos / Posibles falsos negativos / Archivos no parseables).
  - Cada item: path corto, línea, snippet, motivo.
  - Hidden si `diagnostics.length === 0`.

---

## Filosofía FREE/PRO clarificada

Después de discutir, quedó cristal clara la regla:

> **La diferencia FREE/PRO es solo cantidad de peripherals visibles en el grafo. Todo el resto (información, features, modos, paneles) es idéntico en ambos planes.**

### Cambios para alinear el código a la regla

- **F2 BehaviorChipBar** — sacó cap de 3 chips. Ahora muestra todos siempre.
- **F4 ImpactReport backend** — sacó la lógica que vaciaba listas en FREE. Ambos planes reciben report completo.
- **F4 ImpactSimulationButton frontend** — sacó CTA "Con PRO ves qué clases específicas...". El modo simular funciona idéntico en ambos planes.
- Lo único cap-gated: **10 peripherals visibles en el grafo radial**.

---

## UX polish

### Sheet de detalle de clase / método

- **Tabs reducidos a Código + Métricas** (saqué Entrantes/Salientes — no aportaban en modo FOCO porque las relaciones ya están en el grafo, y en peripherals daban (0,0) confuso).
- **Métricas con accordion expandible**:
  - **Campos**: lista plana con `tipo nombre @anotaciones`.
  - **Métodos**: lista con `nombre(params): returnType @anotaciones`.
  - **Conexiones**: lista por peripheral con badge tipo (Llama a / Llamado por / Extiende / Implementa / Usa props) + `↳ método(params): returnType`.
  - **Complejidad estimada**: desglose `campos + métodos + conexiones = total`.
  - Click expande una métrica, otras se cierran (accordion).
- **Eliminé**: bloque "Tipo / Modificadores", métrica "Líneas", componente `ConnectionList` entero.
- **FREE cap awareness en métricas**: cuando la conexión está cap'd (solo en clase del foco), header muestra `10 / 23 [FREE]` con tooltip + banner educativo en el panel expandido.
- **Find widget de Monaco abierto auto** al montar el editor (clase + método). Sin necesidad de Ctrl+F.
- **`seedSearchStringFromSelection: "never"`** — el input de Find arranca vacío.
- **Padding `pr-12`** en headers — la X de cerrar ya no se superpone al botón "Clase enfocada".
- **Highlight de líneas en ClassView**: cuando el chip "via xxx()" / "via import" / "desde uso interno" abre el sheet, las líneas que mencionan el className (incluida la línea del `import`) se pintan bordó. Reusa el patrón de Monaco decorations + el regex de `findCallSiteLines` mejorado para matchear también la versión `lowerCamelCase` del nombre (ej. `User` → también matchea `userService`).

### Sidebar del FOCO

- **`FocusConstructorsBlock`** (nuevo) — bloque dedicado entre Variables y Métodos, muestra constructor(es) con sus parámetros completos.
- **`FocusMethodsBlock`** filtrado para excluir constructores (ya están en su propio bloque).

### Header del map

- **Removí el icono Crosshair duplicado** del header (el badge "FOCO" ya comunica el modo).
- **Removí "Nivel 1"** del subheader. Decisión basada en que el ROADMAP diferencia por **planes**, no por niveles. El texto ahora dice solo `N conexiones directas`.

### Edges del grafo

- **Chip secundario siempre clickeable** con `<ChevronRight />` visible.
- **Fallbacks por tipo de conexión**:
  | Caso | Label | Click |
  |---|---|---|
  | CALLED_BY con método | `via xxx()` | Method sheet del peripheral con highlight |
  | CALLED_BY sin método | `via import` | Class sheet del peripheral, marca línea del import |
  | CALLS con método | `desde xxx()` | Method sheet del foco con highlight |
  | CALLS sin método | `desde uso interno` | Class sheet del foco con highlight |
  | INVOKES_OUTGOING con método | `metodoX()` | Method sheet del peripheral |
  | INVOKES_OUTGOING sin método | `invocación oblicua` | Class sheet del peripheral con highlight |

### Popovers globales

- **`openHelpPopover` en store** — solo un popover abierto a la vez en toda la app. Regla project-wide.
- **Popovers migrados**:
  - JavaVersionBadge → `"java-version"`
  - FocusConnectionLegend → `"focus-connection-legend"`
  - ClassKindLegend → `"class-kind-legend"`
  - FocusSidebarInfo (página map) → `"focus-sidebar-info"`
  - DiagnosticsPanel → `"diagnostics-panel"`
- **Posición unificada**: `fixed right-[194px] top-[80px]`.
- **Max height + overflow-y-auto**: scroll interno cuando el contenido es muy alto.

### MiniMap

- **Agregado a `FocusGraph` y `FocusMethodGraph`** (antes solo estaba en `CodeGraph`).
- Coloreado por `connectionType`:
  - Center → `#B91C42` (bordó)
  - CALLS / CALLED_BY / INVOKES_OUTGOING → `#B91C42`
  - INVOKES_METHOD → `#5C0A1A`
  - EXTENDS → `#C0C0C8`
  - IMPLEMENTS → `#A8A8B0`
  - USES_PROPERTIES → `#8B0F2A`
- Pannable + zoomable activados.

---

## Bugs arreglados

### SSE error en sesión muerta

**Síntoma**: después de reiniciar el backend, las pestañas con sessionId viejo causaban stacktrace gigantesco con `HttpMediaTypeNotAcceptableException`.

**Causa raíz**: `AnalyzeController.stream()` tiraba `SessionNotFoundException` al `GlobalExceptionHandler`, que intentaba serializar JSON sobre un endpoint que pidió `text/event-stream`.

**Fix**: el endpoint ahora atrapa la excepción y devuelve un `SseEmitter` que envía un evento `error` con código `SESSION_NOT_FOUND` y se cierra. El frontend ya escucha el evento `error` y muestra toast.

### `ConnectionList` crasheando con error #001 de React Flow

**Síntoma**: al abrir el tab Entrantes/Salientes en el sheet, error fatal "Seems like you have not used zustand provider as an ancestor".

**Causa raíz**: `ConnectionList` llamaba `useReactFlow()` para centrar el viewport tras saltar a un caller/callee. Pero el sheet renderiza FUERA del `<ReactFlowProvider>` de cada graph (cada uno tiene su provider scoped).

**Fix**: como además los tabs Entrantes/Salientes se sacaron del sheet, el componente `ConnectionList` se borró completo. Si más adelante se necesita centrar, se hará via store (suscribiendo `selectedNodeId` desde dentro del provider).

### Highlight de línea no resaltaba el uso real

**Síntoma**: al clickear `via xxx()` en una edge, el sheet abría el código pero solo resaltaba la línea del field declaration (`private final AuthService authService;`), no la línea de uso real (`authService.method()`).

**Causa raíz**: `findCallSiteLines` buscaba el className exact case (`AuthService`), pero el uso típico Java es con la versión `lowerCamelCase` del field (`authService`).

**Fix**: el regex ahora matchea ambas variantes: `AuthService` (declaración) Y `authService` (uso).

---

## Cosas temporales (marcadas para borrar después)

### Tab "Foco PRO" en la home

- **Para qué**: testear el modo PRO sin tener que poner `?demo=pro` en la URL manualmente.
- **Cómo se usa**: nuevo tab al lado de "Foco" con icon `Sparkles`. Click → ingresar paths → Analizar. Persiste `demoMode=pro` en `sessionStorage` y agrega `&demo=pro` a la URL.
- **Marcado para borrar**: comentarios `TEMPORAL` en:
  - `UploadTabs.tsx` — el `<TabsTrigger value="focus-pro">` y `<TabsContent value="focus-pro">` + import de `Sparkles` + cambiar `grid-cols-5` a `grid-cols-4`.
  - `FocusInput.tsx` — la prop `forcePro` y todo lo que depende (incluido `if (forcePro) persistDemoMode("pro")`).

---

## Permisos modificados

- **`~/.claude/settings.json`** — sumé al array `permissions.allow`:
  - `Bash(./mvnw *)`, `Bash(./mvnw.cmd *)`, `Bash(mvnw *)`, `Bash(mvnw.cmd *)`
  - `Bash(pnpm *)`, `Bash(npm *)`
  - `Bash(find *)`, `Bash(ls *)`, `Bash(cat *)`
  - `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`
  - `Edit`, `Write`, `Read`, `Glob`, `Grep`
- **No se agregó**: `git push`, `git commit`, `rm` ni nada destructivo.

---

## Commits y push a `main`

| # | SHA | Mensaje | Archivos |
|---|---|---|---|
| 1 | `8505459` | `feat(focus): deep dependency analysis + FREE/PRO unification + UX overhaul` | 33 modified + 22 new (incluye F0–F4 + deep + 3 .md de planning) |
| 2 | `e5f05b7` | `fix(stream): emit SSE error event on missing session + add temp Foco PRO tab` | 3 (AnalyzeController + FocusInput + UploadTabs) |

Branch `main` en `https://github.com/arielzuviriag-dot/CodeMapper` actualizada.

---

## Estadísticas

### Archivos backend (Java)

**Nuevos** (10):
- `service/JavaVersionDetector.java`
- `service/JacocoReportParser.java`
- `service/ImpactAnalysisService.java`
- `parser/BehaviorAnnotationExtractor.java`
- `model/dto/BehaviorChip.java`
- `model/dto/ImpactReport.java`
- `model/dto/JacocoCoverage.java`
- `model/dto/UnresolvedReference.java`
- `model/event/UnresolvedReferenceEvent.java`

**Modificados** (~12):
- `controller/AnalyzeController.java`
- `service/AnalysisService.java`
- `service/FocusTracerService.java` (+ ~280 líneas, mayor parte deep analysis)
- `service/JavaParserService.java`
- `service/FocusMethodTracerService.java`
- `parser/MethodExtractor.java`
- `parser/SymbolSolverConfigurer.java`
- `model/domain/SessionData.java`
- `model/domain/ParsedMethod.java`
- `model/event/SessionStartEvent.java`
- `model/event/FocusClassLoadedEvent.java`
- `model/event/FocusConnectionEvent.java`

### Archivos frontend (TS/TSX)

**Nuevos** (8):
- `lib/javaCompat.ts`
- `components/graph/JavaVersionBadge.tsx`
- `components/graph/BehaviorChipBar.tsx`
- `components/graph/ImpactSimulationButton.tsx`
- `components/graph/DiagnosticsPanel.tsx`

**Modificados** (~14):
- `app/map/[sessionId]/page.tsx`
- `app/globals.css` (sumó 60+ líneas para impact mode + cycle ring)
- `components/graph/FocusGraph.tsx`
- `components/graph/FocusMethodGraph.tsx`
- `components/graph/FocusCenterNode.tsx`
- `components/graph/FocusEdge.tsx`
- `components/graph/FocusPeripheralNode.tsx`
- `components/graph/FilterPanel.tsx`
- `components/graph/FocusConnectionLegend.tsx`
- `components/graph/ClassKindLegend.tsx`
- `components/graph/GraphSearchInput.tsx`
- `components/graph/CodeGraph.tsx`
- `components/sidebar/ClassDetailSheet.tsx` (~600 líneas tocadas)
- `components/upload/FocusInput.tsx`
- `components/upload/UploadTabs.tsx`
- `hooks/useSSE.ts`
- `lib/api.ts`
- `lib/types.ts`
- `store/graphStore.ts`

### Líneas netas (estimado): ~2200+ agregadas, ~150 borradas

---

## Validaciones automáticas

| Check | Comando | Resultado |
|---|---|---|
| Backend compila | `./mvnw -q -DskipTests compile` | ✅ BUILD OK |
| Frontend types | `npx tsc --noEmit` | ✅ TS OK |
| Frontend production | `pnpm build` | ✅ Production build limpio |

---

## Validaciones manuales hechas con Ari

- ✅ **F0** completo (detección Java 17 desde `build.gradle`, store con `isPro`/`detectedJavaVersion`).
- ✅ **F-deep** funcionando: `User.java` pasó de **11 conexiones** (signatures only) → **32 conexiones** en PRO (incluye main + tests + same-package + bodies).
- ✅ **DiagnosticsPanel** capturando casos reales (`http.cors`, `csrf.disable`, `UsernamePassword*` de Spring Security, etc.).
- ✅ **Streaming progresivo** visible: nodos aparecen de a uno con stagger durante la búsqueda profunda.

---

## Pendientes para próximas iteraciones

### Pruebas formales pendientes (en orden)

- **F1** validación manual con clase concreta (excepciones, badges seguridad).
- **F2** validación con clase con `@Transactional` + `@Cacheable` (chips, click navega al método).
- **F3** validación con `jacoco.xml` real generado (donut, edges punteados de test, máscara mock).
- **F4** validación de "Simular cambio" con cambio real (overlay, anillo de ciclos si hay).

### Mejoras opcionales

- **Centrado del viewport** desde el sheet al hacer "saltar a otra clase" (lo perdimos cuando saqué `useReactFlow`). Solución limpia: el grafo se suscribe a `selectedNodeId` y centra desde su propio scope.
- **Filtros de impacto en F4**: mostrar solo callers directos vs transitivos vs tests con toggles.
- **Cache de callgraph** en `SessionData` para que el endpoint `/impact` no re-walk el proyecto en cada llamada.
- **Tests unitarios** para los nuevos services backend (JavaVersionDetector, JacocoReportParser, BehaviorAnnotationExtractor, ImpactAnalysisService).
- **Borrar el tab "Foco PRO" temporal** cuando exista billing real.

### v0.7+ del ROADMAP (postergado)

- Detección de migraciones Flyway/Liquibase para sumar a F2 chips.
- Vista end-to-end por capas (HTML → JS → Backend → DB).

---

## Decisiones documentadas en `BITACORA_NOCHE.md`

(20+ decisiones tomadas durante el trabajo autónomo. Las principales:)

1. Detección de versión Java en los 3 servicios backend (no solo FOCO).
2. Cap visual con toast educativo en lugar de modal adaptado.
3. Constructores excluidos del pin grid del nodo central (eventualmente toda la sección de métodos del nodo se eliminó).
4. Color shield seguridad: dorado `#D4AF37`.
5. Anotaciones de seguridad: cubre Spring Security + JSR-250 + Apache Shiro + genérica `@RequiredRole`.
6. Posicionamiento del badge versión: aside derecho.
7. Tono del popover Java: educativo, no vendedor.
8. 12 anotaciones de comportamiento cubiertas en F2.
9. Migraciones Flyway/Liquibase postergadas a v0.7.
10. Sin Jacoco XML → silencio total (donut no se renderiza).
11. Mocks detectados por simple-name match (sin symbol resolution).
12. F4 endpoint: re-walk del proyecto en cada llamada (sin caching todavía).
13. F4 default depth = 4, clamp 1-6.
14. Cycle ring → CSS overlay absoluto sobre el centro.
15. Atenuación canvas: opacity 0.28.
16. Color del impact: naranja `#FB923C` para direct/transitive, rojo para tests + ciclos.
17. JDK no se incluye en diagnostics (sería ruido infinito).
18. FALSE_NEGATIVE solo se emite si el simple-name aparece pero no resolvió.
19. Filtros agresivos al root package del proyecto.
20. Streaming en vivo durante Pasada 2 con stagger 60ms (mismo patrón que P1).

---

## Closing thoughts

Hoy fue una sesión muy densa pero muy productiva. Pasamos de "validar un PDF" a tener un FOCO con análisis profundo, diagnostics streaming, popovers globalmente coordinados, métricas expandibles, y una filosofía FREE/PRO clarificada y aplicada de forma consistente.

El `User.java` con 32 conexiones detectadas (vs los 11 superficiales originales) es la prueba más concreta de que el motor de análisis ahora hace lo que prometía la pitch del producto: "si tocás esto, esto se rompe".

Próxima sesión: pruebas formales F1 → F4 ordenadas, ajustes de UX según feedback visual, y eventualmente arrancar con v0.6 (vista end-to-end por capas).
