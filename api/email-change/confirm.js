import crypto from 'crypto';
import { pool } from '../../lib/db.js';
import { sendEmail } from '../../lib/email.js';
import { renderEmailChangedNoticeTemplate } from '../../lib/email-templates.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'This link is missing some information. Please use the link from your email.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT ecr.id, ecr.client_id, ecr.new_email, ecr.expires_at, ecr.used_at,
              c.email_address AS old_email_address, c.work_email AS old_work_email, c.client_name
       FROM email_change_requests ecr
       JOIN clients c ON c.client_id = ecr.client_id
       WHERE ecr.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    const request = rows[0];

    if (!request || request.used_at || new Date(request.expires_at) < new Date()) {
      return res.status(400).json({
        error: 'This link is invalid or has expired. Please start the process again.',
      });
    }

    await client.query('BEGIN');
    // Updates email_address — the primary client-facing address. work_email
    // is left untouched; adjust here if you'd rather this flow update both,
    // or update work_email instead depending on which one drives Auth0/login.
    await client.query(`UPDATE clients SET email_address = $1 WHERE client_id = $2`, [request.new_email, request.client_id]);
    await client.query(`UPDATE email_change_requests SET used_at = now() WHERE id = $1`, [request.id]);
    await client.query('COMMIT');

    // Fraud/safety net: let every OLD address on file know the account email
    // changed, in case the request wasn't actually made by the account owner.
    const oldAddresses = [request.old_email_address, request.old_work_email]
      .filter(Boolean)
      .filter((addr, i, arr) => arr.findIndex((a) => a.toLowerCase() === addr.toLowerCase()) === i);

    oldAddresses.forEach((addr) => {
      sendEmail({
        to: addr,
        subject: 'Your Ubiquity account email was changed',
        html: renderEmailChangedNoticeTemplate({
          clientName: request.client_name,
          newEmail: request.new_email,
        }),
      }).catch((e) => console.error('[email-change] old-email notice failed:', e));
    });

    return res.status(200).json({
      message: 'Your email address has been updated.',
      newEmail: request.new_email,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[email-change] confirm error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  } finally {
    client.release();
  }
}
