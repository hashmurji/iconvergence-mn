// api/valuations.js
import { pool } from "../lib/db.js";
import { requireAuth, resolveClientScope } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `SELECT * FROM valuations`;
    const params = [];
    if (scopedClientId) {
      query += ` WHERE client_id = $1`;
      params.push(scopedClientId);
    }

    const { rows } = await pool.query(query, params);

    const valuations = {};
    for (const r of rows) {
      valuations[r.client_id] = {
        totalValuationNotice: r.total_valuation_notice,
        totalBriteAssets: r.total_brite_assets,
        totalAssetValuation: r.total_asset_valuation,
        totalCashBalance: r.total_cash_balance,
        pensionValuation: r.pension_valuation,
        pensionCash: r.pension_cash_balance,
        pensionCashBalance: r.pension_cash_balance,
        directInvestmentCash: r.direct_investment_cash_balance,
        directInvestmentCashBalance: r.direct_investment_cash_balance,
        directInvestmentAssets: r.direct_investment_asset_valuation,
        directInvestmentAssetValuation: r.direct_investment_asset_valuation,
        totalLiabilities: r.total_liabilities,
        surrenderRebatePayable: r.surrender_rebate_payable,
        currency: r.currency,
        reportingCcy: r.currency,
      };
    }

    res.status(200).json({ valuations });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
