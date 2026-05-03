# Roadmap CodeMapper

## ✅ MVP (v0.1) — En desarrollo
- [x] Backend Spring Boot con JavaParser (parser y analizador)
- [x] Frontend Next.js con React Flow (visualizador interactivo)
- [x] Análisis desde ruta local, GitHub o ZIP
- [x] Streaming progresivo con Server-Sent Events
- [x] Visualización de clases con anotaciones, campos, métodos
- [x] Detección de conexiones (extends, implements, composition, dependency injection)
- [ ] Layout vertical en capas (Controllers > Services > Repositories > Entities)
- [ ] Click en nodo muestra código fuente con Monaco Editor
- [ ] Filtros funcionales por anotación y tipo de clase
- [ ] Performance optimizada con virtualización y modo compacto

## 🔜 Próximas features (v0.2)
- [ ] Toggle manual Modo Lite vs Modo Full
- [ ] Atajos de teclado (zoom, búsqueda rápida, navegación)
- [ ] Mejoras de UX en filtros
- [ ] Búsqueda avanzada con regex
- [ ] Modo presentación (sin sidebar, solo grafo)

## 💰 Monetización futura (v1.0)
> Idea: tier por capacidad de hardware del usuario.
> Quien tenga máquina más robusta puede pagar para ver más detalle.

### Plan FREE
- Hasta 50 clases por análisis
- Modo Lite forzado
- Sin guardar análisis
- Sin export

### Plan PRO ($X/mes)
- Hasta 500 clases por análisis
- Modo Full disponible
- Guarda hasta 5 análisis
- Export PNG, PDF, JSON
- Comparación entre versiones del código

### Plan ENTERPRISE ($XX/mes)
- Sin límite de clases
- Análisis profundo (métricas avanzadas, code smells)
- Histórico ilimitado
- API privada para CI/CD
- Webhook a Slack cuando cambia la arquitectura
- Soporte prioritario

### Implementación técnica
- [ ] Login con Google/GitHub (NextAuth)
- [ ] Stripe para suscripciones
- [ ] Base de datos de usuarios (PostgreSQL)
- [ ] Dashboard de planes y facturación
- [ ] Sistema de límites por tier
- [ ] Persistencia de análisis guardados

## 💡 Ideas locas (v2.0)
- [ ] IA que sugiere refactors basados en el grafo
- [ ] Detección automática de code smells (acoplamiento excesivo, ciclos)
- [ ] Soporte para Kotlin, Python, TypeScript, Go
- [ ] Plugin para IntelliJ IDEA y VS Code
- [ ] Modo colaborativo en tiempo real (varios usuarios viendo el mismo grafo)
- [ ] Comparación visual entre commits (qué cambió arquitectónicamente)
- [ ] Generación automática de documentación arquitectónica
- [ ] Integración con Confluence/Notion para publicar diagramas
- [ ] Análisis de impacto: "si modifico esta clase, qué se rompe?"

## 📝 Notas
- Idea original del modelo de pricing por hardware: el modo detallado consume más recursos del navegador, así que naturalmente requiere mejores máquinas. Tier comercial alineado con valor técnico.
- Antes de monetizar: validar con 5-10 usuarios reales que la herramienta es útil.
