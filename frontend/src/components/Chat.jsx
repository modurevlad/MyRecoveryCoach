import { useState, useRef, useEffect } from "react";

const WORKOUT_TYPES = [
  { value: "Push (chest, shoulders, triceps)", label: "Push 💪" },
  { value: "Pull (back, biceps)", label: "Pull 🏋️" },
  { value: "Legs", label: "Legs 🦵" },
  { value: "Cardio", label: "Cardio 🏃" },
];

export default function Chat({ recoveryData }) {
  const [workoutType, setWorkoutType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pastPlans, setPastPlans] = useState([]);
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [showPastPlans, setShowPastPlans] = useState(false);
  const bottomRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/plans", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setPastPlans(data));
  }, []);

  // Manual save triggered by user
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
    fetch("/api/plans", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPastPlans(d));
  };
  const deletePlan = async (e, planId) => {
    e.stopPropagation(); // prevent opening the plan
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

  const startChat = async (type) => {
    setWorkoutType(type);
    setCurrentPlanId(null);
    setLoading(true);

    const firstMessage = {
      role: "user",
      content: `I want to do a ${type} workout today. Give me a plan.`,
    };
    setMessages([firstMessage]);

    try {
      const res = await fetch("/api/chat", {
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

  const loadPlan = (plan) => {
    setWorkoutType(plan.workout_type);
    setMessages(plan.messages);
    setCurrentPlanId(plan.id);
    setShowPastPlans(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
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

      // Update saved plan if already saved
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
        ...updatedMessages,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!workoutType) {
    return (
      <div className="plan-section">
        <h2 className="plan-section-title">📋 Today&apos;s Plan</h2>
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
            <button
              className="past-plans-toggle"
              onClick={() => setShowPastPlans(!showPastPlans)}
            >
              {showPastPlans ? "Hide" : "View"} past plans ({pastPlans.length})
            </button>

            {showPastPlans && (
              <div className="past-plans-list">
                {pastPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="past-plan-card"
                    onClick={() => editingId !== plan.id && loadPlan(plan)}
                  >
                    <div className="past-plan-info">
                      {editingId === plan.id ? (
                        <input
                          className="past-plan-rename-input"
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(e, plan.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <strong>{plan.name || plan.workout_type}</strong>
                      )}
                      {plan.recovery_score && (
                        <small className="past-plan-stats">
                          Recovery: {plan.recovery_score}% · HRV:{" "}
                          {Math.round(plan.hrv)}ms
                        </small>
                      )}
                      <small className="past-plan-date">
                        {new Date(plan.created_at).toLocaleDateString()}
                      </small>
                    </div>

                    <div
                      className="past-plan-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editingId === plan.id ? (
                        <button
                          className="plan-action-btn plan-action-save"
                          onClick={(e) => saveRename(e, plan.id)}
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          className="plan-action-btn plan-action-edit"
                          onClick={(e) => startRename(e, plan)}
                        >
                          ✏️
                        </button>
                      )}
                      <button
                        className="plan-action-btn plan-action-delete"
                        onClick={(e) => deletePlan(e, plan.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="plan-section">
      <div className="chat-header">
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setWorkoutType(null);
            setMessages([]);
            setCurrentPlanId(null);
          }}
        >
          ← Back
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
            placeholder="Ask to modify your plan..."
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
