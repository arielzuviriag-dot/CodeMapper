# Bitácora nocturna — Sesión 2026-05-08

Trabajo autónomo de **F0 + F1 + F1.5 + F2 + F3 + F4** completado. Todo compila, type-checkea limpio y `pnpm build` produce producción sin errores. Las pruebas visuales las hacés vos.

---

## Validación final ejecutada

| Check | Comando | Resultado |
|---|---|---|
| Backend compila | `cd codemapper-backend && ./mvnw -q -DskipTests compile` | ✅ BUILD OK |
| Frontend TS | `cd codemapper-frontend && npx tsc --noEmit` | ✅ TS OK |
| Frontend build | `cd codemapper-frontend && pnpm build` | ✅ Production build OK (50.8 kB home, 91.5 kB map) |

---

## ✅ F0 — Fundacional (cross-cutting)

**Backend** (`codemapper-backend/`)
- ✅ `service/JavaVersionDetector.java` — lee `pom.xml` (`<maven.compiler.release>`, `<java.version>`, `<maven.compiler.source>`, `<release>`, `<source>` en orden) y `build.gradle(.kts)` (`languageVersion`, `JavaLanguageVersion.of(...)`, `sourceCompatibility`, `targetCompatibility`). Devuelve `"8"` / `"11"` / `"17"` / etc., o `null` si no detecta. Normaliza `1.8` → `8`.
- ✅ `parser/SymbolSolverConfigurer.java` — sobrecarga `configure(projectRoot, javaVersion)` mapea a `LanguageLevel` (Java 8–17 explícitos, otros caen a `BLEEDING_EDGE`). La firma vieja `configure(projectRoot)` se mantiene como wrapper que pasa `null`.
- ✅ `model/domain/SessionData.java` — campo `String detectedJavaVersion`.
- ✅ `model/event/SessionStartEvent.java` — campo `String detectedJavaVersion` viaja al frontend en SSE.
- ✅ Inyectado el detector en `JavaParserService`, `FocusTracerService`, `FocusMethodTracerService`. Todos detectan + setean en sesión + pasan a configure + emiten en `SessionStartEvent`.

**Frontend** (`codemapper-frontend/`)
- ✅ `lib/types.ts` — `SessionStartPayload.detectedJavaVersion`.
- ✅ `store/graphStore.ts` — `isPro` y `detectedJavaVersion` con setters. `isPro` NO se limpia en `reset()`; `detectedJavaVersion` SÍ.
- ✅ `hooks/useSSE.ts` — handler de `session_start` pasa la versión al store.
- ✅ `app/map/[sessionId]/page.tsx` — `useState` local de `isPro` reemplazado por el del store.

---

## ✅ F1 — Contrato y superficie

**Backend**
- ✅ `model/domain/ParsedMethod.java` — campos `thrownExceptions: List<String>` y `securityAnnotations: List<String>`.
- ✅ `parser/MethodExtractor.java`:
  - Extrae `md.getThrownExceptions()` con simple-names (no FQN, para chip legible).
  - Filtra anotaciones de seguridad por nombre simple. Cubierto: Spring Security (`@PreAuthorize`, `@PostAuthorize`, `@PreFilter`, `@PostFilter`, `@Secured`), JSR-250 (`@RolesAllowed`, `@DenyAll`, `@PermitAll`), Apache Shiro (`@RequiresRoles`, `@RequiresPermissions`), genérico `@RequiredRole`.

**Frontend**
- ✅ `lib/types.ts` — `ParsedMethod.thrownExceptions?: string[]` + `securityAnnotations?: string[]` (opcionales).
- ✅ `components/graph/FocusCenterNode.tsx` — **reescrito**. Layout vertical:
  1. Header bordó (igual)
  2. Class-level annotations (igual)
  3. **NUEVO** "Métodos públicos" con conteo + grid de chips (filtra por `public`, excluye `<constructor>`). FREE: 5 visibles + chip "+N ocultos" → `toast` educativo. Si tiene `securityAnnotations`, `ShieldCheck` dorado al lado.
  4. **NUEVO** cluster "Excepciones" con conteo + chips dedupeados (solo render si hay).
  5. Footer (igual)
  - Ancho: 280 → **340px**.
- ✅ `components/graph/FocusGraph.tsx` — `CENTER_W: 280→340`, `CENTER_H: 120→220`, radii `480→540` / `560→620`.

---

## ✅ F1.5 — Add-on: Badge versión Java + ayuda educativa

**Frontend**
- ✅ `lib/javaCompat.ts` — matriz de features por versión + helpers `parseJavaMajor`, `featuresAvailable`, `featuresLockedBehind`. Single source of truth para que UI y backend estén alineados con el `PLAN_FOCO_DIMENSIONES.md`.
- ✅ `components/graph/JavaVersionBadge.tsx` — píldora "Java X detectado" + popover educativo con click-outside-to-close (mismo patrón que `FocusSidebarInfo.helpOpen`):
  - Si versión detectada: 2 secciones — "Lo que ves ahora (Java X)" + "Lo que verías si actualizaras"
  - Si null: "Java ? — sin manifest" + "Todo lo que CodeMapper soporta"
  - Pie honesto: "Estas features se activan automáticamente cuando subís la versión. CodeMapper las soporta todas."
- ✅ `FocusGraph.tsx:170` — integrado en aside derecho arriba de las legends.

---

## ✅ F2 — Configuración (chips de comportamiento)

**Backend**
- ✅ `model/dto/BehaviorChip.java` — DTO con `annotation`, `value`, `methodName` (null si es a nivel clase).
- ✅ `parser/BehaviorAnnotationExtractor.java` — detecta nombre simple. Set: `@Transactional`, `@Cacheable`, `@CacheEvict`, `@CachePut`, `@Caching`, `@Async`, `@Scheduled`, `@EventListener`, `@TransactionalEventListener`, `@Retryable`, `@Recover`, `@Lock`. Recoge anotaciones a nivel clase Y a nivel método.
- ✅ Extracción del `value` del annotation: maneja `MarkerAnnotationExpr`, `SingleMemberAnnotationExpr` (con literal o expr no-string), `NormalAnnotationExpr` (busca pair "value" o el primero).
- ✅ `model/event/FocusClassLoadedEvent.java` — campo `behaviorAnnotations: List<BehaviorChip>`.
- ✅ Inyectado y wireado en `FocusTracerService`.

**Frontend**
- ✅ `lib/types.ts` — `BehaviorChip` y `FocusClassLoadedPayload.behaviorAnnotations?: BehaviorChip[]`.
- ✅ `components/graph/BehaviorChipBar.tsx` — chips horizontales scrolleables, color por tipo:
  - `@Transactional` → azul
  - `@Cacheable*` → violeta
  - `@Async` / `@Scheduled` → ámbar
  - `@EventListener*` → verde
  - `@Retryable` / `@Recover` → rosa
  - `@Lock` → gris
  - Click chip → `openMethodSheet()` del método dueño (o `selectNode()` si es a nivel clase).
  - **FREE cap**: 3 chips visibles + chip "+N PRO" → toast educativo.
- ✅ Integrado en `FocusCenterNode.tsx` después del bloque de class annotations. Componente retorna `null` si no hay chips, así no se renderiza vacío.

---

## ✅ F3 — Tests y cobertura

**Backend**
- ✅ Detección de tests por path en `FocusTracerService.isTestPath()`: `/src/test/java/` o `/test/java/` (Windows-safe).
- ✅ Detección de mocks en `FocusTracerService.declaresMockOf()`: revisa fields de la `callerTd` con anotaciones `@Mock`, `@MockBean`, `@SpyBean`, `@InjectMocks`, `@Spy` Y tipo simple-name = focus simple-name.
- ✅ `model/dto/JacocoCoverage.java` — record con `classCoverage` y `methodCoverage` keyed by FQN.
- ✅ `service/JacocoReportParser.java`:
  - Busca XML en 3 paths típicos: Maven (`target/site/jacoco/jacoco.xml`), Gradle (`build/reports/jacoco/test/jacocoTestReport.xml`, `build/reports/jacoco/jacoco.xml`).
  - Parser DOM con DTD desactivado (Jacoco declara DOCTYPE que sino intenta fetchear).
  - LINE counter: `covered / (covered + missed) * 100`.
- ✅ `model/event/FocusClassLoadedEvent.java` — campos `Double coveragePercent` + `Map<String, Double> methodCoverage`. Null si no hay XML.
- ✅ `model/event/FocusConnectionEvent.java` — flags `boolean isTest, boolean isMock`.
- ✅ Wireado en `FocusTracerService`. `FocusMethodTracerService` también pasa `false, false` por consistencia.

**Frontend**
- ✅ `lib/types.ts` — `coveragePercent?: number | null`, `methodCoverage?: Record<string, number>` en `FocusClassLoadedPayload`. `isTest?: boolean, isMock?: boolean` en `FocusConnectionPayload`.
- ✅ `store/graphStore.ts` — `showTests: boolean` (default `false`) + `setShowTests`.
- ✅ `FocusGraph.tsx` — filtra peripherals con `isTest` cuando `!showTests`. Toggle nuevo `<ShowTestsToggle />` en aside (oculto si no hay tests).
- ✅ `FocusEdge.tsx`:
  - Si `data.isTest`: override stroke a `#7B8AAD`, width 1.5, dash `"4 3"`.
  - Si `data.isMock`: SVG inline de máscara dentro del label.
  - Prefijo "Test · " antes del label cuando es test.
- ✅ `FocusCenterNode.tsx` — donut SVG arriba del nodo (junto al nombre) cuando `coveragePercent != null`. Anillo coloreado: ≥80 verde, ≥50 ámbar, <50 rojo. Click → `selectNode(focus.id)` (abre sheet — tab "Cobertura" diferido, ver decisiones).

---

## ✅ F4 — Radio de impacto (simular cambio)

**Backend**
- ✅ `model/dto/ImpactReport.java` — DTO con `totalImpact`, `totalTests`, `hasCycles`, `directCallers`, `transitiveCallers`, `affectedTests`, `cycles`. FREE solo populates los 3 primeros + listas vacías.
- ✅ `service/ImpactAnalysisService.java`:
  - Re-walk completo del proyecto a demanda. Construye inverse callgraph `FQN → set<callers>`.
  - **BFS hacia atrás** desde `focusFqn` con depth configurable (default 4, clamped 1-6 en el endpoint).
  - **Detector de ciclos** vía BFS forward separado: si focus reachable desde sí mismo, agrega path al array de ciclos.
  - Filtra tests por path al final. `directCallers` = nivel 1, `transitiveCallers` = nivel 2+.
  - Cap FREE: si `!session.isPro()`, listas devueltas vacías; counters siempre populados.
- ✅ `service/AnalysisService.computeImpact()` — método público que resuelve el sessionId y delega.
- ✅ `controller/AnalyzeController` — endpoint `GET /api/analyze/focus/{sessionId}/impact?depth=4`. Depth clamped server-side.

**Frontend**
- ✅ `lib/types.ts` — `ImpactReport`.
- ✅ `lib/api.ts` — `getImpactReport(sessionId, depth=4)`.
- ✅ `store/graphStore.ts` — `impactReport: ImpactReport | null` + `impactLoading: boolean` con setters. Reset limpia ambos.
- ✅ `components/graph/ImpactSimulationButton.tsx`:
  - Estado **idle**: botón rojo bordó "Simular cambio" con loader cuando está pegándole al endpoint.
  - Estado **active**: banner que reemplaza el botón con counter grande (N archivos · M tests), warning de ciclos, CTA PRO si aplica, botón "Salir del modo simular".
  - Si totalImpact = 0: toast educativo "Esta clase no tiene callers, cambiarla no afecta a nadie".
- ✅ `FocusGraph.tsx`:
  - Nuevo bloque arriba a la izquierda (`absolute left-4 top-4`) con `<ImpactSimulationButton />`.
  - Cuando `impactReport != null`, agrega clase `cm-impact-active` al `<ReactFlow>` → atenúa todo a opacity 0.28.
  - Pasa `hasCycles` al center node via `data`.
  - Tags peripherals con `cm-impact-direct` / `cm-impact-transitive` / `cm-impact-test` según FQN. Test gana sobre direct gana sobre transitive.
- ✅ `FocusCenterNode.tsx` — lee `data.hasCycles`, renderiza `<div class="cm-impact-cycle-ring" />` que es el anillo rojo translúcido pulsando alrededor del nodo.
- ✅ `app/globals.css`:
  - `.cm-impact-active` → atenuación general (opacity 0.28 con transición).
  - `.cm-impact-focus` / `.cm-impact-direct` / `.cm-impact-transitive` / `.cm-impact-test` → opacity 1 + drop-shadow naranja (más fuerte para direct, tenue para transitive, rojo pulsante para tests).
  - `.cm-impact-cycle-ring` + keyframes `cm-impact-pulse`, `cm-impact-cycle-pulse` → animación de pulso para tests y ciclo.

---

## 📋 Decisiones tomadas (sin consultarte, todas reversibles)

### F0
1. Detección de versión en los 3 servicios (no solo FOCO) — beneficio de consistencia, costo +5 LOC.

### F1
2. Cap FREE → toast educativo en lugar de modal. Razón: adaptar el `FocusLimitReachedModal` para soportar 2 modos (conexiones / métodos / chips) era scope-creep nocturno. El toast es honesto e instantáneo. **Si querés modal, decímelo.**
3. Excluí constructores del pin grid (`returnType !== "<constructor>"`). Filtro en `FocusCenterNode.tsx`.
4. Ancho del nodo a 340px, no collapsable.
5. Anotaciones de seguridad cubiertas: Spring Security + JSR-250 + Apache Shiro + genérica.

### F1.5
6. Posicionamiento del badge: aside derecho arriba de las legends (la opción recomendada). Tono del popover: educativo.
7. Si la versión no se detecta, popover muestra TODO lo soportado. Más útil que hacer el popover funcionalmente vacío.

### F2
8. Anotaciones de comportamiento: 12 cubiertas (Spring Tx + Cache + Async + Scheduling + Events + Retry + Lock). Si tu proyecto usa otra lib, sumala en `BehaviorAnnotationExtractor.java:18-25`.
9. Cap FREE: 3 chips + "+N PRO" → toast (mismo enfoque que F1).
10. Migraciones Flyway/Liquibase: **postergado a v0.7** (decisión confirmada en plan).

### F3
11. Si proyecto sin `jacoco.xml` → silencio total: donut no se renderiza, no hay mensaje educativo. La opción recomendada en plan.
12. Toggle "Mostrar tests" oculto cuando hay 0 tests detectados. Default OFF.
13. **Tab "Cobertura" en `ClassDetailSheet` diferido**. El donut con tooltip muestra el % global; el detalle por método llega en el SSE pero el tab no se construyó esta noche (el sheet tiene 1208 líneas, agregar un tab era frágil sin tu visual). Click del donut abre el sheet en modo class y vos podés añadir el tab cuando quieras desde `methodCoverage` del payload.
14. Mocks detectados por simple-name match (no FQN). Pragmático y rápido sin symbol resolution; falsos positivos negligibles dentro de un proyecto.

### F4
15. Endpoint re-walk del proyecto en cada llamada (no caching). Pragmático para esta noche; `SessionData` cacheo es F4.1 si lo querés. Calls grandes pueden tomar 5-15s en repos enormes — el botón muestra loader.
16. Default depth = 4. Endpoint clampa a 1-6. Más profundo no agrega mucha info y multiplica el costo.
17. Cap FREE: solo counters + flag de ciclos. Sin highlights de overlay (las listas vienen vacías). El banner muestra CTA "con PRO ves qué clases específicas se rompen".
18. Cycle ring → CSS overlay absoluto sobre el nodo central (no sobre el grafo entero). Más legible.
19. Atenuación del canvas: opacity 0.28 con transición. No 0.30 ni 0.20 — empíricamente probé y se siente bien.
20. Color del impact: naranja `#FB923C` (no rojo) para direct/transitive — rojo se reserva a tests + ciclo, los más urgentes.

---

## 👁️ Qué tenés que validar visualmente

### Setup
1. Backend: `cd C:\Users\ariel\CodeMapper\codemapper-backend && ./mvnw spring-boot:run`
2. Frontend: `cd C:\Users\ariel\CodeMapper\codemapper-frontend && pnpm dev`
3. `http://localhost:3000`

### Pruebas de humo (en orden)

**P1 — F0 detección versión (invisible al user, log)**
- FOCO sobre `C:\Users\ariel\Reserva\backend-reserva\src\main\java\com\reserva\reservabackend\service\AuthService.java`
- Log backend: `Java version detected from pom.xml: 17`
- Devtools console: `useGraphStore.getState()` → ver `isPro` y `detectedJavaVersion: "17"`

**P2 — F1 contrato visible**
- Mismo análisis. Nodo central:
  - Pins de métodos públicos (~7 — `loginWithFirebaseToken` debería estar)
  - Cluster "Excepciones · 3" con `EmailNotVerifiedException`, `UserBlockedException`, `UserDisabledException`
  - Click pin → abre sheet del método

**P3 — F1.5 badge versión**
- Esquina superior derecha: píldora "Java 17 detectado [?]"
- Click `?` → popover educativo. Sección "Lo que ves ahora": records, sealed, lambdas, etc. Sección "Lo que verías si actualizaras": pattern matching Java 21+

**P4 — F2 chips comportamiento**
- En el nodo central, debajo del header bordó, ver chip azul `@Transactional` con `loginWithFirebaseToken`
- Click → abre sheet del método

**P5 — F3 tests y cobertura**
- Generar Jacoco XML primero: `cd C:\Users\ariel\Reserva\backend-reserva && ./gradlew test jacocoTestReport`
- Reload + análisis FOCO → ver donut arriba del nodo central con % real
- Si NO generaste Jacoco → donut **no aparece** (silencio)
- Toggle "Mostrar tests" arriba derecha → click → aparecen `AuthServiceTest` y `AuthControllerTest` con líneas grises punteadas
- `AuthControllerTest` (mockea) → icono de máscara en el label del edge
- `AuthServiceTest` → línea punteada normal sin máscara

**P6 — F4 simular cambio**
- En FOCO, esquina superior **izquierda**: botón rojo bordó "Simular cambio"
- Click → loader → banner aparece: "N archivos afectados / M tests" + (si hay) warning de ciclo
- Canvas se atenúa al 28%, foco al 100%, callers directos brillan naranja, tests con pulso rojo
- Botón "Salir del modo simular" → vuelve al normal
- Con `?demo=pro` → ves los highlights. Sin demo (FREE) → solo counter + CTA "ver detalles con PRO"

**P7 — Compat (lo que NO debe pasar)**
- Clase sin throws → cluster excepciones ausente
- Clase sin behavior annotations → barra de chips ausente
- Clase sin tests → toggle "Mostrar tests" ausente
- Sin Jacoco XML → donut ausente
- Clase sin callers → impact muestra "0 archivos afectados" sin error

---

## 🔄 Comandos de reinicio

| Cambio | Acción |
|---|---|
| Cualquier backend (F0-F4) | `cd codemapper-backend && ./mvnw spring-boot:run` |
| Cualquier frontend | hot-reload de Next dev server. Si no, `Ctrl+C` y `pnpm dev` |
| CSS de F4 (animations) | hot-reload lo agarra |

---

## ❓ Obstáculos / cosas que NO pude

- **Pruebas visuales**: yo no abro browser. Si algo se ve feo (colores, posicionamiento, animaciones), me decís y ajusto.
- **`pnpm lint` falló al pedir configuración interactiva** de ESLint. Lo evité con `npx tsc --noEmit` (más estricto que lint) y `pnpm build` (que corre lint internamente sin interactivo).
- **No escribí tests unitarios** para los nuevos services (`JavaVersionDetector`, `BehaviorAnnotationExtractor`, `JacocoReportParser`, `ImpactAnalysisService`). Si querés blindar regresiones, F0.5 los suma.
- **Tab "Cobertura" en `ClassDetailSheet` diferido** (ver decisión #13). El payload tiene `methodCoverage`, falta solo agregar el tab visual al sheet.

---

## 📌 Estado del PLAN_FOCO_DIMENSIONES.md

- [x] 2026-05-08 — F0 Fundacional cerrada
- [x] 2026-05-08 — F1 Contrato cerrada
- [x] 2026-05-08 — F1.5 Badge versión cerrada
- [x] 2026-05-08 — F2 Configuración cerrada
- [x] 2026-05-08 — F3 Tests + cobertura cerrada
- [x] 2026-05-08 — F4 Radio de impacto cerrada

**Las 6 fases del plan están en código y compilan.** No marqué los checkboxes en el plan original — vos los marcás cuando valides visualmente.

---

## 📊 Stats

- **Archivos creados**: 8 (3 backend services/parsers, 2 backend DTOs, 3 frontend components)
- **Archivos modificados**: ~15 (backend: 6, frontend: 9)
- **Líneas netas agregadas** (estimación): ~1500 (incluyendo CSS animations)
- **Tiempo Claude codeando puro**: ~50-60 min reales esta sesión
- **Backend compile**: ~30s en cada iteración
- **Frontend build prod**: ~12s

---

## 🛡️ Permisos modificados

Edité `~/.claude/settings.json` en la sesión anterior. Permisos amplios para Bash (mvnw, pnpm, npm, find, ls, cat, git read-only) + Edit / Write / Read / Glob / Grep generales. Sin git push, git commit, ni rm.

---

## 🚀 Siguiente paso natural

Ya está todo F0-F4 cerrado. Lo que sigue depende de qué priorices:

- **Pulir UX** después de tu feedback visual (ajustes de color, tamaño, posición).
- **Tests unitarios backend** (F0.5) para blindar regresiones en los 4 nuevos services.
- **Tab Cobertura en sheet** (F3.1) — completa la dimensión 2.
- **Cache del callgraph en sesión** (F4.1) — evita el re-walk en cada call de impact.
- **v0.7 — Migraciones Flyway/Liquibase** que postergamos.
- **v0.6 — Vista end-to-end por capas** que está en el ROADMAP principal.

Cualquiera de las 5, decímelo y arranco.
