import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  AccionAuditoria,
  RegistroAuditoria,
} from '../administracion/entities/registro-auditoria.entity';
import { VariablesEntorno } from '../config/variables-entorno';
import {
  ESTADOS_DE_USUARIO,
  ROL_USUARIO,
} from '../database/semillas/definiciones';
import { EstadoUsuario } from '../usuarios/entities/estado-usuario.entity';
import { RolPermiso } from '../usuarios/entities/rol-permiso.entity';
import { Rol } from '../usuarios/entities/rol.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  DURACION_ACCESS_SEGUNDOS,
  DURACION_RECUPERACION_MILISEGUNDOS,
  DURACION_REFRESH_SEGUNDOS,
} from './auth.constants';
import { CorreoService } from './correo/correo.service';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import {
  RespuestaAutenticacionDto,
  ResultadoAutenticacion,
  UsuarioSesionDto,
} from './dto/respuesta-autenticacion.dto';
import { RestablecerContrasenaDto } from './dto/restablecer-contrasena.dto';
import { RecuperacionContrasena } from './entities/recuperacion-contrasena.entity';
import { SesionUsuario } from './entities/sesion-usuario.entity';
import { ContrasenaService } from './seguridad/contrasena.service';
import { JwtAuthService } from './seguridad/jwt-auth.service';
import { ClaimsToken } from './seguridad/jwt-auth.service';
import {
  crearTokenOpaco,
  hashearToken,
  hashesCoinciden,
} from './seguridad/token.util';

type ErrorRotacion = 'invalido' | 'reutilizado';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(SesionUsuario)
    private readonly sesiones: Repository<SesionUsuario>,
    @InjectRepository(RecuperacionContrasena)
    private readonly recuperaciones: Repository<RecuperacionContrasena>,
    private readonly contrasenas: ContrasenaService,
    private readonly jwt: JwtAuthService,
    private readonly correo: CorreoService,
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {}

  async registrar(
    dto: RegistrarUsuarioDto,
    ip: string | null,
  ): Promise<ResultadoAutenticacion> {
    const passwordHash = await this.contrasenas.hashear(dto.contrasena);

    try {
      return await this.dataSource.transaction(async (gestor) => {
        const rol = await gestor.findOne(Rol, { where: { key: ROL_USUARIO } });
        const estado = await gestor.findOne(EstadoUsuario, {
          where: { key: ESTADOS_DE_USUARIO[0]?.key ?? 'activo' },
        });
        if (!rol || !estado) {
          throw new ServiceUnavailableException({
            codigo: 'CATALOGOS_NO_INICIALIZADOS',
            mensaje: 'Los catálogos de autenticación no están inicializados',
          });
        }

        const usuario = await gestor.save(
          gestor.create(Usuario, {
            nombre: dto.nombre.trim(),
            apellido: dto.apellido.trim(),
            email: dto.email,
            passwordHash,
            idRol: rol.id,
            idEstadoUsuario: estado.id,
          }),
        );
        usuario.rol = rol;
        usuario.estado = estado;

        const resultado = await this.crearSesion(gestor, usuario, ip);
        await this.auditar(gestor, AccionAuditoria.Crear, usuario.id, {
          email: usuario.email,
        });
        return resultado;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          codigo: 'EMAIL_YA_REGISTRADO',
          mensaje: 'El email ya está registrado',
        });
      }
      throw error;
    }
  }

  async iniciarSesion(
    dto: IniciarSesionDto,
    ip: string | null,
  ): Promise<ResultadoAutenticacion> {
    const usuario = await this.usuarios
      .createQueryBuilder('usuario')
      .addSelect('usuario.passwordHash')
      .leftJoinAndSelect('usuario.rol', 'rol')
      .leftJoinAndSelect('usuario.estado', 'estado')
      .where('usuario.email = :email', { email: dto.email })
      .getOne();

    if (
      !usuario ||
      !(await this.contrasenas.verificar(usuario.passwordHash, dto.contrasena))
    ) {
      throw new UnauthorizedException({
        codigo: 'CREDENCIALES_INVALIDAS',
        mensaje: 'El email o la contraseña no son correctos',
      });
    }
    this.exigirUsuarioActivo(usuario);

    return this.dataSource.transaction(async (gestor) => {
      const resultado = await this.crearSesion(gestor, usuario, ip);
      await this.auditar(
        gestor,
        AccionAuditoria.IniciarSesion,
        usuario.id,
        null,
      );
      return resultado;
    });
  }

  async renovar(
    refreshToken: string,
    claimsVerificados?: ClaimsToken,
  ): Promise<ResultadoAutenticacion> {
    const claims =
      claimsVerificados ?? (await this.jwt.verificarRefresh(refreshToken));
    const resultado = await this.dataSource.transaction(async (gestor) => {
      const sesion = await gestor
        .createQueryBuilder(SesionUsuario, 'sesion')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('sesion.usuario', 'usuario')
        .innerJoinAndSelect('usuario.rol', 'rol')
        .innerJoinAndSelect('usuario.estado', 'estado')
        .where('sesion.id = :id AND sesion.id_usuario = :idUsuario', {
          id: claims.sid,
          idUsuario: claims.sub,
        })
        .getOne();

      if (!sesion || !sesion.activa || sesion.fechaExpiracion <= new Date()) {
        return { error: 'invalido' as ErrorRotacion };
      }

      if (!hashesCoinciden(sesion.tokenHash, hashearToken(refreshToken))) {
        sesion.activa = false;
        await gestor.save(sesion);
        return { error: 'reutilizado' as ErrorRotacion };
      }

      this.exigirUsuarioActivo(sesion.usuario);
      const nuevoRefresh = await this.jwt.firmarRefresh(
        sesion.idUsuario,
        sesion.id,
      );
      sesion.tokenHash = hashearToken(nuevoRefresh);
      sesion.fechaExpiracion = this.fechaRefresh();
      await gestor.save(sesion);
      return this.armarResultado(
        gestor,
        sesion.usuario,
        sesion.id,
        nuevoRefresh,
      );
    });

    if ('error' in resultado) {
      if (resultado.error === 'reutilizado') {
        throw new UnauthorizedException({
          codigo: 'REFRESH_REUTILIZADO',
          mensaje: 'La sesión fue revocada por reutilización del token',
        });
      }
      throw new UnauthorizedException({
        codigo: 'SESION_INVALIDA',
        mensaje: 'La sesión no existe, fue revocada o venció',
      });
    }
    return resultado;
  }

  async cerrarSesion(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = await this.jwt.verificarRefresh(refreshToken);
      await this.dataSource.transaction(async (gestor) => {
        const sesion = await gestor.findOne(SesionUsuario, {
          where: { id: claims.sid, idUsuario: claims.sub },
        });
        if (!sesion?.activa) return;
        sesion.activa = false;
        await gestor.save(sesion);
        await this.auditar(
          gestor,
          AccionAuditoria.CerrarSesion,
          claims.sub,
          null,
        );
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) return;
      throw error;
    }
  }

  async solicitarRecuperacion(email: string): Promise<void> {
    const usuario = await this.usuarios.findOne({ where: { email } });
    if (!usuario) {
      throw new NotFoundException({
        codigo: 'EMAIL_NO_REGISTRADO',
        mensaje: 'No existe una cuenta registrada con ese email',
      });
    }

    const token = crearTokenOpaco();
    const ahora = new Date();
    const recuperacion = await this.dataSource.transaction(async (gestor) => {
      await gestor
        .createQueryBuilder(Usuario, 'usuario')
        .setLock('pessimistic_write')
        .where('usuario.id = :idUsuario', { idUsuario: usuario.id })
        .getOneOrFail();
      await gestor.update(
        RecuperacionContrasena,
        { idUsuario: usuario.id, usado: false },
        { usado: true },
      );
      return gestor.save(
        gestor.create(RecuperacionContrasena, {
          idUsuario: usuario.id,
          tokenHash: hashearToken(token),
          fechaCreacion: ahora,
          fechaExpiracion: new Date(
            ahora.getTime() + DURACION_RECUPERACION_MILISEGUNDOS,
          ),
          usado: false,
        }),
      );
    });

    const enlace = `${this.configuracion.get('FRONTEND_URL', { infer: true })}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    try {
      await this.correo.enviarRecuperacion(usuario.email, enlace);
    } catch (error) {
      await this.recuperaciones.update(recuperacion.id, { usado: true });
      throw error;
    }
  }

  async restablecerContrasena(dto: RestablecerContrasenaDto): Promise<void> {
    const tokenHash = hashearToken(dto.token);
    const passwordHash = await this.contrasenas.hashear(dto.nuevaContrasena);
    await this.dataSource.transaction(async (gestor) => {
      const recuperacion = await gestor
        .createQueryBuilder(RecuperacionContrasena, 'recuperacion')
        .setLock('pessimistic_write')
        .where('recuperacion.token_hash = :tokenHash', { tokenHash })
        .getOne();
      if (!recuperacion) {
        throw new BadRequestException({
          codigo: 'TOKEN_RECUPERACION_INVALIDO',
          mensaje: 'El token de recuperación no es válido',
        });
      }
      if (recuperacion.usado) {
        throw new ConflictException({
          codigo: 'TOKEN_RECUPERACION_USADO',
          mensaje: 'El token de recuperación ya fue utilizado',
        });
      }
      if (recuperacion.fechaExpiracion <= new Date()) {
        throw new GoneException({
          codigo: 'TOKEN_RECUPERACION_VENCIDO',
          mensaje: 'El token de recuperación está vencido',
        });
      }

      recuperacion.usado = true;
      await gestor.save(recuperacion);
      await gestor.update(Usuario, recuperacion.idUsuario, { passwordHash });
      await gestor.update(
        SesionUsuario,
        { idUsuario: recuperacion.idUsuario, activa: true },
        { activa: false },
      );
      await this.auditar(
        gestor,
        AccionAuditoria.Actualizar,
        recuperacion.idUsuario,
        { contrasena: 'restablecida' },
      );
    });
  }

  async obtenerAutenticacionVigente(
    idUsuario: number,
    idSesion: number,
  ): Promise<UsuarioSesionDto & { idSesion: number }> {
    const sesion = await this.sesiones.findOne({
      where: { id: idSesion, idUsuario, activa: true },
      relations: { usuario: { rol: true, estado: true } },
    });
    if (!sesion || sesion.fechaExpiracion <= new Date()) {
      throw new UnauthorizedException({
        codigo: 'SESION_INVALIDA',
        mensaje: 'La sesión no existe, fue revocada o venció',
      });
    }
    this.exigirUsuarioActivo(sesion.usuario);
    return {
      ...(await this.armarUsuario(this.dataSource.manager, sesion.usuario)),
      idSesion,
    };
  }

  private async crearSesion(
    gestor: EntityManager,
    usuario: Usuario,
    ip: string | null,
  ): Promise<ResultadoAutenticacion> {
    const sesion = await gestor.save(
      gestor.create(SesionUsuario, {
        idUsuario: usuario.id,
        tokenHash: hashearToken(crearTokenOpaco()),
        fechaInicio: new Date(),
        fechaExpiracion: this.fechaRefresh(),
        activa: true,
        ip,
      }),
    );
    const refreshToken = await this.jwt.firmarRefresh(usuario.id, sesion.id);
    sesion.tokenHash = hashearToken(refreshToken);
    await gestor.save(sesion);
    return this.armarResultado(gestor, usuario, sesion.id, refreshToken);
  }

  private async armarResultado(
    gestor: EntityManager,
    usuario: Usuario,
    idSesion: number,
    refreshToken: string,
  ): Promise<ResultadoAutenticacion> {
    const respuesta: RespuestaAutenticacionDto = {
      tokenAcceso: await this.jwt.firmarAccess(usuario.id, idSesion),
      tipoToken: 'Bearer',
      expiraEn: DURACION_ACCESS_SEGUNDOS,
      usuario: await this.armarUsuario(gestor, usuario),
    };
    return { respuesta, refreshToken };
  }

  private async armarUsuario(
    gestor: EntityManager,
    usuario: Usuario,
  ): Promise<UsuarioSesionDto> {
    const asignaciones = await gestor.find(RolPermiso, {
      where: { idRol: usuario.idRol },
      relations: { permiso: true },
    });
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: { key: usuario.rol.key, nombre: usuario.rol.nombre },
      permisos: asignaciones.map(({ permiso }) => permiso.key).sort(),
    };
  }

  private exigirUsuarioActivo(usuario: Usuario): void {
    if (usuario.estado.key === 'activo') return;
    const suspendido = usuario.estado.key === 'suspendido';
    throw new ForbiddenException({
      codigo: suspendido ? 'CUENTA_SUSPENDIDA' : 'CUENTA_BANEADA',
      mensaje: suspendido
        ? 'La cuenta está suspendida'
        : 'La cuenta está baneada',
    });
  }

  private fechaRefresh(): Date {
    return new Date(Date.now() + DURACION_REFRESH_SEGUNDOS * 1000);
  }

  private async auditar(
    gestor: EntityManager,
    accion: AccionAuditoria,
    idUsuario: number,
    cambios: Record<string, unknown> | null,
  ): Promise<void> {
    await gestor.save(
      gestor.create(RegistroAuditoria, {
        accion,
        entidadAfectada: 'usuario',
        idEntidadAfectada: idUsuario,
        original: null,
        cambios,
      }),
    );
  }
}
