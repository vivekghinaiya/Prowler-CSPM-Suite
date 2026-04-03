import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import Aurora from "../components/Aurora";
import { useTheme } from "../context/ThemeContext";

export default function LoginPage() {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123!");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await apiFetch<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.access_token);
      nav("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Aurora />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-edge-soft bg-surface/80 p-8 shadow-xl backdrop-blur"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-content">Azure CloudGuard</h1>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-alt hover:text-content"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-sm text-content-muted">Sign in to manage clients and Azure security audits.</p>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-content-secondary">Email</label>
          <input
            className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none ring-emerald-500/40 focus:ring-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-content-secondary">Password</label>
          <input
            className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none ring-emerald-500/40 focus:ring-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
