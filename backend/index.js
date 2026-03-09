import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Groq from "groq-sdk";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const app = express();
const PORT = process.env.PORT || 3001;
const PgSession = connectPgSimple(session);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

//ROUTES

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

app.get("/api/sleep", async (req, res) => {
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
      "https://api.prod.whoop.com/developer/v2/sleep?limit=1",
      { headers: { Authorization: `Bearer ${result.rows[0].access_token}` } }
    );
    res.json(apiRes.data);
  } catch (err) {
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

app.get("/api/strain", async (req, res) => {
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
      "https://api.prod.whoop.com/developer/v2/strain?limit=1",
      { headers: { Authorization: `Bearer ${result.rows[0].access_token}` } }
    );
    res.json(apiRes.data);
  } catch (err) {
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

app.post("/api/goal", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { goal } = req.body;
  if (!["bulk", "lose_weight", "maintain"].includes(goal)) {
    return res.status(400).json({ error: "Invalid goal" });
  }

  await pool.query("UPDATE users SET goal = $1 WHERE id = $2", [
    goal,
    req.session.userId,
  ]);

  res.json({ success: true, goal });
});

app.get("/api/goal", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query("SELECT goal FROM users WHERE id = $1", [
    req.session.userId,
  ]);

  res.json({ goal: result.rows[0]?.goal ?? null });
});

///AI PERSONALIZED PLAN ENDPOINT
app.post("/api/chat", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages" });
  }

  try {
    const userResult = await pool.query(
      "SELECT access_token, goal FROM users WHERE id = $1",
      [req.session.userId]
    );

    const { access_token, goal } = userResult.rows[0];
    const headers = { Authorization: `Bearer ${access_token}` };

    // Fetch all WHOOP data in parallel
    const [recoveryRes, sleepRes, workoutsRes] = await Promise.all([
      axios.get("https://api.prod.whoop.com/developer/v2/recovery?limit=1", {
        headers,
      }),
      axios.get(
        "https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1",
        { headers }
      ),
      axios.get(
        "https://api.prod.whoop.com/developer/v2/activity/workout?limit=10",
        { headers }
      ),
    ]);

    const recovery = recoveryRes.data.records?.[0];
    const sleep = sleepRes.data.records?.[0];
    const recentWorkouts = workoutsRes.data.records?.map((w) => ({
      date: w.start?.slice(0, 10),
      sport: w.sport_name,
      strain: w.score?.strain,
      duration_minutes: Math.round(
        (new Date(w.end) - new Date(w.start)) / 60000
      ),
      avg_heart_rate: w.score?.average_heart_rate,
    }));

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // System message with WHOOP context
    const systemMessage = {
      role: "system",
      content: `You are MyRecoveryCoach, a professional fitness and nutrition coach. Today is ${today}.

You always have access to the user's latest WHOOP biometric data below. Use it to personalize every recommendation.

--- USER PROFILE ---
Goal: ${goal}

--- RECOVERY ---
Recovery Score: ${recovery?.score?.recovery_score ?? "N/A"}%
HRV: ${recovery?.score?.hrv_rmssd_milli ?? "N/A"} ms
Resting Heart Rate: ${recovery?.score?.resting_heart_rate ?? "N/A"} bpm

--- SLEEP ---
Sleep Performance: ${sleep?.score?.sleep_performance_percentage ?? "N/A"}%
Hours in Bed: ${
        sleep?.score?.stage_summary?.total_in_bed_time_milli
          ? Math.round(
              (sleep.score.stage_summary.total_in_bed_time_milli / 3600000) * 10
            ) / 10
          : "N/A"
      } hours

--- RECENT WORKOUTS ---
${JSON.stringify(recentWorkouts, null, 2)}

Guidelines:
- If recovery > 66%: suggest high intensity
- If recovery 33-66%: suggest moderate intensity  
- If recovery < 33%: suggest light workout or rest
- Always vary meal suggestions, use different cuisines
- When user asks to modify a plan, only change what they ask, keep the rest
- Be conversational and encouraging
- When generating meal or workout plans, format them clearly with emojis
- Use minimal emojis, maximum 2-3 per response
- Keep responses concise and to the point
- Don't repeat the full plan when only one thing changes, just show what changed
- Use plain text formatting, avoid excessive markdown`,
    };

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [systemMessage, ...messages],
      temperature: 1.2,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

app.get("/api/workouts/recent", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    "SELECT access_token FROM users WHERE id = $1",
    [req.session.userId]
  );

  try {
    const apiRes = await axios.get(
      "https://api.prod.whoop.com/developer/v2/activity/workout?limit=10",
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
