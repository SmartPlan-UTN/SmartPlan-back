/**
 * Content of the reminder emails (#127). User-visible copy is Spanish, like
 * the rest of the product; every interpolated value is escaped because plan
 * titles and names are user input.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function inactivityReminderEmail(input: {
  name: string;
  link: string;
}): RenderedEmail {
  const subject = 'Hace mucho que no armás un plan';
  const intro = `Hola ${input.name}, hace un tiempo que no armás un plan en SmartPlan.`;
  const body =
    'Contanos cuánto tiempo y presupuesto tenés y te proponemos una salida a tu medida.';

  return {
    subject,
    text: [intro, body, `Armá tu próximo plan: ${input.link}`].join('\n\n'),
    html: layout({
      eyebrow: 'Tu próxima salida',
      title: subject,
      paragraphs: [intro, body],
      action: { label: 'Armar un plan', link: input.link },
    }),
  };
}

export function feedbackReminderEmail(input: {
  name: string;
  planTitle: string;
  link: string;
}): RenderedEmail {
  const subject = 'Recordá completar la retroalimentación de tu salida';
  const intro = `Hola ${input.name}, ¿cómo te fue en "${input.planTitle}"?`;
  const body =
    'Contanos qué tal estuvo: tu opinión mejora tus próximas recomendaciones.';

  return {
    subject,
    text: [intro, body, `Completá la retroalimentación: ${input.link}`].join(
      '\n\n',
    ),
    html: layout({
      eyebrow: 'Tu opinión cuenta',
      title: '¿Cómo te fue?',
      paragraphs: [intro, body],
      action: { label: 'Completar retroalimentación', link: input.link },
    }),
  };
}

function layout(content: {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  action: { label: string; link: string };
}): string {
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#5C5448;">${escapeHtml(paragraph)}</p>`,
    )
    .join('\n                ');
  const link = escapeHtml(content.action.link);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;color:#1A1109;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F0E8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#FFFCF8;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#1A1109;border-bottom:6px solid #E85D20;padding:30px 40px;">
                <img src="cid:smartplan-logo" alt="SmartPlan" width="174" style="display:block;width:174px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 32px;">
                <p style="margin:0 0 16px;color:#E85D20;font-size:14px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(content.eyebrow)}</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#1A1109;">${escapeHtml(content.title)}</h1>
                ${paragraphs}
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px;">
                  <tr>
                    <td align="center" bgcolor="#E85D20" style="border-radius:10px;">
                      <a href="${link}" style="display:inline-block;padding:15px 24px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${escapeHtml(content.action.label)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
