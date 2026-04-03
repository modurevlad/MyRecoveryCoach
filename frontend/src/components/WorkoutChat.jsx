import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, Check } from "lucide-react";
import ConfirmModal from "./ConfirmModal";
import { ChevronDown, ChevronUp } from "lucide-react";
import WorkoutLogger from "./WorkoutLogger";

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
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [todayPlan, setTodayPlan] = useState(null);
  const [pastPlans, setPastPlans] = useState([]);
  const [viewingPlan, setViewingPlan] = useState(null); // the past plan being previewed
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // plan id to delete
  const [isPastPlansOpen, setIsPastPlansOpen] = useState(false);
  const [planLog, setPlanLog] = useState(null);
  const [showingLog, setShowingLog] = useState(false);
  const bottomRef = useRef(null);
  const savedStateRef = useRef(null);
  const otherPlans = pastPlans.filter((plan) => plan.id !== todayPlan?.id);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Scroll to bottom when entering chat view
  useEffect(() => {
    if (view === "chat") {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [view]);

  useEffect(() => {
    fetch("/api/plans", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setPastPlans(data));

    fetch("/api/plans/today", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setTodayPlan(data);
          setWorkoutType(data.workout_type);
          setMessages(data.messages);
          setCurrentPlanId(data.id);
        }
      });
  }, []);

  const startChat = async (type) => {
    savedStateRef.current = { workoutType, messages, currentPlanId };

    setWorkoutType(type);
    setCurrentPlanId(null);
    setMessages([]);
    setView("chat");
    setIsLoading(true);

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

      ///streaming logic
      const reader = res.body.getReader(); // opens a reader on the stream
      const decoder = new TextDecoder(); // converts raw bytes to text
      let fullReply = "";

      setMessages([firstMessage, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const { token } = JSON.parse(line.slice(6));
              fullReply += token;
              setMessages((prev) => [
                ...prev.slice(0, -1), // keep all messages except last
                { role: "assistant", content: fullReply }, // replace last with updated content
              ]);
            } catch {
              console.log("Error while streaming");
            }
          }
        }
      }
      setIsLoading(false);
    } catch {
      setMessages([
        firstMessage,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/workout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      setMessages([...updatedMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const { token } = JSON.parse(line.slice(6));
              fullReply += token;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: fullReply },
              ]);
            } catch {
              console.log("Error while streaming");
            }
          }
        }
      }
      setIsLoading(false);

      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", content: fullReply },
      ];
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
      setIsLoading(false);
    }
  };

  const savePlan = async (msgsToSave) => {
    const msgs = msgsToSave || messages;
    if (currentPlanId) return;
    const res = await fetch("/api/plans", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workout_type: workoutType,
        messages: msgs,
        recovery_score: recoveryData?.score?.recovery_score ?? null,
        hrv: recoveryData?.score?.hrv_rmssd_milli ?? null,
        resting_hr: recoveryData?.score?.resting_heart_rate ?? null,
        sleep_performance: null,
      }),
    });
    const data = await res.json();
    setCurrentPlanId(data.id);
    setTodayPlan({ id: data.id, workout_type: workoutType, messages: msgs });
    fetch("/api/plans", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setPastPlans(data));
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

  const deletePlan = async (planId) => {
    await fetch(`/api/plans/${planId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setPastPlans((prev) => prev.filter((plan) => plan.id !== planId));
    setDeleteTarget(null);
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
      prev.map((plan) =>
        plan.id === planId ? { ...plan, name: editingName } : plan
      )
    );
    setEditingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Helper to extract exercise names from AI message
  function extractExercises(messages) {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(lastAssistant.content, "text/html");
    const names = doc.querySelectorAll(".ai-exercise-name");
    return Array.from(names).map((el) => el.textContent.trim());
  }

  //CLOSED
  if (view === "closed") {
    return (
      <div className="plan-section">
        <h2 className="plan-section-title">Today's Workout</h2>
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
        {pastPlans.filter((plan) => plan.id === todayPlan?.id).length > 0 && (
          <div className="past-plans">
            <p style={{ fontWeight: 600, marginBottom: "8px" }}>Today's Plan</p>
            <div className="past-plans-list">
              {pastPlans
                .filter((plan) => plan.id === todayPlan?.id)
                .map((plan) => (
                  <div
                    key={plan.id}
                    className="past-plan-card"
                    onClick={() => setView("chat")}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>{plan.name || plan.workout_type}</strong>
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
                  </div>
                ))}
            </div>
          </div>
        )}
        {otherPlans.length > 0 && (
          <div className="past-plans">
            <button
              type="button"
              className="past-plans-toggle"
              onClick={() => setIsPastPlansOpen((prev) => !prev)}
              aria-expanded={isPastPlansOpen}
            >
              <span style={{ fontWeight: 600 }}>Past Plans</span>
              <span>{isPastPlansOpen ? <ChevronUp /> : <ChevronDown />}</span>
            </button>
            <div
              className={`past-plans-drawer ${
                isPastPlansOpen ? "past-plans-drawer-open" : ""
              }`}
            >
              <div className="past-plans-list">
                {otherPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="past-plan-card"
                    onClick={() => {
                      if (editingId !== plan.id) {
                        setViewingPlan(plan);
                        setShowingLog(false);
                        setPlanLog(null);
                        fetch(`/api/workout-logs/plan/${plan.id}`, {
                          credentials: "include",
                        })
                          .then((r) => r.json())
                          .then((d) => setPlanLog(d));
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
                          className="icon-btn success"
                          onClick={(e) => saveRename(e, plan.id)}
                        >
                          <Check size={15} />
                        </button>
                      ) : (
                        <button
                          className="icon-btn"
                          onClick={(e) => startRename(e, plan)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        className="icon-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(plan.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {deleteTarget && (
          <ConfirmModal
            message="Are you sure you want to delete this plan?"
            onConfirm={() => deletePlan(deleteTarget)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </div>
    );
  }

  //SELECTING
  if (view === "selecting") {
    return (
      <div className="plan-section">
        <div className="chat-header">
          <h2 className="plan-section-title">Today's Workout</h2>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setView("closed")}
          >
            Cancel
          </button>
        </div>
        <p className="plan-prompt">What are you training today?</p>
        <div className="workout-type-grid">
          {WORKOUT_TYPES.map((workout) => (
            <button
              key={workout.value}
              className="workout-type-btn"
              onClick={() => startChat(workout.value)}
            >
              {workout.label}
            </button>
          ))}
        </div>
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
              setView("closed");
            }}
          >
            ← Back
          </button>
          <span className="chat-workout-label">{viewingPlan.workout_type}</span>
          <div className="past-plan-view-actions">
            {planLog && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowingLog(!showingLog)}
              >
                {showingLog ? "View Plan" : "View Logged Workout"}
              </button>
            )}
            <button className="btn btn-save" onClick={commitPastPlan}>
              Commit to This Plan
            </button>
          </div>
        </div>

        {showingLog && planLog ? (
          <div className="past-plan-logged-container">
            {planLog.recovery_score && (
              <p className="past-plan-logged-recovery">
                Recovery that day: {planLog.recovery_score}%
              </p>
            )}
            {planLog.exercises.map((ex, i) => (
              <div key={i} className="past-plan-exercise-log">
                <strong className="past-plan-exercise-name">{ex.name}</strong>
                {ex.sets.map((set, j) => (
                  <div key={j} className="past-plan-set-detail">
                    Set {j + 1}: {set.reps} reps @ {set.weight_kg}kg
                  </div>
                ))}
              </div>
            ))}
            {planLog.notes && (
              <p className="past-plan-logged-notes">
                <strong>Notes:</strong> {planLog.notes}
              </p>
            )}
          </div>
        ) : (
          <div className="chat-container">
            <div className="chat-messages">
              {viewingPlan.messages
                .filter((m, i) => !(i === 0 && m.role === "user"))
                .map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>
                    {msg.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                    ) : (
                      msg.content
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  //CHAT
  return (
    <div className="plan-section">
      <div className="chat-header">
        <h2 className="plan-section-title">Today's Workout</h2>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            if (!currentPlanId && savedStateRef.current) {
              setWorkoutType(savedStateRef.current.workoutType);
              setMessages(savedStateRef.current.messages);
              setCurrentPlanId(savedStateRef.current.currentPlanId);
              savedStateRef.current = null;
            }
            setView("closed");
          }}
        >
          ✕ Close
        </button>
        <span className="chat-workout-label">{workoutType}</span>
        {currentPlanId ? (
          <span className="saved-badge">✓ Saved</span>
        ) : (
          <button
            onClick={() => savePlan(messages)}
            disabled={messages.length === 0 || isLoading}
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
                {msg.role === "assistant" ? (
                  <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                ) : (
                  msg.content
                )}
              </div>
            ))}
          {isLoading && <div className="chat-bubble thinking">Thinking...</div>}
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
            disabled={!input.trim() || isLoading}
          >
            Send
          </button>
        </div>
      </div>
      {currentPlanId && !isLoading && (
        <WorkoutLogger
          workoutType={workoutType}
          planId={currentPlanId}
          recoveryScore={recoveryData?.score?.recovery_score}
          suggestedExercises={extractExercises(messages)}
          onSaved={() => console.log("workout logged")}
        />
      )}
    </div>
  );
}
