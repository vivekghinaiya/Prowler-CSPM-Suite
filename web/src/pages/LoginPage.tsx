import { Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123!");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.access_token);
      nav("/dashboard", { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hero-gradient relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Ambient green glow blobs */}
      <div
        className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, #00ff41 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-1/4 h-80 w-80 rounded-full opacity-8 blur-3xl"
        style={{ background: "radial-gradient(circle, #00d4ff 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo / title */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: "rgba(0,255,65,0.08)",
              border: "1px solid rgba(0,255,65,0.3)",
              boxShadow: "0 0 24px rgba(0,255,65,0.15)",
            }}
          >
            <Shield className="h-8 w-8" style={{ color: "#00ff41" }} />
          </div>
          <h1
            className="cursor-blink text-2xl font-black tracking-widest"
            style={{
              fontFamily: '"Orbitron", sans-serif',
              color: "#00ff41",
              textShadow: "0 0 20px rgba(0,255,65,0.4)",
            }}
          >
            CloudGuard
          </h1>
          <p className="mt-2 text-xs tracking-widest" style={{ color: "rgba(0,212,255,0.7)", fontFamily: '"Orbitron", sans-serif' }}>
            AZURE CSPM PLATFORM
          </p>
        </div>

        {/* Form card */}
        <div className="card-cyber p-7">
          <h2
            className="mb-5 text-xs font-semibold uppercase tracking-[3px]"
            style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
          >
            System Access
          </h2>

          {err && (
            <div
              className="mb-4 rounded-lg px-3 py-2.5 text-xs"
              style={{
                background: "rgba(255,0,60,0.08)",
                border: "1px solid rgba(255,0,60,0.3)",
                color: "#ff4060",
              }}
            >
              {err}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                className="block text-[10px] uppercase tracking-[2px]"
                style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
              >
                Identity
              </label>
              <input
                className="w-full rounded-lg px-3 py-2.5 text-xs text-content outline-none transition-all placeholder-content-faint"
                style={{
                  background: "rgba(20,20,30,0.8)",
                  border: "1px solid rgba(0,255,65,0.15)",
                  fontFamily: '"JetBrains Mono", monospace',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; e.currentTarget.style.boxShadow = "0 0 10px rgba(0,255,65,0.1)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; e.currentTarget.style.boxShadow = "none"; }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                placeholder="operator@domain.com"
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-[10px] uppercase tracking-[2px]"
                style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
              >
                Passphrase
              </label>
              <input
                className="w-full rounded-lg px-3 py-2.5 text-xs text-content outline-none transition-all"
                style={{
                  background: "rgba(20,20,30,0.8)",
                  border: "1px solid rgba(0,255,65,0.15)",
                  fontFamily: '"JetBrains Mono", monospace',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; e.currentTarget.style.boxShadow = "0 0 10px rgba(0,255,65,0.1)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; e.currentTarget.style.boxShadow = "none"; }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-cyber w-full py-3 mt-2"
            >
              {loading ? "AUTHENTICATING…" : "[ ACCESS SYSTEM ]"}
            </button>
          </form>
        </div>

        <p
          className="mt-5 text-center text-[10px]"
          style={{ color: "rgba(74,74,90,0.8)", fontFamily: '"JetBrains Mono", monospace' }}
        >
          Unauthorized access is prohibited · All sessions logged
        </p>
      </div>
    </div>
  );
}
