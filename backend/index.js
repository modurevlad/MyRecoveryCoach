import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const app = express();
const PORT = process.env.PORT || 3001;
const PgSession = connectPgSimple(session);

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(
  session({
    store: new PgSession({ pool }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 10 * 1000 * 60 * 60 * 24 * 7 },
  })
);

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const WHOOP_CLIENT_ID = () => mustEnv("WHOOP_CLIENT_ID");
const WHOOP_CLIENT_SECRET = () => mustEnv("WHOOP_CLIENT_SECRET");
const WHOOP_REDIRECT_URI = () => mustEnv("WHOOP_REDIRECT_URI");

app.get("/auth/whoop", (req, res) => {
  // added read:profile
  const scope = "read:recovery read:sleep read:workout read:profile";
  const authorizeUrl =
    `https://api.prod.whoop.com/oauth/oauth2/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(WHOOP_CLIENT_ID())}` +
    `&redirect_uri=${encodeURIComponent(WHOOP_REDIRECT_URI())}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=devstate123`;
  res.redirect(authorizeUrl);
});

app.get("/auth/whoop/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing ?code in callback URL");
  if (req.query.state !== "devstate123")
    return res.status(400).send("Invalid state");

  try {
    // 1) Exchange code for tokens
    const tokenRes = await axios.post(
      "https://api.prod.whoop.com/oauth/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: WHOOP_REDIRECT_URI(),
        client_id: WHOOP_CLIENT_ID(),
        client_secret: WHOOP_CLIENT_SECRET(),
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = tokenRes.data;

    // 2) Fetch WHOOP user profile
    const profileRes = await axios.get(
      "https://api.prod.whoop.com/developer/v1/user/profile/basic",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const whoopUserId = String(profileRes.data.user_id);

    // 3) Upsert user in database
    const result = await pool.query(
      `INSERT INTO users (whoop_user_id, access_token, refresh_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (whoop_user_id)
       DO UPDATE SET access_token = $2, refresh_token = $3
       RETURNING id`,
      [whoopUserId, access_token, refresh_token ?? null]
    );

    // 4) Save user ID in session
    req.session.userId = result.rows[0].id;
    console.log("User saved, session userId:", req.session.userId);

    return res.redirect("http://localhost:5173");
  } catch (err) {
    console.error("Callback error:", err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

app.get("/api/status", async (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const result = await pool.query("SELECT id FROM users WHERE id = $1", [
    req.session.userId,
  ]);
  res.json({ authenticated: result.rows.length > 0 });
});

app.get("/api/recovery", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    "SELECT access_token FROM users WHERE id = $1",
    [req.session.userId]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "User not found" });
  }

  try {
    const apiRes = await axios.get(
      "https://api.prod.whoop.com/developer/v2/recovery?limit=1",
      { headers: { Authorization: `Bearer ${result.rows[0].access_token}` } }
    );
    res.json(apiRes.data);
  } catch (err) {
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
