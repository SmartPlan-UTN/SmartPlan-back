import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AccionAuditoria,
  RegistroAuditoria,
} from '../administracion/entities/registro-auditoria.entity';
import { VariablesEntorno } from '../config/variables-entorno';
import { EstadoUsuario } from '../usuarios/entities/estado-usuario.entity';
import { RolPermiso } from '../usuarios/entities/rol-permiso.entity';
import { Rol } from '../usuarios/entities/rol.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AuthService } from './auth.service';
import { CorreoService } from './correo/correo.service';
import { RecuperacionContrasena } from './entities/recuperacion-contrasena.entity';
import { SesionUsuario } from './entities/sesion-usuario.entity';
import { ContrasenaService } from './seguridad/contrasena.service';
import { JwtAuthService } from './seguridad/jwt-auth.service';
import { hashearToken } from './seguridad/token.util';

interface ConstructorEntidad {
  name: string;
}

describe('AuthService', () => {
  const rol = { id: 2, key: 'usuario', nombre: 'Usuario' } as Rol;
  const estado = { id: 1, key: 'activo', nombre: 'Activo' } as EstadoUsuario;
  let usuario: Usuario;
  let sesion: SesionUsuario;
  let recuperacionCreada: Record<string, unknown> | undefined;
  let enlaceEnviado = '';

  const gestor = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = {
    manager: gestor,
    transaction: jest.fn(
      async (trabajo: (entidad: EntityManager) => Promise<unknown>) =>
        trabajo(gestor as unknown as EntityManager),
    ),
  };
  const usuarios = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };
  const sesiones = { findOne: jest.fn() };
  const recuperaciones = { update: jest.fn() };
  const contrasenas = {
    hashear: jest.fn(() => Promise.resolve('hash-argon2')),
    verificar: jest.fn(() => Promise.resolve(true)),
  };
  const jwt = {
    firmarAccess: jest.fn(() => Promise.resolve('access-firmado')),
    firmarRefresh: jest.fn(() => Promise.resolve('refresh-nuevo')),
    verificarRefresh: jest.fn(() =>
      Promise.resolve({
        sub: 7,
        sid: 11,
        tipo: 'refresh' as const,
      }),
    ),
  };
  const correo = {
    enviarRecuperacion: jest.fn((_destinatario: string, enlace: string) => {
      enlaceEnviado = enlace;
      return Promise.resolve();
    }),
  };
  const configuracion = {
    get: jest.fn(() => 'https://app.smartplan.test'),
  };

  const servicio = new AuthService(
    dataSource as unknown as DataSource,
    usuarios as unknown as Repository<Usuario>,
    sesiones as unknown as Repository<SesionUsuario>,
    recuperaciones as unknown as Repository<RecuperacionContrasena>,
    contrasenas as unknown as ContrasenaService,
    jwt as unknown as JwtAuthService,
    correo as unknown as CorreoService,
    configuracion as unknown as ConfigService<VariablesEntorno, true>,
  );

  function queryBuilderCon(resultado: unknown) {
    const builder = {
      addSelect: jest.fn(),
      leftJoinAndSelect: jest.fn(),
      innerJoinAndSelect: jest.fn(),
      where: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn(() => Promise.resolve(resultado)),
      getOneOrFail: jest.fn(() => Promise.resolve(resultado)),
    };
    for (const metodo of [
      'addSelect',
      'leftJoinAndSelect',
      'innerJoinAndSelect',
      'where',
      'setLock',
    ] as const) {
      builder[metodo].mockReturnValue(builder);
    }
    return builder;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    recuperacionCreada = undefined;
    enlaceEnviado = '';
    usuario = {
      id: 7,
      nombre: 'Ana',
      apellido: 'Pérez',
      email: 'ana@example.com',
      passwordHash: 'hash-argon2',
      idRol: rol.id,
      idEstadoUsuario: estado.id,
      rol,
      estado,
    } as Usuario;
    sesion = {
      id: 11,
      idUsuario: usuario.id,
      usuario,
      tokenHash: hashearToken('refresh-viejo'),
      fechaInicio: new Date(),
      fechaExpiracion: new Date(Date.now() + 60_000),
      activa: true,
      ip: '127.0.0.1',
    } as SesionUsuario;

    gestor.create.mockImplementation(
      (entidad: ConstructorEntidad, datos: object) => {
        const creado = { ...datos };
        if (entidad === RecuperacionContrasena) {
          recuperacionCreada = creado;
        }
        return creado;
      },
    );
    gestor.save.mockImplementation((entidad: object) => {
      const registro = entidad as Record<string, unknown>;
      if ('email' in registro && !registro.id) registro.id = usuario.id;
      if ('fechaInicio' in registro && !registro.id) registro.id = sesion.id;
      return Promise.resolve(entidad);
    });
    gestor.findOne.mockImplementation((entidad: ConstructorEntidad) => {
      if (entidad === Rol) return rol;
      if (entidad === EstadoUsuario) return estado;
      if (entidad === SesionUsuario) return sesion;
      return Promise.resolve(null);
    });
    gestor.find.mockResolvedValue([
      { permiso: { key: 'perfil.consultar' } },
    ] as RolPermiso[]);
    gestor.update.mockResolvedValue({ affected: 1 });
    contrasenas.hashear.mockResolvedValue('hash-argon2');
    contrasenas.verificar.mockResolvedValue(true);
    jwt.firmarAccess.mockResolvedValue('access-firmado');
    jwt.firmarRefresh.mockResolvedValue('refresh-nuevo');
    jwt.verificarRefresh.mockResolvedValue({
      sub: usuario.id,
      sid: sesion.id,
      tipo: 'refresh',
    });
    correo.enviarRecuperacion.mockImplementation(
      (_destinatario: string, enlace: string) => {
        enlaceEnviado = enlace;
        return Promise.resolve();
      },
    );
  });

  it('registra con rol/estado, crea sesión y audita sin secretos', async () => {
    const resultado = await servicio.registrar(
      {
        nombre: ' Ana ',
        apellido: ' Pérez ',
        email: 'ana@example.com',
        contrasena: 'contrasena-unitaria-segura',
      },
      '127.0.0.1',
    );

    expect(contrasenas.hashear).toHaveBeenCalledWith(
      'contrasena-unitaria-segura',
    );
    expect(resultado.respuesta).toMatchObject({
      tokenAcceso: 'access-firmado',
      usuario: { email: 'ana@example.com', rol: { key: 'usuario' } },
    });
    expect(resultado.refreshToken).toBe('refresh-nuevo');
    expect(gestor.create).toHaveBeenCalledWith(
      RegistroAuditoria,
      expect.objectContaining({
        accion: AccionAuditoria.Crear,
        idEntidadAfectada: usuario.id,
      }),
    );
    expect(JSON.stringify(gestor.create.mock.calls)).not.toContain(
      'contrasena-unitaria-segura',
    );
  });

  it('inicia sesión sin cerrar las existentes y audita el acceso', async () => {
    usuarios.createQueryBuilder.mockReturnValue(queryBuilderCon(usuario));

    const resultado = await servicio.iniciarSesion(
      {
        email: usuario.email,
        contrasena: 'contrasena-unitaria-segura',
      },
      '127.0.0.1',
    );

    expect(contrasenas.verificar).toHaveBeenCalledWith(
      usuario.passwordHash,
      'contrasena-unitaria-segura',
    );
    expect(resultado.respuesta.tokenAcceso).toBe('access-firmado');
    expect(gestor.update).not.toHaveBeenCalledWith(
      SesionUsuario,
      expect.anything(),
      expect.objectContaining({ activa: false }),
    );
    expect(gestor.create).toHaveBeenCalledWith(
      RegistroAuditoria,
      expect.objectContaining({ accion: AccionAuditoria.IniciarSesion }),
    );
  });

  it('rechaza credenciales incorrectas con un error genérico', async () => {
    usuarios.createQueryBuilder.mockReturnValue(queryBuilderCon(usuario));
    contrasenas.verificar.mockResolvedValue(false);

    await expect(
      servicio.iniciarSesion(
        { email: usuario.email, contrasena: 'incorrecta-pero-larga' },
        null,
      ),
    ).rejects.toMatchObject({
      response: { codigo: 'CREDENCIALES_INVALIDAS' },
      status: 401,
    });
  });

  it('rota el refresh bajo bloqueo y detecta su reutilización', async () => {
    const builderValido = queryBuilderCon(sesion);
    gestor.createQueryBuilder.mockReturnValue(builderValido);

    const resultado = await servicio.renovar('refresh-viejo');

    expect(builderValido.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(resultado.refreshToken).toBe('refresh-nuevo');
    expect(sesion.tokenHash).toBe(hashearToken('refresh-nuevo'));

    sesion.tokenHash = hashearToken('otro-refresh');
    sesion.activa = true;
    gestor.createQueryBuilder.mockReturnValue(queryBuilderCon(sesion));
    await expect(servicio.renovar('refresh-viejo')).rejects.toMatchObject({
      response: { codigo: 'REFRESH_REUTILIZADO' },
      status: 401,
    });
    expect(sesion.activa).toBe(false);
  });

  it('cierra solo la sesión indicada y deja el logout inválido idempotente', async () => {
    await servicio.cerrarSesion('refresh-viejo');

    expect(sesion.activa).toBe(false);
    expect(gestor.create).toHaveBeenCalledWith(
      RegistroAuditoria,
      expect.objectContaining({ accion: AccionAuditoria.CerrarSesion }),
    );

    jwt.verificarRefresh.mockRejectedValueOnce(new UnauthorizedException());
    await expect(servicio.cerrarSesion('invalido')).resolves.toBeUndefined();
  });

  it('invalida pedidos anteriores y envía un token de recuperación opaco', async () => {
    usuarios.findOne.mockResolvedValue(usuario);
    const builder = queryBuilderCon(usuario);
    gestor.createQueryBuilder.mockReturnValue(builder);

    await servicio.solicitarRecuperacion(usuario.email);

    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(gestor.update).toHaveBeenCalledWith(
      RecuperacionContrasena,
      { idUsuario: usuario.id, usado: false },
      { usado: true },
    );
    expect(correo.enviarRecuperacion).toHaveBeenCalledWith(
      usuario.email,
      expect.stringMatching(
        /^https:\/\/app\.smartplan\.test\/restablecer-contrasena\?token=.+/,
      ),
    );
    const token = new URL(enlaceEnviado).searchParams.get('token') ?? '';
    expect(recuperacionCreada?.tokenHash).toBe(hashearToken(token));
    expect(JSON.stringify(recuperacionCreada)).not.toContain(token);
  });

  it('restablece una sola vez bajo bloqueo, revoca sesiones y audita', async () => {
    const recuperacion = {
      id: 5,
      idUsuario: usuario.id,
      tokenHash: hashearToken('token-recuperacion-unitario-valido'),
      fechaExpiracion: new Date(Date.now() + 60_000),
      usado: false,
    } as RecuperacionContrasena;
    const builder = queryBuilderCon(recuperacion);
    gestor.createQueryBuilder.mockReturnValue(builder);

    await servicio.restablecerContrasena({
      token: 'token-recuperacion-unitario-valido',
      nuevaContrasena: 'contrasena-nueva-unitaria',
    });

    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(recuperacion.usado).toBe(true);
    expect(gestor.update).toHaveBeenCalledWith(Usuario, usuario.id, {
      passwordHash: 'hash-argon2',
    });
    expect(gestor.update).toHaveBeenCalledWith(
      SesionUsuario,
      { idUsuario: usuario.id, activa: true },
      { activa: false },
    );
    expect(gestor.create).toHaveBeenCalledWith(
      RegistroAuditoria,
      expect.objectContaining({ accion: AccionAuditoria.Actualizar }),
    );
  });
});
