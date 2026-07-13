// api/financialaccounts.js
import { pool } from "../lib/db.js";
import { requireAuth, resolveClientScope } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `
      SELECT id, client_id, financial_account_number, financial_account_name,
             trustee, fa_currency, funds_received, asset_valuation,
             cash_balance, remaining_surrender_rebate, total_value, created_at
      FROM financial_accounts
    `;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }
    query += ` ORDER BY client_id, financial_account_number`;

    const { rows } = await pool.query(query, params);

    const accounts = {};
    for (const r of rows) {
      if (!accounts[r.client_id]) accounts[r.client_id] = [];
      accounts[r.client_id].push({
        id: r.id,
        clientId: r.client_id,
        accountNumber: r.financial_account_number,
        accountName: r.financial_account_name,
        trustee: r.trustee,
        currency: r.fa_currency,
        fundsReceived: parseFloat(r.funds_received) || 0,
        assetValuation: parseFloat(r.asset_valuation) || 0,
        cashBalance: parseFloat(r.cash_balance) || 0,
        remainingSurrenderRebate: parseFloat(r.remaining_surrender_rebate) || 0,
        totalValue: parseFloat(r.total_value) || 0,
        createdAt: r.created_at,
      });
    }

    res.status(200).json({ accounts });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
