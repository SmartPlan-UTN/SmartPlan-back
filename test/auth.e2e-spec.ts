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
import { EmailService } from '../src/auth/email/email.service';
import { Permissions } from '../src/auth/decorators/permissions.decorator';
import { Public } from '../src/auth/decorators/public.decorator';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { PasswordRecovery } from '../src/auth/entities/password-recovery.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { AuthenticatedRequest } from '../src/auth/types/authenticated-request';
import {
  AuditAction,
  AuditLog,
} from '../src/administration/entities/audit-log.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { UserStatus } from '../src/users/entities/user-status.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

@Controller('pruebas-autorizacion')
class ControladorAutorizacionPrueba {
  @Public()
  @Get('publico')
  publico(): { publico: true } {
    return { publico: true };
  }

  @Get('autenticado')
  autenticado(@Req() request: AuthenticatedRequest): { idUser: number } {
    return { idUser: request.authentication.id };
  }

  @Roles('administrador')
  @Get('solo-administrador')
  soloAdministrador(): { autorizado: true } {
    return { autorizado: true };
  }

  @Permissions('perfil.consultar')
  @Get('con-permission')
  conPermiso(): { autorizado: true } {
    return { autorizado: true };
  }

  @Permissions('permission.inexistente')
  @Get('sin-permission')
  sinPermiso(): { autorizado: true } {
    return { autorizado: true };
  }
}

describe('Autenticación y control de acceso (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let recoveryLink: string | undefined;
  let recoveryLinks: string[] = [];

  const fakeEmailService = {
    sendPasswordRecovery: jest.fn(
      (_destinatario: string, link: string): Promise<void> => {
        recoveryLink = link;
        recoveryLinks.push(link);
        return Promise.resolve();
      },
    ),
  };

  beforeAll(async () => {
    app = await createTestApp(
      (module) =>
        module.overrideProvider(EmailService).useValue(fakeEmailService),
      [ControladorAutorizacionPrueba],
    );
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
  });

  afterAll(async () => {
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PasswordRecovery).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  beforeEach(async () => {
    app.get(AttemptLimiterService).clear();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PasswordRecovery).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    fakeEmailService.sendPasswordRecovery.mockClear();
    recoveryLink = undefined;
    recoveryLinks = [];
  });

  const registrationData = {
    name: 'Ana',
    lastName: 'Pérez',
    email: 'ANA@EXAMPLE.COM',
    password: 'frase-segura-para-smartplan',
  };

  function register(): Test {
    return request(app.getHttpServer())
      .post('/api/users')
      .send(registrationData);
  }

  function cookieDe(response: Response): string {
    const encabezado: unknown = response.headers['set-cookie'];
    const primera = Array.isArray(encabezado)
      ? (encabezado.find(
          (valor): valor is string => typeof valor === 'string',
        ) ?? undefined)
      : typeof encabezado === 'string'
        ? encabezado
        : undefined;
    if (!primera) throw new Error('La response no incluyó Set-Cookie');
    return primera.split(';')[0] ?? '';
  }

  function tokenAccesoDe(response: Response): string {
    const cuerpo: unknown = response.body as unknown;
    const token =
      typeof cuerpo === 'object' && cuerpo !== null && 'accessToken' in cuerpo
        ? cuerpo.accessToken
        : undefined;
    if (typeof token !== 'string') {
      throw new Error('La response no incluyó accessToken');
    }
    return token;
  }

  function autorizacion(token: string): string {
    return `Bearer ${token}`;
  }

  function esperarRespuestaSinSecretos(response: Response): void {
    const cuerpo = JSON.stringify(response.body);
    expect(cuerpo).not.toContain('passwordHash');
    expect(cuerpo).not.toContain('tokenHash');
    expect(response.body).not.toHaveProperty('refreshToken');
  }

  it('registra, normaliza el email e inicia la sesión (CU2)', async () => {
    const response = await register().expect(201);

    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        name: 'Ana',
        email: 'ana@example.com',
        role: { key: 'user' },
      },
    });
    expect(response.body).toMatchObject({
      accessToken: expect.any(String) as string,
    });
    esperarRespuestaSinSecretos(response);
    const cookie = cookieDe(response);
    const setCookie: unknown = response.headers['set-cookie'];
    expect(JSON.stringify(setCookie)).toContain('HttpOnly');
    expect(JSON.stringify(setCookie)).toContain('SameSite=Lax');
    expect(JSON.stringify(setCookie)).toContain('Path=/api/sessions');
    expect(JSON.stringify(setCookie)).toContain('Max-Age=2592000');
    expect(JSON.stringify(setCookie)).not.toContain('Secure');
    expect(cookie).toContain('smartplan_refresh=');
  });

  it('rechaza un email duplicado y un DTO inválido (CU2)', async () => {
    await register().expect(201);
    const duplicado = await register().expect(409);
    expect(duplicado.body).toMatchObject({ code: 'EMAIL_YA_REGISTRADO' });

    await request(app.getHttpServer())
      .post('/api/users')
      .send({
        ...registrationData,
        email: 'otro@example.com',
        password: 'corta',
      })
      .expect(400);

    const desconocido = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        ...registrationData,
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

  it('inicia varias sessions y rechaza credenciales inválidas (CU1)', async () => {
    await register().expect(201);
    const credenciales = {
      email: 'ana@example.com',
      password: registrationData.password,
    };

    const segunda = await request(app.getHttpServer())
      .post('/api/sessions')
      .send(credenciales)
      .expect(201);
    esperarRespuestaSinSecretos(segunda);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send(credenciales)
      .expect(201);
    expect(await dataSource.getRepository(UserSession).count()).toBe(3);

    const invalida = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ ...credenciales, password: 'incorrecta-pero-larga' })
      .expect(401);
    expect(invalida.body).toMatchObject({ code: 'CREDENCIALES_INVALIDAS' });
  });

  it('rechaza DTOs inválidos en login y recuperación', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email: 'no-es-email', password: 'corta' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'no-es-email' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token: 'corto', newPassword: 'corta' })
      .expect(400);
  });

  it('distingue una cuenta suspendida (CU1)', async () => {
    await register().expect(201);
    const suspendido = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'suspendido' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: suspendido.id });

    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'CUENTA_SUSPENDIDA' });
  });

  it('distingue una cuenta baneada (CU1)', async () => {
    await register().expect(201);
    const baneado = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'baneado' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: baneado.id });

    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'CUENTA_BANEADA' });
  });

  it('rota el refresh y revoca la sesión si se reutiliza (CU1)', async () => {
    const alta = await register().expect(201);
    const cookieOriginal = cookieDe(alta);
    const renovada = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(200);
    esperarRespuestaSinSecretos(renovada);
    expect(cookieDe(renovada)).not.toBe(cookieOriginal);

    const reutilizada = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(401);
    expect(reutilizada.body).toMatchObject({ code: 'REFRESH_REUTILIZADO' });
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
  });

  it('rechaza una sesión vencida aunque el refresh siga firmado', async () => {
    const alta = await register().expect(201);
    const session = await dataSource
      .getRepository(UserSession)
      .findOneByOrFail({
        active: true,
      });
    await dataSource
      .getRepository(UserSession)
      .update(session.id, { expiresAt: new Date(0) });

    const response = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieDe(alta))
      .expect(401);
    expect(response.body).toMatchObject({ code: 'SESION_INVALIDA' });
  });

  it('serializa rotaciones concurrentes y revoca ante reutilización', async () => {
    const alta = await register().expect(201);
    const cookie = cookieDe(alta);
    const servidor = app.getHttpServer();

    const respuestas = await Promise.all([
      request(servidor)
        .post('/api/sessions/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
      request(servidor)
        .post('/api/sessions/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
    ]);

    expect(respuestas.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
  });

  it('cierra solamente la sesión actual y el logout es idempotente (CU4)', async () => {
    const alta = await register().expect(201);
    const cookie = cookieDe(alta);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(201);

    const cierre = await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie)
      .expect(204);
    expect(JSON.stringify(cierre.headers['set-cookie'])).toContain(
      'smartplan_refresh=',
    );
    expect(JSON.stringify(cierre.headers['set-cookie'])).toContain(
      'Path=/api/sessions',
    );
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(1);
    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie)
      .expect(204);
  });

  it('solicita y completa una recuperación, revocando sessions (CU3)', async () => {
    await register().expect(201);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    expect(fakeEmailService.sendPasswordRecovery).toHaveBeenCalledTimes(1);
    const token = new URL(recoveryLink ?? '').searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token, newPassword: 'otra-frase-segura-smartplan' })
      .expect(204);
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: 'otra-frase-segura-smartplan',
      })
      .expect(201);

    const used = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token, newPassword: 'tercera-frase-segura-smartplan' })
      .expect(409);
    expect(used.body).toMatchObject({ code: 'TOKEN_RECUPERACION_USADO' });
  });

  it('invalida recoveries anteriores todavía utilizables (CU3)', async () => {
    await register().expect(201);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const primerToken = new URL(recoveryLink ?? '').searchParams.get('token');

    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ANA@EXAMPLE.COM' })
      .expect(202);

    const anterior = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: primerToken,
        newPassword: 'otra-frase-segura-smartplan',
      })
      .expect(409);
    expect(anterior.body).toMatchObject({
      code: 'TOKEN_RECUPERACION_USADO',
    });
  });

  it('serializa solicitudes de recuperación concurrentes (CU3)', async () => {
    await register().expect(201);
    const servidor = app.getHttpServer();

    const solicitudes = await Promise.all([
      request(servidor)
        .post('/api/password-recoveries')
        .send({ email: 'ana@example.com' }),
      request(servidor)
        .post('/api/password-recoveries')
        .send({ email: 'ANA@EXAMPLE.COM' }),
    ]);
    expect(solicitudes.map(({ status }) => status)).toEqual([202, 202]);
    expect(
      await dataSource.getRepository(PasswordRecovery).countBy({ used: false }),
    ).toBe(1);

    const tokens = recoveryLinks.map(
      (link) => new URL(link).searchParams.get('token') ?? '',
    );
    const confirmaciones = await Promise.all(
      tokens.map((token, indice) =>
        request(servidor)
          .patch('/api/password-recoveries')
          .send({
            token,
            newPassword: `password-concurrente-${indice}`,
          }),
      ),
    );
    expect(confirmaciones.map(({ status }) => status).sort()).toEqual([
      204, 409,
    ]);
  });

  it('informa email inexistente y token inválido (CU3)', async () => {
    const inexistente = await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'nadie@example.com' })
      .expect(404);
    expect(inexistente.body).toMatchObject({ code: 'EMAIL_NO_REGISTRADO' });

    const invalido = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: 'token-totalmente-invalido-pero-con-largo-suficiente',
        newPassword: 'otra-frase-segura-smartplan',
      })
      .expect(400);
    expect(invalido.body).toMatchObject({
      code: 'TOKEN_RECUPERACION_INVALIDO',
    });
  });

  it('distingue un token de recuperación vencido (CU3)', async () => {
    await register().expect(201);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const token = new URL(recoveryLink ?? '').searchParams.get('token');
    const recovery = await dataSource
      .getRepository(PasswordRecovery)
      .findOneByOrFail({ used: false });
    await dataSource
      .getRepository(PasswordRecovery)
      .update(recovery.id, { expiresAt: new Date(0) });

    const vencido = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token, newPassword: 'otra-frase-segura-smartplan' })
      .expect(410);
    expect(vencido.body).toMatchObject({
      code: 'TOKEN_RECUPERACION_VENCIDO',
    });
  });

  it('invalida el pedido si el proveedor de emailService falla (CU3)', async () => {
    await register().expect(201);
    fakeEmailService.sendPasswordRecovery.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'CORREO_NO_DISPONIBLE',
        message: 'No se pudo enviar el emailService de recuperación',
      }),
    );

    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(503);

    const pedido = await dataSource
      .getRepository(PasswordRecovery)
      .findOneOrFail({ where: { used: true }, order: { id: 'DESC' } });
    expect(pedido.used).toBe(true);
  });

  it('aplica autenticación, roles, permissions y revocación inmediata', async () => {
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/publico')
      .expect(200, { publico: true });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .expect(401);

    const alta = await register().expect(201);
    const token = tokenAccesoDe(alta);
    const encabezado = autorizacion(token);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', encabezado)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/con-permission')
      .set('Authorization', encabezado)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/sin-permission')
      .set('Authorization', encabezado)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/solo-administrador')
      .set('Authorization', encabezado)
      .expect(403);

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'ana@example.com' });
    const administrador = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'administrador' });
    await dataSource
      .getRepository(User)
      .update(user.id, { idRole: administrador.id });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/solo-administrador')
      .set('Authorization', encabezado)
      .expect(200);

    await dataSource
      .getRepository(UserSession)
      .update({ idUser: user.id }, { active: false });
    await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', encabezado)
      .expect(401);
  });

  it('bloquea inmediatamente un access token si cambia el status del user', async () => {
    const alta = await register().expect(201);
    const suspendido = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'suspendido' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: suspendido.id });

    const response = await request(app.getHttpServer())
      .get('/api/pruebas-autorizacion/autenticado')
      .set('Authorization', autorizacion(tokenAccesoDe(alta)))
      .expect(403);
    expect(response.body).toMatchObject({ code: 'CUENTA_SUSPENDIDA' });
  });

  it('registra auditoría sin incluir secretos', async () => {
    const alta = await register().expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieDe(login))
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const tokenRecuperacion = new URL(recoveryLink ?? '').searchParams.get(
      'token',
    );
    await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: tokenRecuperacion,
        newPassword: 'otra-frase-segura-smartplan',
      })
      .expect(204);

    const registers = await dataSource.getRepository(AuditLog).find();
    expect(registers.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        AuditAction.Create,
        AuditAction.StartSession,
        AuditAction.EndSession,
        AuditAction.Update,
      ]),
    );
    const auditoria = JSON.stringify(registers);
    expect(auditoria).not.toContain(registrationData.password);
    expect(auditoria).not.toContain(tokenAccesoDe(alta));
    expect(auditoria).not.toContain(tokenRecuperacion);
    expect(auditoria).not.toContain('passwordHash');
    expect(auditoria).not.toContain('tokenHash');
  });

  it('limita login por IP y email normalizado', async () => {
    for (let intento = 0; intento < 10; intento += 1) {
      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          email: intento % 2 === 0 ? 'NADIE@EXAMPLE.COM' : 'nadie@example.com',
          password: 'password-invalida-larga',
        })
        .expect(401);
    }
    const limitada = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'nadie@example.com',
        password: 'password-invalida-larga',
      })
      .expect(429);
    expect(limitada.body).toMatchObject({
      code: 'LIMITE_DE_INTENTOS_EXCEDIDO',
    });
  });

  it('rechaza otro origen en operaciones basadas en cookie', async () => {
    const alta = await register().expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'https://sitio-malicioso.test')
      .set('Cookie', cookieDe(alta))
      .expect(403);
    expect(response.body).toMatchObject({ code: 'ORIGEN_NO_PERMITIDO' });
  });
});
