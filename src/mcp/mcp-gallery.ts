import { z } from 'zod';
import type { MediaImageDto } from '../media/dto/media-response.dto';
import type { MediaService, MediaTarget } from '../media/media.service';

/** Ordered gallery: the order is `display_order`; one item may be the cover. */
export const galleryInputSchema = z
  .array(
    z
      .object({
        objectKey: z.string().min(1).max(200),
        isCover: z.boolean().optional(),
      })
      .strict(),
  )
  .min(1)
  .max(10)
  .refine((items) => items.filter((item) => item.isCover).length <= 1, {
    message: 'Only one image can have isCover: true',
  })
  .refine(
    (items) =>
      new Set(items.map((item) => item.objectKey)).size === items.length,
    { message: 'An objectKey is listed twice' },
  );
export type GalleryInput = z.infer<typeof galleryInputSchema>;

export interface McpGalleryResult {
  status: 'replaced' | 'error';
  images: MediaImageDto[];
  errors: Array<{ objectKey?: string; error: string }>;
}

/**
 * Replaces the gallery when `images` is sent. All-or-nothing: if one staged
 * image fails, the previous gallery is kept and every failure is reported.
 */
export async function replaceGallery(
  media: MediaService,
  target: MediaTarget,
  resourceId: number,
  items: GalleryInput,
): Promise<McpGalleryResult> {
  try {
    const result = await media.replaceGalleryFromStaged(
      target,
      resourceId,
      items,
    );
    return result.errors.length > 0
      ? { status: 'error', images: [], errors: result.errors }
      : { status: 'replaced', images: result.images, errors: [] };
  } catch (error) {
    return {
      status: 'error',
      images: [],
      errors: [
        { error: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}
