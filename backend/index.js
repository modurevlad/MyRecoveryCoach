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

//helper to redirect user to login when token expires
async function getAccessToken(userId) {
  const result = await pool.query(
    "SELECT access_token FROM users WHERE id = $1",
    [userId]
  );
  if (result.rows.length === 0) throw new Error("User not found");
  return result.rows[0].access_token;
}

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
    console.log("WHOOP Profile:", JSON.stringify(profileRes.data, null, 2));

    const whoopUserId = String(profileRes.data.user_id);
    const firstName = profileRes.data.first_name;
    const lastName = profileRes.data.last_name;
    const email = profileRes.data.email;

    // 3) Upsert user in database
    const result = await pool.query(
      `INSERT INTO users (whoop_user_id, access_token, refresh_token, name, email)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (whoop_user_id)
   DO UPDATE SET access_token = $2, refresh_token = $3, name = $4, email = $5
   RETURNING id`,
      [
        whoopUserId,
        access_token,
        refresh_token ?? null,
        `${firstName} ${lastName}`,
        email,
      ]
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

  try {
    const token = await getAccessToken(req.session.userId);

    // Verify token is still valid
    await axios.get(
      "https://api.prod.whoop.com/developer/v1/user/profile/basic",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ authenticated: true });
  } catch (err) {
    if (err?.response?.status === 401) {
      // Token expired, destroy session
      req.session.destroy();
      return res.json({ authenticated: false, reason: "token_expired" });
    }
    res.json({ authenticated: true });
  }
});

///RECOVERY ENDPOINT

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

///SLEEP ENDPOINT

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

///Strain endpoints

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

///GOAL ENDPOINTS

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
  const userResult = await pool.query(
    "SELECT access_token, goal, name, age, weight_kg, height_cm FROM users WHERE id = $1",
    [req.session.userId]
  );

  const { access_token, goal, name, age, weight_kg, height_cm } =
    userResult.rows[0];
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
Name: ${name}
Goal: ${goal}
Age: ${age}
Weight: ${weight_kg} kg
Height: ${height_cm} cm
BMI: ${(weight_kg / (height_cm / 100) ** 2).toFixed(1)}

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

//PROFILE ENDPOINTS
app.get("/api/profile", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    "SELECT name, age, weight_kg, height_cm, goal FROM users WHERE id = $1",
    [req.session.userId]
  );

  res.json(result.rows[0]);
});

app.post("/api/profile", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { name, age, weight_kg, height_cm } = req.body;

  await pool.query(
    `UPDATE users SET name = $1, age = $2, weight_kg = $3, height_cm = $4 WHERE id = $5`,
    [name, age, weight_kg, height_cm, req.session.userId]
  );

  res.json({ success: true });
});

// Save a plan (chat history)
app.post("/api/plans", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const {
    workout_type,
    messages,
    recovery_score,
    hrv,
    resting_hr,
    sleep_performance,
  } = req.body;

  const result = await pool.query(
    `INSERT INTO plans (user_id, workout_type, messages, recovery_score, hrv, resting_hr, sleep_performance)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      req.session.userId,
      workout_type,
      JSON.stringify(messages),
      recovery_score,
      hrv,
      resting_hr,
      sleep_performance,
    ]
  );

  res.json(result.rows[0]);
});

// Get all saved plans for the user
app.get("/api/plans", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    `SELECT id, workout_type, created_at, messages, recovery_score, hrv, resting_hr, sleep_performance
     FROM plans
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [req.session.userId]
  );

  res.json(result.rows);
});

// Get a single plan
app.get("/api/plans/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    `SELECT id, workout_type, created_at, messages
     FROM plans
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.session.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Plan not found" });
  }

  res.json(result.rows[0]);
});

app.put("/api/plans/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { messages } = req.body;

  await pool.query(
    `UPDATE plans SET messages = $1 WHERE id = $2 AND user_id = $3`,
    [JSON.stringify(messages), req.params.id, req.session.userId]
  );

  res.json({ success: true });
});

// Delete a plan
app.delete("/api/plans/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  await pool.query("DELETE FROM plans WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.session.userId,
  ]);

  res.json({ success: true });
});

// Rename a plan
app.patch("/api/plans/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { name } = req.body;

  await pool.query(
    "UPDATE plans SET name = $1 WHERE id = $2 AND user_id = $3",
    [name, req.params.id, req.session.userId]
  );

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
