"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { STAGES, statusLabel, type WorkOrderStatus } from "@/lib/ticket-view";

export default function RepairProgress({ status }: { status: WorkOrderStatus }) {
  const current = STAGES.indexOf(status);
  const closed = status === "CLOSED";
  const previous = useRef(current);
  const [advancedStep, setAdvancedStep] = useState<number | null>(null);

  useEffect(() => {
    // Animate only a newly confirmed advance, never replay when opening details.
    const advanced = current > previous.current;
    previous.current = current;
    setAdvancedStep(advanced ? current : null);
    if (!advanced) return;
    const timer = setTimeout(() => setAdvancedStep(null), 700);
    return () => clearTimeout(timer);
  }, [current]);

  return <ol className={`repair-progress${closed ? " is-closed" : ""}`} aria-label="Repair progress">
    {STAGES.map((stage, index) => {
      const complete = index < current || closed;
      const active = index === current;
      return <li key={stage} className={`${complete ? "is-complete" : ""}${active ? " is-current" : ""}${active && advancedStep === current ? " just-advanced" : ""}`} aria-current={active ? "step" : undefined}>
        {index < STAGES.length - 1 && <span className="repair-progress-wire" aria-hidden="true"><span style={{ transform: `scaleX(${index < current ? 1 : 0})` }} /></span>}
        <span className="repair-progress-dot" aria-hidden="true">{complete ? <Check size={15} strokeWidth={2.5} /> : active ? <span /> : null}</span>
        <span className="repair-progress-label">{stage === "OPEN" ? "Submitted" : statusLabel(stage)}</span>
      </li>;
    })}
  </ol>;
}
