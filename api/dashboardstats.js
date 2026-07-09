// api/dashboardstats.js
import { pool } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireAuth(req);

    const [aumResult, cashResult, beneficiariesResult, activeResult, trusteesResult, stockTypeResult] = await Promise.all([

      // Total AUM - total_brite_assets cast from text
      pool.query(`
        SELECT currency,
               SUM(total_brite_assets::text::numeric) as total
        FROM valuations
        WHERE total_brite_assets IS NOT NULL AND total_brite_assets::text != ''
        GROUP BY currency
      `).catch(e => { console.error('aum:', e.message); return { rows: [] }; }),

      // Cash balance - cast from text
      pool.query(`
        SELECT currency,
               SUM(total_cash_balance::text::numeric) as total
        FROM valuations
        WHERE total_cash_balance IS NOT NULL AND total_cash_balance::text != ''
        GROUP BY currency
      `).catch(e => { console.error('cash:', e.message); return { rows: [] }; }),

      // Total beneficiaries
      pool.query(`SELECT COUNT(DISTINCT client_id) as total FROM clients`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Active clients
      pool.query(`SELECT COUNT(*) as total FROM clients WHERE LOWER(status::text) = 'active'`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Top trustees - cast total_value from text
      pool.query(`
        SELECT trustee::text as trustee,
               fa_currency::text as fa_currency,
               SUM(total_value::text::numeric) as total_aum,
               COUNT(DISTINCT client_id::text) as beneficiaries
        FROM financial_accounts
        WHERE trustee IS NOT NULL
          AND trustee::text != ''
          AND total_value IS NOT NULL
          AND total_value::text != ''
        GROUP BY trustee, fa_currency
        ORDER BY total_aum DESC NULLS LAST
      `).catch(e => { console.error('trustees:', e.message); return { rows: [] }; }),

      // AUM by stock type - cast market_value from text
      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(stock_type::text), ''), 'Other') as stock_type,
          COALESCE(NULLIF(TRIM(market_value_currency::text), ''), 'USD') as market_value_currency,
          SUM(market_value::text::numeric) as total_value
        FROM holdings
        WHERE market_value IS NOT NULL
          AND market_value::text != ''
          AND market_value::text != '0'
        GROUP BY stock_type, market_value_currency
        ORDER BY total_value DESC NULLS LAST
      `).catch(e => { console.error('stocktype:', e.message); return { rows: [] }; }),
    ]);

    // AUM by currency
    const aumByCurrency = {};
    for (const r of aumResult.rows) {
      aumByCurrency[r.currency || "USD"] = parseFloat(r.total) || 0;
    }

    // Cash by currency
    const cashByCurrency = {};
    for (const r of cashResult.rows) {
      cashByCurrency[r.currency || "USD"] = parseFloat(r.total) || 0;
    }

    // Aggregate trustees by name (combine currencies)
    const trusteeMap = {};
    for (const r of trusteesResult.rows) {
      const name = r.trustee;
      if (!trusteeMap[name]) trusteeMap[name] = { trustee: name, amounts: [], beneficiaries: 0 };
      trusteeMap[name].amounts.push({ currency: r.fa_currency || "USD", amount: parseFloat(r.total_aum) || 0 });
      trusteeMap[name].beneficiaries = Math.max(trusteeMap[name].beneficiaries, parseInt(r.beneficiaries) || 0);
    }
    const trustees = Object.values(trusteeMap)
      .filter(t => t.trustee)
      .sort((a, b) => b.amounts.reduce((s, x) => s + x.amount, 0) - a.amounts.reduce((s, x) => s + x.amount, 0))
      .slice(0, 10);

    // AUM by stock type
    const stockTypeMap = {};
    for (const r of stockTypeResult.rows) {
      const type = r.stock_type || "Other";
      if (!stockTypeMap[type]) stockTypeMap[type] = [];
      stockTypeMap[type].push({ currency: r.market_value_currency || "USD", amount: parseFloat(r.total_value) || 0 });
    }
    const aumByStockType = Object.entries(stockTypeMap)
      .map(([type, amounts]) => ({ type, amounts }))
      .sort((a, b) => b.amounts.reduce((s, x) => s + x.amount, 0) - a.amounts.reduce((s, x) => s + x.amount, 0));

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
