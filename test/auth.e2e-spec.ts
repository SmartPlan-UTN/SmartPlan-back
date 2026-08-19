import {
  Controller,
  Get,
  INestApplication,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import { DataSource } from 'typeorm';
import { CorreoService } from '../src/auth/correo/correo.service';
import { Permisos } from '../src/auth/decorators/permisos.decorator';
import { Public } from '../src/auth/decorators/publico.decorator';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { RecuperacionContrasena } from '../src/auth/entities/recuperacion-contrasena.entity';
import { SesionUsuario } from '../src/auth/entities/sesion-usuario.entity';
import { LimitadorIntentosService } from '../src/auth/seguridad/limitador-intentos.service';
import { SolicitudAutenticada } from '../src/auth/tipos/solicitud-autenticada';
import {
  AccionAuditoria,
  RegistroAuditoria,
} from '../src/administracion/entities/registro-auditoria.entity';
import { sembrarDatosIniciales } from '../src/database/semillas/sembrar';
import { EstadoUsuario } from '../src/usuarios/entities/estado-usuario.entity';
import { Rol } from '../src/usuarios/entities/rol.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { crearAppDePrueba } from './crear-app-de-prueba';

@Controller('pruebas-autorizacion')
class ControladorAutorizacionPrueba {
  @Public()
  @Get('publico')
  publico(): { publico: true } {
    return { publico: true };
  }

  @Get('autenticado')
  autenticado(@Req() solicitud: SolicitudAutenticada): { idUsuario: number } {
    return { idUsuario: solicitud.autenticacion.id };
  }

  @Roles('administrador')
  @Get('solo-administrador')
  soloAdministrador(): { autorizado: true } {
    return { autorizado: true };
  }

  @Permisos('perfil.consultar')
  @Get('con-permiso')
  conPermiso(): { autorizado: true } {
    return { autorizado: true };
  }

  @Permisos('permiso.inexistente')
  @Get('sin-permiso')
  sinPermiso(): { autorizado: true } {
    return { autorizado: true };
  }
}

describe('Autenticación y control de acceso (e2e)', () => {
  let app: INestApplication<App>;
  let fuente: DataSource;
  let enlaceRecuperacion: string | undefined;
  let enlacesRecuperacion: string[] = [];

  const correoFalso = {
    enviarRecuperacion: jest.fn(
      (_destinatario: string, enlace: string): Promise<void> => {
        enlaceRecuperacion = enlace;
        enlacesRecuperacion.push(enlace);
        return Promise.resolve();
      },
    ),
  };

  beforeAll(async () => {
    app = await crearAppDePrueba(
      (modulo) => modulo.overrideProvider(CorreoService).useValue(correoFalso),
      [ControladorAutorizacionPrueba],
    );
    fuente = app.get(DataSource);
    await sembrarDatosIniciales(fuente);
  });

  afterAll(async () => {
    await fuente.getRepository(RegistroAuditoria).deleteAll();
    await fuente.getRepository(RecuperacionContrasena).deleteAll();
    await fuente.getRepository(SesionUsuario).deleteAll();
    await fuente.getRepository(Usuario).deleteAll();
    await app.close();
  });

  beforeEach(async () => {
    app.get(LimitadorIntentosService).limpiar();
    await fuente.getRepository(RegistroAuditoria).deleteAll();
    await fuente.getRepository(RecuperacionContrasena).deleteAll();
    await fuente.getRepository(SesionUsuario).deleteAll();
    await fuente.getRepository(Usuario).deleteAll();
    correoFalso.enviarRecuperacion.mockClear();
    enlaceRecuperacion = undefined;
    enlacesRecuperacion = [];
  });

  const datosRegistro = {
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ANA@EXAMPLE.COM',
    contrasena: 'frase-segura-para-smartplan',
  };

  function registrar(): Test {
    return request(app.getHttpServer())
      .post('/api/usuarios')
      .send(datosRegistro);
  }

  function cookieDe(respuesta: Response): string {
    const encabezado: unknown = respuesta.headers['set-cookie'];
    const primera = Array.isArray(encabezado)
      ? (encabezado.find(
          (valor): valor is string => typeof valor === 'string',
        ) ?? undefined)
      : typeof encabezado === 'string'
        ? encabezado
        : undefined;
    if (!primera) throw new Error('La respuesta no incluyó Set-Cookie');
    return primera.split(';')[0] ?? '';
  }

  function tokenAccesoDe(respuesta: Response): string {
    const cuerpo: unknown = respuesta.body as unknown;
    const token =
      typeof cuerpo === 'object' && cuerpo !== null && 'tokenAcceso' in cuerpo
        ? cuerpo.tokenAcceso
        : undefined;
    if (typeof token !== 'string') {
      throw new Error('La respuesta no incluyó tokenAcceso');
    }
    return token;
  }

  function autorizacion(token: string): string {
    return `Bearer ${token}`;
  }

  function esperarRespuestaSinSecretos(respuesta: Response): void {
    const cuerpo = JSON.stringify(respuesta.body);
    expect(cuerpo).not.toContain('passwordHash');
    expect(cuerpo).not.toContain('tokenHash');
    expect(respuesta.body).not.toHaveProperty('refreshToken');
  }

  it('registra, normaliza el email e inicia la sesión (CU2)', async () => {
    const respuesta = await registrar().expect(201);

    expect(respuesta.body).toMatchObject({
      tipoToken: 'Bearer',
      expiraEn: 900,
      usuario: {
        nombre: 'Ana',
        email: 'ana@example.com',
        rol: { key: 'usuario' },
      },
    });
    expect(respuesta.body).toMatchObject({
      tokenAcceso: expect.any(String) as string,
    });
    esperarRespuestaSinSecretos(respuesta);
    const cookie = cookieDe(respuesta);
    const setCookie: unknown = respuesta.headers['set-cookie'];
    expect(JSON.stringify(setCookie)).toContain('HttpOnly');
    expect(JSON.stringify(setCookie)).toContain('SameSite=Lax');
    expect(JSON.stringify(setCookie)).toContain('Path=/api/sesiones');
    expect(JSON.stringify(setCookie)).toContain('Max-Age=2592000');
    expect(JSON.stringify(setCookie)).not.toContain('Secure');
    expect(cookie).toContain('smartplan_refresh=');
  });

  it('rechaza un email duplicado y un DTO inválido (CU2)', async () => {
    await registrar().expect(201);
    const duplicado = await registrar().expect(409);
    expect(duplicado.body).toMatchObject({ codigo: 'EMAIL_YA_REGISTRADO' });

    await request(app.getHttpServer())
      .post('/api/usuarios')
      .send({
        ...datosRegistro,
        email: 'otro@example.com',
        contrasena: 'corta',
      })
      .expect(400);

    const desconocido = await request(app.getHttpServer())
      .post('/api/usuarios')
      .send({
        ...datosRegistro,
        email: 'otro@example.com',
        propiedadNoPermitida: true,
      })
      .expect(400);
    expect(desconocido.body).toMatchObject({
      errores: expect.arrayContaining([
        expect.objectContaining({ campo: 'propiedadNoPermitida' }),
      ]) as unknown[],
    });
  });

  it('inicia varias sesiones y rechaza credenciales inválidas (CU1)', async () => {
    await registrar().expect(201);
    const credenciales = {
      email: 'ana@example.com',
      contrasena: datosRegistro.contrasena,
    };

    const segunda = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send(credenciales)
      .expect(201);
    esperarRespuestaSinSecretos(segunda);
    await request(app.getHttpServer())
      .post('/api/sesiones')
      .send(credenciales)
      .expect(201);
    expect(await fuente.getRepository(SesionUsuario).count()).toBe(3);

    const invalida = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({ ...credenciales, contrasena: 'incorrecta-pero-larga' })
      .expect(401);
    expect(invalida.body).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
  });

  it('rechaza DTOs inválidos en login y recuperación', async () => {
    await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({ email: 'no-es-email', contrasena: 'corta' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'no-es-email' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({ token: 'corto', nuevaContrasena: 'corta' })
      .expect(400);
  });

  it('distingue una cuenta suspendida (CU1)', async () => {
    await registrar().expect(201);
    const suspendido = await fuente
      .getRepository(EstadoUsuario)
      .findOneByOrFail({ key: 'suspendido' });
    await fuente
      .getRepository(Usuario)
      .update({ email: 'ana@example.com' }, { idEstadoUsuario: suspendido.id });

    const respuesta = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: datosRegistro.contrasena,
      })
      .expect(403);
    expect(respuesta.body).toMatchObject({ codigo: 'CUENTA_SUSPENDIDA' });
  });

  it('distingue una cuenta baneada (CU1)', async () => {
    await registrar().expect(201);
    const baneado = await fuente
      .getRepository(EstadoUsuario)
      .findOneByOrFail({ key: 'baneado' });
    await fuente
      .getRepository(Usuario)
      .update({ email: 'ana@example.com' }, { idEstadoUsuario: baneado.id });

    const respuesta = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: datosRegistro.contrasena,
      })
      .expect(403);
    expect(respuesta.body).toMatchObject({ codigo: 'CUENTA_BANEADA' });
  });

  it('rota el refresh y revoca la sesión si se reutiliza (CU1)', async () => {
    const alta = await registrar().expect(201);
    const cookieOriginal = cookieDe(alta);
    const renovada = await request(app.getHttpServer())
      .post('/api/sesiones/renovaciones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(200);
    esperarRespuestaSinSecretos(renovada);
    expect(cookieDe(renovada)).not.toBe(cookieOriginal);

    const reutilizada = await request(app.getHttpServer())
      .post('/api/sesiones/renovaciones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(401);
    expect(reutilizada.body).toMatchObject({ codigo: 'REFRESH_REUTILIZADO' });
    expect(
      await fuente.getRepository(SesionUsuario).countBy({ activa: true }),
    ).toBe(0);
  });

  it('rechaza una sesión vencida aunque el refresh siga firmado', async () => {
    const alta = await registrar().expect(201);
    const sesion = await fuente.getRepository(SesionUsuario).findOneByOrFail({
      activa: true,
    });
    await fuente
      .getRepository(SesionUsuario)
      .update(sesion.id, { fechaExpiracion: new Date(0) });

    const respuesta = await request(app.getHttpServer())
      .post('/api/sesiones/renovaciones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieDe(alta))
      .expect(401);
    expect(respuesta.body).toMatchObject({ codigo: 'SESION_INVALIDA' });
  });

  it('serializa rotaciones concurrentes y revoca ante reutilización', async () => {
    const alta = await registrar().expect(201);
    const cookie = cookieDe(alta);
    const servidor = app.getHttpServer();

    const respuestas = await Promise.all([
      request(servidor)
        .post('/api/sesiones/renovaciones')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
      request(servidor)
        .post('/api/sesiones/renovaciones')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
    ]);

    expect(respuestas.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(
      await fuente.getRepository(SesionUsuario).countBy({ activa: true }),
    ).toBe(0);
  });

  it('cierra solamente la sesión actual y el logout es idempotente (CU4)', async () => {
    const alta = await registrar().expect(201);
    const cookie = cookieDe(alta);
    await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: datosRegistro.contrasena,
      })
      .expect(201);

    const cierre = await request(app.getHttpServer())
      .delete('/api/sesiones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie)
      .expect(204);
    expect(JSON.stringify(cierre.headers['set-cookie'])).toContain(
      'smartplan_refresh=',
    );
    expect(JSON.stringify(cierre.headers['set-cookie'])).toContain(
      'Path=/api/sesiones',
    );
    expect(
      await fuente.getRepository(SesionUsuario).countBy({ activa: true }),
    ).toBe(1);
    await request(app.getHttpServer())
      .delete('/api/sesiones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie)
      .expect(204);
  });

  it('solicita y completa una recuperación, revocando sesiones (CU3)', async () => {
    await registrar().expect(201);
    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ana@example.com' })
      .expect(202);
    expect(correoFalso.enviarRecuperacion).toHaveBeenCalledTimes(1);
    const token = new URL(enlaceRecuperacion ?? '').searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({ token, nuevaContrasena: 'otra-frase-segura-smartplan' })
      .expect(204);
    expect(
      await fuente.getRepository(SesionUsuario).countBy({ activa: true }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: datosRegistro.contrasena,
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: 'otra-frase-segura-smartplan',
      })
      .expect(201);

    const usado = await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({ token, nuevaContrasena: 'tercera-frase-segura-smartplan' })
      .expect(409);
    expect(usado.body).toMatchObject({ codigo: 'TOKEN_RECUPERACION_USADO' });
  });

  it('invalida recuperaciones anteriores todavía utilizables (CU3)', async () => {
    await registrar().expect(201);
    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const primerToken = new URL(enlaceRecuperacion ?? '').searchParams.get(
      'token',
    );

    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ANA@EXAMPLE.COM' })
      .expect(202);

    const anterior = await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({
        token: primerToken,
        nuevaContrasena: 'otra-frase-segura-smartplan',
      })
      .expect(409);
    expect(anterior.body).toMatchObject({
      codigo: 'TOKEN_RECUPERACION_USADO',
    });
  });

  it('serializa solicitudes de recuperación concurrentes (CU3)', async () => {
    await registrar().expect(201);
    const servidor = app.getHttpServer();

    const solicitudes = await Promise.all([
      request(servidor)
        .post('/api/recuperaciones-contrasena')
        .send({ email: 'ana@example.com' }),
      request(servidor)
        .post('/api/recuperaciones-contrasena')
        .send({ email: 'ANA@EXAMPLE.COM' }),
    ]);
    expect(solicitudes.map(({ status }) => status)).toEqual([202, 202]);
    expect(
      await fuente
        .getRepository(RecuperacionContrasena)
        .countBy({ usado: false }),
    ).toBe(1);

    const tokens = enlacesRecuperacion.map(
      (enlace) => new URL(enlace).searchParams.get('token') ?? '',
    );
    const confirmaciones = await Promise.all(
      tokens.map((token, indice) =>
        request(servidor)
          .patch('/api/recuperaciones-contrasena')
          .send({
            token,
            nuevaContrasena: `contrasena-concurrente-${indice}`,
          }),
      ),
    );
    expect(confirmaciones.map(({ status }) => status).sort()).toEqual([
      204, 409,
    ]);
  });

  it('informa email inexistente y token inválido (CU3)', async () => {
    const inexistente = await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'nadie@example.com' })
      .expect(404);
    expect(inexistente.body).toMatchObject({ codigo: 'EMAIL_NO_REGISTRADO' });

    const invalido = await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({
        token: 'token-totalmente-invalido-pero-con-largo-suficiente',
        nuevaContrasena: 'otra-frase-segura-smartplan',
      })
      .expect(400);
    expect(invalido.body).toMatchObject({
      codigo: 'TOKEN_RECUPERACION_INVALIDO',
    });
  });

  it('distingue un token de recuperación vencido (CU3)', async () => {
    await registrar().expect(201);
    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const token = new URL(enlaceRecuperacion ?? '').searchParams.get('token');
    const recuperacion = await fuente
      .getRepository(RecuperacionContrasena)
      .findOneByOrFail({ usado: false });
    await fuente
      .getRepository(RecuperacionContrasena)
      .update(recuperacion.id, { fechaExpiracion: new Date(0) });

    const vencido = await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({ token, nuevaContrasena: 'otra-frase-segura-smartplan' })
      .expect(410);
    expect(vencido.body).toMatchObject({
      codigo: 'TOKEN_RECUPERACION_VENCIDO',
    });
  });

  it('invalida el pedido si el proveedor de correo falla (CU3)', async () => {
    await registrar().expect(201);
    correoFalso.enviarRecuperacion.mockRejectedValueOnce(
      new ServiceUnavailableException({
        codigo: 'CORREO_NO_DISPONIBLE',
        mensaje: 'No se pudo enviar el correo de recuperación',
      }),
    );

    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ana@example.com' })
      .expect(503);

    const pedido = await fuente
      .getRepository(RecuperacionContrasena)
      .findOneOrFail({ where: { usado: true }, order: { id: 'DESC' } });
    expect(pedido.usado).toBe(true);
  });

  it('aplica autenticación, roles, permisos y revocación inmediata', async () => {
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/publico')
      .expect(200, { publico: true });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .expect(401);

    const alta = await registrar().expect(201);
    const token = tokenAccesoDe(alta);
    const encabezado = autorizacion(token);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', encabezado)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/con-permiso')
      .set('Authorization', encabezado)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/sin-permiso')
      .set('Authorization', encabezado)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/solo-administrador')
      .set('Authorization', encabezado)
      .expect(403);

    const usuario = await fuente
      .getRepository(Usuario)
      .findOneByOrFail({ email: 'ana@example.com' });
    const administrador = await fuente
      .getRepository(Rol)
      .findOneByOrFail({ key: 'administrador' });
    await fuente
      .getRepository(Usuario)
      .update(usuario.id, { idRol: administrador.id });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/solo-administrador')
      .set('Authorization', encabezado)
      .expect(200);

    await fuente
      .getRepository(SesionUsuario)
      .update({ idUsuario: usuario.id }, { activa: false });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', encabezado)
      .expect(401);
  });

  it('bloquea inmediatamente un access token si cambia el estado del usuario', async () => {
    const alta = await registrar().expect(201);
    const suspendido = await fuente
      .getRepository(EstadoUsuario)
      .findOneByOrFail({ key: 'suspendido' });
    await fuente
      .getRepository(Usuario)
      .update({ email: 'ana@example.com' }, { idEstadoUsuario: suspendido.id });

    const respuesta = await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', autorizacion(tokenAccesoDe(alta)))
      .expect(403);
    expect(respuesta.body).toMatchObject({ codigo: 'CUENTA_SUSPENDIDA' });
  });

  it('registra auditoría sin incluir secretos', async () => {
    const alta = await registrar().expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'ana@example.com',
        contrasena: datosRegistro.contrasena,
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/sesiones')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieDe(login))
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/recuperaciones-contrasena')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const tokenRecuperacion = new URL(
      enlaceRecuperacion ?? '',
    ).searchParams.get('token');
    await request(app.getHttpServer())
      .patch('/api/recuperaciones-contrasena')
      .send({
        token: tokenRecuperacion,
        nuevaContrasena: 'otra-frase-segura-smartplan',
      })
      .expect(204);

    const registros = await fuente.getRepository(RegistroAuditoria).find();
    expect(registros.map(({ accion }) => accion)).toEqual(
      expect.arrayContaining([
        AccionAuditoria.Crear,
        AccionAuditoria.IniciarSesion,
        AccionAuditoria.CerrarSesion,
        AccionAuditoria.Actualizar,
      ]),
    );
    const auditoria = JSON.stringify(registros);
    expect(auditoria).not.toContain(datosRegistro.contrasena);
    expect(auditoria).not.toContain(tokenAccesoDe(alta));
    expect(auditoria).not.toContain(tokenRecuperacion);
    expect(auditoria).not.toContain('passwordHash');
    expect(auditoria).not.toContain('tokenHash');
  });

  it('limita login por IP y email normalizado', async () => {
    for (let intento = 0; intento < 10; intento += 1) {
      await request(app.getHttpServer())
        .post('/api/sesiones')
        .send({
          email: intento % 2 === 0 ? 'NADIE@EXAMPLE.COM' : 'nadie@example.com',
          contrasena: 'contrasena-invalida-larga',
        })
        .expect(401);
    }
    const limitada = await request(app.getHttpServer())
      .post('/api/sesiones')
      .send({
        email: 'nadie@example.com',
        contrasena: 'contrasena-invalida-larga',
      })
      .expect(429);
    expect(limitada.body).toMatchObject({
      codigo: 'LIMITE_DE_INTENTOS_EXCEDIDO',
    });
  });

  it('rechaza otro origen en operaciones basadas en cookie', async () => {
    const alta = await registrar().expect(201);

    const respuesta = await request(app.getHttpServer())
      .post('/api/sesiones/renovaciones')
      .set('Origin', 'https://sitio-malicioso.test')
      .set('Cookie', cookieDe(alta))
      .expect(403);
    expect(respuesta.body).toMatchObject({ codigo: 'ORIGEN_NO_PERMITIDO' });
  });
});
