"use client";

import { LogOut, Trash2, TriangleAlert, X } from "lucide-react";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = "discard",
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "discard" | "delete";
}) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop confirm-layer"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        onCancel();
      }}
    >
      <section className="modal confirm-modal" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="confirm-icon"><TriangleAlert aria-hidden="true" /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
        <footer className="modal-actions">
          <button className="secondary-button" type="button" onClick={onCancel}><X aria-hidden="true" /> ادامه ویرایش</button>
          <span className="action-spacer" />
          <button className="danger-solid-button" type="button" onClick={onConfirm}>
            {tone === "delete" ? <Trash2 aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
