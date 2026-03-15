import StatCard from "./StatCard";

export default function Recovery({ data: recovery }) {
  if (!recovery) return <div className="loading">Loading recovery data...</div>;

  return (
    <StatCard
      title="Recovery"
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
        {
          label: "Blood oxygen (SpO2)",
          value: Math.round(recovery.score?.spo2_percentage),
          unit: "%",
          colorThresholds: { green: 90, yellow: 89 },
        },
      ]}
    />
  );
}
