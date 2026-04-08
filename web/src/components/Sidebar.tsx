import { Building2, LayoutDashboard, LogOut, Shield } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken } from "../api/client";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clients", icon: Building2, label: "Clients" },
];

export default function Sidebar() {
  const location = useLocation();
  const nav = useNavigate();

  function handleLogout() {
    setToken(null);
    nav("/login", { replace: true });
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-edge-soft bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-edge-soft px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
          <Shield className="h-5 w-5 text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-content">Azure CloudGuard</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ to, icon: Icon, label }) => {
          const active =
            location.pathname === to ||
            (to !== "/dashboard" && location.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-content-muted hover:bg-surface-alt hover:text-content"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div className="border-t border-edge-soft px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-content-muted transition-colors duration-150 hover:bg-surface-alt hover:text-content"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
