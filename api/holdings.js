// api/holdings.js
// Multiple holdings per client — returned as a map of client_id -> array,
// matching the shape App.jsx expects (holdings[clientId]).

const { pool } = require("../lib/db");
const { requireAuth, resolveClientScope } = require("../lib/auth");

module.exports = async (req, res) => {
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
};
