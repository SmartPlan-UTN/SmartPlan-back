import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MediaService, UploadedImage } from './media.service';
import { CommunityContentStatus } from '../common/moderation/community-content-status';
import { Plan, PlanKind, PlanVisibility } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { PlanImage, RatingImage } from './entities/media-images.entity';

describe('MediaService upload validation', () => {
  const findOneBy = jest.fn();
  const dataSource = {
    getRepository: jest.fn(() => ({ findOneBy })),
    transaction: jest.fn(),
  } as unknown as DataSource;
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  let service: MediaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaService(dataSource, config);
  });

  const file = (buffer: Buffer, mimetype: string): UploadedImage => ({
    buffer,
    mimetype,
    size: buffer.length,
  });

  it('denies a non-administrator before querying or uploading an activity image', async () => {
    await expect(
      service.upload(
        'activity',
        42,
        1,
        false,
        file(Buffer.from('bad'), 'image/png'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it('does not upload for a missing activity', async () => {
    findOneBy.mockResolvedValue(null);
    await expect(
      service.upload(
        'activity',
        42,
        1,
        true,
        file(Buffer.from('bad'), 'image/png'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a MIME declaration that disagrees with the image content', async () => {
    findOneBy.mockResolvedValue({ id: 42 });
    const jpeg = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await expect(
      service.upload('activity', 42, 1, true, file(jpeg, 'image/png')),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects an image larger than 5 MB before conversion', async () => {
    findOneBy.mockResolvedValue({ id: 42 });
    await expect(
      service.upload(
        'activity',
        42,
        1,
        true,
        file(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'),
      ),
    ).rejects.toThrow('image must not exceed 5 MB');
  });

  it('reports missing S3 configuration for an otherwise valid upload', async () => {
    findOneBy.mockResolvedValue({ id: 42 });
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn(() => ({ count: jest.fn().mockResolvedValue(0) })),
    };
    const execute = (
      work: (transactionManager: typeof manager) => Promise<unknown>,
    ) => work(manager);
    (
      dataSource.transaction as unknown as {
        mockImplementation: (callback: typeof execute) => void;
      }
    ).mockImplementation(execute);
    await expect(
      service.upload('activity', 42, 1, true, file(png, 'image/png')),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('MediaService gallery visibility', () => {
  const ratingLookup = jest.fn();
  const gallery = jest.fn();
  const dataSource = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Rating
        ? { findOneBy: ratingLookup }
        : {
            createQueryBuilder: () => ({
              where: () => ({
                orderBy: () => ({ addOrderBy: () => ({ getMany: gallery }) }),
              }),
            }),
          },
    ),
  } as unknown as DataSource;
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  const service = new MediaService(dataSource, config);

  beforeEach(() => jest.clearAllMocks());

  it('keeps pending rating images private from other readers', async () => {
    ratingLookup.mockResolvedValue({
      id: 9,
      idUser: 4,
      moderationStatus: 'pending',
    });
    await expect(service.list('rating', 9, 5)).rejects.toThrow(
      ForbiddenException,
    );
    expect(gallery).not.toHaveBeenCalled();
  });

  it('makes approved rating images readable to the public', async () => {
    ratingLookup.mockResolvedValue({
      id: 9,
      idUser: 4,
      moderationStatus: 'approved',
    });
    gallery.mockResolvedValue([
      Object.assign(new RatingImage(), {
        id: 12,
        idRating: 9,
        isPrimary: true,
        displayOrder: 0,
        createdAt: new Date('2026-09-30'),
      }),
    ]);
    await expect(service.list('rating', 9)).resolves.toMatchObject([
      { id: 12, url: '/api/media/rating/12', isPrimary: true },
    ]);
  });
});

describe('MediaService shared outing photos (#106)', () => {
  const planLookup = jest.fn();
  const ownsPlan = jest.fn();
  const gallery = jest.fn();
  const findImage = jest.fn();
  const dataSource = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Plan
        ? { findOne: planLookup, exists: ownsPlan }
        : {
            findOne: findImage,
            createQueryBuilder: () => ({
              where: () => ({
                orderBy: () => ({ addOrderBy: () => ({ getMany: gallery }) }),
              }),
            }),
          },
    ),
  } as unknown as DataSource;
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  const service = new MediaService(dataSource, config);
  const photo = (
    id: number,
    communityStatus: CommunityContentStatus,
    isSourceCopy = false,
  ) =>
    Object.assign(new PlanImage(), {
      id,
      idPlan: 30,
      isPrimary: id === 1,
      displayOrder: id,
      createdAt: new Date('2026-10-01'),
      communityStatus,
      isSourceCopy,
    });
  const outing = (
    isShared: boolean,
    sourceStatus = 'confirmed',
    authorDeleted = false,
  ) => ({
    id: 30,
    idUser: 4,
    // A soft-deleted author does not load with the relation.
    user: authorDeleted ? null : { id: 4 },
    kind: PlanKind.Outing,
    visibility: PlanVisibility.Private,
    feedback: { isShared },
    sourcePlan: {
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
      status: { key: sourceStatus },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    gallery.mockResolvedValue([
      photo(1, CommunityContentStatus.Approved),
      photo(2, CommunityContentStatus.Rejected),
    ]);
  });

  it('keeps a private outing gallery to its owner', async () => {
    planLookup.mockResolvedValue(outing(false));
    await expect(service.list('plan', 30, 5)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("keeps a deleted account's shared outing from others", async () => {
    planLookup.mockResolvedValue(outing(true, 'confirmed', true));
    ownsPlan.mockResolvedValue(false);
    await expect(service.list('plan', 30, 5)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('shows a shared outing to others without the photos taken down', async () => {
    planLookup.mockResolvedValue(outing(true));
    ownsPlan.mockResolvedValue(false);
    const images = await service.list('plan', 30, 5);
    expect(images.map((image) => image.id)).toEqual([1]);
    expect(images[0]).not.toHaveProperty('communityHidden');
  });

  it("shows others none of the photos copied from the outing's plan", async () => {
    planLookup.mockResolvedValue(outing(true));
    ownsPlan.mockResolvedValue(false);
    gallery.mockResolvedValue([
      photo(1, CommunityContentStatus.Unreviewed, true),
      photo(2, CommunityContentStatus.Unreviewed),
    ]);
    const images = await service.list('plan', 30, 5);
    expect(images.map((image) => image.id)).toEqual([2]);
  });

  it('keeps the outing of a cancelled plan to its owner', async () => {
    planLookup.mockResolvedValue(outing(true, 'cancelled'));
    await expect(service.list('plan', 30, 5)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('keeps every photo for the owner and flags only the hidden one', async () => {
    planLookup.mockResolvedValue(outing(true));
    ownsPlan.mockResolvedValue(true);
    const images = await service.list('plan', 30, 4);
    expect(images).toEqual([
      expect.not.objectContaining({ communityHidden: true }),
      expect.objectContaining({ id: 2, communityHidden: true }),
    ]);
  });

  it('refuses to stream a photo taken down to anyone but its owner', async () => {
    planLookup.mockResolvedValue(outing(true));
    findImage.mockResolvedValue(photo(2, CommunityContentStatus.Rejected));
    await expect(service.stream('plan', 2, 5)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
