import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardCopy, RefreshCw, Sparkles, Terminal, Wrench } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/client";

type RemediationStep = {
  step_number: number;
  title: string;
  description: string;
  azure_cli?: string;
  azure_portal?: string;
  powershell?: string;
};

type RemediationResult = {
  finding_id: string;
  summary: string;
  risk_explanation: string;
  steps: RemediationStep[];
  verification: string;
  impact: string;
  estimated_effort: "quick" | "moderate" | "significant";
  cached: boolean;
};

const EFFORT_STYLE: Record<string, string> = {
  quick: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50",
  moderate: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  significant: "bg-red-950/60 text-red-300 border-red-700/50",
};

function CodeBlock({ code, label }: { code: string; label: string }) {
  function copyToClipboard() {
    navigator.clipboard.writeText(code).then(() => toast.success("Copied!"));
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-edge bg-surface-alt px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs text-content-faint">
          <Terminal className="h-3 w-3" /> {label}
        </span>
        <button
          type="button"
          onClick={copyToClipboard}
          className="flex items-center gap-1 text-xs text-content-faint hover:text-content"
        >
          <ClipboardCopy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border border-edge bg-page px-4 py-3 text-xs text-content-secondary">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function AIRemediationCard({ findingId }: { findingId: string }) {
  const qc = useQueryClient();
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<RemediationResult>({
    queryKey: ["ai-remediate", findingId],
    queryFn: () => apiFetch(`/api/v1/findings/${findingId}/ai-remediate`, { method: "POST" }),
    staleTime: Infinity,
    retry: 1,
  });

  const regenMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/findings/${findingId}/ai-remediate`, { method: "DELETE" });
      return apiFetch<RemediationResult>(`/api/v1/findings/${findingId}/ai-remediate`, { method: "POST" });
    },
    onSuccess: (result) => {
      qc.setQueryData(["ai-remediate", findingId], result);
      toast.success("Remediation regenerated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || regenMutation.isPending) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-purple-800/40 bg-purple-950/20 px-4 py-4">
        <Sparkles className="h-5 w-5 animate-pulse text-purple-400" />
        <p className="text-sm text-content-muted">
          {regenMutation.isPending ? "Regenerating remediation…" : "Generating remediation steps…"}
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4 rounded-xl border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
        AI remediation unavailable — check GEMINI_API_KEY configuration.
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-purple-800/30 bg-purple-950/10 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600">
            <Wrench className="h-3.5 w-3.5 text-white" />
          </div>
          <p className="text-sm font-semibold text-content">AI Remediation Guide</p>
          {data.cached && (
            <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-content-faint">cached</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${EFFORT_STYLE[data.estimated_effort] ?? "text-content-muted"}`}>
            {data.estimated_effort}
          </span>
          <button
            type="button"
            onClick={() => regenMutation.mutate()}
            title="Regenerate"
            className="rounded-lg p-1.5 text-content-faint hover:bg-surface-alt hover:text-content"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm font-medium text-content">{data.summary}</p>

      {/* Risk explanation */}
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase text-amber-400">Why this matters</p>
        <p className="mt-1 text-sm text-content-secondary">{data.risk_explanation}</p>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {data.steps.map((step) => {
          const isExp = expandedStep === step.step_number;
          const hasCli = Boolean(step.azure_cli);
          const hasPortal = Boolean(step.azure_portal);
          const hasPs = Boolean(step.powershell);

          return (
            <div key={step.step_number} className="rounded-lg border border-edge-soft bg-surface overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-alt transition-colors"
                onClick={() => setExpandedStep(isExp ? null : step.step_number)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {step.step_number}
                </span>
                <span className="flex-1 text-sm font-medium text-content">{step.title}</span>
                {isExp ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-content-faint" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-content-faint" />
                )}
              </button>
              {isExp && (
                <div className="border-t border-edge-soft px-4 pb-4 pt-3">
                  <p className="text-sm text-content-secondary">{step.description}</p>
                  {hasCli && <CodeBlock code={step.azure_cli!} label="Azure CLI" />}
                  {hasPs && <CodeBlock code={step.powershell!} label="PowerShell" />}
                  {hasPortal && (
                    <div className="mt-2 rounded-lg border border-edge bg-surface-alt px-3 py-2 text-xs text-content-muted">
                      <span className="font-medium text-content-secondary">Portal: </span>
                      {step.azure_portal}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Verification */}
      <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase text-emerald-400">Verification</p>
        <p className="mt-1 text-sm text-content-secondary">{data.verification}</p>
      </div>

      {/* Impact */}
      <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase text-blue-400">Impact</p>
        <p className="mt-1 text-sm text-content-secondary">{data.impact}</p>
      </div>

      <p className="text-right text-xs text-content-faint">Generated by Gemini AI</p>
    </div>
  );
}
