// api/onedrive.js - Vercel serverless function
// Fetches Excel/CSV data from SharePoint via Microsoft Graph API

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// SharePoint site details
const SHAREPOINT_HOST = "recit365-my.sharepoint.com";
const SITE_PATH = "/personal/harshad_iconvergence_co_uk";
const SITE_ID = "recit365-my.sharepoint.com,fecf4208-aba4-4152-8740-f4b93c99d92b,c2c93cb5-c5e7-4453-b8de-6a8d56b63267";
const DRIVE_ID = "b!CELP_qSrUkGHQPS5PJnZK7U8ycLnxVNEuN5qjVa2MmcYWMolKah8T6PSxMz8xJJF";
const FOLDER_PATH = "iconvergence-mn";

// File names
const EXCEL_FILE = "clients_holdings_valuations_loans_withdrawals.xlsx";
const CSV_FILE = "txns.csv";

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Failed to get token: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function getSiteId(token) {
  const url = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:${SITE_PATH}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.id) throw new Error("Site not found: " + JSON.stringify(data));
  return data.id;
}

async function getDriveId(token, siteId) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.value || data.value.length === 0) throw new Error("No drives found");
  return data.value[0].id;
}

async function getFileContent(token, siteId, driveId, fileName) {
  // Search for the file in the drive
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${FOLDER_PATH}/${fileName}:/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`File ${fileName} not found: ${err}`);
  }
  return res;
}

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line, i) => {
    // Handle quoted fields
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += char; }
    }
    values.push(current.trim());
    
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    return {
      id: i,
      selector: row["selector"] || "",
      tradedate: row["tradedate"] || "",
      settdate: row["settdate"] || "",
      clientId: row["Client Number"] || "",
      accountId: row["Account Number"] || "",
      clientName: row["ClientName"] || "",
      txtype: row["txtype"] || "",
      ticker: row["ticker"] || "",
      description: row["description"] || "",
      ccy: row["ccy"] || "",
      qty: parseFloat(row["qty"]) || 0,
      consideration: parseFloat(row["consideration"]) || 0,
      clientnetamt: parseFloat(row["clientnetamt"]) || 0,
      costprice: parseFloat(row["costprice"]) || 0,
      costvalue: parseFloat(row["costvalue"]) || 0,
    };
  });
}

async function parseExcel(buffer) {
  // Use a simple XLSX parser - we'll use the xlsx npm package
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const result = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    result[sheetName] = rows;
  }
  return result;
}

function buildClients(rows) {
  return rows.map(r => ({
    id: r["Client Number"] || "",
    clientId: r["client_id"] || "",
    accountNumber: r["Account Number"] || "",
    primaryCode: r["primaryclientcode"] || "",
    name: r["ClientName"] || "",
    reportingCcy: r["Reporting CCY"] || "USD",
    bankAccount: String(r["Bank Account Number"] || ""),
    bankSort: r["Bank Sort Code"] || "",
    bankName: r["Bank Name"] || "",
    email: r["Email"] || "",
    address: r["ClientAddress"] || "",
    jurisdiction: r["Jurisdiction"] || "",
    verified: r["Verified"] === "Yes",
  }));
}

function buildValuations(rows) {
  const result = {};
  for (const r of rows) {
    const id = r["Client Number"];
    if (!id) continue;
    result[id] = {
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
  return result;
}

function buildHoldings(rows) {
  const result = {};
  for (const r of rows) {
    const id = r["Client Number"];
    if (!id) continue;
    if (!result[id]) result[id] = [];
    result[id].push({
      name: r["Holding Name"] || "",
      purchasePrice: r["Purchase Price"] || "",
      marketValue: r["Market Value"] || "",
      gainLoss: r["Gain/Loss"] || "",
      pctChange: parseFloat(r["Percent Change"]) || 0,
      account: r["Financial Account"] || "",
      shares: parseFloat(r["Shares"]) || 0,
    });
  }
  return result;
}

function buildWithdrawals(rows) {
  const result = {};
  for (const r of rows) {
    const id = r["Client Number"];
    if (!id) continue;
    if (!result[id]) result[id] = [];
    const fmtDate = (v) => {
      if (!v) return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    };
    result[id].push({
      dateRequested: fmtDate(r["Date Requested"]),
      currency: r["Currency"] || "",
      requestedAmount: parseFloat(String(r["Requested Amount"] || "").replace(/[^0-9.-]/g, "")) || 0,
      actualPaid: parseFloat(String(r["Actual Paid Amount"] || "").replace(/[^0-9.-]/g, "")) || 0,
      paymentDate: fmtDate(r["Payment Date"]),
      type: r["Withdrawal Type"] || "",
    });
  }
  return result;
}

function buildDistributions(rows) {
  const result = {};
  for (const r of rows) {
    const id = r["Client Number"];
    if (!id) continue;
    if (!result[id]) result[id] = [];
    const distName = r["Distribution Name"] || "";
    let dist = result[id].find(d => d.name === distName);
    if (!dist) {
      dist = { name: distName, date: r["Date of Payment"] || "", payments: [] };
      result[id].push(dist);
    }
    const amtStr = String(r["Amount Paid By The Receivers"] || "").replace(/[^0-9.-]/g, "");
    dist.payments.push({
      accountNumber: r["Financial Account Number"] || "",
      recipient: r["Recipient of Payment"] || "",
      date: r["Date of Payment"] || "",
      amount: parseFloat(amtStr) || 0,
    });
  }
  return result;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getAccessToken();
    const siteId = SITE_ID;
    const driveId = DRIVE_ID;

    // Fetch both files in parallel
    const [excelRes, csvRes] = await Promise.all([
      getFileContent(token, siteId, driveId, EXCEL_FILE),
      getFileContent(token, siteId, driveId, CSV_FILE),
    ]);

    // Parse files
    const excelBuffer = Buffer.from(await excelRes.arrayBuffer());
    const csvText = await csvRes.text();

    const sheets = await parseExcel(excelBuffer);
    const txns = parseCSV(csvText);

    // Build data objects from sheets
    const clients = buildClients(sheets["Client Details"] || []);
    const valuations = buildValuations(sheets["Valuations"] || []);
    const holdings = buildHoldings(sheets["Holdings"] || []);
    const withdrawals = buildWithdrawals(sheets["Processed Withdrawals"] || []);
    const distributions = buildDistributions(sheets["Distribution"] || []);

    // Find document zips for each client
    const documents = {};
    for (const client of clients) {
      try {
        const zipName = `${client.id}.zip`;
        const zipCheckUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${DRIVE_ID}/root:/${FOLDER_PATH}/${zipName}`;
        const zipRes = await fetch(zipCheckUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (zipRes.ok) {
          const zipData = await zipRes.json();
          if (zipData.id) {
            documents[client.id] = {
              name: zipName,
              size: zipData.size ? Math.round(zipData.size / 1024) + " KB" : "—",
              modified: zipData.lastModifiedDateTime ? zipData.lastModifiedDateTime.slice(0, 10) : "—",
              downloadUrl: zipData["@microsoft.graph.downloadUrl"] || null,
            };
          }
        }
      } catch(e) {
        // No zip found for this client, skip
      }
    }

    return res.status(200).json({
      clients,
      valuations,
      holdings,
      withdrawals,
      distributions,
      txns,
      documents,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("OneDrive API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
