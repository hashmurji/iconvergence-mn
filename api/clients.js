// api/clients.js
// IMPORTANT: bank_account_number, bank_sort_code, bank_name are deliberately
// excluded from this SELECT — they are never returned to the frontend.

import { pool } from "../lib/db.js";
import { requireAuth, resolveClientScope } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `
      SELECT client_id, client_name, reporting_currency, jurisdiction,
             verified, date_of_birth, email_address, client_address
      FROM clients
    `;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }
    query += ` ORDER BY client_name`;

    const { rows } = await pool.query(query, params);

    const clients = rows.map((r) => ({
      id: r.client_id,
      name: r.client_name,
      currency: r.reporting_currency,
      jurisdiction: r.jurisdiction,
      verified: r.verified,
      dateOfBirth: r.date_of_birth,
      email: r.email_address,
      address: r.client_address,
    }));

    res.status(200).json({ clients, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
