import { useEffect, useState } from "react";
import GoalSelection from "./components/GoalSelection";
import ProfileSetup from "./components/ProfileSetup";
import Recovery from "./components/Recovery";
import WorkoutChat from "./components/WorkoutChat";
import MealChat from "./components/MealChat";
import "./App.css";
import Sleep from "./components/Sleep";
import { Settings } from "lucide-react";
import TrainerDashboard from "./components/TrainerDashboard";
import TrainerLogin from "./components/TrainerLogin";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [goal, setGoal] = useState(null);
  const [recoveryData, setRecoveryData] = useState(null);
  const [sleepData, setSleepData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [userType, setUserType] = useState(null);
  const [trainerData, setTrainerData] = useState(null);
  const [banner, setBanner] = useState(null);

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
          setBanner("Your session has expired. Please log in again.");
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

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const bannerEl = banner && (
    <div className="app-banner" role="alert">
      <span>{banner}</span>
      <button className="app-banner-close" onClick={() => setBanner(null)}>
        ✕
      </button>
    </div>
  );

  // 1. Still checking auth status
  if (authenticated === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading…
      </div>
    );
  }

  if (userType === "trainer" && !trainerData) {
    return <TrainerLogin onAuthenticated={(data) => setTrainerData(data)} />;
  }

  if (userType === "trainer" && trainerData) {
    return (
      <TrainerDashboard
        trainer={trainerData}
        onLogout={() => {
          fetch("/auth/trainer/logout", {
            method: "POST",
            credentials: "include",
          });
          setUserType(null);
          setTrainerData(null);
        }}
      />
    );
  }

  // 2. Not authenticated
  if (!authenticated) {
    return (
      <div className="login-page">
        {bannerEl}
        <h1 className="app-title">MyRecoveryCoach</h1>
        <p className="login-tagline">Who are you?</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <a href="http://localhost:3001/auth/whoop">
            <button className="btn">I'm an Athlete</button>
          </a>
          <button
            className="btn btn-outline"
            onClick={() => setUserType("trainer")}
          >
            I'm a Trainer
          </button>
        </div>
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
          <button
            className="btn btn-outline btn-sm"
            onClick={async () => {
              await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
              });
              setAuthenticated(false);
              setProfile(null);
              setGoal(null);
              setUserType(null);
            }}
          >
            Logout
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
