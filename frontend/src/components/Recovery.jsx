// frontend/src/components/Recovery.jsx
import { useEffect, useState } from "react";

export default function Recovery() {
  const [recovery, setRecovery] = useState(null);
  const [IsLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/recovery", { credentials: "include" }) // add credentials here
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch recovery data");
        return res.json();
      })
      .then((data) => {
        setRecovery(data.records?.[0] ?? data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (IsLoading) return <p>Loading recovery data...</p>;
  if (error) return <p>Error: {error}</p>;
  if (!recovery) return <p>No recovery data found.</p>;

  return (
    <div>
      <h2>Latest Recovery</h2>
      <p>
        <strong>Score:</strong> {recovery.score?.recovery_score ?? "N/A"}%
      </p>
      <p>
        <strong>HRV:</strong> {recovery.score?.hrv_rmssd_milli ?? "N/A"} ms
      </p>
      <p>
        <strong>Resting HR:</strong>{" "}
        {recovery.score?.resting_heart_rate ?? "N/A"} bpm
      </p>
      <p>
        <strong>Date:</strong> {recovery.created_at?.slice(0, 10) ?? "N/A"}
      </p>
    </div>
  );
}
