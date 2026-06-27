import { useState } from "react";

export default function TrainerLogin({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    const endpoint =
      mode === "login" ? "/auth/trainer/login" : "/auth/trainer/register";
    const body =
      mode === "login"
        ? { email: form.email, password: form.password }
        : { email: form.email, name: form.name, password: form.password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      onAuthenticated(data);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h1 className="app-title">MyRecoveryCoach</h1>
      <p className="login-tagline">Trainer Portal</p>

      <div className="profile-form trainer-form-narrow">
        {mode === "register" && (
          <div className="form-field">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
            />
          </div>
        )}

        <div className="form-field">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn" onClick={handleSubmit} disabled={loading}>
          {loading ? "Loading..." : mode === "login" ? "Login" : "Register"}
        </button>

        <p className="trainer-login-toggle">
          {mode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}{" "}
          <span
            className="trainer-login-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Register" : "Login"}
          </span>
        </p>
      </div>
    </div>
  );
}
