# PROGRESO CodeMapper FOCO PRO

5 mejoras a FOCO PRO de CodeMapper. Backend Spring Boot 3.5 + JavaParser :8090. Frontend Next.js 15 + React Flow + zustand :3000. Tests: JUnit + vitest + Playwright (headed, slowMo 200) contra `C:/Users/ariel/Reserva/backend-reserva` (read-only).

## Tabla de puntos

| Punto | Estado | Commit  | Iteraciones | Screenshots                                     |
|-------|--------|---------|-------------|-------------------------------------------------|
| 1     | ✓      | 55c7ad2 | 1           | p1-per-method.png, p1-per-clase.png             |
| 2     | ✓      | e71833d | 1           | p2-all.png, p2-incoming.png, p2-outgoing.png    |
| 3     | ✓      | c87c81f | 1           | p3-reference-kinds.png                          |
| 4     | ✓      | 2175b62 | 1           | p4-expanded.png, p4-collapsed.png               |
| 5     | ✓      | 0402e4a | 5           | p5-bidirectional.png                            |

Screenshots viven en `codemapper-frontend/test-results/`. La columna "Iteraciones" cuenta corridas de `validate.ps1 -TestFilter 0N-` que ese punto requirió para llegar a verde end-to-end.

## Output validate.ps1

Corrida final, sin filtro (`pwsh -File scripts/validate.ps1`), todas las suites:

```
[validate] killing :8090 / :3000 listeners...
[validate] Reserva OK: 292 .java
[validate] starting backend (mvn spring-boot:run)...
[validate] backend up :8090 (pid 18724)
[validate] starting frontend (pnpm dev)...
[validate] frontend up :3000 (pid 18052)
[validate] mvn -q test...
[validate] pnpm test (vitest)...
 Test Files  6 passed (6)
      Tests  28 passed (28)
[validate] pnpm test:e2e (filter='')...
  ✓ 1 e2e\01-focus-per-method.spec.ts:21:7 › 01-focus-per-method (1.1m)
  ✓ 2 e2e\02-focus-direction.spec.ts:15:7 › 02-focus-direction (49.5s)
  ✓ 3 e2e\03-focus-reference-kind.spec.ts:22:7 › 03-focus-reference-kind (36.0s)
  ✓ 4 e2e\04-focus-expand.spec.ts:15:7 › 04-focus-expand PRO (1.3m)
  ✓ 5 e2e\04-focus-expand.spec.ts:79:7 › 04-focus-expand FREE (39.2s)
  ✓ 6 e2e\05-focus-bidirectional.spec.ts:57:7 › 05-focus-bidirectional (9.9s)
  ✓ 7 e2e\smoke.spec.ts:9:5 › frontend root responds (3.0s)
  7 passed (4.8m)
[validate] ALL GREEN
[validate] cleanup...
```

Backend `mvn -q test` corrió 13 tests JUnit (FocusTracerPerMethodTest 2 + FocusTracerReferenceKindTest 6 + FocusExpandControllerTest 4 + FocusTracerBidirectionalTest 1, más el existente DiagnosticsPdfSmokeTest que Surefire lista pero no contiene @Test).

Totales:
- JUnit: 13/13 verde
- vitest: 28/28 verde (6 archivos)
- Playwright: 7/7 verde (5 specs de puntos + 1 sub-test de P4 FREE + 1 smoke de fase 0)
- Exit code: 0
- Duración E2E: 4.8 min

## Decisiones técnicas

### Punto 1 — Una arista por método invocado
- Backend `FocusTracerService.findInvokedMethods()` dedupea por método invocado en el peripheral; `emitConnections()` se quedó como helper que ahora emite N eventos por una sola `PendingConnection`. Cuando JavaParser no logra resolver ninguna llamada al focus, cae al heurístico viejo (`findViaMethod`) y emite 1 evento con `viaMethodInTarget=null` — preserva el caso `@Autowired sin invocar`.
- Frontend extrajo `buildFocusEdgeDescriptors` a un módulo puro (`focusGraphGrouping.ts`) para que los tests no necesiten ReactFlow context. Modo `method` emite N descriptores con `siblingIndex`/`siblingCount`; modo `class` colapsa con `aggregatedMethods` + badge `+N métodos`.
- Aristas paralelas curvan con quadratic Bezier — offset perpendicular `(siblingIndex - (N-1)/2) × 28px`. Sin esto, save() y delete() se pisaban visualmente. `vitest.config.ts` ganó `@vitejs/plugin-react` para soportar JSX en los tests.

### Punto 2 — Filtro direccional Entra/Sale
- Taxonomía centralizada en `focusDirection.ts`: incoming = `CALLED_BY ∪ INVOKES_METHOD ∪ EXTENDS ∪ IMPLEMENTS`; outgoing = `CALLS ∪ INVOKES_OUTGOING ∪ USES_PROPERTIES`. `passesDirectionFilter` queda como predicado único compartido entre grafo y tests.
- El filtro se aplica como INTERSECCIÓN con `classTypeFilters`, `focusConnectionTypeFilters` y `showTests` — ninguno sobrescribe al otro. Eso pisa el bug del test de regresión: si oculto interfaces Y pongo incoming, los IMPLEMENTS de interfaces siguen ocultos.
- `FocusPeripheralNode` expone `data-testid="focus-peripheral"` + `data-direction` + `data-connection-type` para que el E2E asserte sin depender del SVG.

### Punto 3 — Tipo de relación (Invocación / Instanciación / Inyección / Declaración)
- Ranking en `detectReferenceKind`: INVOCATION > INSTANTIATION > INJECTION > DECLARATION. Resolución best-effort con fallback a simple-name cuando el SymbolSolver falla — los fixtures sintéticos no traen Spring en el classpath del solver.
- Override clave: campos anotados `@Mock`/`@MockBean`/`@SpyBean`/`@InjectMocks` del tipo del foco fuerzan **INJECTION** antes del check de INVOCATION. La razón: `when(mock.foo()).thenReturn(...)` es orquestación de stub, no acoplamiento productivo. Sin este override el E2E de Reserva fallaría — `AuthServiceTest` aparecería como INVOCATION porque su body sí llama métodos del mock.
- Icons lucide (Zap/Plus/Plug/Box) con tooltip nativo via `title` en español. `ReferenceKindIcon` se exporta standalone para que vitest pueda montarlo sin ReactFlow.

### Punto 4 — Expansión depth-2 bajo demanda (PRO only)
- Backend `POST /api/analyze/focus/{sessionId}/expand`: reusa `FocusTracerService` con la periférica como sub-foco transient. La sesión hija va `pro=true` para no aplicar el cap FREE durante la expansión, pero se descarta al final (no se persiste). Filtra FQNs ya presentes en `parent.parsedClasses` antes de devolver.
- `ProRequiredException` + handler nuevo → 403 con `message: "Función disponible en PRO"`. Encaja con el toast del interceptor de axios sin tocar la UX.
- **Layout sub-arco**: para no rebalancear el ring depth-1 al expandir (preserva el mapa mental del dev), las depth-2 caen en un arco de 60° centrado en la dirección radial outward del padre. Distancia `PERIPHERAL_W × 1.3` desde el padre. La geometría depth-1 queda CONGELADA — `groupIndex` calculado antes de procesar depth-2 garantiza que el ángulo del padre no se mueve.
- Edge depth=2: strokeWidth × 0.7, opacity × 0.7. La opacidad final clampa al 0.7 del valor que de otra forma daría la animación, así el ring primary queda visualmente dominante incluso después de expandir 3 periféricos.

### Punto 5 — Aristas bidireccionales con curva
- **Caso bidi**: fixture sintética CircularA ↔ CircularB armada en `os.tmpdir()` por `test.beforeAll`. No se encontró bidi natural en Reserva — el proyecto es estricta capas (controller → service → repository, sin back-references). El fixture queda en una carpeta temporal con `mkdtempSync` y se limpia con `rmSync` en `afterAll`, sin tocar Reserva.
- **Mayor change del punto**: el backend `FocusTracerService` pass-1 dejó de ser mutually-exclusive. Antes la cadena `if extends else if implements else if calledBy else if calls` clasificaba una sola dirección. Ahora se evalúan los cuatro chequeos y se agrega una `PendingConnection` por cada match. Eso permite que la misma periférica emita CALLED_BY + CALLS en el mismo trace, alimentando la curvatura del frontend.
- Frontend `buildFocusEdgeDescriptors` ahora splittea cada grupo por dirección. Si ambas subgrupos no vacías → `curvature=+1` para outgoing, `-1` para incoming, `bidirectional=true`. FocusEdge compone esto con el `siblingPerp` de P1 — la suma da el desplazamiento perpendicular total y dispara la rama de quadratic Bezier (`M…Q…`).
- **Iteraciones**: tomó 5 corridas de loop. (1) backend solo emitía una dirección; (2) emitía las dos pero el regex `parseQ` del test no aceptaba notación científica `e-15` que ReactFlow emite en coordenadas near-zero — los paths sí salían bowed, pero el cross-product check los descartaba. Arreglado el regex y verde a la primera corrida siguiente.
- Dev convenience: `useGraphStore` se expone como `window.__cmStore` para que el test pueda diagnosticar el estado desde Playwright sin construir un harness paralelo. SSR-safe (no-op en node).

### Workarounds creativos / lessons

- **Playwright + SVG visibility**: `toBeVisible()` falla en `<path>` de ReactFlow porque computa `visibility:hidden` mientras la edge-layer hidrata. Reemplazado por `waitFor({ state: 'attached' })` + `waitForTimeout` para dejar que la animación wall-clock se asiente. Vale notar para futuros tests de edges.
- **Notación científica en SVG paths**: coordenadas cercanas a cero (1e-15) salen del `Number.toString()` del browser. Cualquier regex que parsee SVG `d` debe incluir `[eE][-+]?\d+` en sus números.
- **FocusEdgeData en P1 → P5**: agregué `siblingIndex/Count`, después `aggregatedMethods`, `referenceKind`, `depth`, `curvature`, `bidirectional` — cada punto extendió la misma estructura sin romper retrocompatibilidad porque todos los campos son opcionales. La extracción de la grouping logic a un helper puro fue clave para que vitest pueda probar la lógica de cada punto sin meter ReactFlow en jsdom.
- **JUnit + temp fixtures**: `FocusTestFixtures` armado en fase 0 fue suficiente para los 4 escenarios distintos (per-method, reference-kind, expand controller, bidi backend). Cada test crea su propio proyecto, lo borra en `@AfterEach`, y nunca toca Reserva.

## Verificación visual humana

Validate.ps1 ALL GREEN sin filtro. Browser Chromium VISIBLE durante las 5+ specs E2E (cada una abrió Chromium, navegó a `http://localhost:3000?demo=pro`, ejecutó las interacciones con slowMo:200, dejó los screenshots PNG en `test-results/`).

Los 5 hitos visuales verificados por los E2E:

- ✓ Punto 1: aristas con nombres de método distintos sobre la línea — verificado por `01-focus-per-method.spec.ts` (assertion `distinct.size ≥ 2`).
- ✓ Punto 2: control [Todo][←Entra][Sale→] visible y funcional — verificado por `02-focus-direction.spec.ts` con los 3 estados + restore.
- ✓ Punto 3: iconos Zap/Plus/Plug/Box con tooltips ES — verificado por `03-focus-reference-kind.spec.ts` (`title` attr matching "Invoca métodos" / "Inyección sin invocación").
- ✓ Punto 4: botón "+ Expandir" en PRO, nodos depth-2 con menor opacidad — verificado por `04-focus-expand.spec.ts` PRO+FREE.
- ✓ Punto 5: pares bidi con 2 curvas separadas (no líneas superpuestas) — verificado por `05-focus-bidirectional.spec.ts` (2 paths con Q + cross-product de signos opuestos).

PROYECTO COMPLETO — 5/5 puntos verdes, listo para review humana
