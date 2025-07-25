import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});
db.connect();
export { db };
export default db; 