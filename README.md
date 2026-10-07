# Brote — simulador de vida (Filosofía II)

> "Tú no eres tu contexto, sino tus decisiones."

## Correr

```bash
npm start          # http://localhost:3000  (PORT=4000 npm start para otro puerto)
npm run dev        # reinicia el servidor al editar código
npm run validate   # revisa tus JSON
npm run simulate   # juega 2000 partidas y reporta balance
```

Solo necesitas Node 18+. No hay dependencias.

## Estructura

```
server.js              servidor HTTP + API
server/loader.js       lee /data
server/validate.js     valida el contenido
data/
  meta.json            título, frase, acerca de, créditos, música
  game.json            estadísticas, etapas y reglas globales
  endings.json         cierres posibles
  questions/*.json     preguntas (los archivos que empiezan con "_" se ignoran)
arbol/                 componente del árbol (TypeScript)
public/
  js/engine/           motor puro (también lo usa tools/simulate.js)
  js/tree/             adaptador del árbol (+ arbol.js compilado)
  js/ui/               escenas, estadísticas, ajustes
tools/                 validate.js, simulate.js
```

El contenido se relee en cada petición: editas un JSON y recargas el navegador.

## API

| Ruta | Devuelve |
|---|---|
| `GET /api/content` | todo el contenido + reporte de validación |
| `GET /api/questions?stage=juventud` | preguntas (opcionalmente de una etapa) |
| `GET /api/questions/:id` | una pregunta |
| `GET /api/report` | errores y advertencias de los JSON |

Si sirves el frontend desde otro dominio, pon la URL del backend en
`<meta name="api-base">` de `public/index.html` (la API ya envía CORS).

## Formato de flujos (el que usan tus JSON)

Un archivo por etapa. El juego empieza en `startNode` y cada opción lleva al nodo de `next`;
`next: null` termina la etapa. El orden de las etapas lo define `game.json → stages`
(si `nextStage` no coincide, el validador avisa).

```json
{
  "stage": "adolescencia",
  "requiredChoices": 8,
  "startNode": "inicio",
  "nextStage": "juventud",
  "statOrder": ["aprendizaje", "bienestar", "relaciones", "recursos"],
  "initialStats": [50, 50, 50, 50],
  "nodes": {
    "inicio": {
      "prompt": "¿Cómo organizas una semana con un examen y planes con tus amistades?",
      "options": [
        { "id": "a", "text": "…", "next": "estudio",
          "outcome": { "text": "…", "delta": [3, -1, 2, 0] },
          "when": { "stat": "recursos", "gte": 30 } }
      ]
    }
  }
}
```

- `delta` sigue el orden de `statOrder`. `initialStats` (si existe) fija los valores iniciales.
- `when` acepta `gte`, `gt`, `lte` y `lt`. Las opciones con `gte`/`gt` que no se cumplen se muestran
  bloqueadas ("requiere Aprendizaje de 60 o más") y cuentan como caminos cerrados en el final. Las
  opciones con `lt`/`lte` son variantes para quien tiene poco de algo: si no aplican, se ocultan.
- El validador revisa que todos los `next` existan, que no haya ciclos, que todos los caminos midan
  `requiredChoices`, que no haya nodos inalcanzables y que ningún nodo pueda quedarse sin opciones.

## Formato de preguntas sueltas (alternativo)

Un archivo puede ser un arreglo o `{ "stage": "juventud", "questions": [...] }`
(las preguntas heredan esa etapa).

```json
{
  "id": "teen_exam_01",
  "stage": "adolescencia",
  "question": "Tienes un examen importante esta semana, pero tus amigos quieren salir.",
  "context": "Opcional, texto secundario.",
  "requires": { "stats": { "aprendizaje": { "min": 40 } } },
  "onlyIfUnlocked": false,
  "priority": 0,
  "order": 1,
  "answers": [
    {
      "id": "bloques",
      "text": "Organizar bloques fijos para estudiar y salir",
      "effects": { "aprendizaje": 8, "relaciones": 4, "bienestar": -2 },
      "requires": { "flags": ["organizado"] },
      "lockedText": "requiere haberte organizado antes",
      "hideIfLocked": false,
      "outcome": "Texto breve que aparece al elegirla.",
      "flags": ["organizado"],
      "removeFlags": [],
      "unlocks": ["youth_beca_01"],
      "blocks": ["youth_fiesta_01"],
      "later": [
        { "after": 3, "effects": { "recursos": 5 }, "message": "Aquello rindió frutos." },
        { "stage": "adultez", "effects": { "aprendizaje": 4 }, "requires": { "stats": { "aprendizaje": { "min": 60 } } } }
      ]
    }
  ]
}
```

Campos obligatorios: `id`, `stage`, `question`, `answers[].text`. El resto es opcional.
Si una respuesta no tiene `id`, se le asigna `a`, `b`, `c`…

**Selección:** en cada etapa aparecen las preguntas disponibles no vistas, primero las de mayor
`priority`, luego por `order` (o por orden en el archivo). Con `"pick": "random"` en la etapa se
eligen al azar. `maxQuestions` limita cuántas se responden por etapa. Una pregunta sin ninguna
respuesta disponible se salta.

**Respuestas bloqueadas** se muestran atenuadas con el motivo ("requiere Aprendizaje de 60 o más"),
salvo que tengan `hideIfLocked: true`. Se cuentan como "caminos cerrados" en la reflexión final.

### Condiciones (`requires`, `when`)

```json
{
  "stats":    { "aprendizaje": { "min": 60 }, "bienestar": { "max": 30 } },
  "flags":    ["pasion"],
  "notFlags": ["agotamiento"],
  "chose":    ["teen_exam_01:bloques", "teen_friend_01"],
  "notChose": ["..."],
  "unlocked": ["evento_x"],
  "trend":    { "bienestar": { "down": 3 }, "aprendizaje": { "up": 5 } },
  "any":      [ { "...": "..." }, { "...": "..." } ]
}
```

Todo se combina con Y; `any` permite O. `min`/`max` son inclusivos.

### Reglas globales (`game.json → rules`)

Se disparan cuando se cumple `when`, tras cada decisión y al entrar a cada etapa:

```json
{ "id": "agotamiento", "when": { "stats": { "bienestar": { "max": 22 } } },
  "effects": { "aprendizaje": -3 }, "flags": ["agotamiento"], "message": "...", "once": true }
```

### Finales (`endings.json`)

Se elige el de mayor `priority` cuya condición `requires` se cumpla. Nunca dicen "ganaste" o "perdiste".

## El árbol

El árbol es el componente de `arbol/` (TreeController + model, sin modificar). `arbol/mountArbol.ts`
es su versión sin React (misma estructura y CSS que `ArbolSVG.tsx`) y `public/js/tree/PersistentTree.js`
lo conecta con la partida. Si cambias algo en `arbol/`, corre `npm run build:tree`.

El árbol tiene 15 pasos (brote → árbol desarrollado). El juego reparte sus decisiones en esos pasos
según cuántas faltan por responder; al terminar, `dry()` completa lo que falte, caen las hojas y se
seca. La forma del árbol depende de la semilla (la partida guarda la suya).

## Música

Por defecto se genera un fondo ambiental con Web Audio. Para usar un archivo propio, colócalo en
`public/audio/` y pon `"music": { "src": "/audio/tu-archivo.mp3" }` en `meta.json`.
