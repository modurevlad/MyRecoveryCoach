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

async function streamGroqResponse(res, messages, systemMessage) {
  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [systemMessage, ...messages],
    temperature: 1.2,
    stream: true,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || "";
    if (token) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
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

  const limit = req.query.limit || 1;

  try {
    const apiRes = await axios.get(
      `https://api.prod.whoop.com/developer/v2/recovery?limit=${limit}`,
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
      "https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1",
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

// MEAL CHAT
app.post("/api/chat/meal", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "Missing messages" });

  try {
    const userResult = await pool.query(
      "SELECT access_token, goal, name, age, weight_kg, height_cm FROM users WHERE id = $1",
      [req.session.userId]
    );

    const { access_token, goal, name, age } = userResult.rows[0];
    const weightKg = parseFloat(userResult.rows[0].weight_kg);
    const heightCm = parseFloat(userResult.rows[0].height_cm);
    const headers = { Authorization: `Bearer ${access_token}` };

    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    const tdee = Math.round(bmr * 1.55);
    const caloricTarget =
      goal === "bulk" ? tdee + 400 : goal === "lose_weight" ? tdee - 500 : tdee;

    const [recoveryRes, sleepRes, workoutsRes] = await Promise.all([
      axios.get("https://api.prod.whoop.com/developer/v2/recovery?limit=1", {
        headers,
      }),
      axios.get(
        "https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1",
        { headers }
      ),
      axios.get(
        "https://api.prod.whoop.com/developer/v2/activity/workout?limit=5",
        { headers }
      ),
    ]);

    const recovery = recoveryRes.data.records?.[0];
    const sleep = sleepRes.data.records?.[0];
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayWorkout = workoutsRes.data.records?.find(
      (workout) => workout.start?.slice(0, 10) === todayStr
    );
    const workoutCalories = todayWorkout?.score?.kilojoule
      ? Math.round(todayWorkout.score.kilojoule * 0.239)
      : 0;
    const adjustedCaloricTarget = caloricTarget + workoutCalories;

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemMessage = {
      role: "system",
      content: `You are MyRecoveryCoach, a professional nutrition coach. Today is ${today}.
Your job is ONLY to generate and modify meal plans. Do not generate workout plans.

--- USER PROFILE ---
Name: ${name}
Goal: ${goal}
Age: ${age}
Weight: ${weightKg} kg
Height: ${heightCm} cm
BMI: ${(weightKg / (heightCm / 100) ** 2).toFixed(1)}

--- NUTRITION TARGETS ---
BMR: ${Math.round(bmr)} kcal
TDEE: ${tdee} kcal
Workout Calories Burned Today: ${workoutCalories} kcal
Daily Caloric Target: ${adjustedCaloricTarget} kcal
Target Protein: ${Math.round(weightKg * 2.2)}g (2.2g per kg bodyweight)

--- RECOVERY ---
Recovery Score: ${recovery?.score?.recovery_score ?? "N/A"}%
HRV: ${
        recovery?.score?.hrv_rmssd_milli
          ? Math.round(recovery.score.hrv_rmssd_milli * 10) / 10
          : "N/A"
      } ms
Resting Heart Rate: ${recovery?.score?.resting_heart_rate ?? "N/A"} bpm

--- SLEEP ---
Sleep Performance: ${sleep?.score?.sleep_performance_percentage ?? "N/A"}%
Hours Slept: ${
        sleep?.score?.stage_summary?.total_in_bed_time_milli
          ? Math.round(
              (sleep.score.stage_summary.total_in_bed_time_milli / 3600000) * 10
            ) / 10
          : "N/A"
      } hours

Guidelines:
- Generate a full day meal plan immediately when asked
- Meal plan MUST hit ${adjustedCaloricTarget} kcal daily target
- Protein must be at least ${Math.round(weightKg * 2.2)}g per day
- Always vary cuisines and meals
- When user asks to modify, only change what they ask
- Include macros for each meal: (Protein: Xg | Carbs: Xg | Fats: Xg | X kcal)
- Show daily macro totals at the end
- Keep responses concise, no excessive markdown
- Use minimal emojis, max 2-3 per response
- If recovery < 33%: prioritize easy to digest, anti-inflammatory foods
- If recovery 33-66%: balanced macros
- If recovery > 66%: can include more complex carbs for energy`,
    };

    await streamGroqResponse(res, messages, systemMessage);
  } catch (err) {
    console.error("Meal chat error:", err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// WORKOUT CHAT
app.post("/api/chat/workout", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "Missing messages" });

  try {
    const userResult = await pool.query(
      "SELECT access_token, goal, name, age, weight_kg, height_cm FROM users WHERE id = $1",
      [req.session.userId]
    );

    const { access_token, goal, name, age } = userResult.rows[0];
    const weightKg = parseFloat(userResult.rows[0].weight_kg);
    const headers = { Authorization: `Bearer ${access_token}` };

    const [recoveryRes, workoutsRes, workoutLogsRes] = await Promise.all([
      axios.get("https://api.prod.whoop.com/developer/v2/recovery?limit=8", {
        headers,
      }),
      axios.get(
        "https://api.prod.whoop.com/developer/v2/activity/workout?limit=10",
        { headers }
      ),
      pool.query(
        `SELECT workout_type, date, recovery_score, exercises, notes FROM workout_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [req.session.userId]
      ),
    ]);

    const recoveryHistory = recoveryRes.data.records ?? [];
    const recovery = recoveryHistory[0];
    const workoutLogs = workoutLogsRes.rows;

    const scored = recoveryHistory.filter((r) => r.score_state === "SCORED");
    const avgHRV =
      scored.reduce((sum, r) => sum + (r.score?.hrv_rmssd_milli ?? 0), 0) /
      scored.length;
    const avgRHR =
      scored.reduce((sum, r) => sum + (r.score?.resting_heart_rate ?? 0), 0) /
      scored.length;

    const recoveryScore = recovery?.score?.recovery_score ?? null;
    const todayHRV = recovery?.score?.hrv_rmssd_milli ?? null;
    const todayRHR = recovery?.score?.resting_heart_rate ?? null;

    let optimalStrainTarget = null;
    let optimalStrainRange = null;

    if (recoveryScore !== null) {
      const baseTarget =
        recoveryScore >= 80
          ? 14.0
          : recoveryScore >= 67
          ? 13.0
          : recoveryScore >= 50
          ? 11.5
          : recoveryScore >= 34
          ? 10.5
          : recoveryScore >= 20
          ? 8.0
          : 6.0;
      const hrvRatio = todayHRV && avgHRV ? todayHRV / avgHRV : 1;
      const hrvAdjustment = hrvRatio > 1.1 ? 0.5 : hrvRatio < 0.9 ? -0.5 : 0;
      const rhrDiff = todayRHR && avgRHR ? todayRHR - avgRHR : 0;
      const rhrAdjustment = rhrDiff > 3 ? -0.5 : rhrDiff < -3 ? 0.3 : 0;
      optimalStrainTarget =
        Math.round((baseTarget + hrvAdjustment + rhrAdjustment) * 10) / 10;
      optimalStrainRange = `${
        Math.round((optimalStrainTarget - 2) * 10) / 10
      }–${Math.round((optimalStrainTarget + 2) * 10) / 10}`;
    }

    const recoveryHistoryFormatted = recoveryHistory.map((r) => ({
      date: r.created_at?.slice(0, 10),
      recovery: r.score?.recovery_score,
      hrv: r.score?.hrv_rmssd_milli
        ? Math.round(r.score.hrv_rmssd_milli * 10) / 10
        : null,
      rhr: r.score?.resting_heart_rate,
    }));

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemMessage = {
      role: "system",
      content: `You are MyRecoveryCoach, a professional fitness coach. Today is ${today}.
Your job is ONLY to generate and modify workout plans. Do not generate meal plans.

--- USER PROFILE ---
Name: ${name}
Goal: ${goal}
Age: ${age}
Weight: ${weightKg} kg

--- RECOVERY (8-DAY HISTORY) ---
${recoveryHistoryFormatted
  .map(
    (r) =>
      `${r.date}: Recovery ${r.recovery}% | HRV ${r.hrv}ms | RHR ${r.rhr}bpm`
  )
  .join("\n")}

--- TODAY ---
Recovery Score: ${recoveryScore ?? "N/A"}%
HRV: ${todayHRV ? Math.round(todayHRV * 10) / 10 : "N/A"} ms (8-day avg: ${
        Math.round(avgHRV * 10) / 10
      } ms)
Resting Heart Rate: ${todayRHR ?? "N/A"} bpm (8-day avg: ${
        Math.round(avgRHR * 10) / 10
      } bpm)
Optimal Strain Target: ${optimalStrainTarget ?? "N/A"}
Optimal Strain Range: ${optimalStrainRange ?? "N/A"}

--- PREVIOUS LOGGED SESSIONS ---
${
  workoutLogs.length > 0
    ? workoutLogs
        .map(
          (log) =>
            `${log.date} | ${log.workout_type} | Recovery: ${
              log.recovery_score ?? "N/A"
            }%\n` +
            log.exercises
              .map(
                (ex) =>
                  `  ${ex.name}: ${ex.sets
                    .map((s) => `${s.reps} reps @ ${s.weight_kg}kg`)
                    .join(", ")}`
              )
              .join("\n") +
            (log.notes ? `\n  Notes: ${log.notes}` : "")
        )
        .join("\n\n")
    : "No logged sessions yet."
}

Guidelines:
- Always provide specific exercises, sets, reps and weights in kg
- Use the Optimal Strain Range to guide workout volume
- If recovery > 66%: high intensity, progressive overload
- If recovery 33-66%: moderate intensity, maintain current weights
- If recovery < 33%: light workout, reduce weights 10-15%
- When logged sessions exist, reference previous weights and explain adjustments
- If today's recovery is lower than last session: reduce weights 5-10%, reduce reps by 1-2
- If today's recovery is higher than last session: suggest slight weight or rep increase
- Always explain why you are adjusting weights based on recovery
- Keep responses concise, no excessive markdown
- Use minimal emojis, max 2-3 per response
- When user asks to modify, only change what they ask`,
    };

    await streamGroqResponse(res, messages, systemMessage);
  } catch (err) {
    console.error("Workout chat error:", err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// WORKOUT LOG ENDPOINTS
app.post("/api/workout-logs", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { plan_id, workout_type, recovery_score, exercises, notes } = req.body;

  const result = await pool.query(
    `INSERT INTO workout_logs (user_id, plan_id, workout_type, recovery_score, exercises, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [
      req.session.userId,
      plan_id ?? null,
      workout_type,
      recovery_score ?? null,
      JSON.stringify(exercises),
      notes ?? null,
    ]
  );
  res.json(result.rows[0]);
});

app.get("/api/workout-logs", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const result = await pool.query(
    `SELECT id, workout_type, date, recovery_score, exercises, notes, created_at
     FROM workout_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.session.userId]
  );
  res.json(result.rows);
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
    `UPDATE users SET
      age = $1,
      weight_kg = $2,
      height_cm = $3
      ${name ? ", name = $4" : ""}
     WHERE id = ${name ? "$5" : "$4"}`,
    name
      ? [age, weight_kg, height_cm, name, req.session.userId]
      : [age, weight_kg, height_cm, req.session.userId]
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

//Get today's plan (if any)
app.get("/api/plans/today", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const result = await pool.query(
    `SELECT id, workout_type, messages, recovery_score, hrv, resting_hr, created_at
     FROM plans
     WHERE user_id = $1
     AND created_at >= CURRENT_DATE
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.session.userId]
  );

  if (result.rows.length === 0) {
    return res.json(null);
  }

  res.json(result.rows[0]);
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

///MEAL PLAN
// Save meal plan
app.post("/api/meal-plans", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { messages } = req.body;

  const result = await pool.query(
    `INSERT INTO meal_plans (user_id, messages) VALUES ($1, $2) RETURNING id, created_at`,
    [req.session.userId, JSON.stringify(messages)]
  );
  res.json(result.rows[0]);
});

// Get today's meal plan
app.get("/api/meal-plans/today", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const result = await pool.query(
    `SELECT id, messages, created_at FROM meal_plans
     WHERE user_id = $1 AND created_at >= CURRENT_DATE
     ORDER BY created_at DESC LIMIT 1`,
    [req.session.userId]
  );

  res.json(result.rows.length === 0 ? null : result.rows[0]);
});

// Update meal plan messages
app.put("/api/meal-plans/:id", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { messages } = req.body;
  await pool.query(
    `UPDATE meal_plans SET messages = $1 WHERE id = $2 AND user_id = $3`,
    [JSON.stringify(messages), req.params.id, req.session.userId]
  );
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
