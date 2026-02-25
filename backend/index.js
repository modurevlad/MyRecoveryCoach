import express from "express";
import axios from "axios";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory token for quick prototyping (best practice later: store in DB per user)
let currentAccessToken = null;

// Helper to fail fast if env vars are missing
function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const WHOOP_CLIENT_ID = () => mustEnv("WHOOP_CLIENT_ID");
const WHOOP_CLIENT_SECRET = () => mustEnv("WHOOP_CLIENT_SECRET");
const WHOOP_REDIRECT_URI = () => mustEnv("WHOOP_REDIRECT_URI");

// Home page
app.get("/", (req, res) => {
  res.send(`
    <h2>WHOOP OAuth Starter</h2>
    <p><a href="/auth/whoop">Connect WHOOP</a></p>
    <p><a href="/dashboard">Dashboard</a> (shows data after you connect)</p>
  `);
});

// 1) Start OAuth flow
app.get("/auth/whoop", (req, res) => {
  // Later: generate per-session and validate on callback
  const state = "devstate123";

  // Scopes you already have enabled
  const scope = "read:recovery read:sleep read:workout";

  const authorizeUrl =
    `https://api.prod.whoop.com/oauth/oauth2/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(WHOOP_CLIENT_ID())}` +
    `&redirect_uri=${encodeURIComponent(WHOOP_REDIRECT_URI())}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  res.redirect(authorizeUrl);
});

// 2) OAuth callback: exchange code for tokens
app.get("/auth/whoop/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send("Missing ?code in callback URL");

  try {
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

    const tokens = tokenRes.data;

    // Store access token in memory (prototype only)
    currentAccessToken = tokens.access_token;

    console.log("WHOOP TOKENS:", {
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      scope: tokens.scope,
      has_access_token: Boolean(tokens.access_token),
      has_refresh_token: Boolean(tokens.refresh_token),
    });

    // Redirect to dashboard (no token in URL)
    return res.redirect("/dashboard");
  } catch (err) {
    const data = err?.response?.data;
    const status = err?.response?.status;
    console.error("Token exchange failed:", status, data || err.message);

    res.status(500).send(`
      <h2>Token exchange failed</h2>
      <pre>${escapeHtml(
        JSON.stringify({ status, data: data || err.message }, null, 2)
      )}</pre>
    `);
  }
});

// Dashboard: fetch & display WHOOP data using the stored token
app.get("/dashboard", async (req, res) => {
  if (!currentAccessToken) {
    return res.send(`
      <h2>WHOOP Dashboard</h2>
      <p>No token yet. <a href="/auth/whoop">Connect WHOOP</a></p>
    `);
  }

  try {
    const headers = { Authorization: `Bearer ${currentAccessToken}` };

    // v2 endpoints that match your scopes
    const [recoveryRes, sleepRes, workoutRes] = await Promise.all([
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

    res.send(`
      <h2>WHOOP Dashboard</h2>
      <p><a href="/auth/whoop">Reconnect WHOOP</a></p>

      <h3>Latest Recovery</h3>
      <pre>${escapeHtml(JSON.stringify(recoveryRes.data, null, 2))}</pre>

      <h3>Latest Sleep</h3>
      <pre>${escapeHtml(JSON.stringify(sleepRes.data, null, 2))}</pre>

      <h3>Recent Workouts</h3>
      <pre>${escapeHtml(JSON.stringify(workoutRes.data, null, 2))}</pre>
    `);
  } catch (err) {
    res.status(err?.response?.status || 500).send(
      `<h2>WHOOP API Error</h2>
<pre>${escapeHtml(
        JSON.stringify(
          {
            status: err?.response?.status,
            data: err?.response?.data || err.message,
          },
          null,
          2
        )
      )}</pre>`
    );
  }
});

app.listen(PORT, () => {
  console.log(`Local server: http://localhost:${PORT}`);
  console.log(`Start OAuth:   http://localhost:${PORT}/auth/whoop`);
  console.log(`Dashboard:     http://localhost:${PORT}/dashboard`);
});

// tiny helper for safe HTML rendering
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
