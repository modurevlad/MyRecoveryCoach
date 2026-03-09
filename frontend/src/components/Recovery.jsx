import { useEffect, useState } from "react";

function scoreColor(score) {
  if (score == null) return "";
  if (score >= 67) return "score-green";
  if (score >= 34) return "score-yellow";
  return "score-red";
}

export default function Recovery() {
  const [recovery, setRecovery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/recovery", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch recovery data");
        return res.json();
      })
      .then((data) => {
        setRecovery(data.records?.[0] ?? data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading recovery data…
      </div>
    );
  }
  if (error) return <div className="error-msg">{error}</div>;
  if (!recovery)
    return <div className="empty-msg">No recovery data found.</div>;

  const score = recovery.score?.recovery_score;
  const hrv = recovery.score?.hrv_rmssd_milli;
  const rhr = recovery.score?.resting_heart_rate;
  const date = recovery.created_at?.slice(0, 10);

  return (
    <div className="recovery-card">
      <h2 className="recovery-title">❤️‍🩹 Recovery</h2>
      <div className="recovery-stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className={`stat-value ${scoreColor(score)}`}>
            {score ?? "N/A"}
            {score != null && <span className="stat-unit">%</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">HRV</span>
          <span className="stat-value">
            {hrv != null ? Math.round(hrv) : "N/A"}
            {hrv != null && <span className="stat-unit">ms</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Resting HR</span>
          <span className="stat-value">
            {rhr ?? "N/A"}
            {rhr != null && <span className="stat-unit">bpm</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Date</span>
          <span className="stat-value" style={{ fontSize: "1.1rem" }}>
            {date ?? "N/A"}
          </span>
        </div>
      </div>
    </div>
  );
}
