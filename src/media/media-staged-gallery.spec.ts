import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MediaService } from './media.service';

const KEY_A = 'staging/mcp/00000000-0000-4000-8000-00000000000a';
const KEY_B = 'staging/mcp/00000000-0000-4000-8000-00000000000b';

describe('MediaService staged galleries', () => {
  const repo = {
    find: jest.fn(),
    softRemove: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) =>
      Promise.resolve({ id: 1, createdAt: new Date(), ...value }),
    ),
  };
  const manager = { query: jest.fn(), getRepository: jest.fn(() => repo) };
  const transaction = jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
    work(manager),
  );
  const dataSource = {
    getRepository: jest.fn(() => ({ target: 'gallery' })),
    transaction,
  } as unknown as DataSource;
  const config = {
    get: jest.fn(() => undefined),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const send = jest.fn();
  let service: MediaService;

  beforeEach(() => {
    service = new MediaService(dataSource, config);
    Object.assign(service as unknown as Record<string, unknown>, {
      client: { send },
      bucket: 'bucket',
    });
  });

  async function stagedPng() {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    return {
      ContentLength: png.length,
      ContentType: 'image/png',
      Body: {
        transformToByteArray: () => Promise.resolve(new Uint8Array(png)),
      },
    };
  }

  it('replaces the gallery in order with the flagged cover', async () => {
    const staged = await stagedPng();
    send.mockImplementation((command: unknown) =>
      Promise.resolve(command instanceof GetObjectCommand ? staged : {}),
    );
    repo.find.mockResolvedValue([{ id: 9 }]);
    const result = await service.replaceGalleryFromStaged('plan', 5, [
      { objectKey: KEY_A },
      { objectKey: KEY_B, isCover: true },
    ]);
    expect(result.errors).toEqual([]);
    expect(repo.softRemove).toHaveBeenCalledWith([{ id: 9 }]);
    expect(repo.create.mock.calls.map(([row]) => row)).toEqual([
      expect.objectContaining({ idPlan: 5, displayOrder: 0, isPrimary: false }),
      expect.objectContaining({ idPlan: 5, displayOrder: 1, isPrimary: true }),
    ]);
    const deleted = send.mock.calls
      .map(([command]) => command as unknown)
      .filter((command) => command instanceof DeleteObjectCommand)
      .map((command) => command.input.Key);
    expect(deleted).toEqual([KEY_A, KEY_B]);
  });

  it('makes the first image the cover when none is flagged', async () => {
    const staged = await stagedPng();
    send.mockImplementation((command: unknown) =>
      Promise.resolve(command instanceof GetObjectCommand ? staged : {}),
    );
    repo.find.mockResolvedValue([]);
    await service.replaceGalleryFromStaged('activity', 3, [
      { objectKey: KEY_A },
      { objectKey: KEY_B },
    ]);
    expect(repo.create.mock.calls.map(([row]) => row)).toEqual([
      expect.objectContaining({ idActivity: 3, isPrimary: true }),
      expect.objectContaining({ idActivity: 3, isPrimary: false }),
    ]);
  });

  it('keeps the previous gallery when a staged image is invalid', async () => {
    const staged = await stagedPng();
    send.mockImplementation((command: unknown) =>
      Promise.resolve(command instanceof GetObjectCommand ? staged : {}),
    );
    const result = await service.replaceGalleryFromStaged('plan', 5, [
      { objectKey: KEY_A },
      { objectKey: 'https://example.com/photo.jpg' },
    ]);
    expect(result.errors).toEqual([
      {
        objectKey: 'https://example.com/photo.jpg',
        error: 'invalid staged image reference',
      },
    ]);
    expect(transaction).not.toHaveBeenCalled();
    expect(
      send.mock.calls.some(([command]) => command instanceof PutObjectCommand),
    ).toBe(false);
  });

  it('rejects two covers', async () => {
    await expect(
      service.replaceGalleryFromStaged('plan', 5, [
        { objectKey: KEY_A, isCover: true },
        { objectKey: KEY_B, isCover: true },
      ]),
    ).rejects.toThrow('only one image can be the cover');
  });
});
