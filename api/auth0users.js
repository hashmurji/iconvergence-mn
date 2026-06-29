// api/auth0users.js - Fetch users from Auth0 Management API

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "iconvergence.uk.auth0.com";
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || "jWc8OqcK0Vw77Z1sIYQOr7BNviukmrbp";
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;

async function getManagementToken() {
  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get management token: " + JSON.stringify(data));
  return data.access_token;
}

async function getAllUsers(token) {
  const users = [];
  let page = 0;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/users?per_page=${perPage}&page=${page}&include_totals=true&fields=user_id,email,name,last_login,created_at,app_metadata,user_metadata,logins_count`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.error) throw new Error("Auth0 users error: " + data.message);
    
    users.push(...(data.users || []));
    
    const total = data.total || 0;
    if (users.length >= total || (data.users || []).length === 0) break;
    page++;
    if (page > 25) break; // Safety limit: max 2500 users
  }

  return users.map(u => ({
    userId: u.user_id,
    email: u.email,
    name: u.name,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    loginsCount: u.logins_count || 0,
    clientId: u.app_metadata?.client_id || u.user_metadata?.client_id || null,
    roles: u.app_metadata?.roles || [],
  }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getManagementToken();
    const users = await getAllUsers(token);
    return res.status(200).json({ users, total: users.length, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error("Auth0 users error:", err);
    return res.status(500).json({ error: err.message });
  }
}
