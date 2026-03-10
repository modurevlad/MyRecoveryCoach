import { useState, useRef, useEffect } from "react";

const WORKOUT_TYPES = [
  { value: "Push (chest, shoulders, triceps)", label: "Push 💪" },
  { value: "Pull (back, biceps)", label: "Pull 🏋️" },
  { value: "Legs", label: "Legs 🦵" },
  { value: "Cardio", label: "Cardio 🏃" },
];

// view: "closed" | "selecting" | "viewing_past" | "chat"
export default function WorkoutChat({ recoveryData }) {
  const [view, setView] = useState("closed");
  const [workoutType, setWorkoutType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [todayPlan, setTodayPlan] = useState(null);
  const [pastPlans, setPastPlans] = useState([]);
  const [viewingPlan, setViewingPlan] = useState(null); // the past plan being previewed
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/plans", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPastPlans(d));

    fetch("/api/plans/today", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d) {
          setTodayPlan(d);
          setWorkoutType(d.workout_type);
          setMessages(d.messages);
          setCurrentPlanId(d.id);
        }
      });
  }, []);

  const startChat = async (type) => {
    setWorkoutType(type);
    setCurrentPlanId(null);
    setMessages([]);
    setView("chat");
    setLoading(true);

    const firstMessage = {
      role: "user",
      content: `I want to do a ${type} workout today. Give me a plan with specific exercises, sets, reps and weights.`,
    };
    setMessages([firstMessage]);

    try {
      const res = await fetch("/api/chat/workout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [firstMessage] }),
      });
      const data = await res.json();
      setMessages([firstMessage, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        firstMessage,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/workout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });
      const data = await res.json();
      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", content: data.reply },
      ];
      setMessages(finalMessages);

      if (currentPlanId) {
        await fetch(`/api/plans/${currentPlanId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMessages }),
        });
      }
    } catch {
      setMessages([
        ...messages,
        { role: "assistant", content: "Something went wrong." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    if (currentPlanId) return;
    const res = await fetch("/api/plans", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workout_type: workoutType,
        messages,
        recovery_score: recoveryData?.score?.recovery_score ?? null,
        hrv: recoveryData?.score?.hrv_rmssd_milli ?? null,
        resting_hr: recoveryData?.score?.resting_heart_rate ?? null,
        sleep_performance: null,
      }),
    });
    const data = await res.json();
    setCurrentPlanId(data.id);
    setTodayPlan({ id: data.id, workout_type: workoutType, messages });
    fetch("/api/plans", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPastPlans(d));
  };

  const commitPastPlan = () => {
    // Set the viewed past plan as today's active plan
    setWorkoutType(viewingPlan.workout_type);
    setMessages(viewingPlan.messages);
    setCurrentPlanId(viewingPlan.id);
    setTodayPlan(viewingPlan);
    setViewingPlan(null);
    setView("chat");
  };

  const deletePlan = async (e, planId) => {
    e.stopPropagation();
    await fetch(`/api/plans/${planId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setPastPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  const startRename = (e, plan) => {
    e.stopPropagation();
    setEditingId(plan.id);
    setEditingName(plan.name || plan.workout_type);
  };

  const saveRename = async (e, planId) => {
    e.stopPropagation();
    await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName }),
    });
    setPastPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, name: editingName } : p))
    );
    setEditingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── CLOSED ──────────────────────────────────────────────
  if (view === "closed") {
    return (
      <div className="plan-section">
        <h2 className="plan-section-title">💪 Today's Workout</h2>
        {todayPlan ? (
          <>
            <p className="plan-prompt">
              You have a plan for today:{" "}
              <strong>{todayPlan.workout_type}</strong>
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn" onClick={() => setView("chat")}>
                View Today's Plan
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setView("selecting")}
              >
                Start New
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="plan-prompt">
              Ready to train? Pick your workout type to get started.
            </p>
            <button className="btn" onClick={() => setView("selecting")}>
              Plan Today's Workout
            </button>
          </>
        )}
      </div>
    );
  }

  // ── SELECTING ────────────────────────────────────────────
  if (view === "selecting") {
    return (
      <div className="plan-section">
        <div className="chat-header">
          <h2 className="plan-section-title">💪 Today's Workout</h2>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setView("closed")}
          >
            Cancel
          </button>
        </div>
        <p className="plan-prompt">What are you training today?</p>
        <div className="workout-type-grid">
          {WORKOUT_TYPES.map((w) => (
            <button
              key={w.value}
              className="workout-type-btn"
              onClick={() => startChat(w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>

        {pastPlans.length > 0 && (
          <div className="past-plans">
            <p style={{ fontWeight: 600, marginBottom: "8px" }}>Past Plans</p>
            <div className="past-plans-list">
              {pastPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="past-plan-card"
                  onClick={() => {
                    if (editingId !== plan.id) {
                      setViewingPlan(plan);
                      setView("viewing_past");
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {editingId === plan.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(e, plan.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                          width: "100%",
                        }}
                      />
                    ) : (
                      <strong>{plan.name || plan.workout_type}</strong>
                    )}
                    {plan.recovery_score && (
                      <small style={{ display: "block", color: "#666" }}>
                        Recovery: {plan.recovery_score}% · HRV:{" "}
                        {Math.round(plan.hrv)}ms
                      </small>
                    )}
                    <small className="past-plan-date">
                      {new Date(plan.created_at).toLocaleDateString()}
                    </small>
                  </div>
                  <div
                    style={{ display: "flex", gap: "6px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {editingId === plan.id ? (
                      <button
                        onClick={(e) => saveRename(e, plan.id)}
                        style={{
                          padding: "4px 8px",
                          background: "#22c55e",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        onClick={(e) => startRename(e, plan)}
                        style={{
                          padding: "4px 8px",
                          background: "#f3f4f6",
                          border: "1px solid #ddd",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      onClick={(e) => deletePlan(e, plan.id)}
                      style={{
                        padding: "4px 8px",
                        background: "#fee2e2",
                        color: "#ef4444",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VIEWING PAST PLAN ────────────────────────────────────
  if (view === "viewing_past") {
    return (
      <div className="plan-section">
        <div className="chat-header">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setViewingPlan(null);
              setView("selecting");
            }}
          >
            ← Back
          </button>
          <span className="chat-workout-label">{viewingPlan.workout_type}</span>
          <button className="btn btn-save" onClick={commitPastPlan}>
            Commit to This Plan
          </button>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {viewingPlan.messages
              .filter((m, i) => !(i === 0 && m.role === "user"))
              .map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.role}`}>
                  {msg.content}
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  }

  // ── CHAT ─────────────────────────────────────────────────
  return (
    <div className="plan-section">
      <div className="chat-header">
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setView("closed")}
        >
          ✕ Close
        </button>
        <span className="chat-workout-label">{workoutType}</span>
        {currentPlanId ? (
          <span className="saved-badge">✓ Saved</span>
        ) : (
          <button
            onClick={savePlan}
            disabled={messages.length === 0 || loading}
            className="btn btn-save"
          >
            Save Plan
          </button>
        )}
      </div>
      <div className="chat-container">
        <div className="chat-messages">
          {messages
            .filter((m, i) => !(i === 0 && m.role === "user"))
            .map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.content}
              </div>
            ))}
          {loading && <div className="chat-bubble thinking">Thinking...</div>}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-bar">
          <textarea
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask to modify your workout..."
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
