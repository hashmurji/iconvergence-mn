// lib/db.js
// Shared Postgres connection pool for all API routes.
// Credentials come from environment variables set in Vercel project settings
// (or AWS Secrets Manager if you wire that in later) — never hard-coded.

import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,       // the app_api role, NOT the RDS master user
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: true }, // enforce TLS to RDS
  max: 5,
});
