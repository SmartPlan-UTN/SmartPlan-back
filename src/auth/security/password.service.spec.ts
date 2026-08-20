import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const servicio = new PasswordService();

  it('hashea con Argon2id y verifica sin guardar el texto plano', async () => {
    const hash = await servicio.hash('una-frase-segura-2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('una-frase-segura-2026');
    await expect(servicio.verify(hash, 'una-frase-segura-2026')).resolves.toBe(
      true,
    );
    await expect(servicio.verify(hash, 'otra-password')).resolves.toBe(false);
  });
});
