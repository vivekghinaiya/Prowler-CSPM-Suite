import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Key,
  LayoutDashboard,
  Plus,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";

type Credential = {
  id: string;
  label: string;
  provider: string;
  auth_method: string;
  created_at: string;
};

type Scan = {
  id: string;
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

type Client = { id: string; name: string; description: string | null };

type AuthMethod = "service_principal" | "managed_identity" | "cli";

const AUTH_LABELS: Record<AuthMethod, string> = {
  service_principal: "Service Principal",
  managed_identity: "Managed Identity",
  cli: "Azure CLI",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-950/60 text-red-300 border-red-700/50",
  high: "bg-orange-950/50 text-orange-300 border-orange-700/50",
  medium: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  low: "bg-sky-950/40 text-sky-300 border-sky-700/40",
};

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50",
  running: "bg-blue-950/60 text-blue-300 border-blue-700/50",
  pending: "bg-yellow-950/40 text-yellow-300 border-yellow-700/40",
  failed: "bg-red-950/60 text-red-300 border-red-700/50",
  cancelled: "bg-slate-800/60 text-slate-300 border-slate-600/50",
};

type Tab = "dashboard" | "credentials" | "scans";

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-blue-500 text-blue-400"
          : "border-transparent text-content-muted hover:border-edge hover:text-content"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Credential form state
  const [authMethod, setAuthMethod] = useState<AuthMethod>("service_principal");
  const [azureTenant, setAzureTenant] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureSecret, setAzureSecret] = useState("");
  const [azureSubIds, setAzureSubIds] = useState("");
  const [credLabel, setCredLabel] = useState("default");
  const [showCredForm, setShowCredForm] = useState(false);
  const [deleteCredTarget, setDeleteCredTarget] = useState<Credential | null>(null);

  // Scan form state
  const [scanLabel, setScanLabel] = useState("");
  const [credId, setCredId] = useState("");
  const [prevScanId, setPrevScanId] = useState("");
  const [credentialSelectInitialized, setCredentialSelectInitialized] = useState(false);

  // Client edit/delete state
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => apiFetch<Client>(`/api/v1/clients/${clientId}`),
    enabled: !!clientId,
  });

  const creds = useQuery({
    queryKey: ["creds", clientId],
    queryFn: () => apiFetch<Credential[]>(`/api/v1/clients/${clientId}/credentials`),
    enabled: !!clientId,
  });

  const scans = useQuery({
    queryKey: ["scans", clientId],
    queryFn: () => apiFetch<Scan[]>(`/api/v1/clients/${clientId}/scans`),
    enabled: !!clientId,
    refetchInterval: 4000,
  });

  const dashboard = useQuery({
    queryKey: ["dash", clientId],
    queryFn: () => apiFetch<Dashboard>(`/api/v1/clients/${clientId}/dashboard`),
    enabled: !!clientId,
    refetchInterval: 5000,
  });

  const updateClient = useMutation({
    mutationFn: (body: { name?: string; description?: string }) =>
      apiFetch<Client>(`/api/v1/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setEditClientOpen(false);
      toast.success("Client updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClient = useMutation({
    mutationFn: () => apiFetch<void>(`/api/v1/clients/${clientId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      nav("/clients");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCred = useMutation({
    mutationFn: () => {
      const label = credLabel || "default";
      const subIds = azureSubIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (authMethod === "service_principal") {
        return apiFetch<Credential>(`/api/v1/clients/${clientId}/credentials`, {
          method: "POST",
          body: JSON.stringify({
            label,
            auth_method: "service_principal",
            azure_sp: {
              tenant_id: azureTenant,
              client_id: azureClientId,
              client_secret: azureSecret,
              subscription_ids: subIds,
            },
          }),
        });
      }
      return apiFetch<Credential>(`/api/v1/clients/${clientId}/credentials`, {
        method: "POST",
        body: JSON.stringify({
          label,
          auth_method: authMethod,
          azure_sub: { subscription_ids: subIds },
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creds", clientId] });
      setAzureTenant("");
      setAzureClientId("");
      setAzureSecret("");
      setAzureSubIds("");
      setCredLabel("default");
      setShowCredForm(false);
      toast.success("Credential saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCred = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/credentials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creds", clientId] });
      setDeleteCredTarget(null);
      toast.success("Credential removed");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteCredTarget(null);
    },
  });

  const startScan = useMutation({
    mutationFn: () =>
      apiFetch<Scan>(`/api/v1/clients/${clientId}/scans`, {
        method: "POST",
        body: JSON.stringify({
          credential_id: credId,
          label: scanLabel || null,
          previous_scan_id: prevScanId || null,
        }),
      }),
    onSuccess: (s) => nav(`/scans/${s.id}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const completedScans = useMemo(
    () => scans.data?.filter((s) => s.status === "completed") ?? [],
    [scans.data],
  );

  useEffect(() => {
    if (credentialSelectInitialized || !creds.data?.length) return;
    setCredId(creds.data[0].id);
    setCredentialSelectInitialized(true);
  }, [creds.data, credentialSelectInitialized]);

  function openEditClient() {
    if (!client.data) return;
    setEditName(client.data.name);
    setEditDesc(client.data.description ?? "");
    setEditClientOpen(true);
  }

  const credSaveDisabled =
    addCred.isPending ||
    (authMethod === "service_principal" && (!azureTenant || !azureClientId || !azureSecret));

  if (!clientId) return null;

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-content-faint">
        <Link to="/clients" className="hover:text-content transition-colors">
          Clients
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-content-muted">{client.data?.name ?? "…"}</span>
      </div>

      {/* Client header */}
      {client.data && (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-content">{client.data.name}</h1>
            {client.data.description && (
              <p className="mt-1 text-sm text-content-muted">{client.data.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-edge px-3 py-1.5 text-sm text-content-muted transition-colors hover:bg-surface-alt hover:text-content"
              onClick={openEditClient}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-800/60 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-950/40"
              onClick={() => setDeleteClientOpen(true)}
            >
              Delete
            </button>
          </div>
        </header>
      )}

      {/* Tab navigation */}
      <div className="mb-6 flex border-b border-edge-soft">
        <TabBtn
          active={tab === "dashboard"}
          onClick={() => setTab("dashboard")}
          icon={LayoutDashboard}
          label="Dashboard"
        />
        <TabBtn
          active={tab === "credentials"}
          onClick={() => setTab("credentials")}
          icon={Key}
          label={`Credentials${creds.data ? ` (${creds.data.length})` : ""}`}
        />
        <TabBtn
          active={tab === "scans"}
          onClick={() => setTab("scans")}
          icon={ScanLine}
          label={`Scans${scans.data ? ` (${scans.data.length})` : ""}`}
        />
      </div>

      {/* ─── Dashboard Tab ─── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {dashboard.data ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-edge-soft bg-surface p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-content-faint">Total Findings</p>
                  <p className="mt-2 text-3xl font-bold text-content">
                    {dashboard.data.total_findings}
                  </p>
                </div>
                {(["critical", "high", "medium", "low"] as const).map((sev) => {
                  const n = dashboard.data!.by_severity[sev] ?? 0;
                  return (
                    <div key={sev} className="rounded-xl border border-edge-soft bg-surface p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-content-faint">{sev}</p>
                      <p className={`mt-2 text-3xl font-bold ${
                        sev === "critical"
                          ? "text-red-400"
                          : sev === "high"
                            ? "text-orange-400"
                            : sev === "medium"
                              ? "text-yellow-400"
                              : "text-sky-400"
                      }`}>
                        {n}
                      </p>
                    </div>
                  );
                })}
              </div>

              {dashboard.data.diff_counts && (
                <div className="rounded-xl border border-edge-soft bg-surface p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                    Diff vs previous scan
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(dashboard.data.diff_counts).map(([cat, n]) => (
                      <div key={cat} className="rounded-lg border border-edge-soft bg-surface-alt px-4 py-2">
                        <p className="text-xs uppercase text-content-faint">{cat}</p>
                        <p className="text-xl font-bold text-content">{n}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(dashboard.data.by_service).length > 0 && (
                <div className="rounded-xl border border-edge-soft bg-surface p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
                    By Azure Service
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dashboard.data.by_service)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 12)
                      .map(([svc, n]) => (
                        <span
                          key={svc}
                          className="rounded-full border border-edge-soft bg-surface-alt px-2.5 py-1 text-xs text-content-secondary"
                        >
                          {svc} <span className="font-semibold text-content">{n}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-content-faint">
              {dashboard.isLoading ? "Loading…" : "No scan data yet. Run a scan to see results."}
            </div>
          )}
        </div>
      )}

      {/* ─── Credentials Tab ─── */}
      {tab === "credentials" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-content-muted">
              Secrets are encrypted server-side and never returned in API responses.
            </p>
            <button
              type="button"
              onClick={() => setShowCredForm(!showCredForm)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Add Credential
            </button>
          </div>

          {/* Credential form */}
          {showCredForm && (
            <div className="rounded-xl border border-edge-soft bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">New Azure Credential</h3>
                <button type="button" onClick={() => setShowCredForm(false)}>
                  <X className="h-4 w-4 text-content-faint hover:text-content" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-muted">Label</label>
                  <input
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    placeholder="e.g. prod, staging"
                    value={credLabel}
                    onChange={(e) => setCredLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-muted">Auth method</label>
                  <select
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
                  >
                    <option value="service_principal">Service Principal</option>
                    <option value="managed_identity">Managed Identity</option>
                    <option value="cli">Azure CLI</option>
                  </select>
                </div>
                {authMethod === "service_principal" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-content-muted">
                        Directory (Tenant) ID
                      </label>
                      <input
                        className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        value={azureTenant}
                        onChange={(e) => setAzureTenant(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-content-muted">
                        Application (Client) ID
                      </label>
                      <input
                        className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        value={azureClientId}
                        onChange={(e) => setAzureClientId(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-content-muted">
                        Client Secret
                      </label>
                      <input
                        className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                        placeholder="Client secret value"
                        type="password"
                        value={azureSecret}
                        onChange={(e) => setAzureSecret(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-content-muted">
                    Subscription IDs{" "}
                    <span className="font-normal text-content-faint">
                      (optional — comma-separated; leave blank for all accessible)
                    </span>
                  </label>
                  <input
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    placeholder="sub-id-1, sub-id-2"
                    value={azureSubIds}
                    onChange={(e) => setAzureSubIds(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm text-content-muted hover:text-content"
                  onClick={() => setShowCredForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  disabled={credSaveDisabled}
                  onClick={() => addCred.mutate()}
                >
                  {addCred.isPending ? "Saving…" : "Save credential"}
                </button>
              </div>
            </div>
          )}

          {/* Credentials list */}
          {creds.data?.length === 0 && !showCredForm && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge py-12 text-center">
              <Key className="mb-3 h-8 w-8 text-content-faint" />
              <p className="text-sm text-content-muted">No credentials yet</p>
              <button
                type="button"
                onClick={() => setShowCredForm(true)}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Add Credential
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {creds.data?.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
                    <Key className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-content">{c.label}</p>
                    <p className="text-xs text-content-faint">
                      {AUTH_LABELS[c.auth_method as AuthMethod] ?? c.auth_method} ·{" "}
                      <span className="font-mono">{c.id.slice(0, 8)}…</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-red-800/50 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                  disabled={deleteCred.isPending && deleteCredTarget?.id === c.id}
                  onClick={() => setDeleteCredTarget(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteCred.isPending && deleteCredTarget?.id === c.id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Scans Tab ─── */}
      {tab === "scans" && (
        <div className="space-y-6">
          {/* Start scan form */}
          <div className="rounded-xl border border-edge-soft bg-surface p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-content">Start New Azure Audit</h3>
            {!creds.data?.length ? (
              <div className="rounded-lg bg-surface-alt p-3 text-sm text-content-muted">
                No credentials configured.{" "}
                <button
                  type="button"
                  className="text-blue-400 hover:underline"
                  onClick={() => setTab("credentials")}
                >
                  Add a credential
                </button>{" "}
                first.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-muted">Credential</label>
                  <select
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    value={credId}
                    onChange={(e) => setCredId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {creds.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({AUTH_LABELS[c.auth_method as AuthMethod] ?? c.auth_method})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-muted">Scan label</label>
                  <input
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    placeholder="e.g. Initial scan"
                    value={scanLabel}
                    onChange={(e) => setScanLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-muted">
                    Compare to (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                    value={prevScanId}
                    onChange={(e) => setPrevScanId(e.target.value)}
                  >
                    <option value="">No baseline</option>
                    {completedScans.map((s) => (
                      <option key={s.id} value={s.id}>
                        {(s.label || "Scan") + " · " + s.id.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {!!creds.data?.length && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  disabled={startScan.isPending || !credId}
                  onClick={() => startScan.mutate()}
                >
                  <ScanLine className="h-4 w-4" />
                  {startScan.isPending ? "Starting…" : "Start Azure Scan"}
                </button>
              </div>
            )}
          </div>

          {/* Scan history */}
          <div className="rounded-xl border border-edge-soft bg-surface shadow-sm">
            <div className="border-b border-edge-soft px-5 py-4">
              <h3 className="text-sm font-semibold text-content-faint uppercase tracking-wide">
                Scan History
              </h3>
            </div>
            {scans.isLoading && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
            {scans.data?.length === 0 && !scans.isLoading && (
              <p className="px-5 py-8 text-center text-sm text-content-faint">
                No scans yet
              </p>
            )}
            <ul className="divide-y divide-edge-soft">
              {scans.data?.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/scans/${s.id}`}
                    className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-alt"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content">{s.label || "Scan"}</p>
                      <p className="mt-0.5 font-mono text-xs text-content-faint">
                        {new Date(s.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pl-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? "text-content-muted"}`}
                      >
                        {s.status}
                      </span>
                      {s.status === "running" && (
                        <span className="text-xs text-content-faint">{s.progress_pct}%</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-content-faint" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Delete credential modal */}
      {deleteCredTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
          role="dialog"
          onClick={() => setDeleteCredTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-content">Remove credential?</h2>
            <p className="mt-2 text-sm text-content-muted">
              This will permanently remove{" "}
              <span className="font-semibold text-content">{deleteCredTarget.label}</span>. Existing
              scans using this credential will remain.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-content-muted hover:text-content"
                onClick={() => setDeleteCredTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                disabled={deleteCred.isPending}
                onClick={() => deleteCred.mutate(deleteCredTarget.id)}
              >
                {deleteCred.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit client modal */}
      {editClientOpen && client.data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
          role="dialog"
          onClick={() => setEditClientOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-content">Edit client</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-content-muted">Name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-muted">Description</label>
                <input
                  className="mt-1 w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/40"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-content-muted hover:text-content"
                onClick={() => setEditClientOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                disabled={updateClient.isPending || !editName.trim()}
                onClick={() =>
                  updateClient.mutate({
                    name: editName.trim(),
                    description: editDesc.trim() || undefined,
                  })
                }
              >
                {updateClient.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete client modal */}
      {deleteClientOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
          role="dialog"
          onClick={() => setDeleteClientOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-content">Delete this client?</h2>
            <p className="mt-2 text-sm text-content-muted">
              All credentials and scans for{" "}
              <span className="font-semibold text-content">{client.data?.name}</span> will be
              permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-content-muted hover:text-content"
                onClick={() => setDeleteClientOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                disabled={deleteClient.isPending}
                onClick={() => deleteClient.mutate()}
              >
                {deleteClient.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden severity badge classes to keep Tailwind from purging them */}
      <span className="hidden">
        {Object.values(SEV_BADGE).join(" ")} {Object.values(STATUS_BADGE).join(" ")}
      </span>
    </div>
  );
}
