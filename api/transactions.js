// api/transactions.js
// Flat array matching txns.length / txns.map() usage in App.jsx.
// A client-role user is always scoped to their own client_id; advisers can
// optionally filter with ?clientId=... or omit it to get everything.
// Given ~500k rows, this includes basic pagination — adjust limit/offset
// as needed once you see real usage patterns.

const { pool } = require("../lib/db");
const { requireAuth, resolveClientScope } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const offset = parseInt(req.query.offset, 10) || 0;

    let query = `SELECT * FROM transactions`;
    const params = [];
    if (scopedClientId) {
      params.push(scopedClientId);
      query += ` WHERE client_id = $${params.length}`;
    }
    query += ` ORDER BY trade_date DESC`;
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);

    const txns = rows.map((r) => ({
      txRef: r.tx_ref,
      clientId: r.client_id,
      primaryClientCode: r.primary_client_code,
      selector: r.selector,
      tradeDate: r.trade_date,
      settlementDate: r.settlement_date,
      financialAccountNumber: r.financial_account_number,
      financialAccountName: r.financial_account_name,
      txType: r.txtype,
      ticker: r.ticker,
      portfolioType: r.portfolio_type,
      description: r.description,
      currency: r.currency,
      quantity: r.quantity,
      consideration: r.consideration,
      tx10bps: r.tx10bps,
      commission: r.commission,
      clientNetAmount: r.client_net_amount,
      costPrice: r.cost_price,
      costValue: r.cost_value,
      postReference: r.post_reference,
    }));

    res.status(200).json({ txns });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
