import {
  feedbackReminderEmail,
  inactivityReminderEmail,
} from './reminder-email-templates';

describe('reminder email templates (#127)', () => {
  it('invites an inactive person to create a plan', () => {
    const email = inactivityReminderEmail({
      name: 'Ana',
      link: 'https://app.smartplan.test/plans/create',
    });

    expect(email.subject).toBe('Hace mucho que no armás un plan');
    expect(email.text).toContain('https://app.smartplan.test/plans/create');
    expect(email.html).toContain(
      'href="https://app.smartplan.test/plans/create"',
    );
    expect(email.html).toContain('cid:smartplan-logo');
  });

  it('asks for the feedback of the named outing', () => {
    const email = feedbackReminderEmail({
      name: 'Ana',
      planTitle: 'Bodegas en Luján',
      link: 'https://app.smartplan.test/outings/42',
    });

    expect(email.subject).toBe(
      'Recordá completar la retroalimentación de tu salida',
    );
    expect(email.text).toContain('Bodegas en Luján');
    expect(email.html).toContain(
      'href="https://app.smartplan.test/outings/42"',
    );
  });

  it('escapes user-provided text in the HTML', () => {
    const email = feedbackReminderEmail({
      name: '<b>Ana</b>',
      planTitle: '<script>alert(1)</script>',
      link: 'https://app.smartplan.test/outings/1',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});
