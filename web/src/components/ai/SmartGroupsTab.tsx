import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/client";

type SmartGroup = {
  group_id: string;
  title: string;
  root_cause: string;
  single_fix: string;
  finding_fingerprints: string[];
  finding_count: number;
  max_severity: string;
  affected_services: string[];
  effort_to_fix: "quick" | "moderate" | "significant";
};

type GroupingResult = {
  status: string;
  grouping?: {
    scan_id: string;
    groups: SmartGroup[];
    total_findings: number;
    group_count: number;
    cached: boolean;
    created_at?: string;
  };
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-950/60 text-red-300 border-red-700/50",
  high: "bg-orange-950/50 text-orange-300 border-orange-700/50",
  medium: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  low: "bg-sky-950/40 text-sky-300 border-sky-700/40",
};

const EFFORT_STYLE: Record<string, string> = {
  quick: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50",
  moderate: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  significant: "bg-red-950/60 text-red-300 border-red-700/50",
};

export default function SmartGroupsTab({
  scanId,
  clientId,
}: {
  scanId: string;
  clientId: string;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"count" | "severity" | "effort">("count");

  const { data } = useQuery<GroupingResult>({
    queryKey: ["ai-group", scanId],
    queryFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-group`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "pending" ? 2000 : false;
    },
  });

  const trigger = useMutation({
    mutationFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-group`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-group", scanId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reanalyze = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/scans/${scanId}/ai-group`, { method: "DELETE" });
      return apiFetch(`/api/v1/scans/${scanId}/ai-group`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-group", scanId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const triageAll = useMutation({
    mutationFn: ({ fingerprints, state }: { fingerprints: string[]; state: string }) =>
      Promise.all(
        fingerprints.map((fp) =>
          apiFetch(`/api/v1/clients/${clientId}/triage/${fp}`, {
            method: "PUT",
            body: JSON.stringify({ state }),
          })
        )
      ),
    onSuccess: (_, { fingerprints }) => {
      qc.invalidateQueries({ queryKey: ["findings", scanId] });
      toast.success(`Triaged ${fingerprints.length} findings`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.status ?? "not_started";
  const grouping = data?.grouping;

  // ── Not started ──────────────────────────────────────────────────────────
  if (status === "not_started") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/20">
          <Sparkles className="h-7 w-7 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-content">AI Smart Grouping</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-content-muted">
          AI groups hundreds of findings by root cause so you can fix one issue and resolve many
          findings at once.
        </p>
        <button
          type="button"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-purple-500 hover:to-blue-500 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {trigger.isPending ? "Starting…" : "Analyze Patterns"}
        </button>
      </div>
    );
  }

  // ── Running ──────────────────────────────────────────────────────────────
  if (status === "running" || status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/20">
          <Sparkles className="h-7 w-7 animate-pulse text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-content">Analyzing patterns…</h3>
        <p className="mt-1 text-sm text-content-muted">This usually takes 30–60 seconds</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center py-12">
        <p className="text-sm text-red-400">AI grouping failed. Check GEMINI_API_KEY and retry.</p>
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

  if (!grouping) return null;

  const _SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const _EFFORT_ORDER: Record<string, number> = { quick: 0, moderate: 1, significant: 2 };
  const sorted = [...grouping.groups].sort((a, b) => {
    if (sortBy === "count") return b.finding_count - a.finding_count;
    if (sortBy === "severity")
      return (_SEV_ORDER[a.max_severity] ?? 4) - (_SEV_ORDER[b.max_severity] ?? 4);
    return (_EFFORT_ORDER[a.effort_to_fix] ?? 2) - (_EFFORT_ORDER[b.effort_to_fix] ?? 2);
  });

  return (
    <div className="space-y-4">
      {/* Header stat */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-800/40 bg-purple-950/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm text-content-muted">
            AI reduced{" "}
            <span className="font-bold text-content">{grouping.total_findings.toLocaleString()}</span>{" "}
            findings into{" "}
            <span className="font-bold text-purple-300">{grouping.group_count}</span> actionable
            groups
          </span>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-edge bg-field px-2 py-1 text-xs text-content"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="count">Sort: Most findings</option>
            <option value="severity">Sort: Severity</option>
            <option value="effort">Sort: Easiest first</option>
          </select>
          <button
            type="button"
            onClick={() => reanalyze.mutate()}
            disabled={reanalyze.isPending}
            className="rounded-lg border border-purple-700/60 px-3 py-1 text-xs text-purple-300 hover:bg-purple-950/40 disabled:opacity-50"
          >
            Re-analyze
          </button>
        </div>
      </div>

      {/* Group cards */}
      <div className="space-y-2">
        {sorted.map((g) => {
          const isExp = expanded === g.group_id;
          return (
            <div
              key={g.group_id}
              className="overflow-hidden rounded-xl border border-edge-soft bg-surface shadow-sm"
            >
              {/* Card header */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-alt transition-colors"
                onClick={() => setExpanded(isExp ? null : g.group_id)}
              >
                {isExp ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-content-faint" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-content-faint" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{g.title}</p>
                  <p className="mt-0.5 text-xs text-content-faint">
                    {g.affected_services.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEV_STYLE[g.max_severity] ?? "text-content-muted"}`}>
                    {g.max_severity}
                  </span>
                  <span className="rounded-full border border-blue-700/50 bg-blue-950/40 px-2 py-0.5 text-xs font-bold text-blue-300">
                    {g.finding_count}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${EFFORT_STYLE[g.effort_to_fix] ?? "text-content-muted"}`}>
                    {g.effort_to_fix}
                  </span>
                </div>
              </button>

              {/* Expanded body */}
              {isExp && (
                <div className="border-t border-edge-soft px-5 py-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-edge-soft bg-surface-alt p-3">
                      <p className="text-xs font-semibold uppercase text-content-faint">Root Cause</p>
                      <p className="mt-1 text-sm text-content-secondary">{g.root_cause}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-emerald-400">
                        <Wrench className="h-3.5 w-3.5" /> Single Fix
                      </p>
                      <p className="mt-1 text-sm text-content-secondary">{g.single_fix}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-content-faint">
                      Affected fingerprints ({g.finding_count}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.finding_fingerprints.slice(0, 8).map((fp) => (
                        <span key={fp} className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-xs text-content-faint">
                          {fp.slice(0, 10)}…
                        </span>
                      ))}
                      {g.finding_fingerprints.length > 8 && (
                        <span className="text-xs text-content-faint">
                          +{g.finding_fingerprints.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bulk triage */}
                  <div className="flex flex-wrap gap-2 border-t border-edge-soft pt-3">
                    <span className="self-center text-xs text-content-faint">Bulk triage all:</span>
                    {(["valid", "false_positive", "not_applicable"] as const).map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={() => triageAll.mutate({ fingerprints: g.finding_fingerprints, state })}
                        disabled={triageAll.isPending}
                        className="rounded-lg border border-edge px-3 py-1 text-xs text-content-muted hover:bg-surface-alt hover:text-content disabled:opacity-50"
                      >
                        {state.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-right text-xs text-content-faint">Generated by Gemini AI · Review before bulk-triaging</p>
    </div>
  );
}
