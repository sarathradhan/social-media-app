import pg from "pg";
import dotenv from "dotenv";
dotenv.config();


export const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
console.log("DATABASE_URL =>", process.env.DATABASE_URL);

db.connect()
  .then(() => console.log("✅ Connected to Render PostgreSQL"))
  .catch(err => console.error("❌ DB Connection Error:", err));

export default db; 
