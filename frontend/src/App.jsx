import { useEffect, useState } from "react";
import Recovery from "./components/Recovery";
import "./App.css";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated));
  }, []);

  if (authenticated === null) return <p>Loading...</p>;

  if (!authenticated) {
    return (
      <div>
        <h1>MyRecoveryCoach</h1>
        <a href="http://localhost:3001/auth/whoop">
          <button>Login with WHOOP</button>
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1>MyRecoveryCoach</h1>
      <Recovery />
    </div>
  );
}
