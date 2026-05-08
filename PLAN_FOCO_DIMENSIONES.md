# Plan de trabajo — 4 dimensiones FOCO

Plan derivado de la sesión 2026-05-08. Documento vivo: marcar checkboxes a medida que avanza cada tarea. Cualquier cambio de scope se actualiza acá, no en mensajes sueltos.

---

## Contexto y decisiones tomadas

- **Interior del Java en foco** (métodos, fields, anotaciones, excepciones, properties que lee): **SIEMPRE completo**, en FREE y PRO. Es info que ya está en el AST del nodo central, mostrar todo es gratis y le da valor real al dev.
- **Conexiones externas** (callers, callees, tests, radio de impacto): cap de 10 priorizadas en FREE, sin tope en PRO. Mismo modelo que ya existe en el ROADMAP.
- **Split por caps, no por features**: el FREE muestra TODO el producto, solo limitado en cantidad. El modal `FocusLimitReachedModal` es la palanca de conversión.
- **Priorización de las 10 conexiones FREE**: callers de runtime > callees de runtime > DTOs/entities > tests (al final).
- **Filosofía de UX**: ver `VALIDATION_GUIDE.md` sección "Filosofía de UX visual". Foco = protagonista. Sumar sin saturar. Defaults sobrios, capas bajo demanda.

---

## Guía técnica de compatibilidad Java — para Claude al codear

> **No es una fase ni feature visible**. Es una regla técnica que yo (Claude) debo respetar al implementar cada dimensión, para no agregar UI / lógica que no aplique según la versión del Java analizado. Evita mostrar secciones vacías o intentar parsear features que no existen.

### Reglas de "qué tiene sentido renderizar según versión"

| Feature | Versión mínima Java | Si no aplica → qué hago |
|---|---|---|
| Anotaciones (`@Service`, `@Transactional`, `@Cacheable`, etc.) | 5 | No renderizar barra de chips ni badges |
| Excepciones lanzadas (`throws`) | 1.0 | Cluster solo si al menos un método declara throws |
| Anotaciones de seguridad (`@PreAuthorize`, `@Secured`, etc.) | 5 + Spring Security | No badge escudo si no se detectan |
| Records (componentes en lugar de fields) | 14 | Render como CLASS regular |
| Sealed classes (mostrar `permits`) | 17 | Render como CLASS regular |
| Default methods en interfaces | 8 | Marcar con icono solo si existen |
| Lambdas / streams en cuerpos | 8 | (no afecta render — interno) |

### Cómo detectar la versión (mínimo necesario, sin UI)

Al implementar cada fase, si necesito condicionar lógica por versión:

1. Leer `pom.xml` → buscar `<maven.compiler.source>`, `<java.version>`, `<release>` (en orden)
2. Si no hay pom: leer `build.gradle` o `build.gradle.kts` → `sourceCompatibility`, `targetCompatibility`, `languageVersion`
3. Fallback: usar `LanguageLevel.BLEEDING_EDGE` y degradar si rompe el parse
4. Guardar en `SessionData.detectedJavaVersion` (uso interno, no se expone al frontend salvo que una fase lo necesite)

Esto es código backend mínimo (probable: 1-2h dentro de la Fase 1 cuando lo necesite por primera vez), no una fase aparte.

### Regla de oro

**Si la data no existe en el AST (porque la versión no la soporta o el código no la usa), enviar `null`/lista vacía. El frontend no debe renderizar nada para campos vacíos** — no "0 excepciones", no chip "sin anotaciones", no donut gris. Silencio, no ruido.

> **Nota**: la versión detectada SÍ se expone al usuario, pero a través de un componente específico (ver "Add-on UX — Badge de versión Java" más abajo), no metiéndola dentro del nodo central. Eso evita inflar el contrato del foco con metadata del proyecto.

---

## Hallazgos del repo (estado actual)

| Cosa | Estado | Archivo de referencia |
|---|---|---|
| Priorización de conexiones | ✅ Existe (EXTENDS > IMPLEMENTS > CALLED_BY > CALLS > USES_PROPERTIES) | `FocusTracerService.java:213-217` |
| Cap FREE + modal | ✅ Funcional | `FocusTracerService.java:220`, `graphStore.ts:50-59` |
| Edges con patterns punteados | ✅ Soportado | `FocusEdge.tsx:24-31` |
| Throws / excepciones lanzadas | ❌ No extraído | `MethodExtractor.java:30-49` |
| Detección de tests | ❌ No distingue `/test/java/` | `FocusTracerService.java:148` |
| Cobertura (Jacoco) | ❌ No integrado | — |
| BFS transitivo | ❌ Solo nivel 1 | — |
| `isPro` en frontend | ⚠️ Vive local en `page.tsx`, no llega al store | `graphStore.ts` |
| Anotaciones de comportamiento (`@Transactional`, `@Cacheable`, etc.) | ⚠️ Capturadas pero no destacadas | — |

---

## Hoja de ruta de ejecución (orden técnico)

> **Por qué este orden**: tres criterios — (1) dependencias técnicas: lo que otros pasos necesitan, va primero; (2) riesgo creciente: lo más arriesgado al final cuando ya conocemos bien el flujo; (3) bundling: si toco el mismo archivo en dos fases seguidas, las junto.

```
F0 — Fundacional (1-2h)
  ├─ isPro en el store (todo el frontend lo lee después)
  ├─ JavaVersionDetector backend (todas las fases consultan compat)
  └─ detectedJavaVersion viaja en SessionStartEvent
       ↓
F1 — Dim 1: Contrato (3-5h)  ← primer entregable demoable
  ├─ Backend: throws + security annotations en MethodExtractor
  └─ Frontend: pins de métodos + cluster excepciones + badges
       ↓
F1.5 — Add-on: Badge versión Java (2-3h)  ← bundling con F1
  └─ Reusa el chrome del canvas que ya tocamos en F1
       ↓
F2 — Dim 3: Configuración (5-7h)
  ├─ Backend: BEHAVIOR_ANNOTATIONS extractor (extiende lo de F1)
  └─ Frontend: BehaviorChipBar bajo el header
       ↓
F3 — Dim 2: Tests + Cobertura (6-9h)  ← primera dep externa (Jacoco)
  ├─ Backend: split tests / mocks / JacocoReportParser
  └─ Frontend: toggle, donut SVG, edges punteados de test
       ↓
F4 — Dim 5: Radio de impacto (8-12h)  ← la más compleja, al final
  ├─ Backend: ImpactAnalysisService con BFS transitivo + ciclos
  └─ Frontend: modo "simular cambio", overlay, anillo rojo
```

### Criterio por fase

- **F0 primero** porque `isPro` y `detectedJavaVersion` son leídos por TODO lo que viene después. Si los hago al final, tengo que retocar cada fase.
- **F1 antes que F2** porque el rediseño del nodo central en F1 es la base sobre la que F2 inserta la barra de chips. Hacerlas juntas obliga a pensar layout dos veces.
- **F1.5 (badge) inmediatamente después de F1** porque el badge va en el aside del canvas, que ya estamos tocando para F1. Bundling reduce churn.
- **F3 después de F2** porque F3 introduce la primera dependencia externa (Jacoco XML). Si rompe algo, el resto del producto ya está estable.
- **F4 al final** porque es la más arriesgada (BFS transitivo, modo overlay sobre todo el canvas) y conviene atacarla cuando ya conozco bien el flujo.

### Primer micro-paso si arrancamos hoy

1. Crear `service/JavaVersionDetector.java` (lee pom.xml y build.gradle, devuelve `String` tipo `"8"`, `"17"`, o `null`).
2. Inyectarlo en `FocusTracerService` y guardar en `SessionData`.
3. Pasar al frontend en `SessionStartEvent`.
4. Agregar `isPro: boolean` y `detectedJavaVersion: string | null` al `graphStore.ts`.

Eso es F0 completa. ~1-2h Claude. Una vez cerrado, la base está lista y el resto fluye.

---

## FASE 0 — Fundacional (cross-cutting)

**Estimado**: ~1-2h Claude / 0.5-1 día-persona / 1 sesión corta

### Backend (~30-60 min)
- [ ] Nuevo `service/JavaVersionDetector.java` — leer `pom.xml` (`<maven.compiler.source>`, `<java.version>`, `<release>`) o `build.gradle` (`sourceCompatibility`, `languageVersion`). Devolver `"8"`, `"11"`, `"17"`, `"21"`, o `null`.
- [ ] `SymbolSolverConfigurer.java` → si versión disponible, setear `ParserConfiguration.LanguageLevel`; sino fallback `BLEEDING_EDGE`.
- [ ] `SessionData.java` → agregar campo `String detectedJavaVersion`.
- [ ] `FocusTracerService.java:77-95` → llamar al detector al inicio de `traceFocus()` y guardar en `session`.
- [ ] `SessionStartEvent.java` → agregar `String detectedJavaVersion`.

**Cómo probarlo (backend)**:
1. Levantar backend: `cd codemapper-backend && ./mvnw spring-boot:run`
2. Hacer un análisis FOCO sobre `C:\Users\ariel\Reserva\backend-reserva` (proyecto Java 17 según su `pom.xml`).
3. Buscar en el log del backend la línea: `Java version detected: 17` (o lo que tenga el pom).
4. Probar con un proyecto sin pom ni gradle → log debe decir `Java version: null, falling back to BLEEDING_EDGE`.

**Lo que tenés que ver**: log limpio con la versión detectada; sin excepciones; el análisis sigue funcionando como antes.

**Si falla**: chequear que el `JavaVersionDetector` esté inyectado en `FocusTracerService` (constructor + `@RequiredArgsConstructor`).

### Frontend (~30-60 min)
- [ ] `lib/types.ts` → agregar `detectedJavaVersion: string | null` al `SessionStartPayload`.
- [ ] `graphStore.ts:63` → agregar al state `isPro: boolean`, `detectedJavaVersion: string | null`, y setters.
- [ ] `page.tsx:85` → eliminar `useState` local de `isPro`, usar el del store.
- [ ] `useSSE.ts` (o donde se procese `session_start`) → llamar `setDetectedJavaVersion(payload.detectedJavaVersion)`.

**Cómo probarlo (frontend)**:
1. Levantar frontend: `cd codemapper-frontend && pnpm dev`
2. Abrir Chrome devtools → instalar extensión Zustand devtools si no la tenés (opcional, también podés inspeccionar con un `console.log(useGraphStore.getState())`).
3. Cargar análisis FOCO de `backend-reserva` en `http://localhost:3000`.
4. Abrir devtools → Console → tipear `useGraphStore.getState()` → ver que `isPro` y `detectedJavaVersion` están seteados.
5. Probar con `?demoMode=pro` en URL → `isPro: true`. Sin el query param → `isPro: false`.

**Lo que tenés que ver**: `isPro` y `detectedJavaVersion` con valores correctos en el store. Nada cambia visualmente todavía — F0 solo prepara la cancha.

**Si falla**: chequear que el listener de `session_start` esté llamando los setters; verificar payload SSE en Network tab → eventos → buscar `session_start`.

### Criterio de "fase cerrada"
- [ ] Backend log muestra versión detectada de proyectos con pom.xml/build.gradle
- [ ] Store frontend tiene `isPro` y `detectedJavaVersion` con valores reales
- [ ] Nada cambia visualmente — esta fase es invisible para el user final

---

## FASE 1 — Dimensión 1: Contrato y superficie

**Estimado**: ~3-5h Claude / 2.5-3.5 días-persona / 1-2 sesiones

### Backend (~45 min)
- [ ] `MethodExtractor.java:30-49` → extraer `md.getThrownExceptions()` → `List<String>` y filtrar anotaciones `@PreAuthorize / @Secured / @RolesAllowed / @RequiredRole`.
- [ ] `ParsedMethod.java:13` → agregar `private List<String> thrownExceptions = new ArrayList<>()` y `private List<String> securityAnnotations = new ArrayList<>()`.

**Cómo probarlo (backend)**:
1. Reiniciar backend.
2. Hacer análisis FOCO sobre `AuthService.java` (lanza `EmailNotVerifiedException`, `UserBlockedException`, `UserDisabledException`).
3. Abrir Network tab del browser → buscar el evento SSE `focus_class_loaded` → ver que cada `method` tiene `thrownExceptions` con las 3 excepciones del que las lanza (línea 95, 102, 105).
4. Probar con un Controller que tenga `@PreAuthorize` (ej. cualquier admin endpoint del proyecto) → ver `securityAnnotations: ["@PreAuthorize"]` en el método.

**Lo que tenés que ver**: en el JSON del evento SSE, los métodos vienen con los nuevos campos poblados.

**Si falla**: usar Postman para hacer POST a `/api/analyze/focus` directo y leer la respuesta JSON cruda.

### Frontend (~3-4h)
- [ ] `lib/types.ts:23` → agregar mismo shape extendido en `ParsedMethod`.
- [ ] `FocusCenterNode.tsx:23` → reescribir layout del nodo:
  - Sección "métodos públicos" como pins/pills (filtrar `methods` por `modifiers.includes("public")`)
  - Cluster "Excepciones" abajo con chips (dedupe de `methods.flatMap(m => m.thrownExceptions)`)
  - Badge escudo dorado al lado de métodos con `securityAnnotations.length > 0`
  - **Cap visual**: 5 métodos públicos en FREE + chip "+N ocultos, desbloqueá PRO" → abre `FocusLimitReachedModal`
- [ ] `FocusGraph.tsx:39` → ajustar `CENTER_W` (probable 280→340).

**Cómo probarlo (frontend)**:
1. Reload del frontend.
2. Abrir FOCO sobre `AuthService.java` → ver el nodo central:
   - Pins/pills con los 7 métodos públicos (`loginWithFirebaseToken`, `parseEmailVerified` no debería aparecer porque es `private`, etc.)
   - Cluster "Excepciones" abajo con 3 chips: `EmailNotVerifiedException`, `UserBlockedException`, `UserDisabledException`
3. Abrir FOCO sobre un Controller con `@PreAuthorize` → ver el badge escudo dorado al lado del método protegido.
4. Probar con FREE (`?demoMode=free` o sin query) → si la clase tiene >5 métodos públicos, ver chip "+N ocultos, desbloqueá PRO" → click → modal.
5. Con PRO (`?demoMode=pro`) → ver TODOS los métodos sin cap.
6. Probar con un Java sin throws ni security → cluster excepciones y badges deben estar **ausentes** (silencio, no "0 excepciones").

**Lo que tenés que ver**: nodo central enriquecido con pins, cluster, badges; cap funcional en FREE; render condicional respeta la regla "si no hay data, no mostrar".

**Si falla**: console.log de `focus.methods` en `FocusCenterNode` para ver la shape real recibida.

### Compat (recordatorio)
- Si `methods` no tiene ninguno con `thrownExceptions` no vacío → no renderizar cluster.
- Si Java < 5 o no hay `securityAnnotations` → no badges.
- Si no hay métodos públicos → no sección de pins.

---

## FASE 1.5 — Add-on: Badge de versión Java + ayuda educativa

**Estimado**: ~2-3h Claude / 1-1.5 días-persona / 1 sesión

### Backend
- ✅ Nada nuevo — la detección ya está en F0.
- [ ] Confirmar que `detectedJavaVersion` viaja en `session_start` o `focus_class_loaded`.

### Frontend (~2-3h)
- [ ] Nuevo `lib/javaCompat.ts` → constante `JAVA_FEATURES_BY_VERSION` que matchee la matriz de la guía técnica (lista única para evitar drift).
- [ ] Nuevo `components/graph/JavaVersionBadge.tsx`:
  - Píldora con texto `"Java X detectado"` + icono `?`
  - Si `null`: `"Java ? — sin manifest"` con tooltip de fallback
  - Click `?` → popover (`shadcn/popover`) con 3 secciones:
    1. **"Lo que ves ahora"**: features que aplican a la versión detectada
    2. **"Lo que verías si tu proyecto estuviera en…"**: tabla por versión superior
    3. Pie: "CodeMapper soporta todas estas features. Se activan cuando subís la versión."
- [ ] `FocusGraph.tsx:161` → insertar `<JavaVersionBadge />` arriba de las legends en el aside derecho.

**Cómo probarlo**:
1. Reload del frontend.
2. Abrir FOCO de `backend-reserva` (Java 17) → arriba derecha del canvas, junto a las legends, ver píldora `"Java 17 detectado [?]"`.
3. Click en el `?` → popover abre con:
   - Sección "Lo que ves ahora": menciona records, sealed, default methods, lambdas, throws, annotations
   - Sección "Lo que verías en…": Java 21+ → pattern matching, virtual threads
4. Probar con un proyecto Java 8 (si tenés alguno viejo, sino simulá hardcodeando `detectedJavaVersion = "8"` en devtools) → popover debe mostrar "si subieras a 14+ verías Records, a 17+ Sealed".
5. Probar sin pom (proyecto roto a propósito) → píldora dice `"Java ? — sin manifest"` y popover muestra TODO lo soportado.

**Lo que tenés que ver**: badge discreto, popover educativo y honesto, no satura el canvas.

**Si falla**: chequear que `detectedJavaVersion` esté en el store (devtools); chequear z-index del popover si queda detrás del canvas.

### Compat (recordatorio)
- Badge se muestra siempre (incluso con detección fallida)
- Popover funciona igual con detección `null`: oculta "lo que ves ahora", muestra todo lo soportado

---

## FASE 2 — Dimensión 3: Configuración

**Estimado**: ~5-7h Claude / 3.5-5 días-persona / 2-3 sesiones

### Backend (~2-3h)
- [ ] `FocusTracerService.java:65-67` → agregar set `BEHAVIOR_ANNOTATIONS = Set.of("Transactional", "Cacheable", "CacheEvict", "CachePut", "Async", "Scheduled", "EventListener", "Retryable")`.
- [ ] Nuevo método `extractBehaviorChips(focusType)` → `List<BehaviorChip>` con `(annotation, value, methodName)`.
- [ ] Nuevo DTO `model/dto/BehaviorChip.java`.
- [ ] `FocusClassLoadedEvent.java:17` → agregar `behaviorAnnotations: List<BehaviorChip>`.
- [ ] **Postergado a v0.7**: detección de migraciones Flyway/Liquibase.

**Cómo probarlo (backend)**:
1. Reiniciar backend.
2. Análisis FOCO sobre `AuthService.java` (tiene `@Transactional` en `loginWithFirebaseToken`).
3. Inspeccionar SSE `focus_class_loaded` → ver `behaviorAnnotations: [{annotation: "@Transactional", value: null, methodName: "loginWithFirebaseToken"}]`.
4. Probar sobre una clase con `@Cacheable("auth")` → ver `value: "auth"` poblado.
5. Probar sobre clase sin behavior annotations → `behaviorAnnotations: []` (no `null`).

**Lo que tenés que ver**: array bien formado en SSE con cada anotación detectada.

### Frontend (~2-3h)
- [ ] Nuevo `components/graph/BehaviorChipBar.tsx`:
  - Chips horizontales scrolleables, color por tipo (azul = transactional, violeta = cache, naranja = async, etc.)
  - Click chip → `openMethodSheet()` del método dueño
- [ ] `FocusCenterNode.tsx` → insertar `<BehaviorChipBar />` después del header.
- [ ] **Cap visual**: 3 chips en FREE + "+N más" → modal.

**Cómo probarlo (frontend)**:
1. Reload.
2. FOCO de `AuthService.java` → ver chip azul `"@Transactional · loginWithFirebaseToken"` debajo del header.
3. Click en el chip → se abre el `ClassDetailSheet` mostrando el código de `loginWithFirebaseToken`.
4. Probar con clase con muchos `@Cacheable` (4+) en FREE → ver 3 chips visibles + chip "+1 más" → click → modal `FocusLimitReachedModal`.
5. Con PRO → ver todos los chips.
6. Con clase sin behavior annotations → barra ausente (no "sin anotaciones", solo silencio).

**Lo que tenés que ver**: chips coloreados por tipo, click navega al método, cap funcional, render condicional.

### Compat (recordatorio)
- Si Java < 5 o `behaviorAnnotations` está vacío → ocultar barra entera.

---

## FASE 3 — Dimensión 2: Tests y cobertura

**Estimado**: ~6-9h Claude / 5-5.5 días-persona / 3-4 sesiones

### Backend (~3-5h)
- [ ] `FocusTracerService.java:148` → split `projectFiles` en `mainFiles` y `testFiles` por path (`/test/java/`).
- [ ] `FocusTracerService.java:156` (loop) → marcar `PendingConnection.isTest = path.contains("/test/java/")`.
- [ ] Detección mocks: si un `CALLED_BY` tiene fields con `@Mock / @MockBean / @SpyBean / @InjectMocks` cuyo tipo = `focusFqn` → `isMock = true`.
- [ ] Nuevo `service/JacocoReportParser.java`:
  - Buscar `target/site/jacoco/jacoco.xml` (configurable en `application.yml`)
  - Parser DOM → `Map<className, coveragePercent>` y `Map<className.methodName, coveragePercent>`
  - Si no existe el XML: retornar `null`
- [ ] `FocusClassLoadedEvent.java` → agregar `Double coveragePercent`, `Map<String, Double> methodCoverage`.
- [ ] `FocusConnectionEvent.java` → agregar `boolean isTest`, `boolean isMock`.

**Cómo probarlo (backend)**:
1. Generar Jacoco XML en `backend-reserva`: `cd C:\Users\ariel\Reserva\backend-reserva && ./gradlew test jacocoTestReport` (chequear que Jacoco esté en el `build.gradle`).
2. Verificar que existe `backend-reserva/build/reports/jacoco/test/jacocoTestReport.xml` (path real puede variar).
3. Reiniciar backend de CodeMapper, hacer FOCO sobre `AuthService.java`.
4. Inspeccionar SSE `focus_class_loaded` → ver `coveragePercent: 78.5` (o el valor real) y `methodCoverage: {"loginWithFirebaseToken": 92.1, ...}`.
5. Inspeccionar SSE `connection_found` → `AuthControllerTest` debe venir con `isTest: true, isMock: true` (mockea AuthService).
6. `AuthController` debe venir con `isTest: false, isMock: false`.
7. Probar con proyecto sin Jacoco XML → `coveragePercent: null` (no error).

**Lo que tenés que ver**: cobertura real del proyecto reflejada, tests/mocks marcados correctamente.

### Frontend (~3-4h)
- [ ] `graphStore.ts` → `showTests: boolean` (default `false`).
- [ ] `FocusGraph.tsx:96` → si `!showTests`, filtrar peripherals con `c.isTest`.
- [ ] `FocusGraph.tsx:161` → toggle "Mostrar tests" en aside derecho (junto a las legends).
- [ ] `FocusEdge.tsx:18` → si `data.isTest`, override style: stroke `#7B8AAD`, width `1.5`, dash `"4 3"`.
- [ ] `FocusEdge.tsx` → si `data.isMock`, agregar pequeña máscara SVG en el midpoint.
- [ ] `FocusCenterNode.tsx` → donut SVG arriba-derecha (solo si `coveragePercent != null`):
  - Anillo 28-32px, % en el centro, verde >80, amarillo 50-80, rojo <50
- [ ] Click donut → `ClassDetailSheet` con tab nuevo "Cobertura" listando por método.

**Cómo probarlo (frontend)**:
1. Reload.
2. FOCO de `AuthService.java`:
   - Por default no se ven tests (`AuthServiceTest` y `AuthControllerTest` ocultos).
   - Toggle "Mostrar tests" arriba derecha → click → aparecen los 2 tests con líneas grises punteadas.
   - `AuthControllerTest` (mockea) → ver icono de máscara en el medio del edge.
   - `AuthServiceTest` (uso real) → línea punteada normal sin máscara.
3. Donut arriba-derecha del nodo central → ver % cobertura coloreado.
4. Click en donut → sheet derecho abre tab "Cobertura" con lista por método y su %.
5. Probar con proyecto sin Jacoco → donut **no aparece** (silencio).
6. Probar con proyecto sin tests → toggle "Mostrar tests" no aparece.

**Lo que tenés que ver**: distinción visual clara entre runtime / test / mock; donut educativo; render condicional.

### Compat (recordatorio)
- Cobertura es independiente de versión Java
- Si no hay tests detectados: no mostrar toggle
- Si no hay `jacoco.xml`: no renderizar donut (silencio)

### Decisión pendiente
- Si proyecto sin `jacoco.xml`: ¿silencio total (recomendado) o mensaje educativo en el sheet?

---

## FASE 4 — Dimensión 5: Radio de impacto

**Estimado**: ~8-12h Claude / 5.5-7.5 días-persona / 4-6 sesiones

### Backend (~4-5h)
- [ ] Nuevo `service/ImpactAnalysisService.java`:
  - `computeImpact(SessionData, focusFqn, depth=4): ImpactReport`
  - BFS hacia atrás (callers transitivos) reusando `collectAllReferencedFqns`
  - Detector de ciclos durante BFS
  - Filtrar tests al final (cruzar con `/test/java/`)
- [ ] Nuevo endpoint `GET /api/analyze/focus/{sessionId}/impact?depth=4` en `AnalyzeController.java`.
- [ ] **Cap FREE**: si `!session.isPro()`, devolver solo `{ totalImpact, totalTests, hasCycles }` sin grafo enriquecido.

**Cómo probarlo (backend)**:
1. Reiniciar backend.
2. Análisis FOCO de `AuthService.java`.
3. Capturar `sessionId` del response.
4. Curl/Postman: `GET http://localhost:8090/api/analyze/focus/{sessionId}/impact?depth=4`
5. Esperar respuesta tipo:
   ```json
   {
     "totalImpact": 23,
     "totalTests": 5,
     "hasCycles": false,
     "directCallers": ["AuthController"],
     "transitiveCallers": [...],
     "affectedTests": ["AuthControllerTest", "AuthServiceTest", ...]
   }
   ```
6. Con `?demoMode=free` → respuesta solo con `{totalImpact, totalTests, hasCycles}` (sin grafo).
7. Probar con clase con dependencias circulares (forzar uno) → `hasCycles: true` + listado del ciclo.

**Lo que tenés que ver**: respuesta JSON honesta sobre impacto real; cap FREE aplicado.

### Frontend (~4-7h)
- [ ] Botón flotante "Simular cambio" en `FocusGraph.tsx:161` (arriba a la izquierda).
- [ ] Al click, llamar al endpoint impact y guardar en store (`impactReport`).
- [ ] Modo visual cuando `impactReport` está activo:
  - Overlay CSS opacity 0.3 sobre el canvas
  - Foco al 100%
  - Callers directos: brillo naranja sólido
  - Callers transitivos: naranja tenue
  - Tests afectados: contorno rojo punteado pulsante
- [ ] Contador grande arriba: "Cambia este Java impacta: N archivos · M tests".
- [ ] Detector de ciclos: anillo rojo translúcido + pulso lento.
- [ ] **En FREE**: solo el contador + CTA "ver detalle interactivo con PRO".

**Cómo probarlo (frontend)**:
1. Reload.
2. FOCO de `AuthService.java` → click en botón "Simular cambio" arriba izquierda.
3. Ver:
   - Canvas se atenúa (opacity 0.3) excepto el foco
   - `AuthController` (caller directo) brilla naranja sólido
   - Callers transitivos en naranja tenue
   - Tests con contorno rojo punteado pulsante
   - Contador arriba: "Cambia este Java impacta: 23 archivos · 5 tests"
4. Click en el botón otra vez → vuelve al modo normal.
5. Probar con FREE (`?demoMode=free`) → solo aparece el contador + CTA "Ver detalle con PRO" (sin animación visual).
6. Probar con clase que tenga ciclo → ver anillo rojo translúcido pulsando alrededor del ciclo.

**Lo que tenés que ver**: el dev entiende DE UN VISTAZO el impacto de cambiar el Java; FREE limita la riqueza visual pero da el dato clave.

### Compat (recordatorio)
- Independiente de versión Java

---

## Total estimado

Orden de ejecución: F0 → F1 → F1.5 (badge) → F2 → F3 → F4

| Fase | Claude codeando | Días-persona | Sesiones contigo |
|---|---|---|---|
| F0. Fundacional | 1-2h | 0.5-1d | 1 (corta) |
| F1. Contrato | 3-5h | 2.5-3.5d | 1-2 |
| F1.5. Badge versión + ayuda | 2-3h | 1-1.5d | 1 |
| F2. Configuración | 5-7h | 3.5-5d | 2-3 |
| F3. Tests + cobertura | 6-9h | 5-5.5d | 3-4 |
| F4. Radio de impacto | 8-12h | 5.5-7.5d | 4-6 |
| **TOTAL** | **25-38h** | **18.5-24d** | **12-17 sesiones** |

---

## Decisiones pendientes (responder antes de codear cada fase)

- [ ] **Fase 1**: confirmar 5 métodos públicos visibles en FREE + cap visual con CTA
- [ ] **Fase 1**: tamaño nodo central — ¿340-380px aceptable o lo hacemos collapsable por sección?
- [ ] **Fase 3**: si proyecto sin `jacoco.xml` → silencio total (recomendado) o mensaje educativo
- [ ] **Fase 2**: Flyway/Liquibase ahora o postergado a v0.7
- [ ] **Add-on**: posicionamiento del badge (aside derecho recomendado vs bottom-left) y tono del popover (educativo recomendado vs vendedor)

---

## Bitácora de progreso

(Completar a medida que se cierran fases)

- [ ] 2026-XX-XX — F0 Fundacional cerrada
- [ ] 2026-XX-XX — F1 Contrato cerrada
- [ ] 2026-XX-XX — F1.5 Badge versión cerrada
- [ ] 2026-XX-XX — F2 Configuración cerrada
- [ ] 2026-XX-XX — F3 Tests + cobertura cerrada
- [ ] 2026-XX-XX — F4 Radio de impacto cerrada
