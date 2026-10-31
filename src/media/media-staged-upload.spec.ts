import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MediaService, STAGED_UPLOAD_PREFIX } from './media.service';

describe('MediaService staged uploads', () => {
  const values: Record<string, string> = {
    S3_ENDPOINT: 'https://storage.example.com',
    S3_REGION: 'auto',
    S3_BUCKET: 'bucket',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new MediaService({} as DataSource, config);

  it('signs a PUT URL with its type only and no SDK checksum (MCP image upload)', async () => {
    const upload = await service.createStagedUpload('image/png', 1234);
    const url = new URL(upload.uploadUrl);
    expect(upload.objectKey.startsWith(STAGED_UPLOAD_PREFIX)).toBe(true);
    expect(upload.uploadUrl.toLowerCase()).not.toContain('x-amz-checksum');
    expect(upload.uploadUrl.toLowerCase()).not.toContain('x-amz-sdk-checksum');
    // Only type and host are signed: a signed content-length made any PUT
    // whose length differed from the declared byteSize fail with 403
    // SignatureDoesNotMatch (Tigris). Size is checked on attach.
    expect(
      url.searchParams.get('X-Amz-SignedHeaders')?.split(';').sort(),
    ).toEqual(['content-type', 'host']);
    expect(upload.headers).toEqual({ 'Content-Type': 'image/png' });
  });

  describe('checkStaged (dry run)', () => {
    const key = `${STAGED_UPLOAD_PREFIX}0f8fad5b-d9cb-469f-a165-70867728950e`;
    const send = jest.fn();
    beforeEach(() => {
      send.mockReset();
      (service as unknown as { client: { send: jest.Mock } }).client.send =
        send;
    });

    it('accepts an upload that landed with an allowed type', async () => {
      send.mockResolvedValue({ ContentLength: 1234, ContentType: 'image/png' });
      await expect(service.checkStaged([key])).resolves.toEqual([]);
    });

    it('reports keys it never handed out, missing uploads, and wrong types', async () => {
      send.mockRejectedValueOnce(new Error('NotFound')).mockResolvedValueOnce({
        ContentLength: 10,
        ContentType: 'text/plain',
      });
      await expect(
        service.checkStaged(['staging/mcp/foo.jpg', key, key]),
      ).resolves.toEqual([
        {
          objectKey: 'staging/mcp/foo.jpg',
          error: 'invalid staged image reference',
        },
        { objectKey: key, error: 'staged image not found' },
        {
          objectKey: key,
          error: 'only JPEG, PNG, and WebP images are allowed',
        },
      ]);
    });
  });
});
