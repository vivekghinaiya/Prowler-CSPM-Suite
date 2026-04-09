import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/client";
import { useAIHealth } from "../../hooks/useAIHealth";

type Suggestion = {
  id: string;
  scan_id: string;
  fingerprint: string;
  suggested_decision: "valid" | "false_positive" | "not_applicable" | "accepted_risk";
  confidence: number;
  reasoning: string | null;
  priority: "immediate" | "soon" | "low";
  accepted: boolean;
  created_at: string;
};

type AITriageResult = {
  status: string;
  suggestions: Suggestion[];
  processed: number;
  total: number;
};

const DECISION_STYLE: Record<string, string> = {
  valid: "bg-red-950/60 text-red-300 border-red-700/50",
  false_positive: "bg-slate-800/60 text-slate-300 border-slate-600/50",
  not_applicable: "bg-sky-950/40 text-sky-300 border-sky-700/40",
  accepted_risk: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
};

const PRIORITY_STYLE: Record<string, string> = {
  immediate: "bg-red-950/60 text-red-300 border-red-700/50",
  soon: "bg-orange-950/50 text-orange-300 border-orange-700/50",
  low: "bg-slate-800/60 text-slate-300 border-slate-600/50",
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-alt">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-content-faint">{value}%</span>
    </div>
  );
}

export default function AITriageTab({
  scanId,
  clientId,
}: {
  scanId: string;
  clientId: string;
}) {
  const qc = useQueryClient();
  const health = useAIHealth();
  const [filterDecision, setFilterDecision] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [minConf, setMinConf] = useState(80);

  const { data, isLoading } = useQuery<AITriageResult>({
    queryKey: ["ai-triage", scanId],
    queryFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-triage`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "pending" ? 2000 : false;
    },
  });

  const trigger = useMutation({
    mutationFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-triage`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-triage", scanId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const accept = useMutation({
    mutationFn: (fingerprint: string) =>
      apiFetch(`/api/v1/scans/${scanId}/ai-triage/${fingerprint}/accept`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-triage", scanId] });
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      toast.success("Triage applied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptAll = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/scans/${scanId}/ai-triage/accept-all`, {
        method: "POST",
        body: JSON.stringify({ min_confidence: minConf }),
      }),
    onSuccess: (r: { accepted: number }) => {
      qc.invalidateQueries({ queryKey: ["ai-triage", scanId] });
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      toast.success(`Applied ${r.accepted} AI triage decisions`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.status ?? "not_started";
  const suggestions = data?.suggestions ?? [];

  const filtered = suggestions.filter((s) => {
    if (filterDecision && s.suggested_decision !== filterDecision) return false;
    if (filterPriority && s.priority !== filterPriority) return false;
    return true;
  });

  const unaccepted = suggestions.filter((s) => !s.accepted && s.confidence >= minConf);

  // ── Health / key check ───────────────────────────────────────────────────
  if (health.data && (!health.data.configured || !health.data.working)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600/20">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-content">AI Not Available</h3>
        <p className="mt-2 max-w-md text-center text-sm text-amber-400">{health.data.error}</p>
      </div>
    );
  }

  // ── Not started state ────────────────────────────────────────────────────
  if (status === "not_started") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/20">
          <Sparkles className="h-7 w-7 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-content">AI Auto-Triage</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-content-muted">
          Claude AI will analyze untriaged findings and suggest triage decisions with confidence
          scores.
        </p>
        <button
          type="button"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-purple-500 hover:to-blue-500 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {trigger.isPending ? "Starting…" : "Run AI Auto-Triage"}
        </button>
      </div>
    );
  }

  // ── Running/pending state ────────────────────────────────────────────────
  if (status === "running" || status === "pending") {
    const pct = data?.total ? Math.round((data.processed / data.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/20">
          <Sparkles className="h-7 w-7 animate-pulse text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-content">Analyzing findings…</h3>
        <p className="mt-1 text-sm text-content-muted">
          {data?.processed ?? 0} / {data?.total ?? "?"} processed
        </p>
        <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Failed state ─────────────────────────────────────────────────────────
  if (status === "failed") {
    const errMsg = (data as unknown as { error?: string })?.error || "AI triage failed. Check ANTHROPIC_API_KEY and retry.";
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-900/30">
          <XCircle className="h-6 w-6 text-red-400" />
        </div>
        <p className="max-w-md text-center text-sm text-red-400">{errMsg}</p>
        <button
          type="button"
          onClick={() => trigger.mutate()}
          className="mt-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-800/40 bg-purple-950/20 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-content-muted">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span>
            <span className="font-semibold text-content">{suggestions.length}</span> suggestions ·{" "}
            <span className="font-semibold text-emerald-400">
              {suggestions.filter((s) => s.accepted).length}
            </span>{" "}
            accepted
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-content-faint">Min confidence:</span>
          <select
            className="rounded-lg border border-edge bg-field px-2 py-1 text-xs text-content"
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
          >
            <option value={50}>50%</option>
            <option value={70}>70%</option>
            <option value={80}>80%</option>
            <option value={90}>90%</option>
          </select>
          <button
            type="button"
            onClick={() => acceptAll.mutate()}
            disabled={acceptAll.isPending || unaccepted.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-40"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {acceptAll.isPending ? "Applying…" : `Accept ${unaccepted.length} High Confidence`}
          </button>
          <button
            type="button"
            onClick={() => trigger.mutate()}
            className="rounded-lg border border-purple-700/60 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-950/40"
          >
            Re-analyze
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-edge bg-field px-3 py-1.5 text-sm text-content"
          value={filterDecision}
          onChange={(e) => setFilterDecision(e.target.value)}
        >
          <option value="">All decisions</option>
          <option value="valid">Valid</option>
          <option value="false_positive">False Positive</option>
          <option value="not_applicable">Not Applicable</option>
          <option value="accepted_risk">Accepted Risk</option>
        </select>
        <select
          className="rounded-lg border border-edge bg-field px-3 py-1.5 text-sm text-content"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          <option value="immediate">Immediate</option>
          <option value="soon">Soon</option>
          <option value="low">Low</option>
        </select>
        {(filterDecision || filterPriority) && (
          <button
            type="button"
            className="rounded-lg border border-edge px-3 py-1.5 text-sm text-content-muted hover:text-content"
            onClick={() => { setFilterDecision(""); setFilterPriority(""); }}
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-content-faint self-center">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-edge-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge-soft bg-surface">
              <th className="w-6 py-3 pl-4" />
              <th className="py-3 pr-3 text-left text-xs font-medium uppercase text-content-faint">Fingerprint</th>
              <th className="py-3 pr-3 text-left text-xs font-medium uppercase text-content-faint">AI Decision</th>
              <th className="py-3 pr-3 text-left text-xs font-medium uppercase text-content-faint">Confidence</th>
              <th className="py-3 pr-3 text-left text-xs font-medium uppercase text-content-faint">Priority</th>
              <th className="py-3 pr-3 text-left text-xs font-medium uppercase text-content-faint">Status</th>
              <th className="py-3 pr-4 text-right text-xs font-medium uppercase text-content-faint">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isExpanded = expanded === s.fingerprint;
              return (
                <>
                  <tr
                    key={s.fingerprint}
                    className="cursor-pointer border-b border-edge-soft hover:bg-surface-alt"
                    onClick={() => setExpanded(isExpanded ? null : s.fingerprint)}
                  >
                    <td className="py-3 pl-4 text-content-faint">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-content-faint">
                      {s.fingerprint.slice(0, 12)}…
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${DECISION_STYLE[s.suggested_decision] ?? "text-content-muted"}`}>
                        {s.suggested_decision.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <ConfidenceBar value={s.confidence} />
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${PRIORITY_STYLE[s.priority] ?? "text-content-muted"}`}>
                        {s.priority}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {s.accepted ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle className="h-3.5 w-3.5" /> Accepted
                        </span>
                      ) : (
                        <span className="text-xs text-content-faint">Pending</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {!s.accepted && (
                        <button
                          type="button"
                          onClick={() => accept.mutate(s.fingerprint)}
                          disabled={accept.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700/30 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-700/50 disabled:opacity-50"
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Accept
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${s.fingerprint}-exp`} className="border-b border-edge-soft bg-surface/40">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="rounded-lg border border-purple-800/30 bg-purple-950/20 p-3">
                          <p className="text-xs font-semibold uppercase text-purple-400">AI Reasoning</p>
                          <p className="mt-1 text-sm text-content-secondary">{s.reasoning || "—"}</p>
                          <p className="mt-2 font-mono text-xs text-content-faint">fp: {s.fingerprint}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-content-faint">No suggestions match filters</p>
        )}
      </div>

      {/* AI disclaimer */}
      <p className="text-right text-xs text-content-faint">
        Generated by Claude AI · Review before accepting
      </p>
    </div>
  );
}
