import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailTransport,
  EnvironmentVariables,
} from '../../config/environment-variables';
import {
  EmailDeliveryError,
  EmailService,
  isRetryableProviderError,
} from './email.service';

describe('EmailService', () => {
  const LINK = 'https://app.smartplan.test/reset-password?token=opaque';

  function configurationFor(
    transport: EmailTransport,
    key: string | undefined = 're_unit_test',
  ): ConfigService<EnvironmentVariables, true> {
    return {
      get: jest.fn((name: keyof EnvironmentVariables) => {
        if (name === 'EMAIL_TRANSPORT') return transport;
        if (name === 'RESEND_API_KEY') return key;
        return 'not-reply@smartplan.test';
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;
  }

  function serviceWith(send: jest.Mock): EmailService {
    const service = new EmailService(configurationFor(EmailTransport.Resend));
    Object.defineProperty(service, 'client', {
      value: { emails: { send: send } },
    });
    return service;
  }

  beforeEach(() => {
    // Silenced by default so a suite that only asserts the thrown error
    // does not print the service's own diagnostics; the tests that check
    // the logging re-spy with their own assertions.
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the link with sender configured', async () => {
    const send = jest.fn().mockResolvedValue({
      data: { id: 'emailService-1' },
      error: null,
    });
    const service = serviceWith(send);

    await service.sendPasswordRecovery('ana@example.com', LINK);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'not-reply@smartplan.test',
        to: 'ana@example.com',
        subject: 'Restablecé tu contraseña de SmartPlan',
        html: expect.stringContaining('src="cid:smartplan-logo"') as string,
        attachments: [
          expect.objectContaining({
            contentId: 'smartplan-logo',
            contentType: 'image/png',
            filename: 'smartplan-logo.png',
          }) as object,
        ],
      }),
    );

    const sentEmails = send.mock.calls as unknown as Array<[{ html: string }]>;
    const email = sentEmails[0]?.[0] ?? { html: '' };
    expect(email?.html).toContain('#E85D20');
    expect(email.html).not.toContain('¿El botón no funciona?');
  });

  it.each([
    [
      'returned error',
      jest.fn().mockResolvedValue({
        error: { name: 'validation_error', message: 'x' },
      }),
    ],
    ['thrown error', jest.fn().mockRejectedValue(new Error('network outage'))],
  ])('normalizes a %s without exposing details', async (_caseName, send) => {
    const service = serviceWith(send);

    await expect(
      service.sendPasswordRecovery('ana@example.com', LINK),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_SERVICE_UNAVAILABLE',
        message: 'The password recovery email could not be sent',
      },
      status: 503,
    });
  });

  /**
   * The client is told nothing, but an operator has to be able to tell a
   * misconfigured key from a provider outage. Discarding the reason on
   * both paths is what made a placeholder API key look like a transient
   * failure, with an empty log to go on.
   */
  describe('records why a send failed', () => {
    it('logs the reason the provider gave', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const service = serviceWith(
        jest.fn().mockResolvedValue({
          error: { name: 'validation_error', message: 'domain not verified' },
        }),
      );

      await expect(
        service.sendPasswordRecovery('ana@example.com', LINK),
      ).rejects.toThrow();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('domain not verified'),
      );
    });

    it('logs an unreachable provider', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const service = serviceWith(
        jest.fn().mockRejectedValue(new Error('network outage')),
      );

      await expect(
        service.sendPasswordRecovery('ana@example.com', LINK),
      ).rejects.toThrow();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('network outage'),
      );
    });
  });

  /**
   * The transport that makes CU3 reachable on a machine with no provider
   * account: the link goes to the log, and nothing is sent.
   */
  describe('log transport', () => {
    it('writes the recovery link instead of sending it', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const service = new EmailService(
        configurationFor(EmailTransport.Log, undefined),
      );

      await expect(
        service.sendPasswordRecovery('ana@example.com', LINK),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(LINK));
    });

    it('never builds a provider client', () => {
      const service = new EmailService(
        configurationFor(EmailTransport.Log, undefined),
      );

      expect((service as unknown as { client: unknown }).client).toBeNull();
    });
  });

  describe('send (reminder emails, #127)', () => {
    const MESSAGE = {
      to: 'ana@example.com',
      subject: 'Hace mucho que no armás un plan',
      text: 'texto',
      html: '<p>html</p>',
      idempotencyKey: 'smartplan-reminder-inactivity:7:1700000000',
      logSummary: 'resumen',
    };

    it('returns the provider message id and sends the idempotency key', async () => {
      const send = jest.fn().mockResolvedValue({
        data: { id: 'msg-123' },
        error: null,
      });

      await expect(serviceWith(send).send(MESSAGE)).resolves.toEqual({
        transport: EmailTransport.Resend,
        providerMessageId: 'msg-123',
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: MESSAGE.to,
          subject: MESSAGE.subject,
          from: 'not-reply@smartplan.test',
        }),
        { idempotencyKey: MESSAGE.idempotencyKey },
      );
    });

    it.each([
      ['rate_limit_exceeded', 429, true],
      ['internal_server_error', 500, true],
      ['validation_error', 422, false],
      ['invalid_from_address', 403, false],
    ])(
      'classifies a %s answer (retryable: %s)',
      async (name, statusCode, retryable) => {
        const send = jest.fn().mockResolvedValue({
          data: null,
          error: { name, statusCode, message: 'provider said no' },
        });

        await expect(serviceWith(send).send(MESSAGE)).rejects.toMatchObject({
          name: 'EmailDeliveryError',
          retryable,
          message: `${name}: provider said no`,
        });
      },
    );

    it('treats an unreachable provider as retryable', async () => {
      const send = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

      await expect(serviceWith(send).send(MESSAGE)).rejects.toEqual(
        new EmailDeliveryError('network: ECONNRESET', true),
      );
    });

    it('only logs under the log transport and says nothing was sent', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const service = new EmailService(
        configurationFor(EmailTransport.Log, undefined),
      );

      await expect(service.send(MESSAGE)).resolves.toEqual({
        transport: EmailTransport.Log,
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('resumen'));
    });
  });

  describe('isRetryableProviderError', () => {
    it('retries an answer without status (network) or any 5xx', () => {
      expect(
        isRetryableProviderError({
          name: 'invalid_parameter',
          statusCode: null,
        }),
      ).toBe(true);
      expect(
        isRetryableProviderError({
          name: 'invalid_parameter',
          statusCode: 503,
        }),
      ).toBe(true);
      expect(
        isRetryableProviderError({ name: 'invalid_api_key', statusCode: 403 }),
      ).toBe(false);
    });
  });
});
