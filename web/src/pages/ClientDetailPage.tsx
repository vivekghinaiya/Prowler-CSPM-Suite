import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  service_principal: "Service Principal",
  managed_identity: "Managed Identity",
  cli: "Azure CLI",
};

const SEV_CLS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/60 dark:text-red-300 dark:border-red-700/50",
  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700/50",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700/40",
  low: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700/40",
};

const DIFF_CLS: Record<string, string> = {
  new: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700/50",
  open: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50",
  closed: "bg-surface-alt text-content-muted border-edge",
};

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  // Azure credential form state
  const [authMethod, setAuthMethod] = useState<AuthMethod>("service_principal");
  const [azureTenant, setAzureTenant] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureSecret, setAzureSecret] = useState("");
  const [azureSubIds, setAzureSubIds] = useState("");
  const [credLabel, setCredLabel] = useState("default");

  // Scan form state
  const [scanLabel, setScanLabel] = useState("");
  const [credId, setCredId] = useState("");
  const [prevScanId, setPrevScanId] = useState("");
  const [credentialSelectInitialized, setCredentialSelectInitialized] = useState(false);

  // Edit / delete client state
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
      apiFetch<Client>(`/api/v1/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setEditClientOpen(false);
    },
  });

  const deleteClient = useMutation({
    mutationFn: () => apiFetch<void>(`/api/v1/clients/${clientId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      nav("/");
    },
  });

  function openEditClient() {
    if (!client.data) return;
    setEditName(client.data.name);
    setEditDesc(client.data.description ?? "");
    setEditClientOpen(true);
  }

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
      // managed_identity / cli — no secrets
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
    },
  });

  const deleteCred = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/credentials/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["creds", clientId] }),
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
  });

  const completedScans = useMemo(
    () => scans.data?.filter((s) => s.status === "completed") ?? [],
    [scans.data],
  );

  // Auto-select first available credential
  useEffect(() => {
    if (credentialSelectInitialized || !creds.data?.length) return;
    setCredId(creds.data[0].id);
    setCredentialSelectInitialized(true);
  }, [creds.data, credentialSelectInitialized]);

  const credSaveDisabled =
    addCred.isPending ||
    (authMethod === "service_principal" && (!azureTenant || !azureClientId || !azureSecret));

  if (!clientId) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:max-w-5xl xl:max-w-6xl sm:px-6">
      <Link to="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Clients
      </Link>
      {client.data && (
        <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{client.data.name}</h1>
            {client.data.description && <p className="text-content-muted">{client.data.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-edge px-3 py-1.5 text-sm text-content hover:bg-surface-alt"
              onClick={openEditClient}
            >
              Edit client
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={() => setDeleteClientOpen(true)}
            >
              Delete client
            </button>
          </div>
        </header>
      )}

      {/* Dashboard */}
      <section className="mb-8 rounded-xl border border-edge-soft bg-surface/40 p-4">
        <h2 className="mb-3 text-lg font-medium">Dashboard</h2>
        {dashboard.data && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-edge-soft p-3">
              <div className="text-xs uppercase text-content-faint">Total findings</div>
              <div className="text-2xl font-semibold">{dashboard.data.total_findings}</div>
            </div>
            <div className="rounded-lg border border-edge-soft p-3">
              <div className="mb-2 text-xs uppercase text-content-faint">By severity</div>
              <div className="flex flex-wrap gap-2">
                {(["critical", "high", "medium", "low"] as const).map((sev) => {
                  const n = dashboard.data!.by_severity[sev] ?? 0;
                  return (
                    <span key={sev} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${SEV_CLS[sev]}`}>
                      {sev} <span className="font-semibold">{n}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            {dashboard.data.diff_counts && (
              <div className="rounded-lg border border-edge-soft p-3 sm:col-span-2">
                <div className="mb-2 text-xs uppercase text-content-faint">Diff (latest scan)</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(dashboard.data.diff_counts).map(([cat, n]) => (
                    <span key={cat} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${DIFF_CLS[cat] ?? "text-content-secondary"}`}>
                      {cat} <span className="font-semibold">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Azure Credentials */}
      <section className="mb-8 rounded-xl border border-edge-soft bg-surface/40 p-4">
        <h2 className="mb-1 text-lg font-medium">Azure credentials</h2>
        <p className="mb-4 text-sm text-content-faint">
          Add Azure credentials for Prowler to scan this client's Azure subscriptions. Secrets are
          encrypted on the server and never returned in API responses.
        </p>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">Label</label>
            <input
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
              placeholder="e.g. prod, staging"
              value={credLabel}
              onChange={(e) => setCredLabel(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">Auth method</label>
            <select
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
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
                <label className="mb-1 block text-xs font-medium text-content-muted">Directory (Tenant) ID</label>
                <input
                  className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={azureTenant}
                  onChange={(e) => setAzureTenant(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-content-muted">Application (Client) ID</label>
                <input
                  className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={azureClientId}
                  onChange={(e) => setAzureClientId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-content-muted">Client secret</label>
                <input
                  className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
                  placeholder="Client secret value"
                  type="password"
                  value={azureSecret}
                  onChange={(e) => setAzureSecret(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">
              Subscription IDs <span className="font-normal text-content-faint">(optional — comma-separated; leave blank to scan all accessible)</span>
            </label>
            <input
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
              placeholder="sub-id-1, sub-id-2"
              value={azureSubIds}
              onChange={(e) => setAzureSubIds(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="button"
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={credSaveDisabled}
          onClick={() => addCred.mutate()}
        >
          Save credential
        </button>

        <ul className="mt-4 space-y-2 text-sm">
          {creds.data?.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded border border-edge-soft px-3 py-2"
            >
              <span>
                <span className="mr-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs uppercase text-blue-600 dark:text-blue-300">
                  azure
                </span>
                {c.label} · {AUTH_METHOD_LABELS[c.auth_method as AuthMethod] ?? c.auth_method}
              </span>
              <div className="flex items-center gap-2">
                <span className="hidden font-mono text-xs text-content-faint sm:inline">{c.id.slice(0, 8)}…</span>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => {
                    if (window.confirm("Remove this credential?")) deleteCred.mutate(c.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Start Azure scan */}
      <section className="rounded-xl border border-edge-soft bg-surface/40 p-4">
        <h2 className="mb-3 text-lg font-medium">Start Azure audit</h2>
        <p className="mb-3 text-sm text-content-faint">
          Select a saved Azure credential below and optionally compare against a previous scan.
          Prowler will run against the configured Azure subscriptions.
        </p>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">Credential</label>
            <select
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
              value={credId}
              onChange={(e) => setCredId(e.target.value)}
            >
              <option value="">Select a credential…</option>
              {creds.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({AUTH_METHOD_LABELS[c.auth_method as AuthMethod] ?? c.auth_method})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">Scan label</label>
            <input
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
              placeholder="e.g. Initial scan"
              value={scanLabel}
              onChange={(e) => setScanLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">
              Compare to previous scan (optional)
            </label>
            <select
              className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
              value={prevScanId}
              onChange={(e) => setPrevScanId(e.target.value)}
            >
              <option value="">None — no diff baseline</option>
              {completedScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.label || "Scan") + " · " + s.id.slice(0, 8)}… ({s.status})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={startScan.isPending || !credId}
          onClick={() => startScan.mutate()}
        >
          Start Azure scan (Prowler)
        </button>
        <ul className="mt-6 space-y-2 text-sm">
          {scans.data?.map((s) => (
            <li key={s.id}>
              <Link className="text-blue-600 hover:underline dark:text-blue-400" to={`/scans/${s.id}`}>
                {s.label || "Scan"} ·{" "}
                <span className={s.status === "cancelled" ? "text-amber-600 dark:text-amber-400/90" : ""}>{s.status}</span> ·{" "}
                {s.progress_pct}%
              </Link>
              <span className="ml-2 font-mono text-xs text-content-faint">{s.id}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Edit client modal */}
      {editClientOpen && client.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Edit client</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-content-muted">Name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-content-muted">Description</label>
                <input
                  className="mt-1 w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content"
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
                  updateClient.mutate({ name: editName.trim(), description: editDesc.trim() || undefined })
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete client modal */}
      {deleteClientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete this client?</h2>
            <p className="mt-2 text-sm text-content-muted">All credentials and scans for this client will be removed.</p>
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
