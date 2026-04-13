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
  critical: "#ff003c",
  high: "#ff6400",
  medium: "#ffbe00",
  low: "#00d4ff",
  informational: "#4a4a5a",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accentColor,
  pulse,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  accentColor: string;
  pulse?: boolean;
}) {
  return (
    <div className="card-cyber p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-medium uppercase tracking-[2px]"
            style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
          >
            {label}
          </p>
          <p
            className="mt-2 text-3xl font-black"
            style={{ color: accentColor, fontFamily: '"Orbitron", sans-serif', textShadow: `0 0 12px ${accentColor}40` }}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-content-faint">{sub}</p>
          )}
        </div>
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}30` }}
        >
          <Icon className="h-5 w-5" style={{ color: accentColor }} />
          {pulse && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#ff003c" }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "#ff003c" }} />
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

  const tooltipStyle = {
    background: "rgba(10,10,18,0.96)",
    border: "1px solid rgba(0,255,65,0.2)",
    borderRadius: "8px",
    color: "#e0e0e0",
    fontSize: "12px",
    fontFamily: '"JetBrains Mono", monospace',
    backdropFilter: "blur(8px)",
  };

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8">
      {/* Page header */}
      <header className="mb-8 pt-2 md:pt-0">
        <h1
          className="text-xl font-black uppercase tracking-widest"
          style={{ fontFamily: '"Orbitron", sans-serif', color: "#00ff41", textShadow: "0 0 16px rgba(0,255,65,0.3)" }}
        >
          Security Dashboard
        </h1>
        <p className="mt-1 text-xs text-content-muted">
          Threat posture overview · All Azure tenants
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 stagger">
        <SummaryCard
          icon={Building2}
          label="Clients"
          value={isLoading ? "—" : totalClients}
          sub={totalClients === 1 ? "tenant" : "tenants"}
          accentColor="#00d4ff"
        />
        <SummaryCard
          icon={FileSearch}
          label="Total Scans"
          value={isLoading ? "—" : totalScans}
          sub="all time"
          accentColor="#00ff41"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Findings"
          value={isLoading ? "—" : aggStats.totalFindings}
          sub="across all scans"
          accentColor="#ffbe00"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Critical"
          value={isLoading ? "—" : aggStats.criticalCount}
          sub="require attention"
          accentColor="#ff003c"
          pulse={aggStats.criticalCount > 0}
        />
      </div>

      {/* Charts row */}
      {aggStats.severityChart.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Severity donut */}
          <div className="card-cyber p-5">
            <h2
              className="mb-4 text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
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
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ color: "#7a7a8a", fontSize: "11px", fontFamily: '"JetBrains Mono", monospace' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top services bar */}
          <div className="card-cyber p-5">
            <h2
              className="mb-4 text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
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
                    tick={{ fill: "#4a4a5a", fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: "#7a7a8a", fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,255,65,0.04)" }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#00d4ff" />
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
        <div className="card-cyber overflow-hidden">
          <div
            className="px-5 py-4"
            style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}
          >
            <h2
              className="text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
              Recent Scans
            </h2>
          </div>
          <div>
            {allScans.length === 0 && !isLoading && (
              <p className="px-5 py-8 text-center text-xs text-content-faint">No scans yet</p>
            )}
            {allScans.map((s) => (
              <Link
                key={s.id}
                to={`/scans/${s.id}`}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-alt"
                style={{ borderBottom: "1px solid rgba(0,255,65,0.04)" }}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-content">
                    {s.label || "Scan"}
                  </p>
                  <p className="text-[10px] text-content-faint">{s.clientName}</p>
                </div>
                <div className="flex items-center gap-3 pl-4">
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                  <span className="text-[10px] text-content-faint">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Client overview */}
        <div className="card-cyber overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}
          >
            <h2
              className="text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
              Clients
            </h2>
            <Link
              to="/clients"
              className="text-[10px] transition-colors"
              style={{ color: "#00d4ff", fontFamily: '"Orbitron", sans-serif', letterSpacing: "1px" }}
            >
              View all →
            </Link>
          </div>
          <div>
            {isLoading && (
              <p className="px-5 py-8 text-center text-xs text-content-faint">Loading…</p>
            )}
            {!isLoading && totalClients === 0 && (
              <p className="px-5 py-8 text-center text-xs text-content-faint">
                No clients yet —{" "}
                <Link to="/clients" style={{ color: "#00d4ff" }} className="hover:underline">
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
                  style={{ borderBottom: "1px solid rgba(0,255,65,0.04)" }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-content">{c.name}</p>
                    <p className="text-[10px] text-content-faint">
                      {clientScans.length} scan{clientScans.length !== 1 ? "s" : ""}
                      {lastScan ? ` · last ${new Date(lastScan.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {dash && dash.total_findings > 0 && (
                    <div className="flex items-center gap-1 pl-4">
                      {(["critical", "high", "medium"] as const)
                        .filter((s) => (dash.by_severity[s] ?? 0) > 0)
                        .slice(0, 3)
                        .map((s) => (
                          <span key={s} className={`badge badge-${s}`}>
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
