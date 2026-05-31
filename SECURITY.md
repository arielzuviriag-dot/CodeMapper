# Seguridad y modo multiusuario — CodeMapper

> Estado: la app NO tiene aún autenticación ni base de datos de usuarios. Este
> documento describe (a) cómo endurecerla para que varios usuarios la usen a la
> vez sin que puedan leer/escribir el disco del servidor ni pegarle a la red
> interna, y (b) qué falta todavía. **En local, sin setear nada, funciona igual
> que siempre.**

## Modelo de despliegue

| Modo | Cómo | Riesgo |
|------|------|--------|
| **Local (1 usuario)** | No se setea ninguna env de seguridad. | El usuario apunta a sus propias carpetas; acceso a disco es el suyo. OK. |
| **Multiusuario / servidor** | Se setean las envs de abajo. | Sin ellas, sería lectura/escritura arbitraria del disco del server. Con ellas, queda acotado. |

## Variables de entorno de seguridad

### Frontend (Next.js) — IA.Grafo

IA.Grafo lee (y en "Aplicar" escribe) archivos del proyecto según el
`projectPath` que manda el cliente. Para multiusuario:

- **`IA_ALLOWED_ROOTS`** — lista de carpetas absolutas permitidas, separadas por
  `;` o `,`. Todo `projectPath` debe vivir dentro de alguna (se resuelven
  symlinks con realpath para que no se escape). Si no se setea → modo local, sin
  restricción.
  - Ej: `IA_ALLOWED_ROOTS=/srv/repos`
- **`IA_DISABLE_APPLY=1`** — deshabilita por completo la escritura a disco
  (botón "Aplicar"). Recomendado en servidores compartidos: que la IA solo
  analice y proponga, pero no escriba.
- **`ANTHROPIC_API_KEY`** vía cookie httpOnly por usuario (modo API), o **modo
  manual** (sin API, el usuario usa su propia cuenta de claude.ai). La key nunca
  llega al browser (cookie httpOnly, server-only).
- **`IA_GRAFO_MODEL`** — modelo de Claude (default `claude-opus-4-8`).

Rutas afectadas (todas validan `IA_ALLOWED_ROOTS`): `/api/ia/chat`,
`/api/ia/source`, `/api/ia/apply`, `/api/ia/manual/prompt`.

### Backend (Spring, :8090)

- **`CODEMAPPER_CORS_ALLOWED_ORIGIN_PATTERNS`** (o property
  `codemapper.cors.allowed-origin-patterns`) — orígenes CORS permitidos,
  separados por coma. Default: cualquier puerto de `localhost`/`127.0.0.1`. En
  producción, poné el dominio real (no uses `*`).
  - Ej: `CODEMAPPER_CORS_ALLOWED_ORIGIN_PATTERNS=https://codemapper.miempresa.com`

## Mitigaciones ya implementadas

- **Anti-SSRF en clone de GitHub** (`GitService.validateRepoUrl`): solo http(s),
  bloquea `file://`/`ssh://`/`git://` y hosts loopback/privados/link-local (no se
  puede usar el clone para pegarle a servicios internos ni leer el filesystem).
- **Anti path-traversal**: las rutas de IA resuelven y validan que el archivo
  caiga dentro del root permitido (realpath); `getProjectFile` resuelve symlinks
  antes de validar contra los roots de la sesión.
- **CORS** acotado a localhost por defecto, configurable por env.
- **Sesiones** aisladas por `sessionId` (UUID) — un usuario no ve la sesión de
  otro si no tiene el id.

## Lo que TODAVÍA falta (roadmap de seguridad)

- 🔲 **Autenticación + base de datos de usuarios** (login, dueño de cada sesión).
  Hoy cualquiera con el `sessionId` accede a esa sesión.
- 🔲 **Rate limiting / cuotas** por usuario (anti-DoS: repos enormes, muchos
  análisis, loops largos de IA).
- 🔲 **Timeout por tarea del `ExecutorService`** y limpieza de SSE emitters
  (hoy una tarea colgada puede acumular threads).
- 🔲 **Cifrado en reposo** de la API key (hoy va en cookie httpOnly en claro).
- 🔲 **Allowlist de carpetas también en el backend** para `/api/analyze/path` y
  el scan de front (`/api/trace/frontend-scan`), que hoy aceptan rutas del
  cliente (pensados como features de dev local).
