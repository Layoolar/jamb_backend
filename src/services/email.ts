/**
 * Transactional email via Resend (PLAN §12).
 *
 * Only password reset needs email, which is why signup and login shipped
 * without a domain, DNS records or a provider account.
 *
 * With RESEND_API_KEY unset the send is logged instead of delivered, so local
 * development and CI need no credentials and no outbound network.
 */

import { env, isProd } from '../env.js';

const ENDPOINT = 'https://api.resend.com/emails';

type Mail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.error(
        'RESEND_API_KEY or MAIL_FROM missing in production — password reset email NOT sent',
      );
      return false;
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n--- email (not sent, no RESEND_API_KEY) ---\nto: ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n---\n`,
    );
    return true;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`resend rejected the send: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('email send failed', err);
    return false;
  }
}

export function resetEmail(code: string): Pick<Mail, 'subject' | 'text'> {
  return {
    subject: 'Reset your SabiPass password',
    text:
      `Use this code to set a new password:\n\n    ${code}\n\n` +
      'It works once and expires in 30 minutes.\n\n' +
      "If you didn't ask for this, you can ignore this email — nothing has changed.",
  };
}
