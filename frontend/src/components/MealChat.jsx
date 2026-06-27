import { useState, useRef, useEffect } from "react";

export default function MealChat() {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (started) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [started]);

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

    setIsLoading(true);
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
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
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
                ...prev.slice(0, -1),
                { role: "assistant", content: fullReply },
              ]);
            } catch {
              console.log("error streaming");
            }
          }
        }
      }
      setIsLoading(false);
    } catch {
      setMessages([
        {
          role: "assistant",
          content: "Failed to generate meal plan. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveMealPlan = async (msgs, planId) => {
    if (planId) {
      await fetch(`/api/meal-plans/${planId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
    } else {
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
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/meal", {
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

      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", content: fullReply },
      ];
      setMessages(finalMessages);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Something went wrong." },
      ]);
    } finally {
      setIsLoading(false);
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
        <h2 className="plan-section-title">Today's Meal Plan</h2>
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
        <h2 className="plan-section-title">Today's Meal Plan</h2>
        <p className="plan-prompt">You already have a meal plan for today.</p>
        <div className="meal-view-actions">
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
        <h2 className="plan-section-title">Today's Meal Plan</h2>
        <div className="chat-header-actions">
          {currentPlanId ? (
            <>
              <span className="saved-badge">✓ Saved</span>
              <button
                onClick={() => {
                  setCurrentPlanId(null);
                  setMessages([]);
                  setStarted(false);
                }}
                className="btn btn-danger btn-sm"
              >
                Discard
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="btn btn-save"
                disabled={messages.length === 0 || isLoading}
              >
                Save Plan
              </button>
              <button
                onClick={() => {
                  setMessages([]);
                  setStarted(false);
                }}
                className="btn btn-danger btn-sm"
              >
                Discard
              </button>
            </>
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
          {isLoading && (
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
            disabled={!input.trim() || isLoading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
