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
import { DataSource, EntityTarget, Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { Plan, PlanVisibility } from '../plans/entities/plan.entity';
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
    if (!file) throw new BadRequestException('image file is required');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('image must not exceed 5 MB');
    let output: Buffer;
    let metadata: sharp.Metadata;
    try {
      output = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .webp({ quality: 85 })
        .toBuffer();
      metadata = await sharp(output).metadata();
    } catch {
      throw new UnsupportedMediaTypeException(
        'file must be a valid JPEG, PNG, or WebP image',
      );
    }
    if (
      !metadata.width ||
      !metadata.height ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    )
      throw new UnsupportedMediaTypeException(
        'only JPEG, PNG, and WebP images are allowed',
      );
    const repo = this.galleryRepository(target);
    const count = await repo.count({
      where: this.ownerWhere(target, resourceId),
    });
    if (count >= LIMITS[target])
      throw new BadRequestException(
        `a ${target} can have at most ${LIMITS[target]} images`,
      );
    const objectKey = `${target}s/${resourceId}/${crypto.randomUUID()}.webp`;
    await this.put(objectKey, output);
    const image = repo.create({
      ...this.ownerWhere(target, resourceId),
      objectKey,
      contentType: 'image/webp',
      byteSize: output.length,
      width: metadata.width,
      height: metadata.height,
      displayOrder: count,
      isPrimary: count === 0,
    } as never);
    try {
      const saved = await repo.save(image as unknown as Gallery);
      return this.toDto(saved as unknown as Gallery);
    } catch (error) {
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
    const repo = this.galleryRepository(target);
    const image = await repo.findOne({
      where: { id: imageId, ...this.ownerWhere(target, resourceId) },
    });
    if (!image) throw new NotFoundException('image not found');
    await this.dataSource.transaction(async (manager) => {
      if (dto.isPrimary)
        await manager
          .getRepository(repo.target)
          .update(this.ownerWhere(target, resourceId), {
            isPrimary: false,
          } as never);
      Object.assign(image, dto);
      await manager.save(image);
    });
    return this.toDto(image);
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
    const repo = this.galleryRepository(target);
    const image = await repo.findOne({
      where: { id: imageId, ...this.ownerWhere(target, resourceId) },
    });
    if (!image) throw new NotFoundException('image not found');
    await repo.softRemove(image);
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
    if (isAdmin && (target === 'activity' || target === 'place')) return;
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
    if (!isAdmin) throw new ForbiddenException();
  }
  private async assertRead(
    target: MediaTarget,
    image: Gallery,
    actorId?: number,
    isAdmin = false,
  ): Promise<void> {
    if (target === 'activity' || target === 'place') return;
    if (target === 'plan') {
      const plan = await this.dataSource
        .getRepository(Plan)
        .findOneByOrFail({ id: (image as PlanImage).idPlan });
      if (
        plan.visibility === PlanVisibility.Public ||
        isAdmin ||
        plan.idUser === actorId
      )
        return;
    }
    if (target === 'rating') {
      const rating = await this.dataSource
        .getRepository(Rating)
        .findOneByOrFail({ id: (image as RatingImage).idRating });
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
      if (feedback && (isAdmin || feedback.plan.idUser === actorId)) return;
    }
    throw new ForbiddenException();
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
  private toDto(image: Gallery): MediaImageDto {
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
