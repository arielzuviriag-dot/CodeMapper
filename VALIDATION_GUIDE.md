# Guía de validación de resultados — CodeMapper

Documento que describe **cómo Claude debe validar técnicamente los reportes** que genera CodeMapper (vista MapperView, modo FOCO y otros). Aplica cada vez que Ari pida "validar este resultado".

---

## Contexto del producto

- **CodeMapper** es una herramienta de visualización de proyectos: muestra capas, dependencias y relaciones entre clases.
- **MapperView** es la web/cliente desde donde se carga el marco de trabajo y se elige un archivo.
- **Modo FOCO**: Ari elige una clase (ej. un `.java`) y CodeMapper devuelve:
  - Quién **llama a** esa clase (callers).
  - A quién **llama** esa clase (callees / dependencias).
  - Genera un **PDF** con esa información + un **grafo visual**.
- Tiene **planes**: `FREE` limita a **10 conexiones**; `PRO` (y superiores) deberían mostrar todas.
- Repositorio de prueba habitual: **proyecto Mivo** en `C:\Users\ariel\Reserva` (backend Spring Boot en `backend-reserva/`).

---

## Qué tiene que hacer Claude cuando Ari diga "validá este resultado"

### 1. Leer el archivo fuente real

Abrir el `.java` (o el archivo del lenguaje que sea) que CodeMapper analizó. **No confiar solo en el PDF** — el PDF es lo que Ari quiere validar, no la fuente de verdad.

### 2. Construir la lista real de conexiones

A partir del código real, armar dos listas:

- **LLAMADO POR (callers)**: quién importa o referencia esta clase. Buscar con grep por el nombre de la clase en todo el proyecto (`main` y `test`).
- **LLAMA A (callees / dependencias)**: leer los `import`, los campos inyectados, las llamadas a métodos, los tipos usados como parámetro/retorno, las excepciones lanzadas, las anotaciones relevantes, los enums, las clases internas referenciadas.

Distinguir entre:
- **Dependencias de runtime reales** (servicios inyectados, repos, entidades persistidas).
- **Tipos de dominio referenciados** (entities/DTOs/enums usados como tipo).
- **Excepciones custom lanzadas**.
- **SDK / librerías externas** (Firebase, Spring, etc.) — normalmente fuera de scope, pero mencionar si CodeMapper las muestra inconsistentemente.

### 3. Comparar contra el PDF

Cruzar la lista real contra lo que muestra el PDF. Para cada item del PDF:
- ¿Existe en el código? (chequear path del archivo)
- ¿La etiqueta `LLAMADO POR` / `LLAMA A` es correcta?
- ¿La clasificación (cross-package / misma capa / entrada HTTP / JPA / etc.) es razonable?

Para cada conexión real **no mostrada**:
- Anotar qué falta y por qué importa (o por qué quizás no importa).

### 4. Considerar el plan (FREE vs PRO)

- Si es **FREE (10 conexiones)**: validar que las 10 elegidas son **las más relevantes** (típicamente: callers directos + dependencias inyectadas + DTOs de retorno). Sugerir si hubiera mejor selección.
- Si es **PRO**: validar que esté **todo**, incluyendo entidades referenciadas, enums, exceptions custom, clases internas.

### 5. Sugerencias para mejorar el reporte (opcional, pero útil)

Cada validación debería terminar con una sección breve **"qué le agregaría a CodeMapper"** desde la perspectiva del usuario que está validando. Ejemplos:

- Mostrar el **método específico** del caller que invoca al foco (no solo "AuthController llama a AuthService", sino "AuthController.login() llama a AuthService.loginWithFirebaseToken()").
- Distinguir visualmente **dependencias inyectadas** vs **tipos referenciados** vs **excepciones lanzadas**.
- Marcar si una conexión es por **interface** (desacoplamiento) o por **clase concreta**.
- Indicar **acoplamiento cíclico** si lo detecta.
- Mostrar conteo de **invocaciones** (cuántas veces el caller llama al foco) — útil para detectar hot spots.
- En FREE, mostrar un contador "X de Y conexiones — desbloqueá PRO para ver el resto" para que el usuario sepa que está viendo una muestra.
- Diferenciar **callers de producción** vs **callers de tests** (los tests hinchan el grafo pero no son acoplamiento real).
- Para clases con muchos métodos (banderines de "clase grande"), permitir expandir qué métodos del foco son los más llamados.

### 6. Veredicto final

Cerrar con una conclusión clara:

- ✅ **Técnicamente correcto** — los datos del PDF coinciden con el código.
- ⚠️ **Correcto pero incompleto** — todo lo que muestra es real, pero falta X (típico en FREE).
- ❌ **Inconsistencias detectadas** — hay items en el PDF que no existen, o etiquetados mal.

Cuando sea FREE y haya cosas no mostradas, **listar explícitamente qué quedó afuera** — eso es justamente lo que justifica el upgrade a PRO y es la información más accionable para Ari.

---

## Formato de respuesta esperado

```
1. Resumen de qué validé y contra qué fuente
2. Tabla / listado: ítem del PDF → estado (✅ correcto, ⚠️ parcial, ❌ inconsistente)
3. Conexiones reales NO mostradas (si aplica)
4. Sugerencias de mejora para el reporte
5. Veredicto final
```

Mantenerlo conciso. Ari prefiere terse y accionable, no narrativa larga.

---

---

## Filosofía de UX visual

**La prioridad #1 de CodeMapper es que sea visualmente lo más hermoso que un dev experimente.** Cada sugerencia que se haga sobre el producto tiene que pensarse primero como **cómo se ve en pantalla**, no solo como dato. Si una mejora no tiene un tratamiento visual claro, todavía no está madura.

Reglas de oro:
- **Foco = protagonista**: el nodo seleccionado siempre tiene que destacarse del resto del canvas.
- **Sumar sin saturar**: cada dimensión nueva tiene que poder activarse/desactivarse o aparecer solo en hover/selección.
- **Diferenciar por tipo de relación, no solo por color**: usar línea sólida vs punteada, grosor, iconos en el edge — el color solo no alcanza para daltónicos y satura rápido.
- **Defaults sobrios, capas bajo demanda**: el canvas inicial debe verse limpio. Los detalles ricos aparecen al hacer click/hover/toggle.

### Dimensiones de contexto y su tratamiento visual

Estas son las dimensiones validadas con Ari para enriquecer el modo FOCO. La 4 (historia/salud git) queda fuera porque ya la cubre cualquier IDE con git blame.

#### 1. Contrato y superficie

El nodo del foco se transforma en un **"chip con puertos"**:
- Cada **método público** aparece como un pin chiquito en el borde derecho del nodo (tipo conector eléctrico). Hover → tooltip con firma completa.
- **Excepciones lanzadas**: salen del borde inferior como flechas finas con triángulo rojo apuntando a un cluster "Exceptions" debajo del foco.
- **Anotaciones de seguridad** (`@PreAuthorize`, `@Secured`, etc.): badge escudo dorado al lado del método correspondiente.

Resultado: de un vistazo se ve cuántos métodos expone, cómo puede fallar y qué está protegido por rol.

#### 2. Tests y cobertura

- **Toggle arriba a la derecha**: `Mostrar tests [on/off]`. Default off para no inflar el grafo.
- Tests reales: **línea punteada** (vs sólida = runtime) y color gris-azulado en vez del rosado de producción.
- Tests que **mockean** el foco: línea aún más fina, gris claro, con un icono de máscara en el medio del edge — comunica "te mockean acá, no te llaman de verdad".
- **Donut de cobertura** flotando arriba a la derecha del nodo del foco: anillo verde/amarillo/rojo con el % adentro. Click → desglose por método.

Resultado: se distingue runtime real vs test vs mock, y se ve la salud de testing sin salir de la herramienta.

#### 3. Configuración e infraestructura

Una **barra de chips horizontal** debajo del nodo del foco, scrolleable si hay muchos:
- `@Transactional` — chip azul
- `@Cacheable("auth")` — chip violeta
- `app.jwt.secret` — chip gris con icono de llave (property que lee de `application.yml`)
- `V42__add_users.sql` — chip con icono de DB (migración relacionada si el foco toca entities)

Click en cualquier chip → abre el archivo o muestra el valor. Property no definida en `application.yml` → chip rojo con `!`.

Resultado: el "comportamiento implícito" del Java (cache, transacción, async) deja de ser invisible.

#### 5. Radio de impacto

Botón flotante arriba: **"Simular cambio"**. Al activarlo:
- Todo el canvas se atenúa al 30%.
- El foco queda al 100%.
- **Callers directos**: brillo naranja sólido.
- **Callers indirectos** (transitivos, 2+ saltos): naranja más tenue.
- **Tests que romperían**: contorno rojo punteado con pulso lento.
- Contador grande arriba: **"Cambiar este Java impacta: N archivos · M tests"**.

**Acoplamiento cíclico**: línea roja gruesa rodea el ciclo, con fondo translúcido rojo y pulso lento. Imposible de no ver.

Resultado: antes de tocar el Java, el dev sabe qué se rompe.

---

## Lo que NO hay que hacer

- No inventar conexiones que no existen en el código.
- No marcar como "falta" algo que CodeMapper deliberadamente excluye (ej. `java.util.*`, anotaciones de Spring, Lombok generado).
- No sugerir features triviales ya obvias ("agregar colores"). Las sugerencias tienen que venir de algo concreto que vi al validar.
- No asumir que un test que mockea la clase es un caller "real" — anotarlo aparte.
