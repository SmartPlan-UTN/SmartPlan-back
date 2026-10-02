import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { DataSource, EntityManager, EntityTarget, Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { CommunityContentStatus } from '../common/moderation/community-content-status';
import { Plan, PlanKind, PlanVisibility } from '../plans/entities/plan.entity';
import { hasCommunity } from '../plans/plan-selectability';
import { Activity } from '../activities/entities/activity.entity';
import { Place } from '../places/entities/place.entity';
import {
  Rating,
  RatingModerationStatus,
} from '../ratings/entities/rating.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import {
  ActivityImage,
  FeedbackImage,
  PlaceImage,
  PlanImage,
  RatingImage,
  UserAvatar,
} from './entities/media-images.entity';
import { MediaImageDto } from './dto/media-response.dto';
import { UpdateImageDto } from './dto/update-image.dto';

export type MediaTarget = 'activity' | 'place' | 'plan' | 'rating' | 'feedback';
type Gallery =
  | ActivityImage
  | PlaceImage
  | PlanImage
  | RatingImage
  | FeedbackImage;
export interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
}
const LIMITS: Record<MediaTarget, number> = {
  activity: 10,
  place: 10,
  plan: 10,
  rating: 5,
  feedback: 5,
};

@Injectable()
export class MediaService {
  private readonly client: S3Client | null;
  private readonly bucket?: string;
  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const bucket = config.get('S3_BUCKET', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = bucket;
    this.client =
      endpoint && bucket && accessKeyId && secretAccessKey
        ? new S3Client({
            endpoint,
            region: config.get('S3_REGION', { infer: true }) ?? 'auto',
            forcePathStyle: false,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  async upload(
    target: MediaTarget,
    resourceId: number,
    actorId: number,
    isAdmin: boolean,
    file: UploadedImage,
  ): Promise<MediaImageDto> {
    this.assertTarget(target);
    await this.assertManage(target, resourceId, actorId, isAdmin);
    const prepared = await this.prepareImage(file);
    const objectKey = `${target}s/${resourceId}/${crypto.randomUUID()}.webp`;
    let stored = false;
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockGallery(manager, target, resourceId);
        const repo = manager.getRepository(
          this.galleryRepository(target).target,
        );
        const count = await repo.count({
          where: this.ownerWhere(target, resourceId),
        });
        if (count >= LIMITS[target])
          throw new BadRequestException(
            `a ${target} can have at most ${LIMITS[target]} images`,
          );
        await this.put(objectKey, prepared.output);
        stored = true;
        const image = repo.create({
          ...this.ownerWhere(target, resourceId),
          objectKey,
          contentType: 'image/webp',
          byteSize: prepared.output.length,
          width: prepared.width,
          height: prepared.height,
          displayOrder: count,
          isPrimary: count === 0,
        } as never);
        return this.toDto(await repo.save(image as unknown as Gallery));
      });
    } catch (error) {
      if (stored)
        await this.client?.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
        );
      throw error;
    }
  }

  async update(
    target: MediaTarget,
    resourceId: number,
    imageId: number,
    actorId: number,
    isAdmin: boolean,
    dto: UpdateImageDto,
  ): Promise<MediaImageDto> {
    this.assertTarget(target);
    await this.assertManage(target, resourceId, actorId, isAdmin);
    return this.dataSource.transaction(async (manager) => {
      await this.lockGallery(manager, target, resourceId);
      const repo = manager.getRepository(this.galleryRepository(target).target);
      const images = await repo.find({
        where: this.ownerWhere(target, resourceId),
        order: { displayOrder: 'ASC', id: 'ASC' },
      });
      const image = images.find((entry) => entry.id === imageId);
      if (!image) throw new NotFoundException('image not found');
      if (dto.displayOrder !== undefined) {
        const reordered = images.filter((entry) => entry.id !== imageId);
        reordered.splice(
          Math.min(dto.displayOrder, reordered.length),
          0,
          image,
        );
        for (const [index, entry] of reordered.entries()) {
          entry.displayOrder = index;
        }
        await repo.save(reordered);
      }
      if (dto.isPrimary) {
        await repo.update(this.ownerWhere(target, resourceId), {
          isPrimary: false,
        } as never);
        image.isPrimary = true;
        await repo.save(image);
      }
      return this.toDto(image);
    });
  }

  async replaceAvatar(
    userId: number,
    file: UploadedImage,
  ): Promise<{ id: number; url: string; createdAt: Date }> {
    const prepared = await this.prepareImage(file);
    const objectKey = `avatars/${userId}/${crypto.randomUUID()}.webp`;
    await this.put(objectKey, prepared.output);
    try {
      const avatar = await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(UserAvatar)
          .update({ idUser: userId, isCurrent: true }, { isCurrent: false });
        return manager.save(
          manager.create(UserAvatar, {
            idUser: userId,
            objectKey,
            contentType: 'image/webp',
            byteSize: prepared.output.length,
            width: prepared.width,
            height: prepared.height,
            displayOrder: 0,
            isCurrent: true,
          }),
        );
      });
      return {
        id: avatar.id,
        url: `/api/media/avatar/${avatar.id}`,
        createdAt: avatar.createdAt,
      };
    } catch (error) {
      await this.client?.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      throw error;
    }
  }

  async removeAvatar(userId: number): Promise<void> {
    const avatar = await this.dataSource.getRepository(UserAvatar).findOne({
      where: { idUser: userId, isCurrent: true },
    });
    if (!avatar) throw new NotFoundException('avatar not found');
    await this.dataSource.getRepository(UserAvatar).softRemove(avatar);
  }

  async remove(
    target: MediaTarget,
    resourceId: number,
    imageId: number,
    actorId: number,
    isAdmin: boolean,
  ): Promise<void> {
    this.assertTarget(target);
    await this.assertManage(target, resourceId, actorId, isAdmin);
    await this.dataSource.transaction(async (manager) => {
      await this.lockGallery(manager, target, resourceId);
      const repo = manager.getRepository(this.galleryRepository(target).target);
      const images = await repo.find({
        where: this.ownerWhere(target, resourceId),
        order: { displayOrder: 'ASC', id: 'ASC' },
      });
      const image = images.find((entry) => entry.id === imageId);
      if (!image) throw new NotFoundException('image not found');
      await repo.softRemove(image);
      const remaining = images.filter((entry) => entry.id !== imageId);
      if (image.isPrimary && remaining.length > 0) {
        remaining[0].isPrimary = true;
      }
      for (const [index, entry] of remaining.entries()) {
        entry.displayOrder = index;
      }
      if (remaining.length > 0) await repo.save(remaining);
    });
  }

  async stream(
    target: MediaTarget,
    id: number,
    actorId?: number,
    isAdmin = false,
  ): Promise<{ body: NodeJS.ReadableStream; contentType: string }> {
    this.assertTarget(target);
    const image = await this.galleryRepository(target).findOne({
      where: { id },
    });
    if (!image) throw new NotFoundException('image not found');
    await this.assertRead(target, image, actorId, isAdmin);
    const response = await this.s3().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: image.objectKey }),
    );
    if (!response.Body) throw new NotFoundException('image object not found');
    return {
      body: response.Body as NodeJS.ReadableStream,
      contentType: image.contentType,
    };
  }

  async list(
    target: MediaTarget,
    resourceId: number,
    actorId?: number,
    isAdmin = false,
  ): Promise<MediaImageDto[]> {
    this.assertTarget(target);
    await this.assertRead(
      target,
      {
        idActivity: resourceId,
        idPlace: resourceId,
        idPlan: resourceId,
        idRating: resourceId,
        idFeedback: resourceId,
      } as unknown as Gallery,
      actorId,
      isAdmin,
    );
    const owner = Object.keys(this.ownerWhere(target, resourceId))[0];
    const images = await this.galleryRepository(target)
      .createQueryBuilder('image')
      .where(`image.${owner} = :resourceId`, { resourceId })
      .orderBy('image.displayOrder', 'ASC')
      .addOrderBy('image.id', 'ASC')
      .getMany();
    if (target !== 'plan') return images.map((image) => this.toDto(image));
    // Of an outing, everyone else sees only its community photos (#106): a
    // photo taken down disappears, as does one copied from the plan. Its
    // owner keeps both, a taken-down one flagged so they know why.
    const curator =
      isAdmin ||
      (actorId !== undefined &&
        (await this.dataSource
          .getRepository(Plan)
          .exists({ where: { id: resourceId, idUser: actorId } })));
    return images
      .filter((image) => curator || this.isCommunityPhoto(image as PlanImage))
      .map((image) => this.toDto(image, curator));
  }

  async streamAvatar(
    id: number,
  ): Promise<{ body: NodeJS.ReadableStream; contentType: string }> {
    const avatar = await this.dataSource.getRepository(UserAvatar).findOne({
      where: { id, isCurrent: true },
    });
    if (!avatar) throw new NotFoundException('avatar not found');
    const response = await this.s3().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: avatar.objectKey }),
    );
    if (!response.Body) throw new NotFoundException('image object not found');
    return {
      body: response.Body as NodeJS.ReadableStream,
      contentType: avatar.contentType,
    };
  }

  private async prepareImage(
    file: UploadedImage,
  ): Promise<{ output: Buffer; width: number; height: number }> {
    if (!file) throw new BadRequestException('image file is required');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('image must not exceed 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new UnsupportedMediaTypeException(
        'only JPEG, PNG, and WebP images are allowed',
      );
    try {
      const inputMetadata = await sharp(file.buffer, {
        failOn: 'error',
      }).metadata();
      const allowedFormats: Record<string, string> = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      if (
        !inputMetadata.format ||
        allowedFormats[inputMetadata.format] !== file.mimetype
      )
        throw new Error('image content does not match its MIME type');
      const output = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .webp({ quality: 85 })
        .toBuffer();
      const metadata = await sharp(output).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error('invalid dimensions');
      return { output, width: metadata.width, height: metadata.height };
    } catch {
      throw new UnsupportedMediaTypeException(
        'file must be a valid JPEG, PNG, or WebP image',
      );
    }
  }

  private async assertManage(
    target: MediaTarget,
    id: number,
    actorId: number,
    isAdmin: boolean,
  ): Promise<void> {
    if (target === 'activity' || target === 'place') {
      if (!isAdmin) throw new ForbiddenException();
      const entity = target === 'activity' ? Activity : Place;
      const row = await this.dataSource.getRepository(entity).findOneBy({ id });
      if (!row) throw new NotFoundException(`${target} not found`);
      return;
    }
    if (target === 'plan') {
      const row = await this.dataSource
        .getRepository(Plan)
        .findOne({ where: { id } });
      if (!row) throw new NotFoundException('plan not found');
      if (!isAdmin && row.idUser !== actorId) throw new ForbiddenException();
      return;
    }
    if (target === 'rating') {
      const row = await this.dataSource
        .getRepository(Rating)
        .findOne({ where: { id } });
      if (!row) throw new NotFoundException('rating not found');
      if (!isAdmin && row.idUser !== actorId) throw new ForbiddenException();
      return;
    }
    if (target === 'feedback') {
      const row = await this.dataSource
        .getRepository(Feedback)
        .findOne({ where: { id }, relations: { plan: true } });
      if (!row) throw new NotFoundException('feedback not found');
      if (!isAdmin && row.plan.idUser !== actorId)
        throw new ForbiddenException();
      return;
    }
    throw new ForbiddenException();
  }
  private async assertRead(
    target: MediaTarget,
    image: Gallery,
    actorId?: number,
    isAdmin = false,
  ): Promise<void> {
    if (target === 'activity' || target === 'place') {
      const entity = target === 'activity' ? Activity : Place;
      const id =
        target === 'activity'
          ? (image as ActivityImage).idActivity
          : (image as PlaceImage).idPlace;
      const resource = await this.dataSource
        .getRepository(entity)
        .findOneBy({ id });
      if (!resource) throw new NotFoundException(`${target} not found`);
      return;
    }
    if (target === 'plan') {
      const plan = await this.dataSource.getRepository(Plan).findOne({
        where: { id: (image as PlanImage).idPlan },
        relations: { feedback: true, sourcePlan: { status: true }, user: true },
      });
      if (!plan) throw new NotFoundException('plan not found');
      if (
        plan.visibility === PlanVisibility.Public ||
        isAdmin ||
        plan.idUser === actorId
      )
        return;
      if (
        this.isSharedOuting(plan) &&
        this.isCommunityPhoto(image as PlanImage)
      )
        return;
    }
    if (target === 'rating') {
      const rating = await this.dataSource
        .getRepository(Rating)
        .findOneBy({ id: (image as RatingImage).idRating });
      if (!rating) throw new NotFoundException('rating not found');
      if (
        rating.moderationStatus === RatingModerationStatus.Approved ||
        isAdmin ||
        rating.idUser === actorId
      )
        return;
    }
    if (target === 'feedback') {
      const feedback = await this.dataSource.getRepository(Feedback).findOne({
        where: { id: (image as FeedbackImage).idFeedback },
        relations: { plan: true },
      });
      if (!feedback) throw new NotFoundException('feedback not found');
      if (feedback && (isAdmin || feedback.plan.idUser === actorId)) return;
    }
    throw new ForbiddenException();
  }
  /**
   * An outing whose experience is shared with the community (#106): its
   * photos are part of the published plan's community section, so they are
   * as readable as that plan.
   */
  private isSharedOuting(plan: Plan): boolean {
    return (
      plan.kind === PlanKind.Outing &&
      // A deleted account's soft-deleted user does not load.
      Boolean(plan.user) &&
      plan.feedback?.isShared === true &&
      plan.sourcePlan !== null &&
      hasCommunity({
        kind: plan.sourcePlan.kind,
        visibility: plan.sourcePlan.visibility,
        statusKey: plan.sourcePlan.status.key,
      })
    );
  }
  /**
   * A photo the outing's owner took that moderation did not take down. When
   * listing, `image` is only the gallery's owner, so nothing is ruled out.
   */
  private isCommunityPhoto(image: PlanImage): boolean {
    return (
      image.isSourceCopy !== true &&
      image.communityStatus !== CommunityContentStatus.Rejected
    );
  }
  private async lockGallery(
    manager: EntityManager,
    target: MediaTarget,
    resourceId: number,
  ): Promise<void> {
    const targetNumber = Object.keys(LIMITS).indexOf(target) + 1;
    await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
      targetNumber,
      resourceId,
    ]);
  }
  private galleryRepository(target: MediaTarget): Repository<Gallery> {
    const targetEntity: Record<MediaTarget, EntityTarget<Gallery>> = {
      activity: ActivityImage,
      place: PlaceImage,
      plan: PlanImage,
      rating: RatingImage,
      feedback: FeedbackImage,
    };
    return this.dataSource.getRepository(targetEntity[target]);
  }
  private assertTarget(target: string): asserts target is MediaTarget {
    if (!Object.hasOwn(LIMITS, target))
      throw new NotFoundException('media type not found');
  }
  private ownerWhere(target: MediaTarget, id: number): Record<string, number> {
    return { [`id${target[0].toUpperCase()}${target.slice(1)}`]: id };
  }
  toDto(image: Gallery, curator = false): MediaImageDto {
    const target =
      image instanceof ActivityImage
        ? 'activity'
        : image instanceof PlaceImage
          ? 'place'
          : image instanceof PlanImage
            ? 'plan'
            : image instanceof RatingImage
              ? 'rating'
              : 'feedback';
    return {
      id: image.id,
      url: `/api/media/${target}/${image.id}`,
      isPrimary: image.isPrimary,
      displayOrder: image.displayOrder,
      createdAt: image.createdAt,
      ...(curator &&
      image instanceof PlanImage &&
      image.communityStatus === CommunityContentStatus.Rejected
        ? { communityHidden: true }
        : {}),
    };
  }
  private s3(): S3Client {
    if (!this.client || !this.bucket)
      throw new ServiceUnavailableException('image storage is not configured');
    return this.client;
  }
  private async put(key: string, body: Buffer): Promise<void> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
      }),
    );
  }
}
