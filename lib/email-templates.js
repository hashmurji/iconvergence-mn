const WRAPPER_STYLE = `
  font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  background: #EFF7FB;
  padding: 40px 20px;
`;

const CARD_STYLE = `
  max-width: 480px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 16px;
  padding: 40px;
`;

const BUTTON_STYLE = `
  display: inline-block;
  background: #1D7DFF;
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
  padding: 13px 24px;
  border-radius: 8px;
  margin-top: 8px;
`;

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderConfirmEmailTemplate({ clientName, confirmUrl }) {
  const name = escapeHtml(clientName || 'there');
  return `
  <div style="${WRAPPER_STYLE}">
    <div style="${CARD_STYLE}">
      <p style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#10C6C1;margin:0 0 8px;">Ubiquity</p>
      <h1 style="font-size:20px;color:#061B33;margin:0 0 16px;">Confirm your new email address</h1>
      <p style="font-size:15px;line-height:1.55;color:#5B6B84;margin:0 0 8px;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.55;color:#5B6B84;margin:0 0 24px;">
        We received a request to update the email address on your Ubiquity account.
        Click below to confirm this new address. This link expires in 60 minutes.
      </p>
      <a href="${confirmUrl}" style="${BUTTON_STYLE}">Confirm new email address</a>
      <p style="font-size:13px;line-height:1.5;color:#5B6B84;margin:28px 0 0;">
        If you didn't request this change, you can safely ignore this email —
        your account won't be affected unless this link is used.
      </p>
    </div>
  </div>`;
}

export function renderEmailChangedNoticeTemplate({ clientName, newEmail }) {
  const name = escapeHtml(clientName || 'there');
  const safeEmail = escapeHtml(newEmail || '');
  return `
  <div style="${WRAPPER_STYLE}">
    <div style="${CARD_STYLE}">
      <p style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#10C6C1;margin:0 0 8px;">Ubiquity</p>
      <h1 style="font-size:20px;color:#061B33;margin:0 0 16px;">Your account email address was changed</h1>
      <p style="font-size:15px;line-height:1.55;color:#5B6B84;margin:0 0 8px;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.55;color:#5B6B84;margin:0 0 24px;">
        This is a confirmation that the email address on your Ubiquity account
        has been changed to <strong>${safeEmail}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.55;color:#5B6B84;margin:0;">
        If you didn't make this change, please contact your adviser immediately.
      </p>
    </div>
  </div>`;
}
