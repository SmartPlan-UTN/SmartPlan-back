import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id and verifies without storing the text plain', async () => {
    const hash = await service.hash('a-secure-passphrase-2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('a-secure-passphrase-2026');
    await expect(
      service.verify(hash, 'a-secure-passphrase-2026'),
    ).resolves.toBe(true);
    await expect(service.verify(hash, 'another-password')).resolves.toBe(false);
  });
});
