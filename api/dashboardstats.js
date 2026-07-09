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
    ] = await Promise.all([
      // Total AUM - sum of total_brite_assets grouped by currency
      pool.query(`
        SELECT currency, SUM(total_brite_assets) as total
        FROM valuations
        WHERE total_brite_assets IS NOT NULL
        GROUP BY currency
      `),

      // Cash balance - sum of total_cash_balance grouped by currency
      pool.query(`
        SELECT currency, SUM(total_cash_balance) as total
        FROM valuations
        WHERE total_cash_balance IS NOT NULL
        GROUP BY currency
      `),

      // Total beneficiaries - count of distinct client_ids in clients
      pool.query(`
        SELECT COUNT(DISTINCT client_id) as total FROM clients
      `),

      // Active clients - count where status = 'active' (case insensitive)
      pool.query(`
        SELECT COUNT(*) as total FROM clients
        WHERE LOWER(status) = 'active'
      `),

      // Top trustees by AUM - sum of total_value grouped by trustee, with beneficiary count
      pool.query(`
        SELECT 
          trustee,
          fa_currency,
          SUM(total_value) as total_aum,
          COUNT(DISTINCT client_id) as beneficiaries
        FROM financial_accounts
        WHERE trustee IS NOT NULL AND trustee != ''
        GROUP BY trustee, fa_currency
        ORDER BY total_aum DESC
        LIMIT 10
      `),
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
      currency: r.fa_currency || "USD",
      totalAum: parseFloat(r.total_aum) || 0,
      beneficiaries: parseInt(r.beneficiaries) || 0,
    }));

    return res.status(200).json({
      aumByCurrency,
      cashByCurrency,
      totalBeneficiaries: parseInt(beneficiariesResult.rows[0]?.total) || 0,
      activeClients: parseInt(activeResult.rows[0]?.total) || 0,
      trustees,
      lastUpdated: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
}
