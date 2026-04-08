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
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Clients</h1>
          <p className="mt-1 text-sm text-content-muted">
            Each client maps to an Azure tenant with its own credentials and scans.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          New Client
        </button>
      </header>

      {/* Create form (collapsible) */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-edge-soft bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content">New Client</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-content-faint hover:text-content"
            >
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
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-content-muted">Name *</label>
              <input
                className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content placeholder-content-faint outline-none ring-blue-500/40 focus:border-blue-500/60 focus:ring-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-content-muted">Description</label>
              <input
                className="w-full rounded-lg border border-edge bg-field px-3 py-2 text-sm text-content placeholder-content-faint outline-none ring-blue-500/40 focus:border-blue-500/60 focus:ring-2"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create"}
            </button>
          </form>
        </div>
      )}

      {/* Client list */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
            <Plus className="h-6 w-6 text-content-faint" />
          </div>
          <p className="text-sm font-medium text-content-muted">No clients yet</p>
          <p className="mt-1 text-xs text-content-faint">Create your first client to get started</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            New Client
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {data?.map((c) => (
          <li
            key={c.id}
            onClick={() => nav(`/clients/${c.id}`)}
            className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-edge-soft bg-surface p-4 shadow-sm transition-all duration-150 hover:border-blue-500/40 hover:bg-surface-alt hover:shadow-md"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-content">{c.name}</span>
              </div>
              {c.description && (
                <p className="mt-0.5 truncate text-sm text-content-muted">{c.description}</p>
              )}
              <p className="mt-1 text-xs text-content-faint">
                Created {new Date(c.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-content-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface hover:text-content"
                onClick={(e) => openEdit(e, c)}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-800/50 px-3 py-1.5 text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-950/40"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(c);
                }}
              >
                Delete
              </button>
              <ChevronRight className="h-4 w-4 text-content-faint transition-transform group-hover:translate-x-0.5" />
            </div>
          </li>
        ))}
      </ul>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
          role="dialog"
          onClick={() => setEditing(null)}
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
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                disabled={update.isPending || !editName.trim()}
                onClick={() =>
                  update.mutate({
                    id: editing.id,
                    body: { name: editName.trim(), description: editDesc.trim() || undefined },
                  })
                }
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
          role="dialog"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-content">Delete client?</h2>
            <p className="mt-2 text-sm text-content-muted">
              This permanently removes{" "}
              <span className="font-semibold text-content">{deleteTarget.name}</span> along with
              all credentials and scans. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-content-muted hover:text-content"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget.id)}
              >
                {remove.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
