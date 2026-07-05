// api/withdrawals.js
import { pool } from "../lib/db.js";
import { requireAuth, resolveClientScope } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `SELECT * FROM withdrawals`;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }
    query += ` ORDER BY client_id, date_requested DESC`;

    const { rows } = await pool.query(query, params);

    const withdrawals = {};
    for (const r of rows) {
      if (!withdrawals[r.client_id]) withdrawals[r.client_id] = [];
      withdrawals[r.client_id].push({
        dateRequested: r.date_requested,
        type: r.withdrawal_type,
        currency: r.currency,
        requestedAmount: r.requested_amount,
        actualPaid: r.actual_paid_amount,
        paymentDate: r.payment_date,
      });
    }

    res.status(200).json({ withdrawals });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
