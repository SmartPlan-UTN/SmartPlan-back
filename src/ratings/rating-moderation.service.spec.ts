import { ConfigService } from '@nestjs/config';
import { RatingModerationStatus } from './entities/rating.entity';
import { RatingModerationService } from './rating-moderation.service';

describe('RatingModerationService', () => {
  let service: RatingModerationService;
  let generateContent: jest.Mock;

  beforeEach(() => {
    const configuration = {
      get: jest.fn((key: string) =>
        key === 'GEMINI_API_KEY' ? 'test-key' : 'gemini-test-model',
      ),
    } as unknown as ConfigService;
    service = new RatingModerationService(configuration);
    generateContent = jest.fn();
    Object.assign(service as unknown as { client: unknown }, {
      client: { models: { generateContent } },
    });
    Object.assign(service as unknown as { spanishWords: unknown }, {
      spanishWords: Promise.resolve(new Set<string>()),
    });
  });

  it('approves a rating without a comment (CU44)', async () => {
    await expect(service.moderate(null)).resolves.toEqual({
      status: RatingModerationStatus.Approved,
      reason: null,
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('leaves a comment pending when Gemini flags it (CU44)', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ approved: false, reason: 'harassment' }),
    });

    await expect(service.moderate('El servicio fue pésimo.')).resolves.toEqual({
      status: RatingModerationStatus.Pending,
      reason: 'The comment requires review because it may contain harassment.',
    });
  });

  it('fails closed when Gemini is unavailable (CU44)', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.moderate('Lugar excelente y tranquilo.'),
    ).resolves.toEqual({
      status: RatingModerationStatus.Pending,
      reason:
        'The comment requires manual review because automatic moderation is unavailable.',
    });
  });
});
