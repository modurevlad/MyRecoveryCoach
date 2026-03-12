import StatCard from "./StatCard";

export default function Sleep({ data: sleep }) {
  if (!sleep) return <div className="loading">Loading sleep data...</div>;

  const sleepMs =
    (sleep.score?.stage_summary?.total_in_bed_time_milli ?? 0) -
    (sleep.score?.stage_summary?.total_awake_time_milli ?? 0);
  const hours = Math.floor(sleepMs / 3600000);
  const minutes = Math.floor(sleepMs / 60000) % 60;

  return (
    <StatCard
      title="😴 Sleep"
      stats={[
        {
          label: "Score",
          value: sleep.score?.sleep_performance_percentage,
          unit: "%",
          colorThresholds: { green: 85, yellow: 70 },
        },
        { label: "Duration", value: `${hours}h ${minutes}m` },
        {
          label: "Efficiency",
          value:
            sleep.score?.sleep_efficiency_percentage != null
              ? Math.round(sleep.score.sleep_efficiency_percentage)
              : null,
          unit: "%",
          colorThresholds: { green: 85, yellow: 70 },
        },
        {
          label: "Consistency",
          value: sleep.score?.sleep_consistency_percentage,
          unit: "%",
          colorThresholds: { green: 90, yellow: 70 },
        },
      ]}
    />
  );
}
