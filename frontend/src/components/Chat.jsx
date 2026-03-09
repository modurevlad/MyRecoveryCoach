import { useState, useRef, useEffect } from "react";

const WORKOUT_TYPES = [
  { value: "Push (chest, shoulders, triceps)", label: "Push 💪" },
  { value: "Pull (back, biceps)", label: "Pull 🏋️" },
  { value: "Legs", label: "Legs 🦵" },
  { value: "Cardio", label: "Cardio 🏃" },
];

export default function Chat() {
  const [workoutType, setWorkoutType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startChat = async (type) => {
    setWorkoutType(type);
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
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: data.reply },
      ]);
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

  // Step 1: Workout type selection
  if (!workoutType) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "16px" }}>
        <h2>Today's Plan</h2>
        <p>What are you training today?</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {WORKOUT_TYPES.map((w) => (
            <button
              key={w.value}
              onClick={() => startChat(w.value)}
              style={{
                padding: "12px 20px",
                border: "2px solid gray",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Chat
  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 0",
        }}
      >
        <button
          onClick={() => {
            setWorkoutType(null);
            setMessages([]);
          }}
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          ← Change workout
        </button>
        <strong>{workoutType}</strong>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "60vh",
          border: "1px solid #ddd",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {messages
            .filter((m) => m.role !== "user" || messages.indexOf(m) !== 0)
            .map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  background: msg.role === "user" ? "#3b82f6" : "#f3f4f6",
                  color: msg.role === "user" ? "white" : "black",
                  padding: "10px 14px",
                  borderRadius:
                    msg.role === "user"
                      ? "18px 18px 4px 18px"
                      : "18px 18px 18px 4px",
                  maxWidth: "80%",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                }}
              >
                {msg.content}
              </div>
            ))}
          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                background: "#f3f4f6",
                padding: "10px 14px",
                borderRadius: "18px 18px 18px 4px",
                color: "#666",
              }}
            >
              Thinking...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            padding: "12px",
            borderTop: "1px solid #ddd",
            gap: "8px",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask to modify your plan..."
            rows={1}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              resize: "none",
              fontSize: "14px",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              padding: "10px 20px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
