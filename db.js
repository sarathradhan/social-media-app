import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

export const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => console.log("✅ Connected to Render PostgreSQL"))
  .catch(err => console.error("❌ DB Connection Error:", err));

export { db };
export default db; 