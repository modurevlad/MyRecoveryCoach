import { useState } from "react";

const goals = [
  {
    value: "bulk",
    label: "💪 Bulk",
    description: "Build muscle and gain weight",
  },
  {
    value: "lose_weight",
    label: "🔥 Lose Weight",
    description: "Burn fat and lose weight",
  },
  {
    value: "maintain",
    label: "⚖️ Maintain",
    description: "Stay at current weight",
  },
];

export default function GoalSelection({ onGoalSet }) {
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setIsLoading(true);
    await fetch("/api/goal", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: selected }),
    });
    setIsLoading(false);
    onGoalSet(selected);
  };

  return (
    <div className="goal-page">
      <h2 className="goal-heading">What is your goal?</h2>
      <div className="goal-grid">
        {goals.map((g) => (
          <div
            key={g.value}
            className={`goal-card${selected === g.value ? " selected" : ""}`}
            onClick={() => setSelected(g.value)}
          >
            <span className="goal-card-label">{g.label}</span>
            <span className="goal-card-desc">{g.description}</span>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={handleSubmit}
        disabled={!selected || isLoading}
      >
        {isLoading ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}
