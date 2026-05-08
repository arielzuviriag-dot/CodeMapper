# Roadmap CodeMapper

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

### Caso A — Análisis FOCO de un Java ✅ COMPLETADO
- [x] Backend `/api/analyze/focus` con tracing nivel 1 (CALLED_BY/CALLS/EXTENDS/IMPLEMENTS/USES_PROPERTIES)
- [x] UI: tab "Foco" en home, FocusInput con projectPath + focusFile
- [x] FocusGraph con layout radial (centro + N en estrella)
- [x] FocusCenterNode gigante (400px) con variables/métodos como pills + stagger
- [x] FocusEdge con colores por tipo + label always-visible + hover prominente + animación stroke-draw
- [x] Conexiones aparecen una por una con stagger 500ms
- [x] Límite FREE: 10 conexiones (modal `FocusLimitReachedModal` educativo)
- [x] `demoMode=pro` bypassa el límite
- [ ] Cuota: 10 búsquedas por semana (pendiente para login real)

### Caso B — Análisis GENERAL (lo que ya existe, con límite)
- El MVP actual pero limitado
- Límite FREE: hasta 100 archivos mostrados

### UX adicional
- Login obligatorio (no hay acceso anónimo)
- Mensaje permanente abajo: "Estás usando la versión FREE - Te quedan X búsquedas esta semana"
- Dashboard del usuario con porcentaje de uso visible

---

## 💎 v0.2 — PRO (primera versión paga)

> Mismo producto que v0.1 pero sin límites.

- Análisis FOCO: sin límite de 10 conexiones
- Análisis GENERAL: sin límite de 100 archivos
- Búsquedas ilimitadas
- Sin mensajes de FREE

---

## 🔍 v0.3 — EXPANSIÓN PRO

### Detección inteligente de tipo de proyecto
- Al subir el proyecto, preguntar al usuario el tipo:
  - Web (frontend + backend)
  - Solo Backend
  - Mobile + Backend
  - Mobile standalone
  - Monorepo / mixto / no estoy seguro
- Backend hace **scan rápido de validación** (2-3 seg) leyendo manifests:
  `package.json`, `pom.xml`, `build.gradle`, `pubspec.yaml`, `Podfile`,
  `AndroidManifest.xml`, `application.properties`, etc.
- Si lo declarado no coincide con lo detectado → modal "detecté también X,
  ¿lo incluyo?"
- Optimización: solo cargar parsers necesarios según el tipo confirmado

### Nuevos puntos de partida
- Archivo .html / .jsp como inicio
- Botón específico de un HTML
- Método específico (no solo archivo entero)
- Click en botón HTML muestra: handler JS → llamada fetch/ajax → endpoint
  REST en el backend Java (cruce de fronteras tecnológicas)

### INVESTIGAR ERROR
- Input: punto de partida + excepción
- Output: identifica dónde puede lanzarse esa excepción en el camino
- Modo bidireccional: rastreo desde el punto + búsqueda inversa por excepción
- Caso de uso real: "App caída, falla en UserService.validateLogin() con NullPointerException"

---

## 🔄 v0.4 — RECORRIDO INVERSO desde DB

- Input: nombre de tabla
- Output: rastreo inverso completo
  - Repository que la usa → Service → Controller → endpoint REST → frontend → botón origen
- "Desde la tabla hacia el botón que dispara todo"

---

## 📚 v0.5 — DOCUMENTACIÓN INTEGRADA

- Input adicional opcional: docs (PDF, MD, Confluence exportado)
- La app indexa la documentación
- Cuando hace cualquier análisis, también busca menciones en docs
- Conecta visualmente la documentación al grafo

---

## 🌐 v0.6 — VISTA END-TO-END POR CAPAS (PRO/ULTIMATE)

> El "wow moment" del producto: ver el flujo completo de un click hasta la
> tabla de la base de datos, atravesando todas las capas tecnológicas.
> Esto es lo que ningún competidor hace bien.

### La idea
- El usuario sube un proyecto **completo** (web + backend + DB, o mobile +
  backend + DB) y opcionalmente un dump del schema de la base.
- La app detecta el tipo y arma una vista en **columnas verticales por capa**:
  `WEB/MOBILE → CONTROLLERS → SERVICES → REPOSITORIES → DB`
- El usuario hace click en cualquier nodo (un botón HTML, una pantalla mobile,
  un endpoint, una tabla) y se iluminan **todos los caminos** que pasan por
  ese punto, de extremo a extremo.

### Conexiones entre capas (cada una es un parser)
- **HTML/JSX → JS:** detectar `onclick`, `onSubmit`, handlers, funciones llamadas
- **JS → Backend:** detectar `fetch`, `axios`, `$.ajax`, `apiClient.post(...)`,
  extraer la URL y el verbo HTTP
- **URL → Controller:** matchear contra `@GetMapping`, `@PostMapping`,
  `@RequestMapping` del backend Java
- **Controller → Service → Repository:** ya resuelto en v0.0/v0.1
- **Repository → Tabla DB:** parsear `@Entity`, `@Table`, `@Query`, JPQL
- **Mobile → Backend:** mismo patrón que web, parsers específicos por stack
  (React Native usa `fetch`, Android nativo usa Retrofit/OkHttp,
  iOS usa URLSession, Flutter usa `http`/`dio`)

### UX clave
- Columnas colapsables: si el dev solo quiere ver back + DB, oculta la web
- Resaltar el camino completo al hacer click en un extremo
- Indicador honesto: "X conexiones detectadas / Y estimadas"
  (las URLs dinámicas y queries armadas con strings no se pueden mapear)

### Plan de ejecución incremental (no hacer todo de una)
1. **Paso 1:** HTML como inicio + parser JS → endpoint Java (sin DB todavía)
2. **Paso 2:** sumar conexión Java → tabla DB (cierra el end-to-end web)
3. **Paso 3:** mobile, empezando por **un solo stack** (idealmente el de
   un proyecto propio para validar contra una verdad conocida)
4. **Paso 4:** sumar más stacks mobile (React Native, Flutter, Android, iOS)

### Casos de uso que esto desbloquea
- "Quiero saber qué pasa cuando el usuario aprieta el botón Confirmar Reserva"
- "¿Qué pantallas de mi app tocan la tabla `usuarios_sensibles`?" (auditoría)
- "Vine a este proyecto legacy ayer, mostrame de un click cómo viaja la data"
- "Voy a refactorizar el endpoint /api/reservas, ¿qué se rompe arriba y abajo?"

---

## 🌍 v1.0 — MULTI-LENGUAJE + IA

### Multi-lenguaje (en orden de prioridad)
1. Java (ya hecho)
2. COBOL (mainframes - mercado enorme sin herramientas modernas)
3. C# / .NET
4. PHP
5. Python
6. Node.js / TypeScript

### IA (a definir cómo integrar)
- Resumen en lenguaje natural de clases
- Búsqueda semántica
- Sugerencias de refactor

> Pendiente: definir bien el rol de la IA en el producto

---

## 💰 Modelo de monetización

### Pricing (versiones tentativas)

**FREE** (v0.1)
- Hasta 10 conexiones en modo FOCO
- Hasta 100 archivos en modo GENERAL
- 10 búsquedas por semana
- Login obligatorio
- Mensaje permanente

**PRO** (v0.2 → v0.5 conforme crece)
- Sin límites
- Todas las features de cada versión
- Vista end-to-end por capas en proyectos web (v0.6 paso 1 y 2)

**ULTIMATE** (v0.6 paso 3+ y v1.0)
- Vista end-to-end completa incluyendo mobile (todos los stacks)
- Multi-lenguaje
- IA integrada

### Tipo de límite
HARD limit en backend (se detiene a los 100 archivos / 10 conexiones)

---

## 📐 Plan de ejecución actual

### FASE 1 — CONSTRUIR v0.1 + v0.2 (3-4 semanas)
- v0.1 FREE con límites hard
- v0.2 PRO sin límites
- Sin sistema de pago real (todavía)
- Sin login real (todavía)
- Toggle interno "Demo PRO" para mostrar a beta testers

### FASE 2 — VALIDACIÓN (1-2 semanas)
- Mostrar a 10-20 personas (amigos, colegas, comunidad)
- Recopilar feedback honesto
- Decidir si vale la pena seguir

### FASE 3 — PRODUCTIZACIÓN (si feedback positivo)
- Implementar auth real (NextAuth)
- Implementar pagos reales (Stripe)
- Landing nueva con video explicativo
- Dashboard de usuario completo
- Lanzamiento oficial

---

## 🏷️ Pendiente: cambiar el nombre del producto

"CodeMapper" lo usan otras herramientas. Hay que elegir nombre nuevo.
Opciones a considerar: Ariadne, Codetrail, Pathfind, Tendril, Wayfinder.

---

## 💡 Notas estratégicas

### Diferenciadores frente a competencia
- vs Sonar: nosotros somos visualización end-to-end, no métricas
- vs Structure101: UI moderna y accesible
- vs IntelliJ Diagrams: multi-formato (no solo Java) y compartible
- vs Sourcegraph: enfocado en flujos visuales, no en search

### Casos de uso que justifican el producto
- Devs entrando a proyecto legacy
- Debug profundo (modo INVESTIGAR ERROR)
- Refactor seguro (modo RECORRIDO INVERSO)
- Auditoría de seguridad (qué llega a tablas sensibles)
- Documentación automática
- **Visualización end-to-end del flujo de un click** (botón web/mobile → DB)
- **Análisis cross-stack** de proyectos completos sin abrir 5 IDEs distintos

### Decisión clave (sesión actual)
"Construir v0.1 + v0.2 antes de pedir feedback. Cuando alguien vea el FREE y se le acabe, le mostramos el PRO con un toggle demo, así evalúa si pagaría."

---

Última actualización: sesión actual
Estado: Fase 1 — construyendo v0.1 + v0.2
