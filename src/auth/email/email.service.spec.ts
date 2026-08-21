import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const configuration = {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === 'RESEND_API_KEY' ? 're_unit_test' : 'not-reply@smartplan.test',
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  function serviceWith(send: jest.Mock): EmailService {
    const service = new EmailService(configuration);
    Object.defineProperty(service, 'client', {
      value: { emails: { send: send } },
    });
    return service;
  }

  it('sends the link with sender configured', async () => {
    const send = jest.fn().mockResolvedValue({
      data: { id: 'emailService-1' },
      error: null,
    });
    const service = serviceWith(send);

    await service.sendPasswordRecovery(
      'ana@example.com',
      'https://app.smartplan.test/reset-password?token=opaque',
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'not-reply@smartplan.test',
        to: 'ana@example.com',
        subject: expect.any(String) as string,
      }),
    );
  });

  it.each([
    [
      'returned error',
      jest.fn().mockResolvedValue({ error: { message: 'x' } }),
    ],
    ['thrown error', jest.fn().mockRejectedValue(new Error('network outage'))],
  ])('normalizes a %s without exposing details', async (_caseName, send) => {
    const service = serviceWith(send);

    await expect(
      service.sendPasswordRecovery(
        'ana@example.com',
        'https://app.smartplan.test/reset-password?token=opaque',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_SERVICE_UNAVAILABLE',
        message: 'The password recovery email could not be sent',
      },
      status: 503,
    });
  });
});
