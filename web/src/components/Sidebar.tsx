import { Building2, LayoutDashboard, LogOut, Menu, Shield, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken } from "../api/client";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clients", icon: Building2, label: "Clients" },
];

export default function Sidebar() {
  const location = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    setToken(null);
    nav("/login", { replace: true });
  }

  const sidebarContent = (
    <aside className="flex h-full w-60 flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b px-5 py-5" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.25)" }}
        >
          <Shield className="h-5 w-5" style={{ color: "#00ff41" }} />
        </div>
        <div>
          <span
            className="cursor-blink text-sm font-semibold tracking-wide"
            style={{ fontFamily: '"Orbitron", sans-serif', color: "#00ff41" }}
          >
            CloudGuard
          </span>
          <p className="text-[10px]" style={{ color: "rgba(0,255,65,0.5)", fontFamily: '"JetBrains Mono", monospace' }}>
            Azure CSPM
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV.map(({ to, icon: Icon, label }) => {
          const active =
            location.pathname === to ||
            (to !== "/dashboard" && location.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150"
              style={
                active
                  ? {
                      background: "rgba(0,255,65,0.08)",
                      color: "#00ff41",
                      fontFamily: '"Orbitron", sans-serif',
                      letterSpacing: "1px",
                    }
                  : {
                      color: "#7a7a8a",
                      fontFamily: '"Orbitron", sans-serif',
                      letterSpacing: "1px",
                    }
              }
            >
              {/* Active left-border accent */}
              {active && (
                <span
                  className="absolute inset-y-0 left-0 rounded-l-lg"
                  style={{ width: "3px", background: "#00ff41", boxShadow: "0 0 8px rgba(0,255,65,0.6)" }}
                />
              )}
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? "#00ff41" : "#4a4a5a" }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* System status indicator */}
      <div className="mx-2 mb-3 rounded-lg px-3 py-2" style={{ background: "rgba(0,255,65,0.04)", border: "1px solid rgba(0,255,65,0.08)" }}>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-matrix animate-pulse" style={{ boxShadow: "0 0 6px #00ff41" }} />
          <span className="text-[10px]" style={{ color: "rgba(0,255,65,0.6)", fontFamily: '"JetBrains Mono", monospace' }}>
            SYSTEMS NOMINAL
          </span>
        </div>
      </div>

      {/* Logout */}
      <div className="border-t px-2 py-4" style={{ borderColor: "rgba(0,255,65,0.08)" }}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-all duration-150"
          style={{ fontFamily: '"Orbitron", sans-serif', letterSpacing: "1px", color: "#4a4a5a" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,0,60,0.08)";
            e.currentTarget.style.color = "#ff003c";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#4a4a5a";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="glass fixed inset-y-0 left-0 z-40 hidden md:flex"
        style={{ width: "240px", borderRight: "1px solid rgba(0,255,65,0.1)" }}
      >
        {sidebarContent}
      </div>

      {/* Mobile hamburger button */}
      <button
        type="button"
        className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg md:hidden"
        style={{
          background: "rgba(18,18,26,0.95)",
          border: "1px solid rgba(0,255,65,0.25)",
          color: "#00ff41",
        }}
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="mobile-nav-overlay md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`glass fixed inset-y-0 left-0 z-50 flex w-60 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ borderRight: "1px solid rgba(0,255,65,0.1)" }}
      >
        <div className="relative flex h-full w-full flex-col">
          {/* Close button */}
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg p-1.5"
            style={{ color: "#4a4a5a" }}
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
