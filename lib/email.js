// Thin sendEmail() abstraction so the rest of the code doesn't care which
// provider is behind it. Example below uses AWS SES since you're already
// AWS-native (RDS, S3+KMS) — swap for SendGrid/Postmark/etc. if you'd
// rather not add SES setup (verified domain/sending identity, IAM perms).
//
// npm install @aws-sdk/client-ses

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION || 'eu-west-2' });

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;

export async function sendEmail({ to, subject, html }) {
  // Dev/test fallback: until EMAIL_FROM_ADDRESS is set (i.e. SES isn't
  // configured yet), log the email instead of sending it. Check your
  // Vercel function logs for the confirm link to test the flow end to end
  // before wiring up real sending.
  if (!FROM_ADDRESS) {
    console.log('[email:dev-mode] would send email', { to, subject });
    console.log('[email:dev-mode] html body:\n' + html);
    return { devMode: true };
  }

  const command = new SendEmailCommand({
    Source: FROM_ADDRESS,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });

  return ses.send(command);
}
