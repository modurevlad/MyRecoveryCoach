function scoreColor(score) {
  if (score == null) return "";
  if (score >= 85) return "score-green";
  if (score >= 70) return "score-yellow";
  return "score-red";
}

export default function Sleep({ data: sleep }) {
  if (!sleep) return <div className="loading">Loading sleep data...</div>;

  const score = sleep.score?.sleep_performance_percentage;
  const consistency = sleep.score?.sleep_consistency_percentage;
  const sleepMs =
    sleep.score?.stage_summary.total_in_bed_time_milli -
    sleep.score?.stage_summary.total_awake_time_milli;

  const minutes = Math.floor(sleepMs / 60000) % 60;
  const hours = Math.floor(sleepMs / 3600000);

  const sleepDuration = `${hours}h ${minutes}m`;
  const efficiency = sleep.score?.sleep_efficiency_percentage;
  const date = sleep.created_at
    ? new Date(sleep.created_at).toLocaleDateString("en-RO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "N/A";
  return (
    <div className="recovery-card">
      <h2 className="recovery-title">😴 Sleep</h2>
      <div className="recovery-stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className={`stat-value ${scoreColor(score)}`}>
            {score ?? "N/A"}
            {score != null && <span className="stat-unit">%</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{sleepDuration}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Efficiency</span>
          <span className="stat-value">
            {efficiency != null ? Math.round(efficiency) : "N/A"}
            {efficiency != null && <span className="stat-unit">%</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Consistency</span>
          <span className="stat-value">
            {consistency ?? "N/A"}
            {consistency != null && <span className="stat-unit">%</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Date</span>
          <span className="stat-value stat-date">{date}</span>
        </div>
      </div>
    </div>
  );
}
