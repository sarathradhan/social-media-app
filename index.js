import express           from "express";
import bodyParser        from "body-parser";
import path              from "path";
import { fileURLToPath } from "url";
import multer            from "multer";
import fs                from "fs";
import session           from "express-session";
import bcrypt            from "bcrypt";
import passport from "passport";
import { db } from "./db.js";
import "./auth.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const port = 3000;                                           

app.use(express.static(path.join(__dirname, "public"))); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(session({
  secret:            process.env.SESSION_SECRET || "fallback-secret",
  resave:            false,
  saveUninitialized: false,
}));

app.use(async (req, res, next) => {
  if (!req.session.userId) {
    res.locals.followedUsers = [];
    return next();
  }

  const { rows } = await db.query(`
    SELECT u.username, u.profile_pic_url
      FROM follows f
      JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1
     ORDER BY u.username
     LIMIT 8
  `, [req.session.userId]);

  res.locals.followedUsers = rows;
  next();
});

app.use(passport.initialize());
app.use(passport.session());


const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); };

const avatarDir  = path.join(__dirname,"public","avatars");
const uploadDir  = path.join(__dirname,"public","uploads");
ensureDir(avatarDir);  ensureDir(uploadDir);

const avatarStorage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,avatarDir),
  filename:   (req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname))
});
const uploadAvatar = multer({ storage: avatarStorage });

const postStorage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:   (req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname))
});
const uploadPostImage = multer({ storage: postStorage });


const ensureLoggedIn = (req,res,next)=>{
  if(!req.session.userId) return res.redirect("/login");
  next();
};

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.session.userId   = req.user.id;
    req.session.username = req.user.username;
    res.redirect(`/profile/${req.user.username}`);
  }
);

app.get("/signup",(req,res)=>res.render("signup"));

app.post("/signup", async (req,res)=>{
  const { username,password } = req.body;
  const hash = await bcrypt.hash(password,10);
  try{
    await db.query("INSERT INTO users (username,password) VALUES ($1,$2)",[username,hash]);
    res.redirect("/login");
  }catch(e){
    res.status(500).send("Signup error: "+e.message);
  }
});

app.get("/login",(req,res)=>res.render("login"));

app.post("/login", async (req,res)=>{
  const { username,password } = req.body;
  const { rows } = await db.query("SELECT * FROM users WHERE username=$1",[username]);
  const user = rows[0];
  if(user && await bcrypt.compare(password,user.password)){
    req.session.userId   = user.id;
    req.session.username = user.username;
    res.redirect("/");
  }else{
    res.send("Invalid credentials");
  }
});

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
});

app.get("/", async (req,res)=>{
  try{

    const { rows:posts } = await db.query(`
      SELECT p.*,
             u.username,
             u.profile_pic_url,
             COUNT(l.id) AS like_count,
             EXISTS(SELECT 1 FROM likes l2
                    WHERE l2.user_id=$1 AND l2.post_id=p.id) AS user_liked
        FROM posts p
        JOIN users u  ON u.id = p.user_id
        LEFT JOIN likes l ON l.post_id = p.id
       GROUP BY p.id,u.id
       ORDER BY p.created_at DESC
    `,[ req.session.userId || 0 ]);
    console.log("Loaded posts:", posts);
    res.render("index",{ posts, session:req.session });
  }catch(e){
    console.error(e); res.status(500).send("Error loading posts");
  }
});

app.get("/new",(req,res)=>res.render("new",{ session:req.session }));


app.post("/posts", ensureLoggedIn, uploadPostImage.single("image"), async (req,res)=>{
  if(!req.session.userId) return res.status(401).send("Unauthorized");
  const { caption } = req.body;
  const image_url   = "/uploads/"+req.file.filename;
  await db.query(`
    INSERT INTO posts (username,caption,image_url,user_id)
    VALUES ($1,$2,$3,$4)
  `,[ req.session.username, caption, image_url, req.session.userId ]);
  res.redirect("/");
});

app.get("/myposts", ensureLoggedIn, async (req,res)=>{
  const { rows } = await db.query(`
    SELECT p.*,u.profile_pic_url
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.user_id=$1
     ORDER BY p.created_at DESC
  `,[req.session.userId]);
  res.render("myposts",{ posts:rows, session:req.session });
});

app.post("/posts/:id/delete", ensureLoggedIn, async (req,res)=>{
  const id=req.params.id;
  try{
    await db.query("DELETE FROM likes WHERE post_id=$1",[id]);
    await db.query("DELETE FROM posts WHERE id=$1",[id]);
    res.redirect("/myposts");
  }catch(e){
    console.error(e); res.status(500).send("Failed to delete post");
  }
});


app.post("/posts/:id/like", ensureLoggedIn, async (req,res)=>{
  const postId = req.params.id;
  const userId = req.session.userId;

  try{
    const del = await db.query(
      "DELETE FROM likes WHERE user_id=$1 AND post_id=$2 RETURNING 1",
      [userId,postId]
    );
    if(del.rowCount===0){
      await db.query(
        "INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [userId,postId]
      );
    }
    res.sendStatus(200);
  }catch(e){
    console.error("Like toggle error:",e);
    res.status(500).send("Failed to toggle like");
  }
});


app.get("/liked", ensureLoggedIn, async (req,res)=>{
  try{
    const { rows } = await db.query(`
      SELECT p.*,
             u.profile_pic_url,
             TRUE AS user_liked,
             (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS like_count
        FROM likes l
        JOIN posts p ON p.id=l.post_id
        JOIN users u ON u.id=p.user_id
       WHERE l.user_id=$1
       ORDER BY p.created_at DESC
    `,[ req.session.userId ]);
    res.render("liked",{ posts:rows, session:req.session });
  }catch(e){
    console.error(e); res.status(500).send("Error loading liked posts");
  }
});

app.get("/profile", ensureLoggedIn, (req, res) => {
  const myUsername = req.session.username;
  if (!myUsername) return res.redirect("/login");
  res.redirect(`/profile/${myUsername}`);
});

app.get("/profile/:username", ensureLoggedIn, async (req,res)=>{
  const { username } = req.params;

  try{
    const uRes = await db.query(
      "SELECT id,username,bio,profile_pic_url FROM users WHERE username=$1",
      [username]
    );
    if(!uRes.rowCount) return res.status(404).send("User not found");
    const user = uRes.rows[0];

    const { rows:posts } = await db.query(
      "SELECT id,image_url FROM posts WHERE user_id=$1 ORDER BY created_at DESC",
      [user.id]
    );

    const { rows:[counts] } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM follows WHERE following_id=$1) AS follower_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id=$1)  AS following_count
    `,[user.id]);

    res.render("profile",{
      user,
      posts,
      isOwner: req.session.userId === user.id,
      followerCount:  counts.follower_count,
      followingCount: counts.following_count,
      session: req.session
    });

  }catch(e){
    console.error("Profile error:",e);
    res.status(500).send("Server error");
  }
});

app.post(
  "/profile/edit",
  ensureLoggedIn,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    const { bio } = req.body;
    const updates = [];
    const vals    = [];
    const nextIdx = () => `$${vals.length + 1}`;

    if (bio !== undefined) {
      updates.push(`bio = ${nextIdx()}`);
      vals.push(bio.trim());
    }
    if (req.file) {
      updates.push(`profile_pic_url = ${nextIdx()}`);
      vals.push("/avatars/" + req.file.filename);
    }

    if (updates.length === 0) {
      return res.redirect(`/profile/${req.session.username}`);
    }

    vals.push(req.session.userId);
    const idPlaceholder = `$${vals.length}`;

    try {
      await db.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ${idPlaceholder}`,
        vals
      );
      res.redirect(`/profile/${req.session.username}`);
    } catch (err) {
      console.error("Update profile error:", err);
      res.status(500).send("Failed to update profile");
    }
  }
);


app.get("/explore", ensureLoggedIn, async (req,res)=>{
  const me = req.session.userId;
  const { rows } = await db.query(`
    SELECT u.id,u.username,u.profile_pic_url,
           EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id) AS is_following
      FROM users u
     WHERE u.id<>$1
     ORDER BY u.username
  `,[me]);
  res.render("explore",{ users:rows, session:req.session });
});

app.post("/follow/:username", ensureLoggedIn, async (req,res)=>{
  try{
    const { rows:[tgt] } = await db.query("SELECT id FROM users WHERE username=$1",[req.params.username]);
    if(!tgt) return res.status(404).send("User not found");
    await db.query(`
      INSERT INTO follows(follower_id,following_id)
      VALUES($1,$2) ON CONFLICT DO NOTHING
    `,[req.session.userId, tgt.id]);
    res.redirect("back");
  }catch(e){ console.error("Follow err:",e); res.status(500).send("Failed to follow"); }
});

app.post("/unfollow/:username", ensureLoggedIn, async (req,res)=>{
  try{
    const { rows:[tgt] } = await db.query("SELECT id FROM users WHERE username=$1",[req.params.username]);
    if(!tgt) return res.status(404).send("User not found");
    await db.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2",[req.session.userId,tgt.id]);
    res.redirect("back");
  }catch(e){ console.error("Unfollow err:",e); res.status(500).send("Failed to unfollow");}
});

app.listen(port,()=>console.log(`Listening on http://localhost:${port}`));