# Bug pendiente — "olas" durante streaming SSE en modo FOCO

**Fecha del registro original**: 2026-05-08
**Última actualización**: 2026-05-09
**Prioridad**: Baja — UX durante streaming, no afecta grafo final ni exportación.

## Síntoma confirmado (afinado en 2026-05-09)

Durante el streaming SSE en modo FOCO, las **líneas (edges)** entre el nodo central y los periféricos parpadean: aparecen, desaparecen, vuelven a aparecer. El usuario percibe "tres oleadas" durante los ~11s que dura el streaming en una sesión PRO de 32 conexiones, antes de quedar todas dibujadas en el render final.

**Crítico**: el bug está aislado al **edge layer de ReactFlow**. Los **nodos NO parpadean** — eso quedó verificado al migrar los nodos de framer-motion a animación CSS pura el 2026-05-09. Los componentes nuestros se montan una sola vez y se quedan estables; lo que se reinicia es algo a nivel de los edges dentro de la maquinaria interna de @xyflow/react v12.

## Datos confirmados

Instrumentación temporal usada (ya removida): `console.count(\`FocusEdge mount ${id}\`)` dentro de un `useEffect(() => {...}, [])` en `FocusEdge.tsx`.

| Sesión | Edge medido | Mounts |
|---|---|---|
| PRO User (32 conns), handles cardinales originales | `AdminRateLimitController` | 18× |
| PRO User (32 conns), después de migrar a floating edges | `AdminRateLimitController` | 58× |

El número de remounts AUMENTÓ después del intento de fix con floating edges. La eliminación de `sourceHandle`/`targetHandle` no fue la causa raíz; era una causa parcial, y al sacarla destapamos otra que es peor.

Otros datos cross-checked:
- 1 sola conexión SSE al backend (verificado en Network tab).
- 1 solo `session_start` y 1 solo `session_complete` recibidos (instrumentación `[SSE-DBG]`).
- 32 eventos `connection_found` únicos del backend.
- 1 sola ejecución del análisis backend (`Focus session ... done` aparece una sola vez en logs).

## Lo que NO es la causa (descartado por evidencia)

- **`nodeTypes` y `edgeTypes`** — declarados como constantes module-level. Referencias estables.
- **Selectores Zustand** — `FocusGraph` usa selectores específicos por slice, no desestructura el store completo.
- **`sourceHandle` / `targetHandle` rotando con la posición** — eliminados completamente al migrar a floating edges. Bug persiste.
- **SSE reconectándose desde el frontend** — confirmado 1 sola conexión SSE en Network tab. El effect de `useSSE` se ejecuta una sola vez por sesión.
- **HMR (Hot Module Reload)** — el bug se reproduce sin tocar archivos durante la sesión.
- **Backend re-ejecutando el análisis** — los logs del backend muestran 1 sola corrida del análisis por sesión.
- **Strict Mode de React 19** — verificado el 2026-05-09 desactivando `reactStrictMode: false` en `next.config.ts`. Las olas siguen apareciendo. Strict Mode infla los counters en dev (es responsable del MOUNT/UNMOUNT/MOUNT inicial al cargar página, en 2ms), pero NO es la causa de las olas durante el streaming.
- **framer-motion en los nodos** — los nodos migraron a `@keyframes cm-focus-node-enter` con `forwards` puro. Los nodos no parpadean. La instrumentación `[REMOUNT]` en `FocusGraph` y `MapPage` confirma que esos componentes solo se montan una vez por sesión.
- **Componente padre (`MapPage`, `FocusGraph`) remontándose** — instrumentado y descartado. Cada uno fija una sola vez por sesión (más el doble-invoke de Strict Mode al cargar la página, irrelevante).
- **`useEffect` deps mal puestas en useSSE** — dep array es `[sessionId]`, defensivo y correcto.

## Hipótesis abierta (investigar en próxima pasada)

**ReactFlow internamente reconstruye el edge layer en thresholds de cantidad o ante cambios masivos de posiciones de nodos**.

Mecánica probable:
1. Cada `connection_found` agrega un nodo al store de la app.
2. El `useMemo` de FocusGraph recompute el array `nodes`/`edges`. Las posiciones de TODOS los nodos cambian (porque `(i / N) * 2π` depende de N, y `radiusFor(N)` salta al cruzar N=6 y crece linealmente desde N=11).
3. ReactFlow recibe el nuevo array `nodes` con posiciones drásticamente distintas. En algún punto interno (`updateNodeInternals`, batch update al store interno, recompute del edge layer), decide reconstruir las instancias de los componentes de edge.
4. Cada reconstrucción remontea el `<path>` → la animación CSS arranca desde `stroke-dashoffset: 1500, opacity: 0` → "ola" visible.

**Próximo paso a probar**: dive into el source de `@xyflow/react` v12 (específicamente `useStore`, `applyNodeChanges`, y cómo se renderiza el edge layer en `EdgeRenderer`). Buscar si hay algún branch que recrea componentes de edge cuando las posiciones cambian más allá de un threshold, o cuando la lista de nodos crece. Alternativa: probar con un edge component minimal (sin `useInternalNode`) para ver si los hooks de subscripción al store interno son los que disparan el remount.

## Impacto en producto

- **UX durante streaming (~11s para PRO 32 conns)**: el usuario ve "olas" en vez de un dibujado progresivo limpio. Distrae, pero no impide entender el grafo.
- **Grafo final**: correctísimo. Las 32 conexiones quedan dibujadas y estables al terminar.
- **Exportación PDF (FOCO + diagnostics)**: no afectada — el PDF se arma desde el store, no depende del DOM ni de la animación.
- **Sesiones chicas (≤6 conns)**: imperceptible porque el stagger natural del backend (60ms) las dibuja en menos de medio segundo y los remounts no alcanzan a registrarse visualmente.

## Mitigaciones aplicadas en esta sesión (que no resuelven el bug pero lo hacen menos visible)

- **Eliminado el stagger acumulativo CSS** (`STAGGER_S = 0` en FocusEdge y antes en FocusPeripheralNode). Antes había `STAGGER_S = 0.5s × index`, lo que para el último edge daba 16 segundos de delay — ese delay convivía con los remounts y volvía las olas mucho más visibles.
- **Migración de nodos a animación CSS con `forwards`** (en lugar de framer-motion): los nodos quedan estables. Eso descartó el síntoma de "líneas apuntando al vacío" — antes los nodos tardaban en aparecer porque framer-motion reiniciaba la animación con cada re-render.
- **Floating edges**: además de eliminar una causa parcial del remount (handles cardinales rotando), mejoró la calidad visual del grafo final.
- **`BASE_DELAY_S = 0.35` en edges**: garantiza que el nodo termine su animación de entrada antes de que la línea arranque a dibujarse. Ordena el storytelling visual: primero llega la clase, después se conecta.

## Prioridad

**Baja**. No bloquea releases ni el funcionamiento del producto. Es polish de UX.

Para retomar la investigación, el camino propuesto:

1. Probar con un componente edge minimal (sin `useInternalNode`, hardcoded path) para descartar que los hooks de suscripción al store interno sean la fuente del remount.
2. Si el bug persiste con el edge minimal: dive into `@xyflow/react` source. Buscar dónde el `EdgeRenderer` decide remontar componentes vs solo re-renderizarlos.
3. Si el bug solo aparece con `useInternalNode`: alternativa es leer las posiciones de los nodos vía un hook custom que use `useStoreApi().getState()` puntual sin suscripción reactiva, recalculando solo cuando cambia el id del source/target.

## Referencias rápidas

- Floating edges: `codemapper-frontend/src/components/graph/FocusEdge.tsx` (helpers `nodeCenter`, `rectIntersection`).
- Layout radial: `codemapper-frontend/src/components/graph/FocusGraph.tsx` (función `radiusFor`, cálculo de ángulos en el `useMemo`).
- Animación CSS de edge: `codemapper-frontend/src/app/globals.css` (`@keyframes cm-focus-edge-draw` + `.cm-focus-edge-path`).
- Animación CSS de nodo (entrance): `codemapper-frontend/src/app/globals.css` (`@keyframes cm-focus-node-enter` + `.cm-focus-node-enter`).
- Backend que dispara el streaming: `codemapper-backend/src/main/java/com/codemapper/service/FocusTracerService.java` — emite `FocusConnectionEvent` con `Thread.sleep(60)` entre cada uno.
