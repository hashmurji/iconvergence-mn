// api/documents.js
// Returns document METADATA ONLY — never a direct S3 URL. Downloads go
// through /api/documents/download (separate file) which generates a
// short-lived pre-signed URL after re-checking ownership.
//
// A client-role user only ever sees documents where visible_to_client = true
// AND client_id matches their own token — enforced here, not just in the UI.

const { pool } = require("../lib/db");
const { requireAuth, resolveClientScope } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const scopedClientId = resolveClientScope(auth, req.query.clientId);

    let query = `SELECT id, client_id, title, doc_type, uploaded_at FROM documents`;
    const conditions = [];
    const params = [];

    if (scopedClientId) {
      params.push(scopedClientId);
      conditions.push(`client_id = $${params.length}`);
    }
    // Clients only ever see documents marked visible; advisers see everything
    if (auth.isClient && !auth.isAdviser) {
      conditions.push(`visible_to_client = true`);
    }
    if (conditions.length) query += ` WHERE ` + conditions.join(" AND ");
    query += ` ORDER BY client_id, uploaded_at DESC`;

    const { rows } = await pool.query(query, params);

    const documents = {};
    for (const r of rows) {
      if (!documents[r.client_id]) documents[r.client_id] = [];
      documents[r.client_id].push({
        id: r.id,
        title: r.title,
        docType: r.doc_type,
        uploadedAt: r.uploaded_at,
      });
    }

    res.status(200).json({ documents });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
