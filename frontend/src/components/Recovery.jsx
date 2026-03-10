import StatCard from "./StatCard";

export default function Recovery({ data: recovery }) {
  if (!recovery) return <div className="loading">Loading recovery data...</div>;

  const date = recovery.created_at
    ? new Date(recovery.created_at).toLocaleDateString("en-RO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <StatCard
      title="❤️‍🩹 Recovery"
      stats={[
        {
          label: "Score",
          value: recovery.score?.recovery_score,
          unit: "%",
          colorThresholds: { green: 67, yellow: 34 },
        },
        {
          label: "HRV",
          value:
            recovery.score?.hrv_rmssd_milli != null
              ? Math.round(recovery.score.hrv_rmssd_milli)
              : null,
          unit: "ms",
        },
        {
          label: "Resting HR",
          value: recovery.score?.resting_heart_rate,
          unit: "bpm",
        },
        { label: "Date", value: date, isDate: true },
      ]}
    />
  );
}
