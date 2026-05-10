# Roadmap del Producto

> **Sobre el nombre:** "CodeMapper" lo usan otras herramientas. Hay rebrand
> visual en curso a **"Marco Polo"** (tabs de la home + títulos de PDFs +
> chips). Identificadores internos siguen siendo `Focus*`, `focusMode`,
> `bitacora*` — decisión consciente, full rename queda para una pasada
> aparte de refactor.
>
> El producto va a tener **secciones con nombres de exploradores/cartógrafos**
> como universo de marca. Marco Polo ya está. Posibles para otros modos:
> Magallanes (general), Ariadna (recorrido inverso desde DB),
> Brújula/Sextante (verificación de IA), Cartógrafo (diff visual).
>
> Opciones todavía abiertas para el nombre del producto entero:
> Atlas, Brújula, Cartógrafo, Rumbo, Bitácora, Ariadne, Wayfinder.

---

## ✅ MVP v0.0 — Análisis general (COMPLETADO)
- [x] Backend Spring Boot + JavaParser
- [x] Frontend Next.js + React Flow
- [x] Análisis de proyectos Java completos (vista panorámica)
- [x] Streaming SSE progresivo
- [x] Visualización por capas
- [x] Filtros, búsqueda, click en nodo muestra código
- [x] Design System BMW/Lambo aplicado
- [x] Tested con backend-reserva (234 clases, 494 conexiones)

---

## 🎯 v0.1 — FREE (próximo paso)

> Versión gratuita con límites estrictos. Es la entrada al producto.

### Caso A — Marco Polo (ex FOCO) ✅ COMPLETADO (con extensiones)
- [x] Backend `/api/analyze/focus` con tracing nivel 1 (CALLED_BY/CALLS/EXTENDS/IMPLEMENTS/USES_PROPERTIES) — `service/FocusTracerService.java`
- [x] UI: tab "Foco" en home (rebrand visual a "**Marco Polo**" en `UploadTabs.tsx`), `FocusInput` con projectPath + focusFile
- [x] FocusGraph con layout radial (centro + N en estrella) — `components/graph/FocusGraph.tsx`, edges floating sin handles cardinales
- [x] FocusCenterNode con variables/métodos como pills + animación CSS de entrada (migrado desde framer-motion para evitar restart por re-render)
- [x] FocusEdge con colores por tipo + label always-visible + hover prominente + animación stroke-draw wall-clock (basada en `firstSeenAt` para sobrevivir remounts de ReactFlow)
- [x] Conexiones aparecen una por una con stagger conducido por backend SSE (60ms) — eliminado el stagger CSS acumulativo viejo
- [x] Límite FREE: 10 conexiones (modal `FocusLimitReachedModal` educativo en `components/loading/`)
- [x] **`proportionalSample()` en FocusTracerService** — el cap de 10 ya no toma "los primeros 10" sino que reserva al menos 1 slot por tipo de conexión presente y reparte el resto proporcionalmente. Evita perder los 2 CALLS cuando hay 30 CALLED_BY.
- [x] **Pasada P2 deep body analysis** — además del análisis por firma, se camina cada body de método para detectar invocaciones que la firma no captura. Emite `UnresolvedReferenceEvent` para casos no resolvibles.
- [x] **DiagnosticsPanel** en sidebar — surface UNRESOLVED / FALSE_NEGATIVE / UNPARSEABLE durante el análisis, con su propio botón de descarga PDF.
- [x] `demoMode=pro` bypassa el límite (toggle vía URL `?demo=pro` o tab "Marco Polo PRO" temporal)
- [ ] Cuota: 10 búsquedas por semana — **pendiente para login real** (sin auth todavía no se puede medir cuota)

### Caso B — Análisis GENERAL (lo que ya existe, con límite)
- [x] El MVP actual con límite FREE de 100 archivos (`codemapper.limits.free-max-files`)
- [x] `LimitReachedEvent` con honest total (P1+P2) y flag `truncated` para mostrar "200+" cuando aplica el hard cap

### 🆕 Bitácora de Marco Polo ✅ IMPLEMENTADA

> Árbol radial que registra el recorrido del dev mientras navega de clase
> en clase. El nodo origen queda al centro, los saltos se distribuyen
> alrededor. Resuelve el problema de "perderse" en sesiones largas de
> exploración y deja como subproducto una documentación visual del
> proceso de comprensión.
>
> **Concepto estratégico:** la Bitácora no es solo UX — es **conocimiento
> tácito hecho explícito**. Capturar cómo un humano específico decidió
> recorrer un código vale oro en equipos. La IA puede explicar código,
> pero no captura el camino mental que un dev específico siguió para
> entenderlo.

- [x] `store/bitacoraStore.ts` — Zustand + persist a sessionStorage. Modelo: árbol activo (origen + nodos + edges + activeNodeId + panelPos + pipWindow) + `archived[]` con snapshots de árboles pasados.
- [x] `components/marcopolo/Bitacora.tsx` — panel flotante draggable + resizable + portal a Document PiP. Soporta render dentro de una ventana flotante real (Chrome/Edge 116+) con botón "Sacar afuera" + botón "Maximizar" (`requestFullscreen` en modo PiP).
- [x] `BitacoraNode.tsx` — nodo rectangular (140×52 origen / 110×38 visited) con `User.class` para el origen, ring CSS pulsante para el activo.
- [x] `BitacoraEdge.tsx` — bezier con offset paralelo para múltiples saltos entre las mismas dos clases, label `fromMethod() → toMethod()`, marker triangular limpio con clearance.
- [x] `BitacoraIndicator.tsx` — chip al lado del `StreamingIndicator` que toggla el panel.
- [x] `ArbolHistorialBlock.tsx` — bloque de sidebar con lista de árboles archivados (click abre como histórico read-only, hover muestra trash con confirm).
- [x] Captura automática de saltos: `setOrigen` desde `useSSE.focus_class_loaded`, `addJump` desde `requestFocusScanClass`/`requestFocusScanMethod` en `ClassDetailSheet.tsx`.
- [x] Persistencia: árboles pasados sobreviven F5 (sessionStorage), se pierden al cerrar tab.
- [x] Export PNG: botón Download en el header del panel via `html-to-image`.
- [ ] Persistencia en DB (movimiento desde sessionStorage) — pendiente para v0.2 PRO con auth real.

### UX adicional v0.1
- [ ] Login obligatorio (no hay acceso anónimo) — **NO implementado**, depende de auth real
- [ ] Mensaje permanente abajo: "Estás usando la versión FREE - Te quedan X búsquedas esta semana" — **NO implementado**, depende de auth
- [ ] Dashboard del usuario con porcentaje de uso visible — **NO implementado**

---

## 💎 v0.2 — PRO (primera versión paga) ✅ FUNCIONAL VÍA TOGGLE

> Mismo producto que v0.1 pero sin límites + persistencia. Hoy se accede
> via `?demo=pro` o tab "Marco Polo PRO" temporal — billing real pendiente.

- [x] Marco Polo: sin límite de 10 conexiones cuando `isPro`
- [x] Análisis GENERAL: sin límite de 100 archivos cuando `isPro`
- [x] Sin mensajes ni modales de FREE en modo PRO
- [x] Tab "Marco Polo PRO" en home (`UploadTabs.tsx`) — TEMPORAL, se borra cuando exista billing
- [ ] Búsquedas ilimitadas — depende de auth (mismo bloqueo que v0.1)
- [ ] **Bitácoras guardadas en la nube** (persistencia con cuenta del usuario) — pendiente
- [ ] **Compartir bitácoras por link** (caso de uso: senior recorre flujo y manda link al junior) — pendiente
- [ ] Modo lectura de bitácoras guardadas + opción "continuar este recorrido" — pendiente
- [ ] Pago real (Stripe) — pendiente fase 4

---

## 🔍 v0.3 — EXPANSIÓN PRO

### Detección inteligente de tipo de proyecto
- [ ] Modal "qué tipo de proyecto es" al subir — **NO implementado**
- [~] Detección de versión Java por manifest — **PARCIAL**: `JavaVersionDetector` existe (`service/JavaVersionDetector.java`), lee pom.xml y build.gradle, alimenta `JavaVersionBadge` en frontend. Pero no detecta el TIPO de stack (web/mobile/etc).
- [ ] Scan rápido multi-stack (`package.json`, `pubspec.yaml`, etc.) — **NO implementado**
- [ ] Confirmación interactiva con el usuario — **NO implementado**
- [ ] Lazy loading de parsers según tipo confirmado — **NO implementado**

### Nuevos puntos de partida
- [ ] Archivo .html / .jsp como inicio — **NO implementado**
- [ ] Botón específico de un HTML como inicio — **NO implementado**
- [x] **Método específico como inicio** — IMPLEMENTADO: "Foco al Método" desde sheet de método. Endpoint `/api/analyze/focus-method` + `FocusMethodTracerService` + `FocusMethodGraph` + PDF dedicado. Soporta INVOKES_METHOD (callers) e INVOKES_OUTGOING (callees).
- [ ] Click en botón HTML → JS → fetch → endpoint Java — **NO implementado** (parte del v0.6 cross-stack)

### INVESTIGAR ERROR
- [ ] Input punto de partida + excepción — **NO implementado**
- [ ] Output con identificación de dónde se lanza — **NO implementado**
- [ ] Modo bidireccional — **NO implementado**

### Análisis de impacto (no estaba en el roadmap original)
- [x] **"Simular cambio" / Impact analysis** — IMPLEMENTADO: `ImpactAnalysisService` + endpoint `GET /api/analyze/focus/{sessionId}/impact?depth=N`. Devuelve `ImpactReport` con direct callers, transitive callers, affected tests, has cycles. UI: `ImpactSimulationButton` overlay sobre el grafo que ilumina los caminos.

### Modo VERIFICACIÓN DE DIFF (clave estratégica para PRO)
- [ ] El dev pega un PR o conecta GitHub. La app muestra el grafo del antes/después con el blast radius del cambio resaltado.
- [ ] Identifica qué nodos toca el diff y qué otros nodos dependen de los modificados aunque no estén en el diff.
- [ ] Integración futura: GitHub Action que comenta en el PR con link al grafo.
- > **Por qué importa:** es la respuesta a "los devs mergean código de IA sin entender qué tocó". El motor de Impact Analysis ya existe (✅) — esto es exponerlo sobre diffs.

---

## 🔄 v0.4 — RECORRIDO INVERSO desde DB
- [ ] Input nombre de tabla — **NO implementado**
- [ ] Rastreo Repository → Service → Controller → endpoint → frontend — **NO implementado**
- > Casos de uso: auditoría de seguridad, refactor seguro, comprensión de flujos legacy.

---

## 📚 v0.5 — DOCUMENTACIÓN INTEGRADA (movida en parte a DIAMANTE)

> **Cambio de visión:** en la sesión donde se definió DIAMANTE se decidió
> que la documentación integrada es lo que **transforma el producto en
> herramienta de equipo**. Por eso se mueve como pilar de DIAMANTE,
> aunque la base técnica de indexación puede empezar antes.

- [ ] Input docs (PDF, MD, Confluence) — **NO implementado**
- [ ] Indexado de documentación — **NO implementado**
- [ ] Cruce visual con el grafo (al buscar/visitar una clase, el nodo muestra "📄 mencionada en doc-arquitectura.pdf p.14") — **NO implementado**

### Cobertura Jacoco (bonus parcial sobre observabilidad)
- [x] **Detección y parseo de jacoco.xml** — `JacocoReportParser` (`service/`). Si el proyecto tiene Jacoco corrido, se carga.
- [x] **CoverageDonut** en FocusCenterNode — donut SVG (verde ≥80, ámbar ≥50, rojo <50) clickeable. Cobertura por método disponible para la sheet.

---

## 🌐 v0.6 — VISTA END-TO-END POR CAPAS (PRO/DIAMANTE)

> El "wow moment" del producto: ver el flujo completo de un click hasta la
> tabla de la base de datos, atravesando todas las capas tecnológicas.
> Esto es lo que ningún competidor hace bien.

### La idea
- El usuario sube un proyecto **completo** (web + backend + DB, o mobile + backend + DB) y opcionalmente un dump del schema de la base.
- La app detecta el tipo y arma una vista en **columnas verticales por capa**: `WEB/MOBILE → CONTROLLERS → SERVICES → REPOSITORIES → DB`
- El usuario hace click en cualquier nodo (un botón HTML, una pantalla mobile, un endpoint, una tabla) y se iluminan **todos los caminos** que pasan por ese punto, de extremo a extremo.

### Conexiones entre capas (cada una es un parser)
- [ ] **HTML/JSX → JS:** detectar `onclick`, `onSubmit`, handlers, funciones llamadas — **NO implementado**
- [ ] **JS → Backend:** detectar `fetch`, `axios`, `$.ajax`, `apiClient.post(...)`, extraer la URL y el verbo HTTP — **NO implementado**
- [ ] **URL → Controller:** matchear contra `@GetMapping`, `@PostMapping`, `@RequestMapping` — **NO implementado**
- [x] **Controller → Service → Repository:** ya resuelto en v0.0/v0.1 (CALLED_BY/CALLS sobre clases Java)
- [ ] **Repository → Tabla DB:** parsear `@Entity`, `@Table`, `@Query`, JPQL — **NO implementado**
- [ ] **Mobile → Backend** — **NO implementado**

### UX clave
- [ ] Columnas colapsables — **NO implementado**
- [ ] Resaltar el camino completo — **NO implementado** (solo "Simular cambio" hace algo análogo a nivel clase)
- [ ] Indicador honesto "X conexiones detectadas / Y estimadas" — **NO implementado para multi-layer** (sí existe a nivel sesión actual via `LimitReachedEvent.truncated`)

### Plan de ejecución incremental (no hacer todo de una)
1. **Paso 1:** HTML como inicio + parser JS → endpoint Java (sin DB todavía)
2. **Paso 2:** sumar conexión Java → tabla DB (cierra el end-to-end web)
3. **Paso 3:** mobile, empezando por **un solo stack** (idealmente el de un proyecto propio para validar contra una verdad conocida)
4. **Paso 4:** sumar más stacks mobile (React Native, Flutter, Android, iOS)

### Casos de uso que esto desbloquea
- "Quiero saber qué pasa cuando el usuario aprieta el botón Confirmar Reserva"
- "¿Qué pantallas de mi app tocan la tabla `usuarios_sensibles`?" (auditoría)
- "Vine a este proyecto legacy ayer, mostrame de un click cómo viaja la data"
- "Voy a refactorizar el endpoint /api/reservas, ¿qué se rompe arriba y abajo?"

---

## 🌍 v0.7 — MULTI-LENGUAJE (parte de PRO)

> Multi-lenguaje queda dentro de PRO porque es expansión del producto base,
> no cambio de categoría. La IA conversacional es lo que cambia categoría
> y va en DIAMANTE.

### Lenguajes en orden de prioridad
1. Java (ya hecho)
2. COBOL (mainframes - mercado enorme sin herramientas modernas)
3. C# / .NET
4. PHP
5. Python
6. Node.js / TypeScript

---

## 💎💎 v1.0 — DIAMANTE: Modo conversacional con IA

> **Esto cambia la naturaleza del producto.** Ya no es "herramienta para
> ver código". Es "IDE visual conversacional para programar con IA".
> Compite con Cursor, Claude Code, Copilot Workspace — pero ofrece algo
> que ninguno tiene: representación visual del razonamiento de la IA
> mientras programa.
>
> **Tesis:** *"Cuanto más código genera la IA, más necesario es ver
> visualmente qué tocó. El grafo no compite con la IA, le da el mapa
> que ella no tiene."*

### Layout principal
- Pantalla tipo Claude design: chat a la izquierda (~30-35%), grafo en vivo a la derecha (~65-70%)
- El dev escribe en lenguaje natural, la IA analiza el proyecto, el grafo se redibuja mostrando qué se toca
- El dev aprueba, ajusta o redirige antes de que se escriba código

### Las 3 acciones del modo conversacional
1. **Crear funcionalidad** — "quiero agregar login con Google"
   - IA propone qué crear y qué modificar
   - Grafo: nodos nuevos en verde punteado, modificados en amarillo
2. **Resolver error** — "falla en checkout con NullPointerException"
   - IA recorre el grafo desde el punto donde falla buscando el origen
   - Grafo resalta el camino candidato en rojo
3. **Entender** — "explicame cómo funciona el flujo de reserva"
   - IA arma explicación, el grafo se anima paso a paso
   - La Bitácora se llena automáticamente con esa ruta

### Flujo de aprobación visual
- Loading: el grafo principal se atenúa, overlay "Analizando..."
- Respuesta: nodos a modificar (amarillo pulsante), a crear (verde punteado), edges nuevos (azul punteado), edges modificados (naranja)
- Panel lateral con summary, warnings, questions de la IA al dev
- Botones: ✅ Aprobar y ejecutar | ✏️ Modificar plan | ❌ Cancelar

### Documentación integrada al grafo (pilar de DIAMANTE)
- Subís PDFs, MDs, Confluence exportados al proyecto
- La app indexa toda la documentación
- Al buscar/visitar una clase, el nodo muestra "📄 mencionada en doc-arquitectura.pdf p.14"
- Conexión bidireccional: del código a la doc, y de la doc al código
- Resuelve el dolor universal de "documentación que existe pero nadie encuentra cuando la necesita"
- **Esto es lo que hace al producto vendible a equipos completos, no solo a devs individuales**

### Infraestructura técnica clave
- IA propia integrada (sin API key del usuario)
- Cuota generosa de consultas IA por mes
- Backend del proyecto expuesto como API estructurada que la IA consulta (camino hacia un MCP server propio del producto)
- Formato de respuesta de IA: JSON estructurado con `impactedNodes`, `impactedEdges`, `warnings`, `questions`

---

## 🥽 Visión a más largo plazo: inmersión visual

> No para roadmap inmediato, pero anotado para no perder la dirección.

- Modo gafas (Apple Vision, Meta Quest): meterse adentro del grafo en 3D
- Tocar nodos con las manos, escribir prompts con la mirada
- Ver blast radius de cambios en entorno espacial
- Coherente con la evolución natural de los entornos espaciales de código

---

## 💰 Modelo de monetización (3 tiers)

### FREE — "Conocé tu código"
**Para:** dev curioso, estudiante, alguien probando.
- Análisis GENERAL hasta 100 archivos
- Marco Polo hasta 10 conexiones
- Bitácora completa (sin límite de nodos, persiste solo en sessionStorage)
- Login obligatorio
- 10 búsquedas por semana
- Mensaje permanente "Estás usando FREE"
- **Mensaje de venta:** *"Visualizá tu proyecto y descubrí cómo está conectado."*
- **Precio:** $0

### PRO — "Dominá tu código"
**Para:** dev profesional, equipos chicos, freelancers.
- Todo lo del FREE sin límites
- Bitácoras guardadas en la nube
- Compartir bitácoras por link
- Modo verificación de diff (apoyado en Impact Analysis ya existente)
- Multi-lenguaje (COBOL, C#, .NET, PHP, Python, Node/TS — v0.7)
- Vista end-to-end por capas web (v0.6 paso 1 y 2)
- Sin mensajes de FREE
- **Mensaje de venta:** *"Auditá cualquier cambio antes de mergearlo. Documentá cómo entendés tu sistema."*
- **Precio:** $15-25 USD/mes (rango Cursor/Linear)

### DIAMANTE — "Programá con IA viendo todo"
**Para:** dev que ya usa IA todo el día y se cansó de leer paredes de texto. Equipos serios. Empresas que quieren control visual sobre lo que la IA propone.
- Todo lo del PRO
- Modo conversacional con IA (las 3 acciones)
- Grafo en vivo que se redibuja con cada respuesta
- Aprobación visual antes de ejecutar
- IA propia integrada (sin API key del usuario)
- Cuota generosa de consultas IA por mes
- Documentación integrada al grafo (PDFs, MDs, Confluence indexados)
- Vista end-to-end completa incluyendo mobile (todos los stacks — v0.6 paso 3+)
- **Mensaje de venta:** *"Hablá con tu código. Ves lo que la IA va a tocar antes de que lo toque. Y todo conectado a tu documentación."*
- **Precio:** $40-60 USD/mes (rango Cursor Pro con uso intenso)

### Por qué este orden funciona
- **FREE → PRO** es por **límites y persistencia**: el dev probó, le sirvió, paga para destrabar y guardar
- **PRO → DIAMANTE** es por **categoría**: no es "más de lo mismo sin límites", es **otra forma de programar**
- Cada nivel se vende solo a partir del anterior

### Tipo de límite
HARD limit en backend (se detiene a los 100 archivos / 10 conexiones)

---

## 📐 Plan de ejecución actual

### FASE 1 — CONSTRUIR v0.1 + v0.2 ✅ COMPLETADA
- v0.1 FREE con límites hard ✅
- v0.2 PRO sin límites (vía toggle) ✅
- Bitácora ✅
- Sin sistema de pago real (todavía)
- Sin login real (todavía)
- Toggle interno "Demo PRO" para mostrar a beta testers ✅

### FASE 2 — VALIDACIÓN (PRÓXIMO PASO)
- Mostrar a **3-5 personas de confianza primero** (no esperar a tener 10-20)
- Empezar por la persona que menos intimida — Loom de 4 minutos basta
- Recopilar feedback honesto
- Decidir si vale la pena seguir o pivotar al modo verificación de IA

### FASE 3 — EXPERIMENTO IA (1 semana, después de Fase 2)
- Antes de construir el modo conversacional completo, hacer un experimento mínimo:
- Una sola pantalla, una sola acción ("entender"), conectada a IA
- IA recibe contexto del grafo y devuelve explicación animada sobre el grafo existente
- Si funciona, valida la dirección DIAMANTE. Si no, ahorra meses.

### FASE 4 — PRODUCTIZACIÓN (si feedback positivo)
- Implementar auth real (NextAuth)
- Implementar pagos reales (Stripe)
- Landing nueva con video explicativo
- Dashboard de usuario completo
- Lanzamiento oficial

---

## 💡 Notas estratégicas

### Diferenciadores frente a competencia
- **vs Sonar:** somos visualización end-to-end, no métricas
- **vs Structure101:** UI moderna y accesible
- **vs IntelliJ Diagrams:** multi-formato (no solo Java) y compartible
- **vs Sourcegraph:** enfocado en flujos visuales, no en search
- **vs Cursor / Claude Code / Copilot (DIAMANTE):** somos los únicos que muestran visualmente lo que la IA va a tocar antes de ejecutar. Reducen la fricción de "leer paredes de texto generadas por IA".

### Casos de uso que justifican el producto
- Devs entrando a proyecto legacy
- Debug profundo (modo INVESTIGAR ERROR)
- Refactor seguro (modo RECORRIDO INVERSO)
- Auditoría de seguridad (qué llega a tablas sensibles)
- Documentación automática (Bitácora exportable)
- **Verificación de cambios de IA** (modo diff + modo conversacional)
- **Visualización end-to-end del flujo de un click** (botón web/mobile → DB)
- **Análisis cross-stack** de proyectos completos sin abrir 5 IDEs distintos
- **Empresas con restricciones de IA** (bancos, salud, gobierno): tier PRO sin IA sigue dándoles valor enorme

### Decisiones clave acumuladas
- **Construir v0.1 + v0.2 antes de pedir feedback masivo.** Validar primero con 3-5 personas de confianza.
- **El modo conversacional con IA es el corazón del producto a largo plazo.** No es feature, es categoría.
- **La documentación integrada hace al producto vendible a equipos**, no solo a devs individuales.
- **Universo de marca: exploradores/cartógrafos.** Marco Polo ya está; el resto va siguiendo el patrón.
- **Cuando alguien vea el FREE y se le acabe**, le mostramos el PRO con un toggle demo, así evalúa si pagaría.

---

## 🔧 Cambios técnicos no planeados (sesiones recientes)

Bitácora del trabajo real hecho que no estaba en el roadmap original. Listado por área.

### Análisis profundo (P2) y diagnostics
- **`FocusTracerService` con dos pasadas** (`P1` por firma + `P2` por body): la pasada profunda walks bodies de métodos detectando invocaciones que la firma no captura. Hard caps por sesión: 200 detections en FREE, 5000 en PRO. Modo silent-count post-cap para que el contador "10 / 32" del header sea honesto.
- **`UnresolvedReferenceEvent`** streaming: el backend emite tres tipos de findings (`UNRESOLVED`, `FALSE_NEGATIVE`, `UNPARSEABLE`) en vivo durante el análisis.
- **`DiagnosticsPanel`** en sidebar (no flotante): vivienda en `components/graph/DiagnosticsPanel.tsx`, abre como Sheet desde el sidebar `FocusDiagnosticsBlock`. También funciona en modo método-foco.
- **`FocusMethodTracerService` con diagnostics**: el modo método también emite UNPARSEABLE / UNRESOLVED cuando el resolver no puede confirmar una llamada al método foco (sesión 2026-05-09).

### Modo método foco
- Endpoint `POST /api/analyze/focus-method` + `service/FocusMethodTracerService.java`.
- Componentes nuevos: `FocusMethodGraph.tsx`, `FocusMethodCenterNode.tsx`. Layout radial igual que clase-foco (migrado desde two-column en sesión reciente).
- Sheet de método con header mejorado (`Class.method(): retType` + FQN con `#methodName`), botón "Foco al Método" (rename desde "Foco Scaner"), modal de confirmación reutilizado.

### PDFs
- **`/api/foco/export/pdf`** (clase-foco) — `FocoPdfService.java`, título "Reporte Marco Polo", filename con sufijo `-FREE` / `-PRO`.
- **`/api/foco/export/method-pdf`** (método-foco) — `FocoMethodPdfService.java`, secciones "QUIÉN LO INVOCA" / "A QUIÉN INVOCA".
- **`/api/foco/export/diagnostics-pdf`** — `DiagnosticsPdfService.java`, render de los hallazgos con cap FREE 10 + sección locked PRO.
- DTOs: `FocoExportRequest`, `FocoMethodExportRequest`, `DiagnosticsExportRequest` en `model/dto/`.

### Animaciones y rendering
- **Migración de framer-motion a CSS pure** en `FocusCenterNode` y `FocusPeripheralNode` (clase `cm-focus-node-enter`). Razón: framer-motion reiniciaba la animación de entrada en cada re-render del padre cuando el layout radial rebalanceaba.
- **Floating edges** en `FocusGraph` (sin `sourceHandle`/`targetHandle`): `FocusEdge` lee posiciones de `useInternalNode` y calcula intersección con el rect del card. Mejor calidad visual + intento de mitigar bug de remount (no resolvió 100% — ver `BUG_PENDIENTE_OLAS_STREAMING.md`).
- **Wall-clock animation en edges**: la animación de stroke-draw se computa por `Date.now() - firstSeenAt` en lugar de CSS keyframes con delay. Sobrevive remounts de ReactFlow porque `firstSeenAt` está en el store, no en el DOM. Stagger por arrival index con cap (primeros 12 secuenciales + tail-wave).
- **`STAGGER_S = 0`** en edges (antes 0.5s × index) para evitar el bug de "tres olas" del streaming. Ver `BUG_PENDIENTE_OLAS_STREAMING.md` para el contexto del bug que NO se resolvió pero se hizo invisible.

### Navegación inmediata (`/map/pending`)
- Click en "Analizar" desde la home no espera el POST: parquea la promesa en `pendingAnalysis` del `graphStore`, navega directo a `/map/pending`, y la página del map awaita la promesa y hace `router.replace` al sessionId real cuando llega. Aplica a los 4 analyzers (FocusInput, GitHubInput, LocalPathInput, UploadZone).

### Cambios visuales / UX menores
- Tab "Foco" / "Foco PRO" en home → "**Marco Polo**" / "**Marco Polo PRO**" (visible only).
- "Foco Scaner" en sheet de método → "**Foco al Método**".
- "DIAGNÓSTICO" en sidebar (icono `AlertCircle`) — antes era un panel flotante en el grafo que tapaba el MiniMap.
- Monaco find widget con `addExtraSpaceOnTop: true` para no tapar el código fuente.
- Package name en cards periféricas wrap por puntos (con `<wbr>` después de cada `.`) en lugar de truncar con ellipsis.
- Filename de PDFs descargados llevan sufijo `-FREE` / `-PRO`.
- StreamingIndicator: removida frase "DE NIVEL 1" del contador (no aporta valor).

### Performance / estabilidad
- **`SymbolSolverConfigurer`** con cap de caché por solver (`SOLVER_CACHE_LIMIT = 200`) + `setStoreTokens(false)` + `setAttributeComments(false)` en la `ParserConfiguration` para reducir memoria por AST. Fix para `OutOfMemoryError` durante deep walks.
- Identidad estable de eventos (`alreadyConnectedFqns` set) para evitar duplicados.

### Bug abierto (documentado)
- **`BUG_PENDIENTE_OLAS_STREAMING.md`** en root del repo: ReactFlow remontea componentes de edge cuando posiciones de nodos cambian masivamente durante streaming. La causa raíz no se resolvió; se mitigó con wall-clock animation que vuelve los remounts visualmente invisibles. Prioridad baja (UX durante 11s del streaming, no afecta el grafo final ni exportación).

### Documentación de sesiones
- `RESUMEN_SESION_2026-05-08.md` y otros en root del repo — bitácoras de sesiones de desarrollo, no son código de producto.

---

Última actualización: 2026-05-10 (merge del reporte técnico del agente con la visión estratégica de la sesión: Bitácora con contexto, modo conversacional con IA como v1.0 DIAMANTE, 3 tiers FREE/PRO/DIAMANTE, documentación integrada como diferenciador de equipos, universo de marca exploradores).

Estado: **Fase 1 COMPLETADA** (v0.1 + v0.2 funcionales vía toggle demo, Bitácora implementada). Próximo paso: Fase 2 (validación con 3-5 beta testers de confianza).
