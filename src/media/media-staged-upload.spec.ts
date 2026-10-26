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

  it('signs a PUT URL without an SDK checksum (MCP image upload)', async () => {
    const upload = await service.createStagedUpload('image/png', 1234);
    const url = new URL(upload.uploadUrl);
    expect(upload.objectKey.startsWith(STAGED_UPLOAD_PREFIX)).toBe(true);
    expect(upload.uploadUrl.toLowerCase()).not.toContain('x-amz-checksum');
    expect(upload.uploadUrl.toLowerCase()).not.toContain('x-amz-sdk-checksum');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;host',
    );
    expect(upload.headers).toEqual({ 'Content-Type': 'image/png' });
  });
});
