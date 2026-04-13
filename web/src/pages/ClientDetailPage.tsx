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
  critical: "badge badge-critical",
  high: "badge badge-high",
  medium: "badge badge-medium",
  low: "badge badge-low",
};

const STATUS_BADGE: Record<string, string> = {
  completed: "badge badge-completed",
  running: "badge badge-running",
  pending: "badge badge-pending",
  failed: "badge badge-failed",
  cancelled: "badge badge-cancelled",
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
      className="flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors"
      style={
        active
          ? {
              borderColor: "#00ff41",
              color: "#00ff41",
              fontFamily: '"Orbitron", sans-serif',
              letterSpacing: "1px",
            }
          : {
              borderColor: "transparent",
              color: "#4a4a5a",
              fontFamily: '"Orbitron", sans-serif',
              letterSpacing: "1px",
            }
      }
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
      <div className="mb-6 flex items-center gap-2 pt-2 text-xs text-content-faint md:pt-0">
        <Link to="/clients" className="hover:text-content transition-colors" style={{ color: "rgba(0,255,65,0.5)" }}>
          Clients
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span style={{ color: "#7a7a8a" }}>{client.data?.name ?? "…"}</span>
      </div>

      {/* Client header */}
      {client.data && (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl font-black uppercase tracking-widest"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#00ff41", textShadow: "0 0 16px rgba(0,255,65,0.3)" }}
            >
              {client.data.name}
            </h1>
            {client.data.description && (
              <p className="mt-1 text-xs text-content-muted">{client.data.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-cyber-ghost" onClick={openEditClient}>
              Edit
            </button>
            <button type="button" className="btn-cyber-danger" onClick={() => setDeleteClientOpen(true)}>
              Delete
            </button>
          </div>
        </header>
      )}

      {/* Tab navigation */}
      <div className="mb-6 flex border-b" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 stagger">
                <div className="card-cyber p-4">
                  <p className="text-[10px] uppercase tracking-[2px] text-content-faint" style={{ fontFamily: '"Orbitron", sans-serif' }}>Total Findings</p>
                  <p className="mt-2 text-3xl font-black" style={{ color: "#00ff41", fontFamily: '"Orbitron", sans-serif', textShadow: "0 0 12px rgba(0,255,65,0.3)" }}>
                    {dashboard.data.total_findings}
                  </p>
                </div>
                {(["critical", "high", "medium", "low"] as const).map((sev) => {
                  const n = dashboard.data!.by_severity[sev] ?? 0;
                  const color = sev === "critical" ? "#ff003c" : sev === "high" ? "#ff6400" : sev === "medium" ? "#ffbe00" : "#00d4ff";
                  return (
                    <div key={sev} className="card-cyber p-4">
                      <p className="text-[10px] uppercase tracking-[2px] text-content-faint" style={{ fontFamily: '"Orbitron", sans-serif' }}>{sev}</p>
                      <p className="mt-2 text-3xl font-black" style={{ color, fontFamily: '"Orbitron", sans-serif', textShadow: `0 0 12px ${color}40` }}>
                        {n}
                      </p>
                    </div>
                  );
                })}
              </div>

              {dashboard.data.diff_counts && (
                <div className="card-cyber p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2px] text-content-faint" style={{ fontFamily: '"Orbitron", sans-serif' }}>
                    Diff vs previous scan
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(dashboard.data.diff_counts).map(([cat, n]) => (
                      <div key={cat} className="rounded-lg px-4 py-2" style={{ background: "rgba(0,255,65,0.05)", border: "1px solid rgba(0,255,65,0.1)" }}>
                        <p className="text-[10px] uppercase text-content-faint">{cat}</p>
                        <p className="text-xl font-bold text-content">{n}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(dashboard.data.by_service).length > 0 && (
                <div className="card-cyber p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2px] text-content-faint" style={{ fontFamily: '"Orbitron", sans-serif' }}>
                    By Azure Service
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dashboard.data.by_service)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 12)
                      .map(([svc, n]) => (
                        <span
                          key={svc}
                          className="rounded-full px-2.5 py-1 text-[10px] text-content-secondary"
                          style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}
                        >
                          {svc} <span className="font-semibold" style={{ color: "#00d4ff" }}>{n}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-16 text-xs text-content-faint">
              {dashboard.isLoading ? "Loading…" : "No scan data yet. Run a scan to see results."}
            </div>
          )}
        </div>
      )}

      {/* ─── Credentials Tab ─── */}
      {tab === "credentials" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-content-muted">
              Secrets are encrypted server-side and never returned in API responses.
            </p>
            <button type="button" onClick={() => setShowCredForm(!showCredForm)} className="btn-cyber">
              <Plus className="h-3.5 w-3.5" />
              Add Credential
            </button>
          </div>

          {/* Credential form */}
          {showCredForm && (
            <div className="card-cyber p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3
                  className="text-[10px] font-semibold uppercase tracking-[2px]"
                  style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
                >
                  New Azure Credential
                </h3>
                <button type="button" onClick={() => setShowCredForm(false)}>
                  <X className="h-4 w-4 text-content-faint hover:text-content" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Label", value: credLabel, onChange: (v: string) => setCredLabel(v), placeholder: "e.g. prod" },
                ].map(({ label, value, onChange, placeholder }) => (
                  <div key={label}>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>{label}</label>
                    <input
                      className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none transition-all"
                      style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>Auth Method</label>
                  <select
                    className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                    style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
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
                    {[
                      { label: "Directory (Tenant) ID", value: azureTenant, onChange: setAzureTenant, ph: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
                      { label: "Application (Client) ID", value: azureClientId, onChange: setAzureClientId, ph: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
                    ].map(({ label, value, onChange, ph }) => (
                      <div key={label}>
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>{label}</label>
                        <input
                          className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                          style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                          placeholder={ph}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>Client Secret</label>
                      <input
                        className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                        style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
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
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
                    Subscription IDs{" "}
                    <span className="font-normal text-content-faint normal-case tracking-normal">(optional, comma-separated)</span>
                  </label>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                    style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                    placeholder="sub-id-1, sub-id-2"
                    value={azureSubIds}
                    onChange={(e) => setAzureSubIds(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn-cyber-ghost" onClick={() => setShowCredForm(false)}>Cancel</button>
                <button type="button" className="btn-cyber" disabled={credSaveDisabled} onClick={() => addCred.mutate()}>
                  {addCred.isPending ? "Saving…" : "[ Save ]"}
                </button>
              </div>
            </div>
          )}

          {/* Credentials list */}
          {creds.data?.length === 0 && !showCredForm && (
            <div className="flex flex-col items-center justify-center rounded-xl py-12 text-center" style={{ border: "1px dashed rgba(0,255,65,0.15)" }}>
              <Key className="mb-3 h-8 w-8" style={{ color: "rgba(0,255,65,0.3)" }} />
              <p className="text-xs text-content-muted">No credentials configured</p>
              <button type="button" onClick={() => setShowCredForm(true)} className="btn-cyber mt-4">
                Add Credential
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {creds.data?.map((c) => (
              <li key={c.id} className="card-cyber flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}
                  >
                    <Key className="h-4 w-4" style={{ color: "#00d4ff" }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-content">{c.label}</p>
                    <p className="text-[10px] text-content-faint">
                      {AUTH_LABELS[c.auth_method as AuthMethod] ?? c.auth_method} · <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{c.id.slice(0, 8)}…</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-cyber-danger flex items-center gap-1.5 disabled:opacity-50"
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
          <div className="card-cyber p-5">
            <h3
              className="mb-4 text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
              Launch New Azure Audit
            </h3>
            {!creds.data?.length ? (
              <div className="rounded-lg p-3 text-xs text-content-muted" style={{ background: "rgba(255,190,0,0.05)", border: "1px solid rgba(255,190,0,0.15)" }}>
                No credentials configured.{" "}
                <button type="button" className="hover:underline" style={{ color: "#00d4ff" }} onClick={() => setTab("credentials")}>
                  Add a credential
                </button>{" "}
                first.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Credential", type: "select" as const },
                  { label: "Scan Label", type: "input" as const },
                  { label: "Compare To", type: "select-prev" as const },
                ].map(({ label, type }) => (
                  <div key={label}>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>{label}</label>
                    {type === "input" ? (
                      <input
                        className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                        style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                        placeholder="e.g. Initial scan"
                        value={scanLabel}
                        onChange={(e) => setScanLabel(e.target.value)}
                      />
                    ) : type === "select" ? (
                      <select
                        className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                        style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                        value={credId}
                        onChange={(e) => setCredId(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {creds.data?.map((c) => (
                          <option key={c.id} value={c.id}>{c.label} ({AUTH_LABELS[c.auth_method as AuthMethod] ?? c.auth_method})</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                        style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                        value={prevScanId}
                        onChange={(e) => setPrevScanId(e.target.value)}
                      >
                        <option value="">No baseline</option>
                        {completedScans.map((s) => (
                          <option key={s.id} value={s.id}>{(s.label || "Scan") + " · " + s.id.slice(0, 8)}…</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!!creds.data?.length && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="btn-cyber"
                  disabled={startScan.isPending || !credId}
                  onClick={() => startScan.mutate()}
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  {startScan.isPending ? "Starting…" : "[ Launch Scan ]"}
                </button>
              </div>
            )}
          </div>

          {/* Scan history */}
          <div className="card-cyber overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}>
              <h3
                className="text-[10px] font-semibold uppercase tracking-[2px] text-content-faint"
                style={{ fontFamily: '"Orbitron", sans-serif' }}
              >
                Scan History
              </h3>
            </div>
            {scans.isLoading && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full" style={{ border: "2px solid rgba(0,255,65,0.2)", borderTopColor: "#00ff41" }} />
              </div>
            )}
            {scans.data?.length === 0 && !scans.isLoading && (
              <p className="px-5 py-8 text-center text-xs text-content-faint">No scans yet</p>
            )}
            <ul>
              {scans.data?.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/scans/${s.id}`}
                    className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-alt"
                    style={{ borderBottom: "1px solid rgba(0,255,65,0.04)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-content">{s.label || "Scan"}</p>
                      <p className="mt-0.5 text-[10px] text-content-faint">
                        {new Date(s.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pl-4">
                      <span className={STATUS_BADGE[s.status] ?? "badge"}>{s.status}</span>
                      {s.status === "running" && (
                        <span className="text-[10px] text-content-faint">{s.progress_pct}%</span>
                      )}
                      <ChevronRight className="h-4 w-4" style={{ color: "rgba(0,255,65,0.3)" }} />
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          role="dialog"
          onClick={() => setDeleteCredTarget(null)}
        >
          <div className="card-cyber w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#ff003c" }}>
              Remove Credential?
            </h2>
            <p className="text-sm text-content-secondary">
              This will permanently remove <span className="font-semibold text-content">{deleteCredTarget.label}</span>. Existing scans will remain.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-cyber-ghost" onClick={() => setDeleteCredTarget(null)}>Cancel</button>
              <button type="button" className="btn-cyber-danger" disabled={deleteCred.isPending} onClick={() => deleteCred.mutate(deleteCredTarget.id)}>
                {deleteCred.isPending ? "Removing…" : "[ Remove ]"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit client modal */}
      {editClientOpen && client.data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          role="dialog"
          onClick={() => setEditClientOpen(false)}
        >
          <div className="card-cyber w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
              Edit Client
            </h2>
            <div className="space-y-4">
              {[
                { label: "Name", value: editName, onChange: setEditName },
                { label: "Description", value: editDesc, onChange: setEditDesc },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>{label}</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-xs text-content outline-none"
                    style={{ background: "rgba(20,20,30,0.8)", border: "1px solid rgba(0,255,65,0.15)", fontFamily: '"JetBrains Mono", monospace' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-cyber-ghost" onClick={() => setEditClientOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn-cyber"
                disabled={updateClient.isPending || !editName.trim()}
                onClick={() => updateClient.mutate({ name: editName.trim(), description: editDesc.trim() || undefined })}
              >
                {updateClient.isPending ? "Saving…" : "[ Save ]"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete client modal */}
      {deleteClientOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          role="dialog"
          onClick={() => setDeleteClientOpen(false)}
        >
          <div className="card-cyber w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#ff003c" }}>
              Delete Client?
            </h2>
            <p className="mt-3 text-sm text-content-secondary">
              All credentials and scans for <span className="font-semibold text-content">{client.data?.name}</span> will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-cyber-ghost" onClick={() => setDeleteClientOpen(false)}>Cancel</button>
              <button type="button" className="btn-cyber-danger" disabled={deleteClient.isPending} onClick={() => deleteClient.mutate()}>
                {deleteClient.isPending ? "Deleting…" : "[ Delete ]"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
