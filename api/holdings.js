// api/holdings.js
import { pool } from "../lib/db.js";
import { requireAuth, resolveClientScope } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `SELECT * FROM holdings`;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }
    query += ` ORDER BY client_id, holding_name`;

    const { rows } = await pool.query(query, params);

    const holdings = {};
    for (const r of rows) {
      if (!holdings[r.client_id]) holdings[r.client_id] = [];
      holdings[r.client_id].push({
        name: r.holding_name,
        purchasePriceCurrency: r.purchase_price_currency,
        purchasePrice: r.purchase_price,
        marketValueCurrency: r.market_value_currency,
        marketValue: r.market_value,
        gainLossCurrency: r.gain_loss_currency,
        gainLoss: r.gain_loss,
        percentChange: r.percent_change,
        financialAccountName: r.financial_account_name,
        financialAccountNumber: r.financial_account_number,
        shares: r.shares,
      });
    }

    res.status(200).json({ holdings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
