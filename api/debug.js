// api/debug.js - temporary diagnostic endpoint
const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

const SHAREPOINT_HOST = "recit365-my.sharepoint.com";
const SITE_PATH = "/personal/harshad_iconvergence_co_uk";

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
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const results = {};

  try {
    // Step 1: Get token
    const token = await getAccessToken();
    results.token = "OK";

    // Step 2: Try site lookup
    const siteUrl = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:${SITE_PATH}`;
    results.siteUrl = siteUrl;
    const siteRes = await fetch(siteUrl, { headers: { Authorization: `Bearer ${token}` } });
    const siteData = await siteRes.json();
    results.site = siteData.error ? siteData : { id: siteData.id, name: siteData.name };

    if (siteData.id) {
      // Step 3: List drives
      const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const drivesData = await drivesRes.json();
      results.drives = drivesData.value ? drivesData.value.map(d => ({ id: d.id, name: d.name })) : drivesData;

      if (drivesData.value && drivesData.value.length > 0) {
        const driveId = drivesData.value[0].id;

        // Step 4: List root folder
        const rootRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives/${driveId}/root/children`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const rootData = await rootRes.json();
        results.rootFiles = rootData.value ? rootData.value.map(f => f.name) : rootData;

        // Step 5: Try Documents folder
        const docsRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives/${driveId}/root:/Documents:/children`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const docsData = await docsRes.json();
        results.documentsFolder = docsData.value ? docsData.value.map(f => f.name) : docsData;
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message, results });
  }
}
