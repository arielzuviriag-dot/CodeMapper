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

### Caso A — Análisis FOCO de un Java (NUEVO)
- Inputs: 1 archivo .java + proyecto entero como marco
- UX progresiva:
  1. El java aparece centrado en pantalla
  2. Se cargan variables de a una (animación stagger)
  3. Se cargan métodos
  4. Se cargan interfaces que implementa
  5. Aparecen conexiones (qué llama, quién lo llama, properties que usa)
- Límite FREE: hasta 10 conexiones mostradas
- Cuota: 10 búsquedas por semana

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

### Nuevos puntos de partida
- Archivo .html / .jsp como inicio
- Botón específico de un HTML
- Método específico (no solo archivo entero)

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

**ULTIMATE** (v1.0)
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

### Decisión clave (sesión actual)
"Construir v0.1 + v0.2 antes de pedir feedback. Cuando alguien vea el FREE y se le acabe, le mostramos el PRO con un toggle demo, así evalúa si pagaría."

---

Última actualización: sesión actual
Estado: Fase 1 — construyendo v0.1 + v0.2
