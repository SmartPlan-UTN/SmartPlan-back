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
import type { AuthenticatedRequest } from '../src/auth/types/authenticated-request';
import {
  AuditAction,
  AuditLog,
} from '../src/administration/entities/audit-log.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { UserStatus } from '../src/users/entities/user-status.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

@Controller('authorization-tests')
class AuthorizationTestController {
  @Public()
  @Get('publicEndpoint')
  publicEndpoint(): { publicEndpoint: true } {
    return { publicEndpoint: true };
  }

  @Get('authenticated')
  authenticated(@Req() request: AuthenticatedRequest): { idUser: number } {
    return { idUser: request.authentication.id };
  }

  @Roles('admin')
  @Get('only-admin')
  adminOnly(): { authorized: true } {
    return { authorized: true };
  }

  @Permissions('profile.view')
  @Get('with-permission')
  withPermission(): { authorized: true } {
    return { authorized: true };
  }

  @Permissions('permission.nonexistent')
  @Get('without-permission')
  withoutPermission(): { authorized: true } {
    return { authorized: true };
  }
}

describe('Authentication and access control (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let recoveryLink: string | undefined;
  let recoveryLinks: string[] = [];

  const fakeEmailService = {
    sendPasswordRecovery: jest.fn(
      (_recipient: string, link: string): Promise<void> => {
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
      [AuthorizationTestController],
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
    password: 'secure-passphrase-for-smartplan',
  };

  function register(): Test {
    return request(app.getHttpServer())
      .post('/api/users')
      .send(registrationData);
  }

  function cookieFrom(response: Response): string {
    const authorizationHeader: unknown = response.headers['set-cookie'];
    const first = Array.isArray(authorizationHeader)
      ? (authorizationHeader.find(
          (value): value is string => typeof value === 'string',
        ) ?? undefined)
      : typeof authorizationHeader === 'string'
        ? authorizationHeader
        : undefined;
    if (!first) throw new Error('The response did not include Set-Cookie');
    return first.split(';')[0] ?? '';
  }

  function accessTokenFrom(response: Response): string {
    const responseBody: unknown = response.body as unknown;
    const token =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'accessToken' in responseBody
        ? responseBody.accessToken
        : undefined;
    if (typeof token !== 'string') {
      throw new Error('The response did not include accessToken');
    }
    return token;
  }

  function authorization(token: string): string {
    return `Bearer ${token}`;
  }

  function currentSessionFrom(response: Response): {
    ip: unknown;
    startedAt: unknown;
  } {
    const responseBody: unknown = response.body as unknown;
    if (typeof responseBody !== 'object' || responseBody === null) {
      throw new Error('The response was not an object');
    }
    return responseBody as { ip: unknown; startedAt: unknown };
  }

  function expectResponseWithoutSecrets(response: Response): void {
    const responseBody = JSON.stringify(response.body);
    expect(responseBody).not.toContain('passwordHash');
    expect(responseBody).not.toContain('tokenHash');
    expect(response.body).not.toHaveProperty('refreshToken');
  }

  it('registers, normalizes the email, and starts the session (CU2)', async () => {
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
    expectResponseWithoutSecrets(response);
    const cookie = cookieFrom(response);
    const setCookie: unknown = response.headers['set-cookie'];
    expect(JSON.stringify(setCookie)).toContain('HttpOnly');
    expect(JSON.stringify(setCookie)).toContain('SameSite=Lax');
    expect(JSON.stringify(setCookie)).toContain('Path=/api/sessions');
    expect(JSON.stringify(setCookie)).toContain('Max-Age=2592000');
    expect(JSON.stringify(setCookie)).not.toContain('Secure');
    expect(cookie).toContain('smartplan_refresh=');
  });

  it('rejects a email duplicate and a DTO invalid (CU2)', async () => {
    await register().expect(201);
    const duplicate = await register().expect(409);
    expect(duplicate.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });

    await request(app.getHttpServer())
      .post('/api/users')
      .send({
        ...registrationData,
        email: 'another@example.com',
        password: 'short',
      })
      .expect(400);

    const unknown = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        ...registrationData,
        email: 'another@example.com',
        disallowedProperty: true,
      })
      .expect(400);
    expect(unknown.body).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'disallowedProperty' }),
      ]) as unknown[],
    });
  });

  it('starts multiple sessions and rejects credentials invalid (CU1)', async () => {
    await register().expect(201);
    const credentials = {
      email: 'ana@example.com',
      password: registrationData.password,
    };

    const secondResponse = await request(app.getHttpServer())
      .post('/api/sessions')
      .send(credentials)
      .expect(201);
    expectResponseWithoutSecrets(secondResponse);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send(credentials)
      .expect(201);
    expect(await dataSource.getRepository(UserSession).count()).toBe(3);

    const invalid = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ ...credentials, password: 'incorrect-but-long' })
      .expect(401);
    expect(invalid.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects DTOs invalid in login and recovery', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'not-an-email' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token: 'corto', newPassword: 'short' })
      .expect(400);
  });

  it('distinguishes a suspended account (CU1)', async () => {
    await register().expect(201);
    const isSuspended = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'suspended' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: isSuspended.id });

    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('distinguishes a banned account (CU1)', async () => {
    await register().expect(201);
    const banned = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'banned' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: banned.id });

    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'ACCOUNT_BANNED' });
  });

  it('rotates the refresh token and revokes the session on reuse (CU1)', async () => {
    const registrationResponse = await register().expect(201);
    const cookieOriginal = cookieFrom(registrationResponse);
    const refreshedResponse = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(200);
    expectResponseWithoutSecrets(refreshedResponse);
    expect(cookieFrom(refreshedResponse)).not.toBe(cookieOriginal);

    const reusedResponse = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookieOriginal)
      .expect(401);
    expect(reusedResponse.body).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
  });

  it('rejects a session expired even though the refresh remains signed', async () => {
    const registrationResponse = await register().expect(201);
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
      .set('Cookie', cookieFrom(registrationResponse))
      .expect(401);
    expect(response.body).toMatchObject({ code: 'INVALID_SESSION' });
  });

  it('serializes concurrent rotations and revokes on reuse', async () => {
    const registrationResponse = await register().expect(201);
    const cookie = cookieFrom(registrationResponse);
    const server = app.getHttpServer();

    const responses = await Promise.all([
      request(server)
        .post('/api/sessions/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
      request(server)
        .post('/api/sessions/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', cookie),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
  });

  it('closes only the session current and the logout is idempotent (CU4)', async () => {
    const registrationResponse = await register().expect(201);
    const cookie = cookieFrom(registrationResponse);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'ana@example.com',
        password: registrationData.password,
      })
      .expect(201);

    const logoutResponse = await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie)
      .expect(204);
    expect(JSON.stringify(logoutResponse.headers['set-cookie'])).toContain(
      'smartplan_refresh=',
    );
    expect(JSON.stringify(logoutResponse.headers['set-cookie'])).toContain(
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

  it("reports the calling session's own ip and start time (CU6)", async () => {
    const registrationResponse = await register().expect(201);
    const token = accessTokenFrom(registrationResponse);

    const response = await request(app.getHttpServer())
      .get('/api/sessions/me')
      .set('Authorization', authorization(token))
      .expect(200);
    const currentSession = currentSessionFrom(response);
    expect(typeof currentSession.ip).toBe('string');
    expect(typeof currentSession.startedAt).toBe('string');

    await request(app.getHttpServer()).get('/api/sessions/me').expect(401);
  });

  it('requests and completes a recovery while revoking sessions (CU3)', async () => {
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
      .send({ token, newPassword: 'another-secure-smartplan-passphrase' })
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
        password: 'another-secure-smartplan-passphrase',
      })
      .expect(201);

    const used = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token, newPassword: 'third-secure-smartplan-passphrase' })
      .expect(409);
    expect(used.body).toMatchObject({ code: 'RECOVERY_TOKEN_ALREADY_USED' });
  });

  it('keeps previous invalid recoveries usable (CU3)', async () => {
    await register().expect(201);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const firstToken = new URL(recoveryLink ?? '').searchParams.get('token');

    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ANA@EXAMPLE.COM' })
      .expect(202);

    const previous = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: firstToken,
        newPassword: 'another-secure-smartplan-passphrase',
      })
      .expect(409);
    expect(previous.body).toMatchObject({
      code: 'RECOVERY_TOKEN_ALREADY_USED',
    });
  });

  it('serializes concurrent recovery requests (CU3)', async () => {
    await register().expect(201);
    const server = app.getHttpServer();

    const requests = await Promise.all([
      request(server)
        .post('/api/password-recoveries')
        .send({ email: 'ana@example.com' }),
      request(server)
        .post('/api/password-recoveries')
        .send({ email: 'ANA@EXAMPLE.COM' }),
    ]);
    expect(requests.map(({ status }) => status)).toEqual([202, 202]);
    expect(
      await dataSource.getRepository(PasswordRecovery).countBy({ used: false }),
    ).toBe(1);

    const tokens = recoveryLinks.map(
      (link) => new URL(link).searchParams.get('token') ?? '',
    );
    const confirmations = await Promise.all(
      tokens.map((token, index) =>
        request(server)
          .patch('/api/password-recoveries')
          .send({
            token,
            newPassword: `concurrent-password-${index}`,
          }),
      ),
    );
    expect(confirmations.map(({ status }) => status).sort()).toEqual([
      204, 409,
    ]);
  });

  it('reports an unregistered email and invalid token (CU3)', async () => {
    const nonexistent = await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'nobody@example.com' })
      .expect(404);
    expect(nonexistent.body).toMatchObject({ code: 'EMAIL_NOT_REGISTERED' });

    const invalid = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: 'completely-invalid-token-with-sufficient-length',
        newPassword: 'another-secure-smartplan-passphrase',
      })
      .expect(400);
    expect(invalid.body).toMatchObject({
      code: 'INVALID_RECOVERY_TOKEN',
    });
  });

  it('distinguishes an expired recovery token (CU3)', async () => {
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

    const expiredResponse = await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({ token, newPassword: 'another-secure-smartplan-passphrase' })
      .expect(410);
    expect(expiredResponse.body).toMatchObject({
      code: 'EXPIRED_RECOVERY_TOKEN',
    });
  });

  it('invalidates the request when the email service provider fails (CU3)', async () => {
    await register().expect(201);
    fakeEmailService.sendPasswordRecovery.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'EMAIL_SERVICE_UNAVAILABLE',
        message: 'The password recovery email could not be sent',
      }),
    );

    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(503);

    const recoveryRequest = await dataSource
      .getRepository(PasswordRecovery)
      .findOneOrFail({ where: { used: true }, order: { id: 'DESC' } });
    expect(recoveryRequest.used).toBe(true);
  });

  it('applies authentication, roles, permissions, and immediate revocation', async () => {
    await request(app.getHttpServer())
      .get('/api/authorization-tests/publicEndpoint')
      .expect(200, { publicEndpoint: true });
    await request(app.getHttpServer())
      .get('/api/authorization-tests/authenticated')
      .expect(401);

    const registrationResponse = await register().expect(201);
    const token = accessTokenFrom(registrationResponse);
    const authorizationHeader = authorization(token);
    await request(app.getHttpServer())
      .get('/api/authorization-tests/authenticated')
      .set('Authorization', authorizationHeader)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/authorization-tests/with-permission')
      .set('Authorization', authorizationHeader)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/authorization-tests/without-permission')
      .set('Authorization', authorizationHeader)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/authorization-tests/only-admin')
      .set('Authorization', authorizationHeader)
      .expect(403);

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'ana@example.com' });
    const admin = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource.getRepository(User).update(user.id, { idRole: admin.id });
    await request(app.getHttpServer())
      .get('/api/authorization-tests/only-admin')
      .set('Authorization', authorizationHeader)
      .expect(200);

    await dataSource
      .getRepository(UserSession)
      .update({ idUser: user.id }, { active: false });
    await request(app.getHttpServer())
      .get('/api/authorization-tests/authenticated')
      .set('Authorization', authorizationHeader)
      .expect(401);
  });

  it('immediately blocks an access token when the user status changes', async () => {
    const registrationResponse = await register().expect(201);
    const isSuspended = await dataSource
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'suspended' });
    await dataSource
      .getRepository(User)
      .update({ email: 'ana@example.com' }, { idUserStatus: isSuspended.id });

    const response = await request(app.getHttpServer())
      .get('/api/authorization-tests/authenticated')
      .set(
        'Authorization',
        authorization(accessTokenFrom(registrationResponse)),
      )
      .expect(403);
    expect(response.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('records audit entries without including secrets', async () => {
    const registrationResponse = await register().expect(201);
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
      .set('Cookie', cookieFrom(login))
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/password-recoveries')
      .send({ email: 'ana@example.com' })
      .expect(202);
    const recoveryToken = new URL(recoveryLink ?? '').searchParams.get('token');
    await request(app.getHttpServer())
      .patch('/api/password-recoveries')
      .send({
        token: recoveryToken,
        newPassword: 'another-secure-smartplan-passphrase',
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
    const auditLog = JSON.stringify(registers);
    expect(auditLog).not.toContain(registrationData.password);
    expect(auditLog).not.toContain(accessTokenFrom(registrationResponse));
    expect(auditLog).not.toContain(recoveryToken);
    expect(auditLog).not.toContain('passwordHash');
    expect(auditLog).not.toContain('tokenHash');
  });

  it('rate-limits login by IP and normalized email', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          email:
            attempt % 2 === 0 ? 'NOBODY@EXAMPLE.COM' : 'nobody@example.com',
          password: 'long-invalid-password',
        })
        .expect(401);
    }
    const limited = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: 'nobody@example.com',
        password: 'long-invalid-password',
      })
      .expect(429);
    expect(limited.body).toMatchObject({
      code: 'ATTEMPT_LIMIT_EXCEEDED',
    });
  });

  it('rejects another origin for cookie-based operations', async () => {
    const registrationResponse = await register().expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/sessions/refresh')
      .set('Origin', 'https://sitio-malicioso.test')
      .set('Cookie', cookieFrom(registrationResponse))
      .expect(403);
    expect(response.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
  });
});
