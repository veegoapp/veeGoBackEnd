import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/api";

const REFRESH_BUFFER_SECONDS = 60;

function getJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function getAccessToken(): Promise<string | null> {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return null;

  const exp = getJwtExpiry(accessToken);
  const nowSec = Math.floor(Date.now() / 1000);

  if (exp !== null && exp - nowSec > REFRESH_BUFFER_SECONDS) {
    return accessToken;
  }

  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return accessToken;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("userProfile");
          return null;
        }
        const data = await res.json();
        localStorage.setItem("accessToken", data.accessToken);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
        return data.accessToken as string;
      } catch {
        return accessToken;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

setAuthTokenGetter(getAccessToken);

createRoot(document.getElementById("root")!).render(<App />);
