---
name: smartplan-testing
description: Cómo se testea el backend — qué es unitario y qué es e2e, la base de prueba aislada, cómo mockear dependencias y qué se espera de un CU antes de darlo por terminado. Leer antes de escribir el primer test de un caso de uso.
---

# SmartPlan Back — Testing

Específico de `SmartPlan-back`.

## Los dos tipos de test

| | Unitario | E2E |
|---|---|---|
| Archivo | `<algo>.spec.ts`, al lado del código | `<modulo>.e2e-spec.ts`, en `test/` |
| Comando | `pnpm test` | `pnpm test:e2e` |
| Qué prueba | Una clase, aislada | La app entera, por HTTP |
| Dependencias | Mockeadas | Reales |
| Base de datos | **No** | Sí, `smartplan_test` |
| Cuánto tarda | Milisegundos | Segundos |

La diferencia la hace el nombre del archivo: `.spec.ts` lo toma `pnpm test`,
`.e2e-spec.ts` lo toma `pnpm test:e2e`. No hay que registrar nada en ningún lado.

**Un unitario nunca toca la base.** Si para escribir el test necesitás la base
levantada, o es un e2e, o al servicio le falta que le inyecten el repositorio en
vez de construirlo adentro.

## Comandos

```bash
pnpm test               # unitarios
pnpm test:watch         # unitarios en watch, mientras escribís
pnpm test:cov           # unitarios con cobertura → coverage/
pnpm db:up              # levantar PostgreSQL (los e2e lo necesitan)
pnpm test:e2e           # e2e
```

Un test suelto:

```bash
pnpm test planes.service           # por nombre de archivo
pnpm test -t "rechaza un plan"     # por nombre del test
```

## Los moldes

Hay tres archivos escritos para copiar y pegar. Están comentados de más a
propósito: son la referencia, no código de producción.

| Molde | Archivo | Muestra |
|---|---|---|
| Servicio | [`src/app.service.spec.ts`](../../src/app.service.spec.ts) | La estructura de un unitario |
| Controller | [`src/app.controller.spec.ts`](../../src/app.controller.spec.ts) | Cómo se mockea una dependencia |
| Endpoint | [`test/app.e2e-spec.ts`](../../test/app.e2e-spec.ts) | Cómo se le pega a la app por HTTP |

## Mockear un repositorio de TypeORM

El caso que más va a aparecer: un servicio inyecta `Repository<Entidad>` y el
unitario tiene que reemplazarlo. El token de inyección lo da
`getRepositoryToken()`.

```ts
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlanesService } from './planes.service';

describe('PlanesService', () => {
  let servicio: PlanesService;
  // Tipar el doble contra el repositorio real hace que el test deje de
  // compilar si cambia una firma. `jest.Mocked<Pick<...>>` obliga a declarar
  // solo los métodos que el servicio realmente usa.
  let repositorio: jest.Mocked<Pick<Repository<Plan>, 'findOne' | 'save'>>;

  beforeEach(async () => {
    repositorio = { findOne: jest.fn(), save: jest.fn() };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesService,
        { provide: getRepositoryToken(Plan), useValue: repositorio },
      ],
    }).compile();

    servicio = modulo.get(PlanesService);
  });

  describe('consultar', () => {
    it('devuelve el plan cuando existe (CU13)', async () => {
      const plan = { id: 1, nombre: 'Tarde en el parque' } as Plan;
      repositorio.findOne.mockResolvedValue(plan);

      await expect(servicio.consultar(1)).resolves.toEqual(plan);
    });

    it('lanza NotFoundException cuando no existe (CU13)', async () => {
      repositorio.findOne.mockResolvedValue(null);

      // El camino de error es la mitad del test, no un extra: es donde más se
      // rompe y lo que define el código HTTP que ve el front.
      await expect(servicio.consultar(99)).rejects.toThrow(NotFoundException);
    });
  });
});
```

`clearMocks: true` está activado en la configuración de Jest, así que los mocks
se limpian solos entre tests: no hace falta `jest.clearAllMocks()` en un
`afterEach`.

Para reemplazar una dependencia **dentro de un e2e** (típicamente un servicio que
sale a internet, como Google Maps o Gemini), el punto de extensión es el
parámetro de `crearAppDePrueba`:

```ts
const app = await crearAppDePrueba((modulo) =>
  modulo.overrideProvider(ServicioDeGoogleMaps).useValue(mapaFalso),
);
```

## La base de prueba aislada

Los e2e levantan el `AppModule` completo, y eso abre una conexión real a
PostgreSQL con `synchronize: true` — o sea, TypeORM reescribe el esquema para que
coincida con las entidades. Contra la base de desarrollo eso significa perder
datos.

Por eso los e2e corren contra **otra base en el mismo servidor**:

```
smartplan        desarrollo — tus datos
smartplan_test   tests      — se vacía en cada corrida
```

Cómo funciona, en orden:

| Paso | Archivo | Qué hace |
|---|---|---|
| 1 | `test/base-de-datos-de-prueba.ts` | Calcula el nombre (`<DB_NAME>_test`) y reescribe el entorno: `DB_NAME` y la base dentro de `DATABASE_URL` |
| 2 | `test/preparar-base-de-datos.ts` | `globalSetup`: crea la base si no existe y deja el esquema vacío |
| 3 | `test/entorno-de-prueba.ts` | `setupFiles`: carga el `.env`, completa las claves ficticias y aplica el paso 1 en cada suite |

**No hay que preparar nada a mano.** Con la base levantada (`pnpm db:up`),
`pnpm test:e2e` crea `smartplan_test` en la primera corrida.

### La red de seguridad

`exigirSufijoDePrueba` corta la corrida si el nombre de la base no termina en
`_test`:

```
La base de prueba es "smartplan", que no termina en "_test".
Los tests borran y recrean el esquema, así que solo corren contra una base de prueba.
```

Es una excepción y no un warning a propósito: preferimos un test que no corre
antes que un `DROP SCHEMA` contra la base equivocada. Si ves ese error, revisá
`DB_NAME_TEST` en tu `.env`.

### Datos de un test

El esquema se vacía **una vez por corrida**, no entre tests. Si dos tests de la
misma suite se pisan, limpiá vos las tablas involucradas en el `beforeEach`:

```ts
const planes = app.get<Repository<Plan>>(getRepositoryToken(Plan));

beforeEach(async () => {
  await planes.delete({});
});
```

Los e2e corren con `maxWorkers: 1` — de a uno y no en paralelo — justamente
porque comparten esa única base. No lo saques.

## Configuración de Jest

Son dos configuraciones separadas porque los dos tipos de test necesitan cosas
distintas:

| | Unitarios | E2E |
|---|---|---|
| Dónde | campo `jest` de `package.json` | `test/jest-e2e.json` |
| Qué toma | `src/**/*.spec.ts` y `test/**/*.spec.ts` | `test/**/*.e2e-spec.ts` |
| `globalSetup` | — | `preparar-base-de-datos.ts` |
| `setupFiles` | `reflect-metadata` | + `entorno-de-prueba.ts` |
| `maxWorkers` | por defecto (paralelo) | `1` |
| `testTimeout` | 5 s | 30 s |

La cobertura (`pnpm test:cov`) deja afuera `main.ts`, los `*.module.ts`, el
`data-source.ts` y las migraciones: son cableado sin lógica propia, y contarlos
solo ensucia el número. Lo que los ejercita son los e2e.

## Qué se espera de un CU

De `AGENTS.md` y de `SEGUIMIENTO.md`:

> Un CU no se da por terminado sin al menos un test del camino feliz.

En la práctica, para un CU con endpoint:

- [ ] Un unitario del servicio: camino feliz **y** el error que corresponda
      (`NotFoundException`, `ForbiddenException`, …).
- [ ] Un e2e del endpoint: código HTTP y forma de la respuesta.
- [ ] Si el endpoint recibe un DTO, un e2e que mande un cuerpo inválido y espere
      `400`.
- [ ] El nombre del test dice el comportamiento, no el método: `'rechaza un plan
      sin actividades'`, no `'test crear'`. Referenciá el CU entre paréntesis.

**Antes de abrir el PR:** `pnpm lint`, `pnpm test` y `pnpm test:e2e`.

## Errores frecuentes

| Síntoma | Causa |
|---|---|
| `No se pudo preparar la base de prueba` | PostgreSQL no está levantado → `pnpm db:up` |
| `La base de prueba es "..." que no termina en "_test"` | `DB_NAME_TEST` mal configurada en el `.env` |
| `A worker process has failed to exit gracefully` | Falta `await app.close()` en el `afterAll` del e2e |
| `Cannot find module 'src/...'` en un e2e | Los e2e importan con ruta relativa (`../src/...`), no con alias |
| Un test pasa solo y falla con los demás | Estado compartido en la base: limpiá las tablas en el `beforeEach` |
| `ECONNREFUSED ... 5672` en un e2e | RabbitMQ no está levantado → `pnpm db:up` (desde F12, `AppModule` abre la conexión AMQP al arrancar — como rol `'productor'`, solo declara el exchange principal, no colas, pero igual necesita conectar) |
| `PRECONDITION_FAILED ... x-message-ttl` al correr el spike de RabbitMQ o el worker | Las colas de retry ya existen con un TTL distinto al configurado (`RABBITMQ_RETRY_DELAYS_MS` cambió, o quedaron con el TTL corto del spike) — borrá todas las colas `smartplan.jobs.example.retry.*` desde el panel (http://localhost:15672) y reiniciá |
