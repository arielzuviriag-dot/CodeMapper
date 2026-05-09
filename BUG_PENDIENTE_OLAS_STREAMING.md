# Bug pendiente — "olas" durante streaming SSE en modo FOCO

**Fecha del registro**: 2026-05-08
**Prioridad**: Baja — UX durante streaming, no afecta grafo final ni exportación.

## Síntoma

Durante el streaming SSE en modo FOCO, los edges (líneas) entre el nodo central y los periféricos se desmontan y remontan múltiples veces a medida que llegan nuevas conexiones. Cada remount reinicia la animación CSS `cm-focus-edge-draw` desde cero (`stroke-dashoffset: 1500, opacity: 0`), generando "olas" visuales: el usuario ve aparecer ~10 líneas → desaparecer → re-aparecer → desaparecer → al final del análisis aparecen las 32 desde cero.

Sucede tanto en FREE como en PRO. El grafo **final** se ve correctamente; el problema es la experiencia durante los ~11s que dura el streaming en sesiones grandes.

## Datos confirmados

Instrumentación: `console.count(\`FocusEdge mount ${id}\`)` dentro de un `useEffect(() => {...}, [])` en `FocusEdge.tsx`.

| Sesión | Edge medido | Mounts |
|---|---|---|
| PRO User (32 conns), handles cardinales originales | `AdminRateLimitController` | 18× |
| PRO User (32 conns), después de migrar a floating edges | `AdminRateLimitController` | 58× |

El número de remounts AUMENTÓ después del intento de fix con floating edges. La eliminación de `sourceHandle`/`targetHandle` no fue la causa raíz — quizás fue una causa parcial, pero al sacarla destapamos otra que es peor.

## Lo que NO es la causa (descartado por evidencia)

- **`nodeTypes` y `edgeTypes`** — declarados como constantes module-level en `FocusGraph.tsx:26-33`. Referencias estables.
- **Selectores Zustand** — `FocusGraph` usa selectores específicos por slice (`useGraphStore((s) => s.focusConnections)`), no desestructura el store completo.
- **`sourceHandle` / `targetHandle` rotando con la posición** — eliminados completamente al migrar a floating edges. El bug persiste.

## Lo que se cambió en este intento (mantenido aunque no resolvió el bug)

Migración a **floating edges** en FocusGraph:
- Borrada la función `pickHandles()` en `FocusGraph.tsx`.
- Quitados `sourceHandle` y `targetHandle` del objeto edge.
- `FocusEdge.tsx` ahora usa `useInternalNode(source)` + `useInternalNode(target)` para leer las posiciones de los nodos del store interno de ReactFlow, y calcula los endpoints como la intersección de la línea centro-a-centro con el rectángulo de cada card (helper `rectIntersection()`).

**Por qué se mantuvo aunque no resolvió el bug**: mejora la calidad visual del grafo final. Las líneas ahora apuntan al borde exacto del card más cercano al otro nodo, en vez de snapear a uno de cuatro handles cardinales. Es una mejora neta independiente del bug.

## Hipótesis pendientes para investigar

1. **El array `nodes` con posiciones cambiantes**: cada nueva conexión hace que `radiusFor(N)` crezca (al cruzar N=6 y al pasar N>10) y que todos los ángulos `(i / N) * 2π` se recalculen. Esto cambia la posición de cada nodo en el array `nodes` que recibe `<ReactFlow>`. ReactFlow podría estar tratando posiciones drásticamente nuevas como una invalidación interna del edge layer y recreando los componentes.
2. **`useInternalNode()` puede estar suscribiéndose mal**: ahora que cada FocusEdge usa `useInternalNode(source)` + `useInternalNode(target)`, podría estar generando re-renders cascada que en alguna interacción con el ciclo interno de ReactFlow terminan en remount. El aumento de 18→58 mounts coincide con haber agregado dos `useInternalNode` por edge.
3. **Strict Mode de React 19**: en dev amplifica todo por 2 (intencionalmente, para detectar lógica impura). Si el componente está en un punto donde Strict Mode hace doble-mount/desmount inicial, los números podrían estar inflados artificialmente. Vale verificar el mismo escenario en build de producción para descartar.
4. **El campo `data: { ... }` recreado en cada `useMemo` recompute**: aunque ReactFlow normalmente diffea por id, si en su lógica interna detecta cambios de `data` (nueva referencia siempre), podría estar tratándolo como un edge nuevo en algunos paths. Vale probar memoizar el `data` por edge id.
5. **Interacción `fitView` + ReactFlow internals**: en `FocusGraph.tsx:185-190` hay un `useEffect` que dispara `fitView` con cada cambio de `focusConnections.length`. La cámara se anima 600ms en cada arribo. Si la animación de viewport interfiere con la reconciliación de edges (poco probable pero no descartado), podría amplificar el remount.

## Impacto en producto

- **UX durante streaming (~11s para una sesión PRO de 32 conns)**: el usuario ve "olas" en lugar de un dibujado progresivo limpio. Distrae pero no impide entender el grafo.
- **Grafo final**: se ve correctamente. Las 32 conexiones quedan dibujadas y estables al terminar.
- **Exportación PDF (FOCO + diagnostics)**: no afectada — el PDF se arma desde el store, no depende del DOM ni de la animación.
- **Modo PRO con clases pequeñas (≤6 conns)**: el efecto es menos perceptible porque el stagger total es corto (~3.6s) y hay menos remounts.

## Prioridad

**Baja**. No bloquea releases ni el funcionamiento del producto. Es polish de UX. Para retomar:

1. Probar en build de producción (sin Strict Mode) primero para descartar inflación artificial del counter.
2. Si el remount persiste en prod: investigar hipótesis #1 (nodes con posiciones cambiantes) y #4 (memoización de `data`) en ese orden — son las más baratas de probar.
3. Si ninguna de esas anda: dive into ReactFlow source para entender qué dispara la recreación interna del edge layer cuando los nodos se mueven mucho.

## Referencias rápidas

- Código del fix de floating edges: `codemapper-frontend/src/components/graph/FocusEdge.tsx` (helpers `nodeCenter`, `rectIntersection`).
- Código del layout radial: `codemapper-frontend/src/components/graph/FocusGraph.tsx` (función `radiusFor`, cálculo de ángulos en el `useMemo`).
- CSS de la animación: `codemapper-frontend/src/app/globals.css:246-257` (`@keyframes cm-focus-edge-draw` + `.cm-focus-edge-path`).
- Backend que dispara el streaming: `codemapper-backend/src/main/java/com/codemapper/service/FocusTracerService.java` — emite `FocusConnectionEvent` con `Thread.sleep(60)` entre cada uno.
