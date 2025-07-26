import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import db from "./db.js";     
import dotenv from "dotenv";
dotenv.config();       

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  const { rows } = await db.query("SELECT * FROM users WHERE id=$1", [id]);
  done(null, rows[0]);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const name = profile.displayName;
        const avatar = profile.photos?.[0]?.value || null;
        let { rows } = await db.query(
          "SELECT * FROM users WHERE google_id=$1",
          [googleId]
        );

        if (rows.length === 0) {
            ({rows} = await db.query(
                `INSERT INTO users (google_id, username, profile_pic_url)
                VALUES ($1, $2, $3)
                ON CONFLICT (username) DO UPDATE SET google_id = EXCLUDED.google_id, profile_pic_url = EXCLUDED.profile_pic_url
                RETURNING *`,
                [googleId, name, avatar]
            ));
        }
        done(null, rows[0]);
      } catch (error) {
        done(error);
      }
    }
  )
);