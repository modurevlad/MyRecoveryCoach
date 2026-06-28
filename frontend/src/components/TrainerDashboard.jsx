import { useState, useEffect, useRef } from "react";

export default function TrainerDashboard({ trainer, onLogout }) {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [athleteData, setAthleteData] = useState({});
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedAthlete) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [selectedAthlete]);

  useEffect(() => {
    fetch("/trainer/athletes", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAthletes(d));
  }, []);

  const selectAthlete = async (athlete) => {
    setSelectedAthlete(athlete);
    setMessages([]);

    const [recoveryRes, sleepRes] = await Promise.all([
      fetch(`/trainer/athletes/${athlete.id}/recovery`, {
        credentials: "include",
      }).then((r) => r.json()),
      fetch(`/trainer/athletes/${athlete.id}/sleep`, {
        credentials: "include",
      }).then((r) => r.json()),
    ]);

    setAthleteData({
      recovery: recoveryRes.records?.[0] ?? null,
      sleep: sleepRes.records?.[0] ?? null,
    });
  };

  const addAthlete = async () => {
    setAddLoading(true);
    setAddError(null);
    const res = await fetch("/trainer/athletes/add", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error);
      setAddLoading(false);
      return;
    }
    setAthletes((prev) => [...prev, data.athlete]);
    setAddEmail("");
    setAddLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const res = await fetch(`/trainer/athletes/${selectedAthlete.id}/chat`, {
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
            console.log("Error streaming");
          }
        }
      }
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const recovery = athleteData.recovery;
  const sleep = athleteData.sleep;

  return (
    <div className="app">
      <div className="dashboard-header">
        <h1 className="app-title">MyRecoveryCoach</h1>
        <div className="trainer-header-actions">
          <span className="goal-badge">Trainer</span>
          <button className="btn btn-outline btn-sm" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      <p className="welcome-text">Welcome, {trainer.name}!</p>

      <div className="trainer-layout">
        <div className="trainer-sidebar">
          <div className="plan-section">
            <h2 className="plan-section-title">Athletes</h2>

            <div className="trainer-add-row">
              <input
                className="form-input trainer-add-input"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="athlete@email.com"
              />
              <button
                className="btn btn-sm"
                onClick={addAthlete}
                disabled={addLoading || !addEmail.trim()}
              >
                Add
              </button>
            </div>
            {addError && <p className="form-error">{addError}</p>}

            <div className="trainer-athletes-list">
              {athletes.map((a) => (
                <div
                  key={a.id}
                  className={`past-plan-card ${
                    selectedAthlete?.id === a.id ? "selected" : ""
                  }`}
                  onClick={() => selectAthlete(a)}
                >
                  <div>
                    <strong>{a.name}</strong>
                    <small className="trainer-athlete-email">{a.email}</small>
                  </div>
                </div>
              ))}
              {athletes.length === 0 && (
                <p className="trainer-empty-msg">
                  No athletes yet. Add one above.
                </p>
              )}
            </div>
          </div>
        </div>
        {selectedAthlete ? (
          <div className="trainer-main">
            <div className="plan-section trainer-athlete-stats-section">
              <h2 className="plan-section-title">{selectedAthlete.name}</h2>

              <div className="trainer-metrics-grid">
                <div className="trainer-metric-card">
                  <p className="trainer-metric-label">RECOVERY</p>
                  <p
                    className={`trainer-metric-value ${
                      recovery?.score?.recovery_score >= 67
                        ? "score-green"
                        : recovery?.score?.recovery_score >= 34
                        ? "score-yellow"
                        : "score-red"
                    }`}
                  >
                    {recovery?.score?.recovery_score ?? "N/A"}%
                  </p>
                </div>
                <div className="trainer-metric-card">
                  <p className="trainer-metric-label">HRV</p>
                  <p className="trainer-metric-value">
                    {recovery?.score?.hrv_rmssd_milli
                      ? Math.round(recovery.score.hrv_rmssd_milli)
                      : "N/A"}{" "}
                    ms
                  </p>
                </div>
                <div className="trainer-metric-card">
                  <p className="trainer-metric-label">RESTING HR</p>
                  <p className="trainer-metric-value">
                    {recovery?.score?.resting_heart_rate ?? "N/A"} bpm
                  </p>
                </div>
                <div className="trainer-metric-card">
                  <p className="trainer-metric-label">SLEEP</p>
                  <p
                    className={`trainer-metric-value ${
                      sleep?.score?.sleep_performance_percentage >= 85
                        ? "score-green"
                        : sleep?.score?.sleep_performance_percentage >= 70
                        ? "score-yellow"
                        : "score-red"
                    }`}
                  >
                    {sleep?.score?.sleep_performance_percentage ?? "N/A"}%
                  </p>
                </div>
              </div>
            </div>

            <div className="plan-section">
              <h2 className="plan-section-title">
                AI Chat for {selectedAthlete.name}
              </h2>
              <div className="chat-container">
                <div className="chat-messages">
                  {messages.map((msg, i) => (
                    <div key={i} className={`chat-bubble ${msg.role}`}>
                      {msg.role === "assistant" ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: msg.content }}
                        />
                      ) : (
                        msg.content
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="chat-bubble thinking">Thinking...</div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="chat-input-bar">
                  <textarea
                    className="chat-textarea"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Plan a workout for ${selectedAthlete.name}...`}
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
            </div>
          </div>
        ) : (
          <div className="trainer-no-athlete">
            <p className="trainer-empty-msg">
              Select an athlete to view their data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
