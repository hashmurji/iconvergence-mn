import crypto from 'crypto';
import { pool } from '../../lib/db.js';
import { sendEmail } from '../../lib/email.js';
import { renderConfirmEmailTemplate } from '../../lib/email-templates.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_NUMBER_RE = /^C\d{8}$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes
const CONFIRM_BASE_URL = 'https://iconvergence-mn.vercel.app/confirm-email-change';

// NOTE: this endpoint is unauthenticated by design (that's the point — a
// client who's lost access to their inbox can't log in with Auth0 either).
// That means it's a public surface that accepts a client number + name +
// address, which is a small guessable-input space. Rate limiting at the
// edge (Vercel/Cloudflare) and/or a CAPTCHA (hCaptcha/Turnstile) on the
// identity path is strongly recommended before this goes live with real
// client data — see README-email-change.md.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { method, oldEmail, name, address, clientNumber, newEmail } = req.body || {};

  // --- Input validation (safe to be specific about these errors) ---
  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return res.status(400).json({ error: 'Please provide a valid new email address.' });
  }

  if (method === 'old_email') {
    if (!oldEmail || !EMAIL_RE.test(oldEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
  } else if (method === 'identity') {
    if (!name || !address || !clientNumber) {
      return res.status(400).json({ error: 'Please complete all fields.' });
    }
    if (!CLIENT_NUMBER_RE.test(String(clientNumber).toUpperCase())) {
      return res.status(400).json({ error: 'Client number should start with C followed by 8 digits.' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  // From here on, ALWAYS return the same generic response whether or not a
  // matching client is found. Differentiating the response (or its timing)
  // between "matched" and "no match" lets someone enumerate valid client
  // IDs/emails by trial and error, so don't add an else-branch below that
  // responds differently.
  const genericResponse = () =>
    res.status(200).json({
      message:
        "If the details you provided match our records, you'll receive an email with a link to confirm your new address.",
    });

  try {
    let client;

    if (method === 'old_email') {
      // Matches against either email column on file — a client may have
      // given us a personal address (email_address) or a work address
      // (work_email), and either should be accepted as "their old email".
      const { rows } = await pool.query(
        `SELECT client_id, client_name, email_address, work_email
         FROM clients
         WHERE lower(email_address) = lower($1) OR lower(work_email) = lower($1)
         LIMIT 1`,
        [oldEmail]
      );
      client = rows[0];
    } else {
      // client_id doubles as the "client number" (the C12345678-format
      // identifier used everywhere else in the schema as the join key).
      // client_address is a single free-text field, so an exact match
      // after stripping whitespace is fragile against real-world variation
      // (e.g. "Rd" vs "Road", flat number formatting, extra commas) —
      // worth revisiting if you see false negatives in practice.
      const { rows } = await pool.query(
        `SELECT client_id, client_name, email_address, work_email
         FROM clients
         WHERE client_id = $1
           AND lower(client_name) = lower($2)
           AND lower(regexp_replace(client_address, '\\s+', '', 'g')) = lower(regexp_replace($3, '\\s+', '', 'g'))
         LIMIT 1`,
        [clientNumber.toUpperCase(), name, address]
      );
      client = rows[0];
    }

    if (!client) {
      console.warn('[email-change] no matching client for request', { method });
      return genericResponse();
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await pool.query(
      `INSERT INTO email_change_requests (client_id, new_email, token_hash, expires_at, requested_via)
       VALUES ($1, $2, $3, $4, $5)`,
      [client.client_id, newEmail, tokenHash, expiresAt, method]
    );

    const confirmUrl = `${CONFIRM_BASE_URL}?token=${rawToken}`;

    await sendEmail({
      to: newEmail,
      subject: 'Confirm your new email address — Ubiquity',
      html: renderConfirmEmailTemplate({ clientName: client.client_name, confirmUrl }),
    });

    return genericResponse();
  } catch (err) {
    console.error('[email-change] initiate error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
