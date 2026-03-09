import { useEffect, useState } from "react";
import GoalSelection from "./components/GoalSelection";
import ProfileSetup from "./components/ProfileSetup";
import Recovery from "./components/Recovery";
import Chat from "./components/Chat";
import "./App.css";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [goal, setGoal] = useState(null);
  const [recoveryData, setRecoveryData] = useState(null);

  useEffect(() => {
    fetch("/api/status", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
        if (!data.authenticated) setProfileLoading(false);
        if (data.reason === "token_expired") {
          alert("Your session has expired. Please login again.");
        }
      });
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    // Fetch profile
    fetch("/api/profile", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setGoal(data.goal ?? null);
        setProfile(data.age ? data : null);
        setProfileLoading(false);
      });

    // Fetch recovery
    fetch("/api/recovery", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setRecoveryData(data.records?.[0] ?? null));
  }, [authenticated]);

  // 1. Still checking auth status
  if (authenticated === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading…
      </div>
    );
  }

  // 2. Not authenticated
  if (!authenticated) {
    return (
      <div className="login-page">
        <h1 className="app-title">MyRecoveryCoach</h1>
        <p className="login-tagline">
          Connect your WHOOP to get personalized meal and workout plans.
        </p>
        <a href="http://localhost:3001/auth/whoop">
          <button className="btn">Login with WHOOP</button>
        </a>
      </div>
    );
  }

  // 3. Authenticated but profile still loading
  if (profileLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading…
      </div>
    );
  }

  // 4. Profile incomplete
  if (!profile) {
    return (
      <ProfileSetup
        onComplete={(p) => {
          setProfile(p);
          setProfileLoading(false);
        }}
      />
    );
  }

  // 5. Goal not set
  if (!goal) {
    return <GoalSelection onGoalSet={setGoal} />;
  }

  // 6. Dashboard
  return (
    <div className="app">
      <div className="dashboard-header">
        <h1 className="app-title">MyRecoveryCoach</h1>
        <span className="goal-badge">🎯 {goal}</span>
      </div>
      <p className="welcome-text">
        Welcome back, {profile.name || "athlete"}! 👋
      </p>
      <Recovery data={recoveryData} />
      <Chat profile={profile} goal={goal} recoveryData={recoveryData} />
    </div>
  );
}
