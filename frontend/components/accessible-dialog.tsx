"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Native modal dialogs provide focus containment and make the background inert.
export default function AccessibleDialog({ title, id, busy = false, onClose, children }: {
  title: string; id: string; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.open && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]') ?? dialog).focus();
    }
  });
  return <dialog ref={ref} tabIndex={-1} className="ux-dialog" aria-labelledby={`${id}-title`} aria-busy={busy}
    onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!busy && e.target === e.currentTarget && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) onClose();
    }}>
    <header className="ux-dialog-header"><h2 id={`${id}-title`}>{title}</h2><button type="button" className="btn-switch-role" disabled={busy} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><X size={18} aria-hidden="true" /></button></header>
    {children}
  </dialog>;
}
