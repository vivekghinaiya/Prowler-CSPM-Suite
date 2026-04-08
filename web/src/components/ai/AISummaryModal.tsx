import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ClipboardCopy, FileText, Printer, Sparkles, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/client";

type SummaryRisk = {
  rank: number;
  title: string;
  description: string;
  affected_resources: number;
  recommendation: string;
};

type QuickWin = {
  title: string;
  description: string;
  impact: string;
  effort: string;
};

type SummaryData = {
  scan_id: string;
  overall_rating: string;
  overall_score: number;
  executive_summary: string;
  top_risks: SummaryRisk[];
  quick_wins: QuickWin[];
  compliance_notes: string;
  next_steps: string[];
  cached: boolean;
  created_at?: string;
};

type StatusResult = {
  status: string;
  summary?: SummaryData;
};

const RATING_STYLE: Record<string, { score: string; label: string; bar: string }> = {
  Excellent: { score: "text-emerald-400", label: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50", bar: "bg-emerald-500" },
  Good: { score: "text-blue-400", label: "bg-blue-950/60 text-blue-300 border-blue-700/50", bar: "bg-blue-500" },
  Fair: { score: "text-yellow-400", label: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40", bar: "bg-yellow-500" },
  Poor: { score: "text-orange-400", label: "bg-orange-950/50 text-orange-300 border-orange-700/50", bar: "bg-orange-500" },
  Critical: { score: "text-red-400", label: "bg-red-950/60 text-red-300 border-red-700/50", bar: "bg-red-500" },
};

export default function AISummaryModal({
  scanId,
  scanLabel,
  onClose,
}: {
  scanId: string;
  scanLabel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [expandedRisk, setExpandedRisk] = useState<number | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<StatusResult>({
    queryKey: ["ai-summary", scanId],
    queryFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-summary`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "pending" ? 2000 : false;
    },
  });

  const trigger = useMutation({
    mutationFn: () => apiFetch(`/api/v1/scans/${scanId}/ai-summary`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-summary", scanId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const regenMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/scans/${scanId}/ai-summary`, { method: "DELETE" });
      return apiFetch(`/api/v1/scans/${scanId}/ai-summary`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-summary", scanId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function copyToClipboard(summary: SummaryData) {
    const text = [
      `AZURE CLOUDGUARD — SECURITY POSTURE REPORT`,
      `Scan: ${scanLabel} | Date: ${new Date().toLocaleDateString()}`,
      `Overall Rating: ${summary.overall_rating} (${summary.overall_score}/100)`,
      ``,
      `EXECUTIVE SUMMARY`,
      summary.executive_summary,
      ``,
      `TOP RISKS`,
      ...summary.top_risks.map((r) => `${r.rank}. ${r.title}\n   ${r.description}\n   → ${r.recommendation}`),
      ``,
      `QUICK WINS`,
      ...summary.quick_wins.map((w) => `• ${w.title}: ${w.description}`),
      ``,
      `NEXT STEPS`,
      ...summary.next_steps.map((s, i) => `${i + 1}. ${s}`),
      ``,
      `COMPLIANCE NOTES`,
      summary.compliance_notes,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Report copied to clipboard"));
  }

  const status = data?.status ?? "not_started";
  const summary = data?.summary;
  const ratingStyles = RATING_STYLE[summary?.overall_rating ?? ""] ?? RATING_STYLE.Fair;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay/80 p-4 pt-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-edge bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-edge-soft px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-content">Security Posture Report</h2>
              <p className="text-xs text-content-faint">{scanLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {summary && (
              <>
                <button
                  type="button"
                  onClick={() => copyToClipboard(summary)}
                  className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-content-muted hover:bg-surface-alt hover:text-content"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-content-muted hover:bg-surface-alt hover:text-content"
                >
                  <Printer className="h-3.5 w-3.5" /> Print PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-content-faint hover:bg-surface-alt hover:text-content"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[80vh] overflow-y-auto p-6 space-y-6">
          {/* Not started */}
          {status === "not_started" && (
            <div className="flex flex-col items-center py-16">
              <Sparkles className="mb-4 h-10 w-10 text-purple-400" />
              <h3 className="text-lg font-semibold text-content">Generate Executive Summary</h3>
              <p className="mt-2 max-w-sm text-center text-sm text-content-muted">
                AI will analyze all findings and produce a management-ready security posture report.
              </p>
              <button
                type="button"
                onClick={() => trigger.mutate()}
                disabled={trigger.isPending}
                className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {trigger.isPending ? "Starting…" : "Generate Report"}
              </button>
            </div>
          )}

          {/* Running */}
          {(status === "running" || status === "pending") && (
            <div className="flex flex-col items-center py-16">
              <Sparkles className="mb-4 h-10 w-10 animate-pulse text-purple-400" />
              <p className="text-sm text-content-muted">Generating executive summary…</p>
            </div>
          )}

          {/* Failed */}
          {status === "failed" && (
            <div className="flex flex-col items-center py-8">
              <p className="text-sm text-red-400">Report generation failed. Check ANTHROPIC_API_KEY.</p>
              <button
                type="button"
                onClick={() => trigger.mutate()}
                className="mt-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </div>
          )}

          {/* Report */}
          {summary && (
            <>
              {/* Score gauge */}
              <div className="flex items-center gap-6 rounded-xl border border-edge-soft bg-surface-alt p-5">
                <div className="flex flex-col items-center">
                  <span className={`text-5xl font-black ${ratingStyles.score}`}>
                    {summary.overall_score}
                  </span>
                  <span className="mt-0.5 text-xs text-content-faint">/ 100</span>
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${ratingStyles.label}`}>
                      {summary.overall_rating}
                    </span>
                    {summary.cached && (
                      <button
                        type="button"
                        onClick={() => regenMutation.mutate()}
                        className="text-xs text-content-faint hover:text-content underline"
                      >
                        Re-generate
                      </button>
                    )}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full transition-all ${ratingStyles.bar}`}
                      style={{ width: `${summary.overall_score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-content-faint">
                    Generated {summary.created_at ? new Date(summary.created_at).toLocaleDateString() : "just now"}
                  </p>
                </div>
              </div>

              {/* Executive summary */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  Executive Summary
                </h3>
                <div className="rounded-xl border border-edge-soft bg-surface p-4 text-sm leading-relaxed text-content-secondary whitespace-pre-wrap">
                  {summary.executive_summary}
                </div>
              </section>

              {/* Top risks */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  Top Risks
                </h3>
                <div className="space-y-2">
                  {summary.top_risks.map((r) => (
                    <div
                      key={r.rank}
                      className="overflow-hidden rounded-xl border-l-4 border-red-600 border-edge-soft bg-surface"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-alt"
                        onClick={() => setExpandedRisk(expandedRisk === r.rank ? null : r.rank)}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-950/60 text-xs font-bold text-red-300">
                          {r.rank}
                        </span>
                        <span className="flex-1 text-sm font-medium text-content">{r.title}</span>
                        <span className="text-xs text-content-faint">{r.affected_resources} resources</span>
                        <ChevronDown className={`h-4 w-4 text-content-faint transition-transform ${expandedRisk === r.rank ? "rotate-180" : ""}`} />
                      </button>
                      {expandedRisk === r.rank && (
                        <div className="border-t border-edge-soft px-4 pb-4 pt-3 space-y-2">
                          <p className="text-sm text-content-secondary">{r.description}</p>
                          <div className="rounded-lg bg-surface-alt p-2">
                            <span className="text-xs font-medium text-content-faint">Recommendation: </span>
                            <span className="text-xs text-content-secondary">{r.recommendation}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Quick wins */}
              {summary.quick_wins.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                    Quick Wins
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {summary.quick_wins.map((w, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4"
                      >
                        <p className="text-sm font-semibold text-emerald-300">{w.title}</p>
                        <p className="mt-1 text-xs text-content-secondary">{w.description}</p>
                        <div className="mt-2 flex gap-3 text-xs text-content-faint">
                          <span>Impact: {w.impact}</span>
                          <span>Effort: {w.effort}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Compliance notes */}
              <section className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-400">
                  Compliance Notes
                </h3>
                <p className="text-sm text-content-secondary">{summary.compliance_notes}</p>
              </section>

              {/* Next steps */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  Recommended Next Steps
                </h3>
                <ul className="space-y-2">
                  {summary.next_steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-edge-soft bg-surface p-3"
                    >
                      <input
                        type="checkbox"
                        checked={checkedSteps.has(i)}
                        onChange={() => {
                          const next = new Set(checkedSteps);
                          next.has(i) ? next.delete(i) : next.add(i);
                          setCheckedSteps(next);
                        }}
                        className="mt-0.5 h-4 w-4 rounded accent-blue-500"
                      />
                      <span className={`text-sm ${checkedSteps.has(i) ? "line-through text-content-faint" : "text-content-secondary"}`}>
                        {step}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="text-right text-xs text-content-faint">
                Generated by Claude AI · For internal use only
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
