# Autenticación y control de acceso

Contrato de la API para CU1–CU4. Todos los cuerpos de entrada se validan y los
errores siguen el formato uniforme documentado en `docs/calidad.md`.

## Endpoints

| Método | Ruta | Entrada | Estado feliz | Errores específicos |
|---|---|---|---:|---|
| `POST` | `/api/usuarios` | `nombre`, `apellido`, `email`, `contrasena` | `201` | `409 EMAIL_YA_REGISTRADO` |
| `POST` | `/api/sesiones` | `email`, `contrasena` | `201` | `401 CREDENCIALES_INVALIDAS`, `403 CUENTA_SUSPENDIDA`, `403 CUENTA_BANEADA` |
| `POST` | `/api/sesiones/renovaciones` | Cookie refresh | `200` | `401 REFRESH_AUSENTE`, `401 TOKEN_INVALIDO`, `401 SESION_INVALIDA`, `401 REFRESH_REUTILIZADO` |
| `DELETE` | `/api/sesiones` | Cookie refresh opcional | `204` | Idempotente |
| `POST` | `/api/recuperaciones-contrasena` | `email` | `202` | `404 EMAIL_NO_REGISTRADO`, `503 CORREO_NO_DISPONIBLE` |
| `PATCH` | `/api/recuperaciones-contrasena` | `token`, `nuevaContrasena` | `204` | `400 TOKEN_RECUPERACION_INVALIDO`, `410 TOKEN_RECUPERACION_VENCIDO`, `409 TOKEN_RECUPERACION_USADO` |

Toda propiedad no declarada se rechaza con `400 VALIDACION_FALLIDA`. Los emails
se recortan y normalizan a minúsculas. Las contraseñas nuevas y la credencial
de login admiten entre 12 y 128 caracteres.

### Respuesta de sesión

Registro, login y renovación devuelven este contrato; rol y permisos se leen de
PostgreSQL en cada petición protegida y no son claims del JWT:

```json
{
  "tokenAcceso": "...",
  "tipoToken": "Bearer",
  "expiraEn": 900,
  "usuario": {
    "id": 1,
    "nombre": "Ana",
    "apellido": "Pérez",
    "email": "ana@example.com",
    "rol": { "key": "usuario", "nombre": "Usuario" },
    "permisos": ["perfil.consultar"]
  }
}
```

El refresh nunca aparece en JSON: viaja en la cookie `smartplan_refresh`,
`HttpOnly`, `SameSite=Lax`, `Max-Age=2592000` y path `/api/sesiones`; en
producción también lleva `Secure`.

El frontend envía el access como `Authorization: Bearer <token>` y usa
`credentials: 'include'` al renovar o cerrar sesión. Al recargar la página
realiza una sola renovación en curso: dos renovaciones concurrentes con el
mismo token se interpretan como reutilización y revocan esa sesión.

## Seguridad

- Access JWT: 15 minutos. Refresh JWT rotativo: 30 días.
- Access y refresh usan secretos, audiencias y tipo de claim diferentes; rol y
  permisos no viajan en el JWT.
- Contraseñas: Argon2id con 19 MiB, 2 iteraciones y paralelismo 1.
- Cada request protegido consulta la sesión, el estado de la cuenta y los
  permisos vigentes en PostgreSQL; logout, suspensión y baneo son inmediatos.
- El cambio por recuperación revoca todas las sesiones. El token es opaco, de
  un solo uso y vence en 30 minutos.
- Los endpoints con cookie rechazan un encabezado `Origin` diferente de
  `FRONTEND_URL`. CORS admite credenciales solo desde ese origen.
- Los hashes, contraseñas y tokens no se incluyen en respuestas, auditoría ni
  logs.
- `@Public()` marca las rutas abiertas. Las demás pasan por el guard global;
  `@Roles()` acepta cualquiera de los roles declarados y `@Permisos()` exige
  todos los permisos declarados.

## Códigos específicos

`EMAIL_YA_REGISTRADO`, `CREDENCIALES_INVALIDAS`, `CUENTA_SUSPENDIDA`,
`CUENTA_BANEADA`, `REFRESH_AUSENTE`, `TOKEN_INVALIDO`,
`REFRESH_REUTILIZADO`, `SESION_INVALIDA`, `EMAIL_NO_REGISTRADO`,
`TOKEN_RECUPERACION_INVALIDO`, `TOKEN_RECUPERACION_VENCIDO`,
`TOKEN_RECUPERACION_USADO`, `CORREO_NO_DISPONIBLE`, `ORIGEN_NO_PERMITIDO` y
`LIMITE_DE_INTENTOS_EXCEDIDO`.

La respuesta de email inexistente es deliberadamente explícita (`404`). Esto
permite enumerar cuentas y se compensa parcialmente con rate limiting; si cambia
la decisión de producto, debe reemplazarse por una respuesta genérica `202`.

## Límites operativos

El rate limiting usa el almacenamiento en memoria de `@nestjs/throttler` y
presupone una sola instancia de la API: login 10/minuto por IP+email, registro
20/hora por IP, recuperación 10/hora por IP+email, confirmación 10/hora por IP
y refresh 60/minuto por IP+sesión. Antes de escalar horizontalmente debe
migrarse a un almacén compartido como Redis.

## Coordinación con frontend

Los consumidores son [CU1](https://github.com/SmartPlan-UTN/SmartPlan-front/issues/13),
[CU2](https://github.com/SmartPlan-UTN/SmartPlan-front/issues/14),
[CU3](https://github.com/SmartPlan-UTN/SmartPlan-front/issues/15) y
[CU4](https://github.com/SmartPlan-UTN/SmartPlan-front/issues/16). El frontend:

- conserva `tokenAcceso` únicamente en memoria;
- usa `credentials: 'include'` al renovar y cerrar sesión;
- recupera la sesión al recargar mediante una única renovación en curso
  (single-flight);
- redirige el registro al flujo de preferencias de CU8 sin esperar que esta API
  cree preferencias;
- muestra los códigos estables anteriores sin depender del texto de `mensaje`.
