import express from "express";
import axios from "axios";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

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
  `);
});

// 1) Start OAuth flow
app.get("/auth/whoop", (req, res) => {
  // Later you should generate and validate a random state per user/session
  const state = "devstate123";

  // Put scopes that your WHOOP dashboard supports / you selected.
  // If WHOOP rejects this, reduce to the exact scopes your app has enabled.
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
  const state = req.query.state;

  if (!code) {
    return res.status(400).send("Missing ?code in callback URL");
  }

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

    // Token payload typically includes: access_token, refresh_token, expires_in, token_type
    const tokens = tokenRes.data;

    console.log("WHOOP TOKENS:", tokens);

    res.send(`
      <h2>WHOOP OAuth Success</h2>
      <p>Tokens printed below (and also in your terminal):</p>
      <pre>${escapeHtml(JSON.stringify(tokens, null, 2))}</pre>
      <p><a href="/me?access_token=${encodeURIComponent(
        tokens.access_token
      )}">Test API call</a></p>
    `);
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

// 3) Test API call (temporary dev helper)
app.get("/me", async (req, res) => {
  const accessToken = req.query.access_token;
  if (!accessToken) return res.status(400).send("Missing access_token");

  try {
    // Example endpoint — adjust to a real WHOOP endpoint you have access to
    const apiRes = await axios.get(
      "https://api.prod.whoop.com/developer/v1/user/profile/basic",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.send(`<pre>${escapeHtml(JSON.stringify(apiRes.data, null, 2))}</pre>`);
  } catch (err) {
    const data = err?.response?.data;
    const status = err?.response?.status;
    res
      .status(500)
      .send(
        `<pre>${escapeHtml(JSON.stringify({ status, data }, null, 2))}</pre>`
      );
  }
});

app.listen(PORT, () => {
  console.log(`Local server: http://localhost:${PORT}`);
  console.log(`Start OAuth:   http://localhost:${PORT}/auth/whoop`);
});

// tiny helper for safe HTML rendering
function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
