// lib/auth.js
// Verifies the Auth0 access token on every API request and extracts the
// role/clientId claims. This is the server-side enforcement referenced in
// the security guide — the frontend's isAdviser/isClient check is a
// convenience, this is the actual boundary.
//
// PREREQUISITE: the custom claims (roles, client_id) must be added to the
// ACCESS token via an Auth0 Action, not just the ID token. If your Auth0
// tenant currently only adds them to the ID token, add an Action on the
// "Login / Post Login" trigger that also calls:
//   api.accessToken.setCustomClaim('https://iconvergence.co.uk/roles', roles);
//   api.accessToken.setCustomClaim('https://iconvergence.co.uk/client_id', clientId);

const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: process.env.AUTH0_AUDIENCE,
        issuer: `https://${process.env.AUTH0_DOMAIN}/`,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      }
    );
  });
}

// Throws a { status, message } style error if the token is missing/invalid.
async function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const e = new Error("Missing access token");
    e.status = 401;
    throw e;
  }

  let claims;
  try {
    claims = await verifyToken(token);
  } catch (err) {
    const e = new Error("Invalid or expired token");
    e.status = 401;
    throw e;
  }

  const roles =
    claims["https://iconvergence.co.uk/roles"] ||
    claims["https://iconvergence.uk.auth0.com/roles"] ||
    [];
  const clientId =
    claims["https://iconvergence.co.uk/client_id"] ||
    claims["https://iconvergence.uk.auth0.com/client_id"] ||
    null;
  const isAdviser = roles.includes("adviser") || roles.length === 0;
  const isClient = roles.includes("client");

  return { sub: claims.sub, roles, clientId, isAdviser, isClient };
}

// Helper: if the caller is a client-only user, force any requested clientId
// to match their own — never trust a clientId passed in the querystring for
// a client-role user.
function resolveClientScope(auth, requestedClientId) {
  if (auth.isClient && !auth.isAdviser) {
    return auth.clientId; // ignore whatever was requested, use the token's own id
  }
  return requestedClientId || null; // advisers can request any client, or none = all
}

module.exports = { requireAuth, resolveClientScope };
