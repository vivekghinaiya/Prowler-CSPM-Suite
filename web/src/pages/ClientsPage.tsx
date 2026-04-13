import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";

type Client = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const cyberInput =
  "w-full rounded-lg px-3 py-2.5 text-xs text-content outline-none transition-all placeholder-content-faint";
const cyberInputStyle = {
  background: "rgba(20,20,30,0.8)",
  border: "1px solid rgba(0,255,65,0.15)",
  fontFamily: '"JetBrains Mono", monospace',
};

export default function ClientsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiFetch<Client[]>("/api/v1/clients"),
  });

  const create = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      apiFetch<Client>("/api/v1/clients", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setName("");
      setDesc("");
      setShowForm(false);
      toast.success("Client created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; description?: string } }) =>
      apiFetch<Client>(`/api/v1/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setEditing(null);
      toast.success("Client updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setDeleteTarget(null);
      toast.success("Client deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  function openEdit(e: React.MouseEvent, c: Client) {
    e.stopPropagation();
    setEditing(c);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
  }

  return (
    <div className="mx-auto max-w-screen-lg px-6 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between gap-4 pt-2 md:pt-0">
        <div>
          <h1
            className="text-xl font-black uppercase tracking-widest"
            style={{ fontFamily: '"Orbitron", sans-serif', color: "#00ff41", textShadow: "0 0 16px rgba(0,255,65,0.3)" }}
          >
            Clients
          </h1>
          <p className="mt-1 text-xs text-content-muted">
            Azure tenant configurations · Credentials &amp; scans per client
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="btn-cyber"
        >
          <Plus className="h-3.5 w-3.5" />
          New Client
        </button>
      </header>

      {/* Create form */}
      {showForm && (
        <div className="card-cyber mb-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
              New Client
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-content-faint hover:text-content">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate({ name: name.trim(), description: desc.trim() || undefined });
            }}
          >
            <div className="flex-1 space-y-1.5">
              <label className="block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
                Name *
              </label>
              <input
                className={cyberInput}
                style={cyberInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
                Description
              </label>
              <input
                className={cyberInput}
                style={cyberInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <button type="submit" disabled={create.isPending || !name.trim()} className="btn-cyber shrink-0">
              {create.isPending ? "Creating…" : "[ Create ]"}
            </button>
          </form>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div
            className="h-8 w-8 animate-spin rounded-full"
            style={{ border: "2px solid rgba(0,255,65,0.2)", borderTopColor: "#00ff41" }}
          />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data?.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-16 text-center"
          style={{ border: "1px dashed rgba(0,255,65,0.15)" }}
        >
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(0,255,65,0.06)", border: "1px solid rgba(0,255,65,0.15)" }}
          >
            <Plus className="h-6 w-6" style={{ color: "#00ff41" }} />
          </div>
          <p className="text-xs font-medium text-content-muted">No clients configured</p>
          <p className="mt-1 text-[10px] text-content-faint">Add your first Azure tenant to get started</p>
          <button type="button" onClick={() => setShowForm(true)} className="btn-cyber mt-4">
            New Client
          </button>
        </div>
      )}

      {/* Client list */}
      <ul className="space-y-3 stagger">
        {data?.map((c) => (
          <li
            key={c.id}
            onClick={() => nav(`/clients/${c.id}`)}
            className="card-cyber group flex cursor-pointer items-center justify-between gap-4 p-4 transition-all duration-150"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-content">{c.name}</p>
              {c.description && (
                <p className="mt-0.5 truncate text-xs text-content-muted">{c.description}</p>
              )}
              <p className="mt-1 text-[10px] text-content-faint">
                Created {new Date(c.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="btn-cyber-ghost rounded-lg border px-3 py-1.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => openEdit(e, c)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-cyber-danger rounded-lg border px-3 py-1.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
              >
                Delete
              </button>
              <ChevronRight className="h-4 w-4 text-content-faint transition-transform group-hover:translate-x-0.5" style={{ color: "rgba(0,255,65,0.4)" }} />
            </div>
          </li>
        ))}
      </ul>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          role="dialog"
          onClick={() => setEditing(null)}
        >
          <div
            className="card-cyber w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="mb-4 text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}
            >
              Edit Client
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
                  Name
                </label>
                <input
                  className={cyberInput}
                  style={cyberInputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase tracking-[2px]" style={{ fontFamily: '"Orbitron", sans-serif', color: "#4a4a5a" }}>
                  Description
                </label>
                <input
                  className={cyberInput}
                  style={cyberInputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; }}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-cyber-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-cyber"
                disabled={update.isPending || !editName.trim()}
                onClick={() => update.mutate({ id: editing.id, body: { name: editName.trim(), description: editDesc.trim() || undefined } })}
              >
                {update.isPending ? "Saving…" : "[ Save ]"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          role="dialog"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="card-cyber w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="mb-2 text-[10px] font-semibold uppercase tracking-[2px]"
              style={{ fontFamily: '"Orbitron", sans-serif', color: "#ff003c" }}
            >
              Confirm Deletion
            </h2>
            <p className="mt-3 text-sm text-content-secondary">
              Permanently remove{" "}
              <span className="font-semibold text-content">{deleteTarget.name}</span> along with all
              credentials and scans. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-cyber-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-cyber-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget.id)}
              >
                {remove.isPending ? "Deleting…" : "[ Delete ]"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
