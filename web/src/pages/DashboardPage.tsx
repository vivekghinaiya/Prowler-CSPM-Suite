import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, FileSearch, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../api/client";

type Client = { id: string; name: string; description: string | null; created_at: string };

type Scan = {
  id: string;
  client_id: string;
  label: string | null;
  status: string;
  progress_pct: number;
  created_at: string;
};

type Dashboard = {
  scan_id: string | null;
  total_findings: number;
  by_severity: Record<string, number>;
  by_service: Record<string, number>;
  diff_counts: Record<string, number> | null;
};

const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  informational: "#64748b",
};

const SEV_BG: Record<string, string> = {
  critical: "bg-red-950/60 text-red-300 border-red-700/50",
  high: "bg-orange-950/50 text-orange-300 border-orange-700/50",
  medium: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  low: "bg-sky-950/40 text-sky-300 border-sky-700/40",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50",
  running: "bg-blue-950/60 text-blue-300 border-blue-700/50",
  pending: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  failed: "bg-red-950/60 text-red-300 border-red-700/50",
  cancelled: "bg-slate-800/60 text-slate-300 border-slate-600/50",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  pulse,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
  pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-edge-soft bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-content-faint">{label}</p>
          <p className="mt-2 text-3xl font-bold text-content">{value}</p>
          {sub && <p className="mt-1 text-xs text-content-muted">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
          {pulse && (
            <span className="absolute right-4 top-4 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiFetch<Client[]>("/api/v1/clients"),
  });

  const dashboardQueries = useQueries({
    queries: (clients.data ?? []).map((c) => ({
      queryKey: ["dash", c.id],
      queryFn: () => apiFetch<Dashboard>(`/api/v1/clients/${c.id}/dashboard`),
      enabled: !!clients.data?.length,
      staleTime: 30_000,
    })),
  });

  const scanQueries = useQueries({
    queries: (clients.data ?? []).map((c) => ({
      queryKey: ["scans", c.id],
      queryFn: () => apiFetch<Scan[]>(`/api/v1/clients/${c.id}/scans`),
      enabled: !!clients.data?.length,
      staleTime: 15_000,
    })),
  });

  const aggStats = useMemo(() => {
    let totalFindings = 0;
    let criticalCount = 0;
    const bySev: Record<string, number> = {};
    const bySvc: Record<string, number> = {};

    for (const q of dashboardQueries) {
      if (!q.data) continue;
      totalFindings += q.data.total_findings;
      for (const [sev, n] of Object.entries(q.data.by_severity)) {
        bySev[sev] = (bySev[sev] ?? 0) + n;
      }
      criticalCount += q.data.by_severity.critical ?? 0;
      for (const [svc, n] of Object.entries(q.data.by_service)) {
        bySvc[svc] = (bySvc[svc] ?? 0) + n;
      }
    }

    const severityChart = (["critical", "high", "medium", "low"] as const)
      .map((s) => ({ name: s.charAt(0).toUpperCase() + s.slice(1), value: bySev[s] ?? 0, color: SEV_COLORS[s] }))
      .filter((d) => d.value > 0);

    const topServices = Object.entries(bySvc)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return { totalFindings, criticalCount, severityChart, topServices, bySev };
  }, [dashboardQueries]);

  const allScans = useMemo(() => {
    const scans: (Scan & { clientName: string })[] = [];
    for (let i = 0; i < scanQueries.length; i++) {
      const q = scanQueries[i];
      const client = clients.data?.[i];
      if (!q.data || !client) continue;
      for (const s of q.data) {
        scans.push({ ...s, clientName: client.name });
      }
    }
    return scans
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [scanQueries, clients.data]);

  const totalScans = useMemo(
    () => scanQueries.reduce((acc, q) => acc + (q.data?.length ?? 0), 0),
    [scanQueries],
  );

  const isLoading = clients.isLoading;
  const totalClients = clients.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8">
      {/* Page header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-content">Dashboard</h1>
        <p className="mt-1 text-sm text-content-muted">
          Security posture overview across all Azure tenants
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={Building2}
          label="Total Clients"
          value={isLoading ? "—" : totalClients}
          sub={totalClients === 1 ? "tenant" : "tenants"}
          accent="bg-blue-600/20 text-blue-400"
        />
        <SummaryCard
          icon={FileSearch}
          label="Total Scans"
          value={isLoading ? "—" : totalScans}
          sub="all time"
          accent="bg-indigo-600/20 text-indigo-400"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Total Findings"
          value={isLoading ? "—" : aggStats.totalFindings}
          sub="across all scans"
          accent="bg-yellow-600/20 text-yellow-400"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Critical Issues"
          value={isLoading ? "—" : aggStats.criticalCount}
          sub="require attention"
          accent="bg-red-600/20 text-red-400"
          pulse={aggStats.criticalCount > 0}
        />
      </div>

      {/* Charts row */}
      {aggStats.severityChart.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Severity donut */}
          <div className="rounded-xl border border-edge-soft bg-surface p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-faint">
              Findings by Severity
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={aggStats.severityChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {aggStats.severityChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgb(18 30 48)",
                    border: "1px solid rgb(40 60 92)",
                    borderRadius: "8px",
                    color: "rgb(226 232 240)",
                    fontSize: "13px",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ color: "rgb(120 144 172)", fontSize: "12px" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top services bar */}
          <div className="rounded-xl border border-edge-soft bg-surface p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-faint">
              Top Azure Services
            </h2>
            {aggStats.topServices.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={aggStats.topServices}
                  layout="vertical"
                  margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "rgb(72 92 120)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: "rgb(120 144 172)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgb(18 30 48)",
                      border: "1px solid rgb(40 60 92)",
                      borderRadius: "8px",
                      color: "rgb(226 232 240)",
                      fontSize: "13px",
                    }}
                    cursor={{ fill: "rgba(59,130,246,0.08)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="mt-8 text-center text-sm text-content-faint">No service data yet</p>
            )}
          </div>
        </div>
      )}

      {/* Recent scans + Clients grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent scans */}
        <div className="rounded-xl border border-edge-soft bg-surface shadow-sm">
          <div className="border-b border-edge-soft px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-content-faint">
              Recent Scans
            </h2>
          </div>
          <div className="divide-y divide-edge-soft">
            {allScans.length === 0 && !isLoading && (
              <p className="px-5 py-8 text-center text-sm text-content-faint">No scans yet</p>
            )}
            {allScans.map((s) => (
              <Link
                key={s.id}
                to={`/scans/${s.id}`}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-alt"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">
                    {s.label || "Scan"}
                  </p>
                  <p className="text-xs text-content-faint">{s.clientName}</p>
                </div>
                <div className="flex items-center gap-3 pl-4">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status] ?? "text-content-muted"}`}
                  >
                    {s.status}
                  </span>
                  <span className="text-xs text-content-faint">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Client overview */}
        <div className="rounded-xl border border-edge-soft bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-edge-soft px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-content-faint">
              Clients
            </h2>
            <Link
              to="/clients"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-edge-soft">
            {isLoading && (
              <p className="px-5 py-8 text-center text-sm text-content-faint">Loading…</p>
            )}
            {!isLoading && totalClients === 0 && (
              <p className="px-5 py-8 text-center text-sm text-content-faint">
                No clients yet —{" "}
                <Link to="/clients" className="text-blue-400 hover:underline">
                  add one
                </Link>
              </p>
            )}
            {clients.data?.map((c, i) => {
              const dash = dashboardQueries[i]?.data;
              const clientScans = scanQueries[i]?.data ?? [];
              const lastScan = clientScans[0];
              return (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-alt"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content">{c.name}</p>
                    <p className="text-xs text-content-faint">
                      {clientScans.length} scan{clientScans.length !== 1 ? "s" : ""}
                      {lastScan ? ` · last ${new Date(lastScan.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {dash && dash.total_findings > 0 && (
                    <div className="flex items-center gap-1 pl-4">
                      {(["critical", "high", "medium", "low"] as const)
                        .filter((s) => (dash.by_severity[s] ?? 0) > 0)
                        .slice(0, 3)
                        .map((s) => (
                          <span
                            key={s}
                            className={`inline-flex rounded-full border px-1.5 py-0.5 text-xs font-semibold ${SEV_BG[s]}`}
                          >
                            {dash.by_severity[s]}
                          </span>
                        ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
