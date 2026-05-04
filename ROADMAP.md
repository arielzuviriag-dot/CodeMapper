# Roadmap CodeMapper

## ✅ MVP v0.1 — COMPLETADO
- [x] Backend Spring Boot + JavaParser
- [x] Frontend Next.js + React Flow
- [x] Análisis de proyectos Java completos
- [x] Streaming SSE progresivo
- [x] Visualización por capas (Controllers → Services → Repos → Entities)
- [x] Filtros, búsqueda, click en nodo muestra código
- [x] Design System BMW/Lambo aplicado
- [x] Tested con backend-reserva (234 clases, 494 conexiones)

---

## 🎯 v0.2 — IMPACT TRACER (la feature estrella, vale plata)

> Idea original: rastrear la cadena completa desde un punto de entrada hasta la base de datos, atravesando TODOS los formatos del proyecto (no solo Java).

### Qué problema resuelve
Cualquier dev que entra a un proyecto legacy se pierde. Hay un bug en un formulario web y nadie sabe por dónde empezar. Esta feature da la respuesta visual end-to-end.

### Casos de uso reales
- Bug en formulario HTML → "qué clase Java lo procesa, qué tabla toca"
- Dev nuevo en el proyecto → "muestrame qué hace este botón"
- Refactor → "si toco esta clase, qué se rompe"
- Auditoría seguridad → "qué endpoints llegan a la tabla creditCards"
- Documentación automática de flujos completos

### Punto de partida (input puede ser cualquiera)
- Archivo .java (Controller, Service, Repository, Entity)
- Archivo .html / .jsp / .xhtml (formulario, pantalla)
- Un BOTÓN específico de un HTML (con su action)
- Archivo .xml (struts-config, web.xml, applicationContext, persistence.xml)
- Archivo .properties / .yml / .yaml
- Archivo .css / .js / .ts (frontend)
- Una tabla de base de datos (rastreo inverso)

### Qué tiene que rastrear
1. Frontend → Backend: form action, fetch, axios
2. Backend mappings: struts-config, Spring annotations, web.xml servlets
3. Backend layers: Controller → Service → Repository → Entity
4. Configs: properties, applicationContext, persistence.xml
5. Base de datos: @Table, SQL inline, stored procedures, FKs

### UI del Tracer
- Subir proyecto + seleccionar archivo de inicio
- El archivo de inicio queda CENTRADO en pantalla
- La cadena se dibuja radiando desde el centro hacia afuera
- Cada nivel de profundidad en un anillo concéntrico
- Colores distintos por TIPO de nodo (HTML, XML, Properties, Java, DB, SQL)

---

## 🌍 v0.3 — MULTI-LENGUAJE

> Idea original: no quedarse solo en Java. Soportar otros stacks legacy y modernos.

### Lenguajes target (en orden de prioridad)
1. Java (ya hecho)
2. COBOL (mainframes, bancos, gobiernos — mercado enorme casi sin herramientas modernas)
3. C# / .NET (WebForms, ASP.NET, Entity Framework)
4. PHP (WordPress, Laravel, sistemas legacy)
5. Python (Django, Flask, FastAPI)
6. Node.js / TypeScript (Express, NestJS, Next.js)
7. Visual Basic / VB.NET
8. Ruby on Rails

### Por qué COBOL es la apuesta brillante
- Trillones de líneas en producción (bancos, gobiernos, aerolíneas)
- Casi nadie sabe leerlo
- Empresas pagan fortunas por entender su código COBOL
- Herramientas existentes (Micro Focus) son de los 90s y caras
- CodeMapper podría ser la PRIMERA herramienta moderna de visualización COBOL

---

## 💰 v1.0 — MONETIZACIÓN

### Pricing
- FREE: hasta 50 clases, sin tracer, sin export
- PRO ($19/mes): ilimitado, tracer, export, histórico
- ENTERPRISE ($99/mes): multi-lenguaje, API, webhooks, on-premise

### Stack para implementar
- NextAuth.js (login Google/GitHub/email)
- Stripe (suscripciones)
- PostgreSQL (usuarios y análisis guardados)
- Redis (sesiones y cache)

---

## 💡 v2.0 — IDEAS LOCAS

- IA que sugiere refactors
- Detección de code smells, ciclos, dead code
- Plugin IntelliJ / VS Code / Eclipse
- Modo colaborativo (varios devs en vivo)
- Comparación visual entre commits
- Documentación auto en PDF / Confluence
- Análisis de impacto en PRs
- Chat con tu codebase
- Búsqueda semántica

---

## 📝 Notas estratégicas

### Decisión clave (3-Mayo-2026)
"Dar como opción de pago tipo pagas más tenes más detalle pero necesitas una máquina más robusta" — el modo detallado consume más recursos, naturalmente requiere mejores máquinas. Tier comercial alineado con valor técnico real.

### Diferenciadores
- vs Sonar: Sonar es métricas, no visualización end-to-end
- vs Structure101: caro y feo, lookee de los 2010s
- vs IntelliJ Diagrams: solo Java, solo dentro del IDE
- vs Sourcegraph: enfocado en search, no en flujos visuales
- CodeMapper: end-to-end + multi-lenguaje + UI moderna

---

## 🗓️ Próximos pasos

- [x] MVP v0.1 — completado 3-Mayo-2026
- [ ] v0.2 Impact Tracer — diseño detallado pendiente
- [ ] v0.3 Multi-lenguaje — investigación pendiente
- [ ] v1.0 Monetización — después de validación

---

Última actualización: 3-Mayo-2026
