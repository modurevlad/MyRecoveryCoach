function scoreColor(score, thresholds) {
  if (score == null) return "";
  if (score >= thresholds.green) return "score-green";
  if (score >= thresholds.yellow) return "score-yellow";
  return "score-red";
}

export default function StatCard({ title, stats }) {
  return (
    <div className="recovery-card">
      <h2 className="recovery-title">{title}</h2>
      <div className="recovery-stats">
        {stats.map((stat, i) => (
          <div key={i} className="stat">
            <span className="stat-label">{stat.label}</span>
            <span
              className={`stat-value ${
                stat.colorThresholds
                  ? scoreColor(stat.value, stat.colorThresholds)
                  : ""
              } ${stat.isDate ? "stat-date" : ""}`}
            >
              {stat.value ?? "N/A"}
              {stat.unit && stat.value != null && (
                <span className="stat-unit">{stat.unit}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
