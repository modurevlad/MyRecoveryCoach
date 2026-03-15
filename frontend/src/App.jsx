import { useEffect, useState } from "react";
import GoalSelection from "./components/GoalSelection";
import ProfileSetup from "./components/ProfileSetup";
import Recovery from "./components/Recovery";
import WorkoutChat from "./components/WorkoutChat";
import MealChat from "./components/MealChat";
import "./App.css";
import Sleep from "./components/Sleep";
import { Settings } from "lucide-react";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [goal, setGoal] = useState(null);
  const [recoveryData, setRecoveryData] = useState(null);
  const [sleepData, setSleepData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const goalLabels = {
    bulk: "Bulk",
    lose_weight: "Lose Weight",
    maintain: "Maintain",
  };

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

    // Fetch sleep
    fetch("/api/sleep", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setSleepData(data.records?.[0] ?? null));
  }, [authenticated]);

  //disable scrolling when settings modal is open
  useEffect(() => {
    if (showSettings) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  }, [showSettings]);

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
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="app-title">MyRecoveryCoach</h1>
          <p className="welcome-text">
            Welcome back, {profile.name || "athlete"}!
          </p>
        </div>
        <div className="header-right">
          <span className="goal-badge">
            Current plan: {goalLabels[goal] || goal}
          </span>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <Settings size={20} color="#9ca3af" />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button
                className="settings-close"
                onClick={() => setShowSettings(false)}
              >
                ✕
              </button>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">Goal</h3>
              <div className="settings-goal-grid">
                {[
                  { value: "bulk", label: "Bulk" },
                  { value: "lose_weight", label: "Lose Weight" },
                  { value: "maintain", label: "Maintain" },
                ].map((g) => (
                  <button
                    key={g.value}
                    className={`settings-goal-chip${
                      goal === g.value ? " active" : ""
                    }`}
                    onClick={async () => {
                      await fetch("/api/goal", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ goal: g.value }),
                      });
                      setGoal(g.value);
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">Profile</h3>
              <ProfileSetup
                existingProfile={profile}
                onComplete={(p) => {
                  setProfile(p);
                  setShowSettings(false);
                }}
                onCancel={() => setShowSettings(false)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <p className="biometrics-date">
          Biometrics for{" "}
          {recoveryData
            ? new Date(recoveryData.created_at).toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "today"}
        </p>
        <div className="stats-row">
          <Recovery data={recoveryData} />
          <Sleep data={sleepData} />
        </div>
        <div className="chats-row">
          <MealChat />
          <WorkoutChat recoveryData={recoveryData} />
        </div>
      </div>
    </div>
  );
}
