# PROGRESO — FOCO PRO testing rollout

## FASE 0 — Bootstrap testing infra

- Backend: `codemapper-backend/src/test/java/com/codemapper/focus/FocusTestFixtures.java`
  helpers reusables para armar proyectos Java sintéticos vía `Files.createTempDirectory`.
- Frontend: vitest 4.1.7 + @testing-library/react + jsdom + Playwright 1.60 (Chromium descargado).
- Configs: `vitest.config.ts` (alias `@/*`), `playwright.config.ts` (headed, slowMo 200, timeout 120s, screenshot on failure, sin webServer).
- Scripts npm: `pnpm test` (vitest) y `pnpm test:e2e` (playwright).
- Orquestador: `scripts/validate.ps1` — mata :8090/:3000, valida Reserva (>10 .java), levanta backend + frontend, corre mvn/vitest/playwright, cleanup en `finally`.
- Loop: `scripts/loop-infinito.ps1 -Point N` — sin cap, escribe iter+resultado a PROGRESO.md.
- E2E smoke: `e2e/smoke.spec.ts` (asegura que Chromium abre y `/` responde HTTP).

### Verificación FASE 0

`powershell.exe -File scripts/validate.ps1` → exit 0. Output observado:

```
[validate] Reserva OK: 292 .java
[validate] backend up :8090
[validate] frontend up :3000
[validate] mvn -q test...
[validate] pnpm test (vitest)... No test files found, exiting with code 0
[validate] pnpm test:e2e (filter='')...
  ✓  1 e2e\smoke.spec.ts:9:5 › frontend root responds (24.7s)
[validate] ALL GREEN
```

FASE 0 LISTA — pedir prompt 2/6

## PUNTO 1 — Una arista por método invocado

- Backend: `FocusTracerService` emite ahora 1 evento por `(FQN periférico, método invocado)`. Tres `repo.save(...)` en distintos call sites → 1 evento; `repo.save() + repo.delete()` → 2 eventos. Aplica a `CALLED_BY` y `CALLS`. Casos estructurales (`@Autowired` sin invocar) siguen emitiendo 1 evento con `viaMethodInTarget=null`.
- Frontend store: nueva propiedad `edgeGrouping: "method" | "class"` (default `method`) + `setEdgeGrouping`. Dedup de `addFocusConnection` se amplió a `(id, viaMethodInTarget)` para no perder métodos siblings.
- Legend: toggle "Vista: Por método / Por clase" en `FocusConnectionLegend` con `data-testid` para los dos buttons.
- Grafo: pure helper `buildFocusEdgeDescriptors` agrupa por clase. Modo `method` → N edges con `siblingIndex/Count`. Modo `class` → 1 edge con `aggregatedMethods`.
- Edge: aristas paralelas curvan con quadratic Bezier (offset perpendicular `(siblingIndex - (N-1)/2) * 28px`). Badge `+N métodos` cuando hay agrupado, con tooltip `title` listando los métodos.
- Tests:
  - JUnit `FocusTracerPerMethodTest` — 2/2 pasan (dedup por método + caso estructural).
  - vitest `FocusGraph.perMethod.test.tsx` — 4/4 pasan (grouping pure logic + legend toggle).
  - Playwright `01-focus-per-method.spec.ts` — verde end-to-end con Reserva (`AppointmentService` focus → 30+ Repository invocations). Screenshots `test-results/p1-per-method.png` + `p1-per-clase.png`.

PUNTO 1 LISTO — pedir prompt 3/6

## PUNTO 2 — Filtro direccional entra/sale

- Store: nuevo `focusDirectionFilter: "all" | "incoming" | "outgoing"` (default `"all"`) + `setFocusDirectionFilter`. Reset por sesión.
- Taxonomía centralizada en `src/components/graph/focusDirection.ts`:
  - incoming = `CALLED_BY` ∪ `INVOKES_METHOD` ∪ `EXTENDS` ∪ `IMPLEMENTS`
  - outgoing = `CALLS` ∪ `INVOKES_OUTGOING` ∪ `USES_PROPERTIES`
- Componente `FocusDirectionFilter.tsx`: segmented control `[Todo] [← Entra] [Sale →]` con `ArrowLeftToLine`/`ArrowRightFromLine`, ubicado al lado de `ImpactSimulationButton` (top-left del grafo).
- `FocusGraph.tsx` aplica el filtro como intersección con `classTypeFilters`, `focusConnectionTypeFilters` y `showTests`.
- `FocusPeripheralNode` expone `data-testid`, `data-connection-type` y `data-direction` para tests E2E estables.
- Tests:
  - vitest `graphStore.directionFilter.test.ts` (3): setter + intersección con classTypeFilters + tabla de mapeo.
  - vitest `FocusDirectionFilter.test.tsx` (4): default Todo, filtro entrante, filtro saliente, vuelta a Todo.
  - Playwright `02-focus-direction.spec.ts` end-to-end (1.3m) contra Reserva (focus `AppointmentService`) — assert peripherals incoming/outgoing por `data-direction`. Screenshots `p2-all.png`, `p2-incoming.png`, `p2-outgoing.png`.

PUNTO 2 LISTO — pedir prompt 4/6

## PUNTO 3 — Tipo de relación: invocación / instanciación / inyección / declaración

- Backend `FocusConnectionEvent.referenceKind: String` — uno de `INVOCATION` / `INSTANTIATION` / `INJECTION` / `DECLARATION`. Null para EXTENDS / IMPLEMENTS / USES_PROPERTIES.
- `FocusTracerService.detectReferenceKind` aplica ranking INVOCATION > INSTANTIATION > INJECTION > DECLARATION, con override: si el caller declara un campo con `@Mock` / `@MockBean` / `@SpyBean` / `@InjectMocks` cuyo tipo es el foco, gana INJECTION (las llamadas `when()/verify()` son orquestación, no acoplamiento real).
- Sets centralizados: `DI_ANNOTATION_NAMES = {Autowired, Inject, Resource, PersistenceContext}`, mock annotations reutilizan `MOCK_ANNOTATION_NAMES`.
- Frontend `FocusConnectionPayload.referenceKind` + propagación a `FocusEdge` data.
- `ReferenceKindIcon` exportado: badge con icono lucide (Zap/Plus/Plug/Box) + `title` español. Tooltips: "Invoca métodos", "Crea instancias", "Inyección sin invocación", "Solo declaración de tipo".
- Tests verdes:
  - JUnit `FocusTracerReferenceKindTest` (6): 4 fixtures por kind + INVOCATION supera a INJECTION + INSTANTIATION supera a INJECTION.
  - vitest `FocusEdge.referenceKind.test.tsx` (5): icon+tooltip por kind + null + cobertura del map.
  - Playwright `03-focus-reference-kind.spec.ts` (1m) contra Reserva: FOCO `JwtService` → AuthService (productivo) emite Zap, AuthServiceTest (`@Mock JwtService`) emite Plug. Screenshot `p3-reference-kinds.png`.

PUNTO 3 LISTO — pedir prompt 5/6
