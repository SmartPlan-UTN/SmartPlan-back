# SmartPlan — Definition of Done

> Núcleo compartido. Este archivo es idéntico en `SmartPlan-front` y `SmartPlan-back`.
> Si lo modificás, replicá el cambio en el otro repositorio.

**Terminado no es "anda en mi máquina".** Un issue está terminado cuando cumple
todo lo que sigue. Mientras falte algo, el issue no se cierra y el PR no se
mergea, por más que el código funcione.

La lista corta vive en la plantilla de PR
([`.github/pull_request_template.md`](../../.github/pull_request_template.md)),
que se llena sola al abrir el pull request. Este archivo es el detalle: el
**por qué** de cada punto.

---

## 1. Alcance

- **Se cumplen todos los criterios de aceptación del issue.** Si alguno no se
  puede cumplir, no se borra: se explica en *Qué queda afuera* del PR.
- **Lo que quedó afuera está escrito.** Un alcance recortado en silencio se
  descubre en la demo, que es el peor momento.
- **La deuda técnica que dejás tiene issue propio.** Un `TODO` en el código no es
  un plan de trabajo.

## 2. Código

- **`pnpm lint` sin errores.** Cero. Los warnings se revisan, pero no bloquean.
- **`pnpm build` pasa.** Si no compila, no está terminado.
- **Nada de credenciales, tokens ni URLs hardcodeadas.** Todo por variables de
  entorno. Un secreto commiteado queda en el historial de git para siempre.
- **Sin `console.log` de depuración** ni código comentado "por las dudas". Para
  eso está el historial.
- **Los nombres del dominio en español**, como en `skills/01-dominio/`. Es lo que
  sostiene la trazabilidad CU → código que exige el entregable.
- **Los `eslint-disable` llevan motivo escrito.** Sin motivo, es una regla
  apagada para que deje de molestar.

## 3. Específico del front

- **`pnpm test` en verde.** Un test roto bloquea el PR igual que un error de lint
  o de compilación.
- **Estilos con los tokens del design system.** Ningún hex escrito a mano
  (`skills/06-design-system/`).
- **Estados de carga, error y vacío** contemplados en toda pantalla que consuma
  la API. La pantalla feliz es el caso menos frecuente en producción.
- **Sin `any`** y **sin promesas sin manejar**: ESLint las tiene en error por algo.
- **Responsive**: se probó en viewport chico, no solo en el monitor de quien lo
  escribió.
- **Accesibilidad mínima**: los controles se alcanzan con el teclado, las imágenes
  tienen `alt`, los campos tienen `label`.

## 4. Específico del back

- **Toda entrada de la API se valida con un DTO y `class-validator`.**
- **Ninguna respuesta expone campos sensibles** (contraseñas, tokens, hashes).
- **`pnpm test` en verde**, y el caso de uso tiene al menos un test que cubre el
  camino feliz y uno de error.
- **Los cambios de esquema van con migración**, no con `synchronize`.

## 5. Git y revisión

- **La rama sale de `develop`** y se llama `SMART-<id>-<descripcion>`.
- **El PR va contra `develop`**, nunca contra `main`.
- **El PR responde las tres preguntas**: qué hace, cómo probarlo, qué queda afuera.
- **El PR cierra el issue con `Closes #NN`.** Es lo que arma la trazabilidad
  issue → PR → commit.
- **2 aprobaciones.** Está forzado por la protección de rama: no hay atajo.
- **Sin conflictos con `develop`** al momento de mergear.

## 6. Documentación

- **[`SEGUIMIENTO.md`](../../SEGUIMIENTO.md) actualizado**: estado, fecha, rama y
  PR. Es lo que permite retomar sin releer el historial de git.
- **Las decisiones técnicas no obvias** van en la sección *Decisiones* de ese
  mismo archivo, con el motivo. Sirve para no rediscutir lo mismo dos veces.
- **Si cambiaste una convención**, actualizá la skill correspondiente. Y si la
  skill es compartida, replicala en el otro repositorio.

---

## Cuándo cambia una fila de estado

| Estado | Cuándo |
|---|---|
| `En progreso` | Hay una rama abierta con trabajo real |
| `En revisión` | PR abierto, esperando las 2 aprobaciones |
| `Finalizado` | PR **mergeado** a `develop` |

Un issue no pasa a `Finalizado` con el PR abierto. Y un CU del front no se marca
`Finalizado` hasta que el endpoint del back existe y está integrado: si la
pantalla anda contra datos mockeados, el caso de uso no está hecho.

## Qué no es parte de la DoD

Para que la lista siga siendo creíble, esto queda explícitamente afuera:

- **Un umbral global de cobertura en el front.** La infraestructura de tests ya
  existe, pero F20 no fija un porcentaje mínimo. Esa política requiere una
  decisión separada del equipo.
- **Despliegue.** Mergear a `develop` no despliega nada. El deploy sale de `main`
  y es trabajo aparte.
- **Revisión de diseño pixel a pixel.** Se revisa contra los tokens y el
  prototipo, no con regla.

## Cómo se cambia este documento

Se acordó en el refinamiento del **Sprint 0** y aplica a los dos repositorios. Se
cambia por PR, con las mismas 2 aprobaciones que cualquier otro cambio, y el
motivo del cambio va en la descripción del PR. Si un punto se vuelve imposible de
cumplir de forma sistemática, se saca de la lista y se dice por qué: una DoD que
todos incumplen no ordena nada.
