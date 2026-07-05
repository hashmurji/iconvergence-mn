// api/distributions.js
// Each distribution "batch" (name) can have multiple recipient payments.
// Grouped into { [clientId]: [ { name, date, payments: [...] } ] } to match
// the Distribution tab's dist.payments.map() usage in App.jsx.

const { pool } = require("../lib/db");
const { requireAuth, resolveClientScope } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `SELECT * FROM distributions`;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }
    query += ` ORDER BY client_id, distribution_name, date_of_payment`;

    const { rows } = await pool.query(query, params);

    // Group rows into per-client arrays of { name, date, payments: [] }
    const byClient = {};
    for (const r of rows) {
      if (!byClient[r.client_id]) byClient[r.client_id] = new Map();
      const batchKey = r.distribution_name; // one batch per distribution_name
      const clientMap = byClient[r.client_id];
      if (!clientMap.has(batchKey)) {
        clientMap.set(batchKey, {
          name: r.distribution_name,
          date: r.date_of_payment,
          currency: r.currency,
          payments: [],
        });
      }
      clientMap.get(batchKey).payments.push({
        accountNumber: r.financial_account_number,
        recipient: r.recipient_of_payment,
        date: r.date_of_payment,
        amount: r.amount_paid_by_the_receivers,
      });
    }

    const distributions = {};
    for (const [clientId, map] of Object.entries(byClient)) {
      distributions[clientId] = Array.from(map.values());
    }

    res.status(200).json({ distributions });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
