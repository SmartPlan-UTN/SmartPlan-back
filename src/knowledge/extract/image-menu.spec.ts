import { MenuOcrBusyError, readMenuImage } from './image-menu';

describe('menu OCR concurrency', () => {
  it('shares an in-flight capture, rejects a concurrent capture and releases capacity', async () => {
    const input = Buffer.from('invalid-image-first');
    const first = readMenuImage(input);
    expect(readMenuImage(input)).toBe(first);
    await expect(
      readMenuImage(Buffer.from('invalid-image-second')),
    ).rejects.toBeInstanceOf(MenuOcrBusyError);
    await expect(first).resolves.toBeNull();
    await expect(
      readMenuImage(Buffer.from('invalid-image-third')),
    ).resolves.toBeNull();
  });
});
