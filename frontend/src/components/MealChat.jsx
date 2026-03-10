import { useState, useRef, useEffect } from "react";

export default function MealChat() {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load today's meal plan on mount if it exists
  useEffect(() => {
    fetch("/api/meal-plans/today", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setMessages(data.messages);
          setCurrentPlanId(data.id);
        }
      });
  }, []);

  const generateMealPlan = async () => {
    setStarted(true);
    if (messages.length > 0) return;

    setLoading(true);
    const firstMessage = {
      role: "user",
      content: "Generate my meal plan for today.",
    };
    setMessages([firstMessage]);

    try {
      const res = await fetch("/api/chat/meal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [firstMessage] }),
      });
      const data = await res.json();
      setMessages([firstMessage, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        {
          role: "assistant",
          content: "Failed to generate meal plan. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const saveMealPlan = async (msgs, planId) => {
    if (planId) {
      // Update existing
      await fetch(`/api/meal-plans/${planId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
    } else {
      // Create new
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
      const data = await res.json();
      setCurrentPlanId(data.id);
      return data.id;
    }
  };

  const handleSave = async () => {
    await saveMealPlan(messages, currentPlanId);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/meal", {
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

      // Auto-update if already saved
      if (currentPlanId) {
        await saveMealPlan(finalMessages, currentPlanId);
      }
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Something went wrong." },
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

  if (!started && messages.length === 0) {
    return (
      <div className="plan-section">
        <h2 className="plan-section-title">🍽️ Today's Meal Plan</h2>
        <p className="plan-prompt">
          Get a personalized meal plan based on your recovery and goals.
        </p>
        <button className="btn" onClick={generateMealPlan}>
          Generate Meal Plan for Today
        </button>
      </div>
    );
  }

  if (!started && messages.length > 0) {
    return (
      <div className="plan-section">
        <h2 className="plan-section-title">🍽️ Today's Meal Plan</h2>
        <p className="plan-prompt">You already have a meal plan for today.</p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn" onClick={() => setStarted(true)}>
            View Meal Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-section">
      <div className="chat-header">
        <h2 className="plan-section-title">🍽️ Today's Meal Plan</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {currentPlanId ? (
            <span className="saved-badge">✓ Saved</span>
          ) : (
            <button
              onClick={handleSave}
              className="btn btn-save"
              disabled={messages.length === 0 || loading}
            >
              Save Plan
            </button>
          )}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setStarted(false)}
          >
            ✕ Close
          </button>
        </div>
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
          {loading && (
            <div className="chat-bubble thinking">
              Generating your meal plan...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-bar">
          <textarea
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask to modify your meal plan..."
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
