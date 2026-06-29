// api/clients.js - Fast endpoint returning only client list from Excel

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
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getAccessToken();

    // Fetch Excel file
    const fileRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${EXCEL_FILE}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fileRes.ok) throw new Error("File fetch failed: " + await fileRes.text());

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const XLSX = await import("xlsx");

    // Only read the Client Details sheet
    const workbook = XLSX.read(buffer, { type: "buffer", sheets: "Client Details" });
    const sheet = workbook.Sheets["Client Details"];
    if (!sheet) throw new Error("Client Details sheet not found");

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    const clients = rows.map(r => ({
      id: r["Client Number"] || "",
      clientId: r["client_id"] || "",
      accountNumber: r["Account Number"] || "",
      primaryCode: r["primaryclientcode"] || "",
      name: r["ClientName"] || "",
      reportingCcy: r["Reporting CCY"] || "USD",
      email: r["Email"] || "",
      address: r["ClientAddress"] || "",
      jurisdiction: r["Jurisdiction"] || "",
      verified: r["Verified"] === "Yes",
      bankAccount: String(r["Bank Account Number"] || ""),
      bankSort: r["Bank Sort Code"] || "",
      bankName: r["Bank Name"] || "",
    })).filter(c => c.id);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      clients,
      total: clients.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Clients API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
