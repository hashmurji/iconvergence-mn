// api/clientdetail.js - Fast endpoint for a single client's full data

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_ID = "recit365-my.sharepoint.com,fecf4208-aba4-4152-8740-f4b93c99d92b,c2c93cb5-c5e7-4453-b8de-6a8d56b63267";
const DRIVE_ID = "b!CELP_qSrUkGHQPS5PJnZK7U8ycLnxVNEuN5qjVa2MmcYWMolKah8T6PSxMz8xJJF";
const FOLDER_PATH = "iconvergence-mn";
const EXCEL_FILE = "clients_holdings_valuations_loans_withdrawals.xlsx";
const CSV_FILE = "txns.csv";

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

function parseCSVForClient(text, clientId) {
  const lines = text.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1)
    .map((line, i) => {
      const values = [];
      let current = "", inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
        else { current += char; }
      }
      values.push(current.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
      return row;
    })
    .filter(r => r["Client Number"] === clientId)
    .map((row, i) => ({
      id: i, selector: row["selector"] || "", tradedate: row["tradedate"] || "",
      settdate: row["settdate"] || "", clientId: row["Client Number"] || "",
      accountId: row["Account Number"] || "", clientName: row["ClientName"] || "",
      txtype: row["txtype"] || "", ticker: row["ticker"] || "",
      description: row["description"] || "", ccy: row["ccy"] || "",
      qty: parseFloat(row["qty"]) || 0, consideration: parseFloat(row["consideration"]) || 0,
      clientnetamt: parseFloat(row["clientnetamt"]) || 0,
      costprice: parseFloat(row["costprice"]) || 0, costvalue: parseFloat(row["costvalue"]) || 0,
    }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = req.query && req.query.clientId;
  if (!clientId) return res.status(400).json({ error: "clientId required" });

  try {
    const token = await getAccessToken();

    // Fetch Excel and CSV in parallel
    const [excelRes, csvRes] = await Promise.all([
      fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${EXCEL_FILE}:/content`,
        { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${CSV_FILE}:/content`,
        { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const [excelBuffer, csvText] = await Promise.all([
      excelRes.arrayBuffer().then(b => Buffer.from(b)),
      csvRes.text(),
    ]);

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(excelBuffer, { type: "buffer", cellDates: true });

    const getSheet = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name] || {}, { defval: null });

    // Build filtered data for this client only
    const valuationsAll = getSheet("Valuations");
    const valRow = valuationsAll.find(r => r["Client Number"] === clientId);
    const valuations = valRow ? {
      [clientId]: {
        reportingCcy: valRow["Reporting CCY"] || valRow["reporting ccy"] || "USD",
        totalValuationNotice: parseFloat(valRow["Total Valuation Notice"]) || 0,
        totalBriteAssets: parseFloat(valRow["Total Brite Assets"]) || 0,
        totalAssetValuation: parseFloat(valRow["Total Asset Valuation"]) || 0,
        totalCashBalance: parseFloat(valRow["Total Cash Balance"]) || 0,
        pensionValuation: parseFloat(valRow["Pension Valuation"]) || 0,
        pensionCash: parseFloat(valRow["Pension Cash Balance"]) || 0,
        directInvestmentCash: parseFloat(valRow["Direct Investment Cash Balance"]) || 0,
        directInvestmentAssets: parseFloat(valRow["Firect Investment Asset Valuation"]) || 0,
        totalLiabilities: parseFloat(valRow["Total Liabilities"]) || 0,
        surrenderRebatePayable: parseFloat(valRow["Surrender Rebate Payable"]) || 0,
      }
    } : {};

    const holdingsAll = getSheet("Holdings");
    const holdings = {
      [clientId]: holdingsAll.filter(r => r["Client Number"] === clientId).map(r => ({
        name: r["Holding Name"] || "", purchasePrice: r["Purchase Price"] || "",
        purchasePriceCcy: r["Purchase Price Currency"] || "",
        marketValue: r["Market Value"] || "",
        marketValueCcy: r["Market Value Currency"] || "",
        gainLoss: r["Gain/Loss"] || "",
        gainLossCcy: r["Gain/Loss Currency"] || "",
        pctChange: parseFloat(r["Percent Change"]) || 0,
        account: r["Financial Account"] || "", shares: parseFloat(r["Shares"]) || 0,
      }))
    };

    const withdrawalsAll = getSheet("Processed Withdrawals");
    const fmtDate = (v) => { if (!v) return ""; if (v instanceof Date) return v.toISOString().slice(0,10); return String(v); };
    const withdrawals = {
      [clientId]: withdrawalsAll.filter(r => r["Client Number"] === clientId).map(r => ({
        dateRequested: fmtDate(r["Date Requested"]),
        currency: r["Currency"] || "",
        requestedAmount: parseFloat(String(r["Requested Amount"]||"").replace(/[^0-9.-]/g,"")) || 0,
        actualPaid: parseFloat(String(r["Actual Paid Amount"]||"").replace(/[^0-9.-]/g,"")) || 0,
        paymentDate: fmtDate(r["Payment Date"]),
        type: r["Withdrawal Type"] || "",
      }))
    };

    const distAll = getSheet("Distribution");
    const distMap = {};
    for (const r of distAll.filter(r => r["Client Number"] === clientId)) {
      const name = r["Distribution Name"] || "";
      if (!distMap[name]) distMap[name] = { name, date: r["Date of Payment"]||"", payments: [] };
      distMap[name].payments.push({
        accountNumber: r["Financial Account Number"]||"",
        recipient: r["Recipient of Payment"]||"",
        date: r["Date of Payment"]||"",
        amount: parseFloat(String(r["Amount Paid By The Receivers"]||"").replace(/[^0-9.-]/g,"")) || 0,
      });
    }
    const distributions = { [clientId]: Object.values(distMap) };

    // Get transactions for this client
    const txns = parseCSVForClient(csvText, clientId);

    // Check for zip document
    const documents = {};
    try {
      const zipRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${clientId}.zip`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (zipRes.ok) {
        const zipData = await zipRes.json();
        if (zipData.id) {
          documents[clientId] = {
            name: `${clientId}.zip`,
            size: zipData.size ? Math.round(zipData.size/1024)+" KB" : "—",
            modified: zipData.lastModifiedDateTime ? zipData.lastModifiedDateTime.slice(0,10) : "—",
            downloadUrl: zipData["@microsoft.graph.downloadUrl"] || null,
          };
        }
      }
    } catch(e) {}

    return res.status(200).json({ valuations, holdings, withdrawals, distributions, txns, documents, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error("ClientDetail API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
