import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  const [health, setHealth] = useState({
    status: "checking",
    message: "Checking API connection..."
  });

  useEffect(() => {
    let ignore = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = await response.json();

        if (!ignore) {
          setHealth({
            status: data.ok ? "healthy" : "unhealthy",
            message: data.ok ? "API server is healthy" : "API server returned an unhealthy status",
            checkedAt: data.timestamp
          });
        }
      } catch (error) {
        if (!ignore) {
          setHealth({
            status: "offline",
            message: "API server is not reachable",
            detail: error.message
          });
        }
      }
    }

    checkHealth();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="intro">
        <p className="eyebrow">React App</p>
        <h1>Image Gen</h1>
        <p>Frontend scaffold is connected to the API health endpoint.</p>

        <div className={`status-panel status-panel--${health.status}`}>
          <div className="status-indicator" aria-hidden="true" />
          <div>
            <p className="status-label">Server status</p>
            <p className="status-message">{health.message}</p>
            {health.checkedAt ? (
              <p className="status-meta">Last checked {new Date(health.checkedAt).toLocaleString()}</p>
            ) : null}
            {health.detail ? <p className="status-meta">{health.detail}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
