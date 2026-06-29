// api/valuations.js - Fast endpoint returning only valuations from Excel

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_ID = "recit365-my.sharepoint.com,fecf4208-aba4-4152-8740-f4b93c99d92b,c2c93cb5-c5e7-4453-b8de-6a8d56b63267";
const DRIVE_ID = "b!CELP_qSrUkGHQPS5PJnZK7U8ycLnxVNEuN5qjVa2MmcYWMolKah8T6PSxMz8xJJF";
const FOLDER_PATH = "iconvergence-mn";
const EXCEL_FILE = "clients_holdings_valuations_loans_withdrawals.xlsx";

async function getAccessToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token failed");
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getAccessToken();

    const fileRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${EXCEL_FILE}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fileRes.ok) throw new Error("File fetch failed");

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const XLSX = await import("xlsx");

    // Only read Valuations sheet
    const workbook = XLSX.read(buffer, { type: "buffer", sheets: "Valuations" });
    const sheet = workbook.Sheets["Valuations"];
    if (!sheet) throw new Error("Valuations sheet not found");

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    const valuations = {};
    for (const r of rows) {
      const id = r["Client Number"];
      if (!id) continue;
      valuations[id] = {
        totalValuationNotice: parseFloat(r["Total Valuation Notice"]) || 0,
        totalBriteAssets: parseFloat(r["Total Brite Assets"]) || 0,
        totalAssetValuation: parseFloat(r["Total Asset Valuation"]) || 0,
        totalCashBalance: parseFloat(r["Total Cash Balance"]) || 0,
        pensionValuation: parseFloat(r["Pension Valuation"]) || 0,
        pensionCash: parseFloat(r["Pension Cash Balance"]) || 0,
        directInvestmentCash: parseFloat(r["Direct Investment Cash Balance"]) || 0,
        directInvestmentAssets: parseFloat(r["Firect Investment Asset Valuation"]) || 0,
        totalLiabilities: parseFloat(r["Total Liabilities"]) || 0,
        surrenderRebatePayable: parseFloat(r["Surrender Rebate Payable"]) || 0,
      };
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ valuations, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error("Valuations API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
