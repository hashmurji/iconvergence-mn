// api/documents/download.js  (Vercel route: /api/documents/download?id=...)
// Generates a short-lived pre-signed S3 URL — but ONLY after re-checking
// that this specific document belongs to the requester (or they're an
// adviser) and, for client-role users, that it's marked visible_to_client.
// This check happens BEFORE any S3 call, per the security guide.

const { pool } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
const BUCKET = process.env.DOCUMENTS_BUCKET; // e.g. 'ubiquiti-client-documents'

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await requireAuth(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing document id" });

    const { rows } = await pool.query(
      `SELECT id, client_id, s3_key, visible_to_client FROM documents WHERE id = $1`,
      [id]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Ownership + visibility check — the actual security boundary
    const isOwner = doc.client_id === auth.clientId;
    const allowed = auth.isAdviser || (auth.isClient && isOwner && doc.visible_to_client);
    if (!allowed) return res.status(403).json({ error: "Not authorized to access this document" });

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: doc.s3_key });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    res.status(200).json({ url, expiresIn: 300 });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
