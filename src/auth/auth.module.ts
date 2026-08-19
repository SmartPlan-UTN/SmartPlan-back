import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistroAuditoria } from '../administracion/entities/registro-auditoria.entity';
import { EstadoUsuario } from '../usuarios/entities/estado-usuario.entity';
import { Permiso } from '../usuarios/entities/permiso.entity';
import { RolPermiso } from '../usuarios/entities/rol-permiso.entity';
import { Rol } from '../usuarios/entities/rol.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AuthService } from './auth.service';
import { CorreoService } from './correo/correo.service';
import { RecuperacionContrasena } from './entities/recuperacion-contrasena.entity';
import { SesionUsuario } from './entities/sesion-usuario.entity';
import { AutenticacionGuard } from './guards/autenticacion.guard';
import { PermisosGuard } from './guards/permisos.guard';
import { RolesGuard } from './guards/roles.guard';
import { RecuperacionesContrasenaController } from './recuperaciones-contrasena.controller';
import { ContrasenaService } from './seguridad/contrasena.service';
import { JwtAuthService } from './seguridad/jwt-auth.service';
import { LimitadorIntentosService } from './seguridad/limitador-intentos.service';
import { SesionesController } from './sesiones.controller';
import { UsuariosAuthController } from './usuarios-auth.controller';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot(),
    TypeOrmModule.forFeature([
      Usuario,
      Rol,
      Permiso,
      RolPermiso,
      EstadoUsuario,
      SesionUsuario,
      RecuperacionContrasena,
      RegistroAuditoria,
    ]),
  ],
  controllers: [
    UsuariosAuthController,
    SesionesController,
    RecuperacionesContrasenaController,
  ],
  providers: [
    AuthService,
    ContrasenaService,
    JwtAuthService,
    CorreoService,
    LimitadorIntentosService,
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermisosGuard },
  ],
  exports: [AuthService, ContrasenaService, JwtAuthService],
})
export class AuthModule {}
