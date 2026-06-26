const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SHAREPOINT_HOST = "recit365-my.sharepoint.com";
const SITE_PATH = "/personal/harshad_iconvergence_co_uk";
const SITE_ID = "recit365-my.sharepoint.com,fecf4208-aba4-4152-8740-f4b93c99d92b,c2c93cb5-c5e7-4453-b8de-6a8d56b63267";
const ONEDRIVE_ID = "b!CELP_qSrUkGHQPS5PJnZK7U8ycLnxVNEuN5qjVa2MmcYWMolKah8T6PSxMz8xJJF";

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const results = {};
  try {
    const token = await getAccessToken();
    results.token = "OK";

    // List root of OneDrive
    const rootRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${ONEDRIVE_ID}/root/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rootData = await rootRes.json();
    results.oneDriveRoot = rootData.value ? rootData.value.map(f => ({ name: f.name, type: f.folder ? "folder" : "file" })) : rootData;

    // Try to list root directly
    const rootItemRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${ONEDRIVE_ID}/root`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rootItem = await rootItemRes.json();
    results.rootItem = { name: rootItem.name, size: rootItem.size };

    // Search for our files
    const searchRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drives/${ONEDRIVE_ID}/root/search(q='clients_holdings')`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    results.searchResults = searchData.value ? searchData.value.map(f => ({ name: f.name, path: f.parentReference?.path })) : searchData;

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message, results });
  }
}
