import { useEffect, useState } from "react";
import GoalSelection from "./components/GoalSelection";
import Recovery from "./components/Recovery";
import Chat from "./components/Chat";
import "./App.css";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [goal, setGoal] = useState(null);

  useEffect(() => {
    fetch("/api/status", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/goal", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setGoal(data.goal));
  }, [authenticated]);

  if (authenticated === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="login-page">
        <h1 className="app-title">MyRecoveryCoach</h1>
        <p className="login-tagline">
          Track your recovery, sleep & workouts — powered by WHOOP.
        </p>
        <a href="http://localhost:3001/auth/whoop">
          <button className="btn">Connect WHOOP</button>
        </a>
      </div>
    );
  }

  if (!goal) {
    return <GoalSelection onGoalSet={setGoal} />;
  }

  return (
    <div className="app">
      <div className="dashboard-header">
        <h1 className="app-title">MyRecoveryCoach</h1>
        <span className="goal-badge">🎯 Current goal: {goal}</span>
      </div>
      <Recovery />
      <Chat />
    </div>
  );
}
