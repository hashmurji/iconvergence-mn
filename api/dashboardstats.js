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

      // AUM by stock type from holdings with safe cast
      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(CAST(stock_type AS TEXT)), ''), 'Other') as stock_type,
          COALESCE(NULLIF(TRIM(CAST(market_value_currency AS TEXT)), ''), 'USD') as market_value_currency,
          SUM(CASE WHEN market_value::text ~ '^[0-9.]+$' THEN market_value::text::numeric ELSE 0 END) as total_value
        FROM holdings
        WHERE market_value IS NOT NULL
        GROUP BY stock_type, market_value_currency
        ORDER BY total_value DESC
      `).catch(() => ({ rows: [] })),

      // Top trustees - explicit numeric cast
      pool.query(`
        SELECT trustee, fa_currency, 
               SUM(CASE WHEN total_value ~ '^[0-9.]+$' THEN total_value::numeric ELSE 0 END) as total_aum, 
               COUNT(DISTINCT client_id) as beneficiaries
        FROM financial_accounts
        WHERE trustee IS NOT NULL AND trustee != ''
        GROUP BY trustee, fa_currency
        ORDER BY total_aum DESC
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
    // Aggregate trustees across currencies
    const trusteeMap = {};
    for (const r of trusteesResult.rows) {
      if (!trusteeMap[r.trustee]) {
        trusteeMap[r.trustee] = { trustee: r.trustee, amounts: [], beneficiaries: 0 };
      }
      trusteeMap[r.trustee].amounts.push({ currency: r.fa_currency || "USD", amount: parseFloat(r.total_aum) || 0 });
      trusteeMap[r.trustee].beneficiaries = Math.max(trusteeMap[r.trustee].beneficiaries, parseInt(r.beneficiaries) || 0);
    }
    const trustees = Object.values(trusteeMap)
      .sort((a,b) => b.amounts.reduce((s,x)=>s+x.amount,0) - a.amounts.reduce((s,x)=>s+x.amount,0))
      .slice(0, 10);

    // Build AUM by stock type
    const stockTypeMap = {};
    for (const r of stockTypeResult.rows) {
      const type = r.stock_type || "Other";
      if (!stockTypeMap[type]) stockTypeMap[type] = [];
      stockTypeMap[type].push({ currency: r.market_value_currency || "USD", amount: parseFloat(r.total_value) || 0 });
    }
    const aumByStockType = Object.entries(stockTypeMap)
      .map(([type, amounts]) => ({ type, amounts }))
      .sort((a,b) => b.amounts.reduce((s,x)=>s+x.amount,0) - a.amounts.reduce((s,x)=>s+x.amount,0));

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
