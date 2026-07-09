// api/dashboardstats.js
// Returns aggregate stats for the dashboard:
// - Total AUM (sum of total_brite_assets per currency, FX to selected)
// - Total beneficiaries (count of client_ids in clients)
// - Active clients (count where status = active)
// - Cash balance (sum of total_cash_balance per currency)
// - Top trustees by AUM (from financial_accounts)

import { pool } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireAuth(req);

    // Run all queries in parallel
    const [
      aumResult,
      cashResult,
      beneficiariesResult,
      activeResult,
      trusteesResult,
      stockTypeResult,
    ] = await Promise.all([
      // Total AUM - sum of total_brite_assets grouped by currency
      pool.query(`
        SELECT currency, SUM(total_brite_assets) as total
        FROM valuations
        WHERE total_brite_assets IS NOT NULL
        GROUP BY currency
      `).catch(() => ({ rows: [] })),

      // Cash balance - sum of total_cash_balance grouped by currency
      pool.query(`
        SELECT currency, SUM(total_cash_balance) as total
        FROM valuations
        WHERE total_cash_balance IS NOT NULL
        GROUP BY currency
      `).catch(() => ({ rows: [] })),

      // Total beneficiaries - count of distinct client_ids in clients
      pool.query(`
        SELECT COUNT(DISTINCT client_id) as total FROM clients
      `),

      // Active clients - count where status = 'active' (case insensitive)
      pool.query(`
        SELECT COUNT(*) as total FROM clients
        WHERE LOWER(status) = 'active'
      `),

      // AUM by stock type from holdings
      pool.query(`
        SELECT 
          COALESCE(NULLIF(TRIM(stock_type), ''), 'Other') as stock_type,
          market_value_currency,
          SUM(market_value::numeric) as total_value
        FROM holdings
        WHERE market_value IS NOT NULL AND market_value != 0
        GROUP BY stock_type, market_value_currency
        ORDER BY total_value DESC
      `).catch(() => ({ rows: [] })),

      // Top trustees by AUM - group by trustee only, aggregate currencies
      pool.query(`
        SELECT 
          trustee,
          json_agg(json_build_object('currency', fa_currency, 'amount', total_aum)) as amounts,
          SUM(beneficiaries) as beneficiaries
        FROM (
          SELECT 
            trustee,
            fa_currency,
            SUM(total_value) as total_aum,
            COUNT(DISTINCT client_id) as beneficiaries
          FROM financial_accounts
          WHERE trustee IS NOT NULL AND trustee != ''
          GROUP BY trustee, fa_currency
        ) sub
        GROUP BY trustee
        ORDER BY SUM(total_aum) DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })),
    ]);

    // Build AUM by currency
    const aumByCurrency = {};
    for (const r of aumResult.rows) {
      aumByCurrency[r.currency || "USD"] = parseFloat(r.total) || 0;
    }

    // Build cash by currency
    const cashByCurrency = {};
    for (const r of cashResult.rows) {
      cashByCurrency[r.currency || "USD"] = parseFloat(r.total) || 0;
    }

    // Build trustee list
    const trustees = trusteesResult.rows.map(r => ({
      trustee: r.trustee,
      amounts: r.amounts || [],  // array of {currency, amount} for FX conversion
      beneficiaries: parseInt(r.beneficiaries) || 0,
    }));

    // Build AUM by stock type (aggregate currencies as array for FX on frontend)
    const stockTypeMap = {};
    for (const r of stockTypeResult.rows) {
      const type = r.stock_type;
      if (!stockTypeMap[type]) stockTypeMap[type] = [];
      stockTypeMap[type].push({ currency: r.market_value_currency || "USD", amount: parseFloat(r.total_value) || 0 });
    }
    const aumByStockType = Object.entries(stockTypeMap).map(([type, amounts]) => ({ type, amounts }));

    return res.status(200).json({
      aumByCurrency,
      cashByCurrency,
      totalBeneficiaries: parseInt(beneficiariesResult.rows[0]?.total) || 0,
      activeClients: parseInt(activeResult.rows[0]?.total) || 0,
      trustees,
      aumByStockType,
      lastUpdated: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
}
