import { ContrasenaService } from './contrasena.service';

describe('ContrasenaService', () => {
  const servicio = new ContrasenaService();

  it('hashea con Argon2id y verifica sin guardar el texto plano', async () => {
    const hash = await servicio.hashear('una-frase-segura-2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('una-frase-segura-2026');
    await expect(
      servicio.verificar(hash, 'una-frase-segura-2026'),
    ).resolves.toBe(true);
    await expect(servicio.verificar(hash, 'otra-contrasena')).resolves.toBe(
      false,
    );
  });
});
