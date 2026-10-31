import { EntityManager } from 'typeorm';
import {
  generateCommunityUsername,
  isReservedUsername,
} from './community-username';

describe('community usernames', () => {
  it.each([
    'viajero123',
    'viajero123_abcdef',
    'admin',
    'smartplan',
    'soporte',
    'viajero',
  ])('reserves %s against account impersonation', (username) => {
    expect(isReservedUsername(username)).toBe(true);
  });

  it('allows a personal username', () => {
    expect(isReservedUsername('ana_mendoza')).toBe(false);
  });

  it('allocates a different identity when a legacy account occupied the generated name', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce(null);
    const username = await generateCommunityUsername(
      { findOne } as unknown as EntityManager,
      123,
    );
    expect(username).toMatch(/^viajero123_[a-f0-9]{6}$/);
    expect(username.length).toBeLessThanOrEqual(24);
  });
});
