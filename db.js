// db.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Create PostgreSQL client
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL, // Railway connection URL
  ssl: { rejectUnauthorized: false },          // Required for Railway SSL
});

// Connect to the database
db.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB Connection Error:", err));

// Helper function to run queries
export const query = async (text, params) => {
  try {
    const res = await db.query(text, params);
    return res;
  } catch (err) {
    console.error("❌ Query Error:", err);
    throw err;
  }
};

// Function to create all tables
export const createTables = async () => {
  try {
    // Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id TEXT UNIQUE,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        bio TEXT,
        profile_pic_url TEXT
      );
    `);

    // Posts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        username TEXT,
        caption TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Likes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        post_id INT REFERENCES posts(id) ON DELETE CASCADE,
        UNIQUE(user_id, post_id)
      );
    `);

    // Follows table
    await db.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        follower_id INT REFERENCES users(id) ON DELETE CASCADE,
        following_id INT REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(follower_id, following_id)
      );
    `);

    console.log("✅ All tables created successfully!");
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  }
};

// Export the db client
export default db;
