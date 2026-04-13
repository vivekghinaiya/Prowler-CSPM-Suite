import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Sparkles } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { apiFetch, getToken } from "../api/client";
import AIRemediationCard from "../components/ai/AIRemediationCard";
import AISummaryModal from "../components/ai/AISummaryModal";
import AITriageTab from "../components/ai/AITriageTab";
import SmartGroupsTab from "../components/ai/SmartGroupsTab";

type Scan = {
  id: string;
  client_id: string;
  label: string | null;
  status: string;
  progress_pct: number;
  error_message: string | null;
  previous_scan_id: string | null;
  created_at: string;
  findings_count?: number;
};

type Finding = {
  id: string;
  fingerprint: string;
  severity: string;
  status: string;
  triage: string | null;
  title: string | null;
  description: string | null;
  check_description: string | null;
  status_detail: string | null;
  resource_id: string;
  region: string;
  service: string;
  check_id: string;
  compliance_framework: string | null;
  remediation: string | null;
  remediation_url: string | null;
  created_at: string;
};

type PaginatedFindings = {
  total: number;
  items: Finding[];
};

const SEV_BADGE: Record<string, string> = {
  critical: "badge badge-critical",
  high: "badge badge-high",
  medium: "badge badge-medium",
  low: "badge badge-low",
  informational: "badge badge-info",
};

const PAGE_SIZE = 50;

type DiffItem = {
  fingerprint: string;
  category: string;
  finding_id: string | null;
  severity: string | null;
  service: string | null;
  resource_id: string | null;
  title: string | null;
  description: string | null;
  check_description: string | null;
  status_detail: string | null;
  check_id: string | null;
  remediation: string | null;
  remediation_url: string | null;
  triage: string | null;
};

type DiffOut = {
  scan_id: string;
  previous_scan_id: string | null;
  counts: Record<string, number>;
  items: DiffItem[];
};

type ResourceInstance = {
  id: string;
  resource_id: string;
  region: string;
  status: string;
  triage: string | null;
  fingerprint: string;
};

type GroupedFinding = {
  check_id: string;
  title: string | null;
  description: string | null;
  check_description: string | null;
  status_detail: string | null;
  severity: string;
  service: string;
  remediation: string | null;
  remediation_url: string | null;
  count: number;
  resources: ResourceInstance[];
};

type PaginatedGroupedFindings = {
  total_groups: number;
  groups: GroupedFinding[];
};

const DIFF_BADGE: Record<string, string> = {
  new: "badge badge-success",
  open: "badge badge-pending",
  closed: "badge badge-cancelled",
};

export default function ScanDetailPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const qc = useQueryClient();
  const [wsPct, setWsPct] = useState<number | null>(null);
  const [wsStage, setWsStage] = useState<string | null>(null);
  const [wsChecks, setWsChecks] = useState<{ done: number; total: number } | null>(null);
  const [tab, setTab] = useState<"findings" | "issues" | "smart_groups" | "diff" | "ai_triage" | "logs">("findings");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [fSeverity, setFSeverity] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTriage, setFTriage] = useState("");
  const [fService, setFService] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDiffFp, setExpandedDiffFp] = useState<string | null>(null);
  const [diffCatFilter, setDiffCatFilter] = useState<string | null>(null);
  const [diffPage, setDiffPage] = useState(0);
  const [diffTriageFilter, setDiffTriageFilter] = useState("");
  const [issueSeverity, setIssueSeverity] = useState("");
  const [issueService, setIssueService] = useState("");
  const [issuesPage, setIssuesPage] = useState(0);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [fSearch, setFSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [diffSearch, setDiffSearch] = useState("");

  const scan = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => apiFetch<Scan>(`/api/v1/scans/${scanId}`),
    enabled: !!scanId,
    refetchInterval: (q) => (q.state.data?.status === "running" || q.state.data?.status === "pending" ? 2000 : false),
  });

  const findingsParams = useMemo(() => {
    const p = new URLSearchParams();
    if (fSeverity) p.set("severity", fSeverity);
    if (fStatus) p.set("status", fStatus);
    if (fTriage) p.set("triage", fTriage);
    if (fService) p.set("service", fService);
    if (fSearch) p.set("search", fSearch);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [fSeverity, fStatus, fTriage, fService, fSearch, page]);

  const findings = useQuery({
    queryKey: ["findings", scanId, findingsParams],
    queryFn: () => apiFetch<PaginatedFindings>(`/api/v1/scans/${scanId}/findings?${findingsParams}`),
    enabled: !!scanId && scan.data?.status === "completed",
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  const services = useQuery({
    queryKey: ["findingServices", scanId],
    queryFn: () => apiFetch<string[]>(`/api/v1/scans/${scanId}/findings/services`),
    enabled: !!scanId && scan.data?.status === "completed",
    staleTime: 60_000,
  });

  const issuesParams = useMemo(() => {
    const p = new URLSearchParams();
    if (issueSeverity) p.set("severity", issueSeverity);
    if (issueService) p.set("service", issueService);
    if (issueSearch) p.set("search", issueSearch);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(issuesPage * PAGE_SIZE));
    return p.toString();
  }, [issueSeverity, issueService, issueSearch, issuesPage]);

  const groupedFindings = useQuery({
    queryKey: ["groupedFindings", scanId, issuesParams],
    queryFn: () => apiFetch<PaginatedGroupedFindings>(`/api/v1/scans/${scanId}/findings/grouped?${issuesParams}`),
    enabled: !!scanId && scan.data?.status === "completed",
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (scan.data?.status === "completed" && scanId) {
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      qc.invalidateQueries({ queryKey: ["findingServices", scanId] });
      qc.invalidateQueries({ queryKey: ["groupedFindings", scanId] });
    }
  }, [scan.data?.status, scanId, qc]);

  const diffParams = useMemo(() => {
    const p = new URLSearchParams();
    if (diffTriageFilter) p.set("triage", diffTriageFilter);
    return p.toString();
  }, [diffTriageFilter]);

  const diff = useQuery({
    queryKey: ["diff", scanId, diffParams],
    queryFn: () => apiFetch<DiffOut>(`/api/v1/scans/${scanId}/diff${diffParams ? `?${diffParams}` : ""}`),
    enabled: !!scanId && scan.data?.status === "completed",
    retry: false,
  });

  const scanLogs = useQuery({
    queryKey: ["scanLogs", scanId],
    queryFn: () => apiFetch<{ logs: string }>(`/api/v1/scans/${scanId}/logs`),
    enabled: !!scanId,
    refetchInterval:
      scan.data?.status === "running" || scan.data?.status === "pending" ? 2000 : false,
  });

  const patchLabel = useMutation({
    mutationFn: (label: string) =>
      apiFetch<Scan>(`/api/v1/scans/${scanId}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scan", scanId] }),
  });

  const cancelScan = useMutation({
    mutationFn: () => apiFetch<Scan>(`/api/v1/scans/${scanId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan", scanId] });
      qc.invalidateQueries({ queryKey: ["scanLogs", scanId] });
      setWsPct(0);
    },
  });

  const reparseFindings = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; detail?: string }>(`/api/v1/scans/${scanId}/reparse`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan", scanId] });
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      qc.invalidateQueries({ queryKey: ["findingServices", scanId] });
      qc.invalidateQueries({ queryKey: ["groupedFindings", scanId] });
      qc.invalidateQueries({ queryKey: ["diff", scanId] });
      qc.invalidateQueries({ queryKey: ["scanLogs", scanId] });
    },
  });

  const triage = useMutation({
    mutationFn: (vars: { clientId: string; fingerprint: string; state: string }) =>
      apiFetch(`/api/v1/clients/${vars.clientId}/triage/${vars.fingerprint}`, {
        method: "PUT",
        body: JSON.stringify({ state: vars.state }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      qc.invalidateQueries({ queryKey: ["groupedFindings", scanId] });
    },
  });

  const base = import.meta.env.VITE_API_URL || "";
  const wsUrl = useMemo(() => {
    if (!scanId) return null;
    const tok = getToken();
    if (!tok) return null;
    const path = `/api/v1/ws/scans/${scanId}?token=${encodeURIComponent(tok)}`;
    if (base) {
      const u = new URL(base);
      const wsProto = u.protocol === "https:" ? "wss" : "ws";
      return `${wsProto}://${u.host}${path}`;
    }
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${wsProto}://${window.location.host}${path}`;
  }, [scanId, base]);

  useEffect(() => {
    if (!wsUrl || !scanId) return;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data as string);
        if (typeof p.pct === "number") setWsPct(p.pct);
        if (typeof p.stage === "string") setWsStage(p.stage);
        if (typeof p.checks_done === "number" && typeof p.checks_total === "number")
          setWsChecks({ done: p.checks_done, total: p.checks_total });
        if (p.stage === "diff" || p.stage === "completed") {
          qc.invalidateQueries({ queryKey: ["findings", scanId] });
          qc.invalidateQueries({ queryKey: ["findingServices", scanId] });
          qc.invalidateQueries({ queryKey: ["groupedFindings", scanId] });
          qc.invalidateQueries({ queryKey: ["diff", scanId] });
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [wsUrl, scanId, qc]);

  const [labelEdit, setLabelEdit] = useState("");
  useEffect(() => {
    if (scan.data?.label != null) setLabelEdit(scan.data.label);
  }, [scan.data?.label]);

  if (!scanId) return null;

  const pct = wsPct ?? scan.data?.progress_pct ?? 0;
  const stageLabel = wsStage;

  const STATUS_BADGE: Record<string, string> = {
    completed: "badge badge-completed",
    running: "badge badge-running",
    pending: "badge badge-pending",
    failed: "badge badge-failed",
    cancelled: "badge badge-cancelled",
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 pt-2 text-xs text-content-faint md:pt-0">
        <Link to="/clients" className="transition-colors hover:text-content" style={{ color: "rgba(0,255,65,0.5)" }}>
          Clients
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {scan.data?.client_id && (
          <>
            <Link to={`/clients/${scan.data.client_id}`} className="transition-colors hover:text-content" style={{ color: "rgba(0,255,65,0.5)" }}>
              Client
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span style={{ color: "#7a7a8a" }}>{scan.data?.label || "Scan"}</span>
      </div>

      {scan.data && (
        <header className="mb-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1
                className="text-xl font-black uppercase tracking-widest"
                style={{ fontFamily: '"Orbitron", sans-serif', color: "#00ff41", textShadow: "0 0 16px rgba(0,255,65,0.3)" }}
              >
                {scan.data.label || "Scan"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={STATUS_BADGE[scan.data.status] ?? "badge"}>
                  {scan.data.status}
                </span>
                {(scan.data.status === "running" || scan.data.status === "pending") && (
                  <div className="flex items-center gap-2">
                    <div className="progress-track w-32">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-content-faint">{pct}%</span>
                  </div>
                )}
                {stageLabel && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ border: "1px solid rgba(0,255,65,0.15)", color: "#7a7a8a", fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {stageLabel.replace(/_/g, " ")}
                    {wsChecks && stageLabel === "running_prowler" ? ` (${wsChecks.done}/${wsChecks.total})` : ""}
                  </span>
                )}
                {scan.data.status === "completed" && typeof scan.data.findings_count === "number" && (
                  <span className="text-xs text-content-faint">
                    {scan.data.findings_count.toLocaleString()} findings
                  </span>
                )}
                {scan.data.error_message && (
                  <span className="text-xs" style={{ color: "#ff003c" }}>{scan.data.error_message}</span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-lg px-3 py-1.5 text-xs text-content outline-none"
                style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                value={labelEdit}
                onChange={(e) => setLabelEdit(e.target.value)}
                placeholder="Edit scan label"
              />
              <button
                type="button"
                className="btn-cyber-ghost"
                onClick={() => patchLabel.mutate(labelEdit, { onSuccess: () => toast.success("Label saved"), onError: (e: Error) => toast.error(e.message) })}
              >
                Save
              </button>
              {(scan.data.status === "pending" || scan.data.status === "running") && (
                <button
                  type="button"
                  className="btn-cyber"
                  style={{ borderColor: "rgba(255,190,0,0.35)", background: "rgba(255,190,0,0.07)", color: "#ffbe00" }}
                  disabled={cancelScan.isPending}
                  onClick={() => cancelScan.mutate(undefined, { onError: (e: Error) => toast.error(e.message) })}
                >
                  Cancel scan
                </button>
              )}
              {scan.data.status === "completed" && (
                <button
                  type="button"
                  className="btn-cyber-ghost disabled:opacity-50"
                  disabled={reparseFindings.isPending}
                  onClick={() => reparseFindings.mutate(undefined, { onSuccess: () => toast.success("Re-parse queued"), onError: (e: Error) => toast.error(e.message) })}
                >
                  {reparseFindings.isPending ? "Re-parsing…" : "Re-parse"}
                </button>
              )}
              <button
                type="button"
                className="btn-cyber-secondary"
                onClick={() => {
                  const url = `${base || ""}/api/v1/scans/${scanId}/export.xlsx`;
                  fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
                    .then((r) => r.blob())
                    .then((b) => {
                      const dl = URL.createObjectURL(b);
                      const a = document.createElement("a");
                      a.href = dl;
                      a.download = `scan-${scanId}.xlsx`;
                      a.click();
                      URL.revokeObjectURL(dl);
                    });
                }}
              >
                Export Excel
              </button>
              {scan.data.status === "completed" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(true)}
                    className="btn-cyber"
                    style={{ borderColor: "rgba(168,85,247,0.4)", background: "rgba(168,85,247,0.1)", color: "#c084fc" }}
                  >
                    <FileText className="h-3.5 w-3.5" /> AI Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("ai_triage")}
                    className="btn-cyber"
                    style={{ borderColor: "rgba(168,85,247,0.35)", background: "rgba(168,85,247,0.07)", color: "#c084fc" }}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> AI Triage
                  </button>
                </>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Tab navigation */}
      <div className="mb-6 flex overflow-x-auto border-b" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        {(["findings", "issues", "smart_groups", "diff", "ai_triage", "logs"] as const).map((t) => {
          const active = tab === t;
          const label = t === "smart_groups" ? "Smart Groups" : t === "ai_triage" ? "AI Triage" : t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium transition-colors"
              style={active
                ? { borderColor: "#00ff41", color: "#00ff41", fontFamily: '"Orbitron", sans-serif', letterSpacing: "1px" }
                : { borderColor: "transparent", color: "#4a4a5a", fontFamily: '"Orbitron", sans-serif', letterSpacing: "1px" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "findings" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={fSeverity}
              onChange={(e) => { setFSeverity(e.target.value); setPage(0); }}
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={fStatus}
              onChange={(e) => { setFStatus(e.target.value); setPage(0); }}
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={fTriage}
              onChange={(e) => { setFTriage(e.target.value); setPage(0); }}
            >
              <option value="">All triage</option>
              <option value="none">Untriaged</option>
              <option value="valid">Valid</option>
              <option value="false_positive">False positive</option>
              <option value="not_applicable">N/A</option>
            </select>
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={fService}
              onChange={(e) => { setFService(e.target.value); setPage(0); }}
            >
              <option value="">All services</option>
              {services.data?.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search findings..."
              className="w-40 rounded-lg px-3 py-1.5 text-xs text-content outline-none placeholder-content-faint sm:w-48" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={fSearch}
              onChange={(e) => { setFSearch(e.target.value); setPage(0); }}
            />
            {(fSeverity || fStatus || fTriage || fService || fSearch) && (
              <button
                type="button"
                className="btn-cyber-ghost"
                onClick={() => { setFSeverity(""); setFStatus(""); setFTriage(""); setFService(""); setFSearch(""); setPage(0); }}
              >
                Clear filters
              </button>
            )}
            {findings.data && (
              <span className="ml-auto text-xs text-content-faint">
                {findings.data.total} finding{findings.data.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="table-cyber w-full">
              <thead>
                <tr>
                  <th className="w-6 py-2" />
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Triage</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Resource</th>
                  <th className="py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {findings.data?.items.map((f) => {
                  const open = expandedId === f.id;
                  return (
                    <Fragment key={f.id}>
                      <tr
                        className="border-b border-edge-row hover:bg-surface/40 cursor-pointer"
                        onClick={() => setExpandedId(open ? null : f.id)}
                      >
                        <td className="py-2 pl-1 pr-1 text-content-faint">
                          <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${SEV_BADGE[f.severity] ?? "text-content-secondary"}`}>
                            {f.severity}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-content-secondary">{f.status}</td>
                        <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="rounded px-2 py-1 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)" }}
                            value={f.triage ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v || !scan.data?.client_id) return;
                              triage.mutate({ clientId: scan.data.client_id, fingerprint: f.fingerprint, state: v });
                            }}
                          >
                            <option value="">—</option>
                            <option value="valid">Valid</option>
                            <option value="false_positive">False positive</option>
                            <option value="not_applicable">N/A</option>
                          </select>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-content-secondary">{f.service}</td>
                        <td className="max-w-[14rem] truncate py-2 pr-3 font-mono text-xs text-content-muted">{f.resource_id}</td>
                        <td className="max-w-md truncate py-2 text-content-muted">{f.status_detail || f.description}</td>
                      </tr>
                      {open && (
                        <tr className="border-b border-edge-row bg-surface/10">
                          <td colSpan={7} className="px-4 py-3">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                              <dt className="text-content-faint">Finding</dt>
                              <dd className="text-content-secondary">{f.status_detail || "—"}</dd>
                              <dt className="text-content-faint">Check</dt>
                              <dd className="text-content-secondary">{f.title || f.description || "—"}</dd>
                              <dt className="text-content-faint">Description</dt>
                              <dd className="text-content-secondary whitespace-pre-wrap">{f.check_description || "—"}</dd>
                              <dt className="text-content-faint">Resource</dt>
                              <dd className="font-mono text-content-secondary break-all">{f.resource_id}</dd>
                              <dt className="text-content-faint">Check ID</dt>
                              <dd className="font-mono text-content-secondary">{f.check_id}</dd>
                              <dt className="text-content-faint">Region</dt>
                              <dd className="text-content-secondary">{f.region || "—"}</dd>
                              <dt className="text-content-faint">Compliance</dt>
                              <dd className="text-content-secondary">{f.compliance_framework || "—"}</dd>
                              <dt className="text-content-faint">Remediation</dt>
                              <dd className="text-content-secondary whitespace-pre-wrap">
                                {f.remediation?.replace(/\*\*/g, "") || "—"}
                                {f.remediation_url && (
                                  <>
                                    {" "}
                                    <a href={f.remediation_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">
                                      Reference
                                    </a>
                                  </>
                                )}
                              </dd>
                              <dt className="text-content-faint">Fingerprint</dt>
                              <dd className="font-mono text-content-muted">{f.fingerprint}</dd>
                            </dl>
                            <AIRemediationCard findingId={f.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {findings.data && findings.data.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                className="btn-cyber-ghost disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="text-content-faint">
                Page {page + 1} of {Math.ceil(findings.data.total / PAGE_SIZE)}
              </span>
              <button
                type="button"
                className="btn-cyber-ghost disabled:opacity-40"
                disabled={(page + 1) * PAGE_SIZE >= findings.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}

          {scan.data?.status === "cancelled" && (
            <p className="mt-4 text-content-faint">This scan was cancelled; there are no findings.</p>
          )}
          {scan.data?.status !== "completed" && scan.data?.status !== "cancelled" && (
            <p className="mt-4 text-content-faint">Findings appear when the scan completes.</p>
          )}
        </div>
      )}

      {tab === "issues" && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={issueSeverity}
              onChange={(e) => { setIssueSeverity(e.target.value); setIssuesPage(0); }}
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              className="rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={issueService}
              onChange={(e) => { setIssueService(e.target.value); setIssuesPage(0); }}
            >
              <option value="">All services</option>
              {services.data?.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search issues..."
              className="w-40 rounded-lg px-3 py-1.5 text-xs text-content outline-none placeholder-content-faint sm:w-48" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
              value={issueSearch}
              onChange={(e) => { setIssueSearch(e.target.value); setIssuesPage(0); }}
            />
            {(issueSeverity || issueService || issueSearch) && (
              <button
                type="button"
                className="btn-cyber-ghost"
                onClick={() => { setIssueSeverity(""); setIssueService(""); setIssueSearch(""); setIssuesPage(0); }}
              >
                Clear filters
              </button>
            )}
            {groupedFindings.data && (
              <span className="ml-auto text-xs text-content-faint">
                {groupedFindings.data.total_groups} issue type{groupedFindings.data.total_groups !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="table-cyber w-full">
              <thead>
                <tr>
                  <th className="w-6 py-2" />
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Instances</th>
                </tr>
              </thead>
              <tbody>
                {groupedFindings.data?.groups.map((g) => {
                  const open = expandedCheckId === g.check_id;
                  return (
                    <Fragment key={g.check_id}>
                      <tr
                        className="border-b border-edge-row hover:bg-surface/40 cursor-pointer"
                        onClick={() => setExpandedCheckId(open ? null : g.check_id)}
                      >
                        <td className="py-2 pl-1 pr-1 text-content-faint">
                          <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${SEV_BADGE[g.severity] ?? "text-content-secondary"}`}>
                            {g.severity}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-content-secondary">{g.service}</td>
                        <td className="max-w-lg truncate py-2 pr-3 text-content-muted">{g.status_detail || g.title || g.description}</td>
                        <td className="py-2 pr-3 text-right">
                          <span className="inline-block rounded-full bg-surface-alt border border-edge px-2.5 py-0.5 text-xs font-semibold text-content">
                            {g.count}
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-edge-row bg-surface/10">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="mb-2">
                              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                                <dt className="text-content-faint">Finding</dt>
                                <dd className="text-content-secondary">{g.status_detail || "—"}</dd>
                                <dt className="text-content-faint">Check</dt>
                                <dd className="text-content-secondary">{g.title || g.description || "—"}</dd>
                                <dt className="text-content-faint">Description</dt>
                                <dd className="text-content-secondary whitespace-pre-wrap">{g.check_description || "—"}</dd>
                                <dt className="text-content-faint">Check ID</dt>
                                <dd className="font-mono text-content-secondary">{g.check_id}</dd>
                                <dt className="text-content-faint">Remediation</dt>
                                <dd className="text-content-secondary whitespace-pre-wrap">
                                  {g.remediation?.replace(/\*\*/g, "") || "—"}
                                  {g.remediation_url && (
                                    <>
                                      {" "}
                                      <a href={g.remediation_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">
                                        Reference
                                      </a>
                                    </>
                                  )}
                                </dd>
                              </dl>
                            </div>
                            <table className="table-cyber w-full">
                              <thead>
                                <tr>
                                  <th className="py-1.5 pr-3">Resource</th>
                                  <th className="py-1.5 pr-3">Region</th>
                                  <th className="py-1.5 pr-3">Status</th>
                                  <th className="py-1.5 pr-3">Triage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.resources.map((r) => (
                                  <tr key={r.id} className="border-b border-edge-row/50">
                                    <td className="max-w-xs truncate py-1.5 pr-3 font-mono text-content-secondary">{r.resource_id}</td>
                                    <td className="py-1.5 pr-3 text-content-muted">{r.region || "—"}</td>
                                    <td className="py-1.5 pr-3 text-content-muted">{r.status}</td>
                                    <td className="py-1.5 pr-3" onClick={(e) => e.stopPropagation()}>
                                      <select
                                        className="rounded px-2 py-0.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)" }}
                                        value={r.triage ?? ""}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (!v || !scan.data?.client_id) return;
                                          triage.mutate({ clientId: scan.data.client_id, fingerprint: r.fingerprint, state: v });
                                        }}
                                      >
                                        <option value="">—</option>
                                        <option value="valid">Valid</option>
                                        <option value="false_positive">False positive</option>
                                        <option value="not_applicable">N/A</option>
                                      </select>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {groupedFindings.data && groupedFindings.data.total_groups > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                className="btn-cyber-ghost disabled:opacity-40"
                disabled={issuesPage === 0}
                onClick={() => setIssuesPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="text-content-faint">
                Page {issuesPage + 1} of {Math.ceil(groupedFindings.data.total_groups / PAGE_SIZE)}
              </span>
              <button
                type="button"
                className="btn-cyber-ghost disabled:opacity-40"
                disabled={(issuesPage + 1) * PAGE_SIZE >= groupedFindings.data.total_groups}
                onClick={() => setIssuesPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}

          {scan.data?.status !== "completed" && scan.data?.status !== "cancelled" && (
            <p className="mt-4 text-content-faint">Issues appear when the scan completes.</p>
          )}
        </div>
      )}

      {tab === "diff" && (
        <div className="mt-4 space-y-4">
          {diff.isError && <p className="text-content-faint">Diff not ready or no comparison scan.</p>}
          {diff.data && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {Object.entries(diff.data.counts).map(([cat, n]) => {
                  const active = diffCatFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => { setDiffCatFilter(active ? null : cat); setDiffPage(0); }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${DIFF_BADGE[cat] ?? "text-content-secondary"} ${active ? "ring-2 ring-content-faint ring-offset-1 ring-offset-page scale-105" : "opacity-80 hover:opacity-100"}`}
                    >
                      {cat} <span className="font-semibold">{n}</span>
                    </button>
                  );
                })}
                {diffCatFilter && (
                  <button
                    type="button"
                    className="text-xs text-content-faint hover:text-content-secondary"
                    onClick={() => { setDiffCatFilter(null); setDiffPage(0); }}
                  >
                    Show all
                  </button>
                )}
                <input
                  type="text"
                  placeholder="Search diff..."
                  className="w-40 rounded-lg px-3 py-1.5 text-xs text-content outline-none placeholder-content-faint sm:w-48" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                  value={diffSearch}
                  onChange={(e) => { setDiffSearch(e.target.value); setDiffPage(0); }}
                />
                <select
                  className="ml-auto rounded-lg px-3 py-1.5 text-xs text-content outline-none" style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                  value={diffTriageFilter}
                  onChange={(e) => { setDiffTriageFilter(e.target.value); setDiffPage(0); setDiffCatFilter(null); }}
                >
                  <option value="">All triage</option>
                  <option value="valid">Valid only</option>
                  <option value="false_positive">False positive only</option>
                  <option value="not_applicable">N/A only</option>
                  <option value="none">Untriaged only</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge-soft text-content-muted">
                      <th className="w-6 py-2" />
                      <th className="py-2 pr-3">Change</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Service</th>
                      <th className="py-2 pr-3">Resource</th>
                      <th className="py-2 pr-3">Triage</th>
                      <th className="py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let filtered = diffCatFilter ? diff.data.items.filter((i) => i.category === diffCatFilter) : diff.data.items;
                      if (diffSearch) {
                        const q = diffSearch.toLowerCase();
                        filtered = filtered.filter((i) =>
                          (i.status_detail ?? i.description ?? "").toLowerCase().includes(q)
                          || (i.resource_id ?? "").toLowerCase().includes(q)
                          || (i.check_id ?? "").toLowerCase().includes(q)
                          || (i.service ?? "").toLowerCase().includes(q)
                        );
                      }
                      return filtered.slice(diffPage * PAGE_SIZE, (diffPage + 1) * PAGE_SIZE).map((i) => {
                        const key = `${i.category}-${i.fingerprint}`;
                        const open = expandedDiffFp === key;
                        return (
                          <Fragment key={key}>
                            <tr
                              className="border-b border-edge-row hover:bg-surface/40 cursor-pointer"
                              onClick={() => setExpandedDiffFp(open ? null : key)}
                            >
                              <td className="py-2 pl-1 pr-1 text-content-faint">
                                <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                              </td>
                              <td className="py-2 pr-3">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${DIFF_BADGE[i.category] ?? "text-content-secondary"}`}>
                                  {i.category}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                {i.severity ? (
                                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${SEV_BADGE[i.severity] ?? "text-content-secondary"}`}>
                                    {i.severity}
                                  </span>
                                ) : (
                                  <span className="text-xs text-content-faint">--</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 font-mono text-xs text-content-secondary">{i.service ?? "--"}</td>
                              <td className="max-w-[14rem] truncate py-2 pr-3 font-mono text-xs text-content-muted">
                                {i.resource_id ?? i.fingerprint.slice(0, 16) + "..."}
                              </td>
                              <td className="py-2 pr-3 text-xs text-content-muted">{i.triage?.replace(/_/g, " ") ?? "—"}</td>
                              <td className="max-w-md truncate py-2 text-content-muted">
                                {i.status_detail || i.description || "--"}
                              </td>
                            </tr>
                            {open && (
                              <tr className="border-b border-edge-row bg-surface/10">
                                <td colSpan={7} className="px-4 py-3">
                                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                                    <dt className="text-content-faint">Finding</dt>
                                    <dd className="text-content-secondary">{i.status_detail || "—"}</dd>
                                    <dt className="text-content-faint">Check</dt>
                                    <dd className="text-content-secondary">{i.title || i.description || "—"}</dd>
                                    <dt className="text-content-faint">Description</dt>
                                    <dd className="text-content-secondary whitespace-pre-wrap">{i.check_description || "—"}</dd>
                                    <dt className="text-content-faint">Resource</dt>
                                    <dd className="font-mono text-content-secondary break-all">{i.resource_id ?? "—"}</dd>
                                    <dt className="text-content-faint">Check ID</dt>
                                    <dd className="font-mono text-content-secondary">{i.check_id ?? "—"}</dd>
                                    <dt className="text-content-faint">Remediation</dt>
                                    <dd className="text-content-secondary whitespace-pre-wrap">
                                      {i.remediation?.replace(/\*\*/g, "") || "—"}
                                      {i.remediation_url && (
                                        <>
                                          {" "}
                                          <a href={i.remediation_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">
                                            Reference
                                          </a>
                                        </>
                                      )}
                                    </dd>
                                    <dt className="text-content-faint">Fingerprint</dt>
                                    <dd className="font-mono text-content-muted">{i.fingerprint}</dd>
                                  </dl>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              {(() => {
                const filtered = diffCatFilter ? diff.data.items.filter((i) => i.category === diffCatFilter) : diff.data.items;
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                return filtered.length > PAGE_SIZE ? (
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <button
                      type="button"
                      className="btn-cyber-ghost disabled:opacity-40"
                      disabled={diffPage === 0}
                      onClick={() => setDiffPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="text-content-faint">
                      Page {diffPage + 1} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn-cyber-ghost disabled:opacity-40"
                      disabled={diffPage + 1 >= totalPages}
                      onClick={() => setDiffPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}

      {tab === "smart_groups" && scan.data && (
        <SmartGroupsTab scanId={scanId} clientId={scan.data.client_id} />
      )}

      {tab === "ai_triage" && scan.data && (
        <AITriageTab scanId={scanId} clientId={scan.data.client_id} />
      )}

      {tab === "logs" && (
        <div className="mt-4">
          {scanLogs.isError && <p className="text-xs" style={{ color: "#ff003c" }}>Could not load logs.</p>}
          <div className="terminal-wrap">
            <div className="terminal-titlebar">
              <span className="terminal-dot" style={{ background: "#ff003c" }} />
              <span className="terminal-dot" style={{ background: "#ffbe00" }} />
              <span className="terminal-dot" style={{ background: "#00ff41" }} />
              <span className="ml-3 text-[10px]" style={{ color: "rgba(0,255,65,0.5)", fontFamily: '"Orbitron", sans-serif', letterSpacing: "1px" }}>
                SCAN LOG
              </span>
            </div>
            <pre className="terminal-body">
              {scanLogs.data?.logs || (scan.data?.status === "pending" || scan.data?.status === "running" ? "Waiting for log output…" : "No logs available.")}
            </pre>
          </div>
          {(scan.data?.status === "pending" || scan.data?.status === "running") && (
            <p className="mt-2 text-[10px] text-content-faint">Streaming · refreshes every 2s</p>
          )}
        </div>
      )}

      {showSummaryModal && scan.data && (
        <AISummaryModal
          scanId={scanId}
          scanLabel={scan.data.label || "Scan"}
          onClose={() => setShowSummaryModal(false)}
        />
      )}
    </div>
  );
}
