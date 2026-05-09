"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { History, Network, Trash2 } from "lucide-react";
import { useBitacoraStore } from "@/store/bitacoraStore";

/** Format an "ago" string in Spanish — light dependency-free helper, no
 *  date-fns needed for this single use. */
function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/**
 * Sidebar block that lists archived Marco Polo trees from the current
 * browser session. Click on an item opens it in the floating panel
 * (read-only view). Hover reveals a delete button per row.
 *
 * Hidden when there are no archived trees — the bitácora is brand new
 * or the user already wiped them all.
 */
export function ArbolHistorialBlock() {
  const archived = useBitacoraStore((s) => s.archived);
  const viewArchived = useBitacoraStore((s) => s.viewArchived);
  const deleteArchived = useBitacoraStore((s) => s.deleteArchived);
  const viewingArchivedId = useBitacoraStore((s) => s.viewingArchivedId);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (archived.length === 0) return null;

  // Render most-recent first — the natural mental model for a history list.
  const sorted = [...archived].sort((a, b) => b.endedAt - a.endedAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="cm-hairline-top flex flex-col gap-2 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
        <History className="h-3 w-3 text-[var(--bordo)]" />
        Árboles guardados{" "}
        <span className="text-[var(--silver)] tabular-nums">
          ({archived.length})
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {sorted.map((tree) => {
          const isActive = tree.id === viewingArchivedId;
          const isConfirming = tree.id === confirmDelete;
          return (
            <div
              key={tree.id}
              className={`group flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors ${
                isActive
                  ? "border-[var(--bordo)] bg-[var(--bordo)]/10"
                  : "border-transparent hover:border-[var(--border-silver)] hover:bg-[var(--bg-input)]"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(null);
                  viewArchived(tree.id);
                }}
                className="flex flex-1 items-center gap-2 text-left"
                title={`Ver árbol de ${tree.origenId}`}
              >
                <Network
                  className={`h-3 w-3 shrink-0 ${
                    isActive
                      ? "text-[var(--bordo)]"
                      : "text-[var(--silver-mid)]"
                  }`}
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`truncate font-mono text-[11px] font-semibold ${
                      isActive ? "text-[var(--bordo)]" : "text-[var(--fg-primary)]"
                    }`}
                  >
                    {tree.origenId}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
                    {tree.nodes.length} {tree.nodes.length === 1 ? "clase" : "clases"}{" "}
                    · {relativeTime(tree.endedAt)}
                  </span>
                </span>
              </button>

              {isConfirming ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteArchived(tree.id);
                    setConfirmDelete(null);
                  }}
                  className="rounded-sm border border-[var(--bordo)] bg-[var(--bordo)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white hover:bg-[var(--bordo-mid)]"
                  title="Confirmar borrar"
                >
                  Borrar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(tree.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[var(--silver-dark)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)] focus-visible:opacity-100"
                  title="Borrar este árbol del historial"
                  aria-label="Borrar este árbol del historial"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
