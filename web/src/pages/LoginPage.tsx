import { Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import Aurora from "../components/Aurora";

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
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-page p-6">
      <Aurora />
      <div className="relative w-full max-w-md">
        {/* Logo mark above form */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20 ring-1 ring-blue-500/30">
            <Shield className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Azure CloudGuard</h1>
          <p className="mt-1 text-sm text-content-muted">
            Cloud security posture management for Azure
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-edge-soft bg-surface/80 p-8 shadow-2xl backdrop-blur"
        >
          <div>
            <h2 className="text-base font-semibold text-content">Sign in to your account</h2>
          </div>

          {err && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {err}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-content-secondary">Email</label>
            <input
              className="w-full rounded-lg border border-edge bg-field px-3 py-2.5 text-sm text-content outline-none transition-colors ring-blue-500/40 focus:border-blue-500/60 focus:ring-2 placeholder-content-faint"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-content-secondary">Password</label>
            <input
              className="w-full rounded-lg border border-edge bg-field px-3 py-2.5 text-sm text-content outline-none transition-colors ring-blue-500/40 focus:border-blue-500/60 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
