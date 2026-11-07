"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, ClipboardList, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { statusLabel, targetLabel, type CategoryItem, type LocationItem, type WorkOrder } from "@/lib/ticket-view";
import RepairProgress from "@/components/repair-progress";
import { relativeUpdate, requestReference, submitterLabel, updateLabel, type DashboardData } from "@/lib/dashboard-view";

export default function MaintenanceOverview({ role, data, loading, error, categories, locations, busyIds, actionErrors, demo, submitterRoles, onRetry, onViewAll, onView, onAssign }: {
  role: "staff" | "reporter"; data: DashboardData | null; loading: boolean; error: string | null;
  categories: CategoryItem[]; locations: LocationItem[]; busyIds: string[]; actionErrors: Record<string, string>; demo: boolean;
  submitterRoles: Record<string, string>;
  onRetry: () => void; onViewAll: () => void; onView: (order: WorkOrder) => void; onAssign: (order: WorkOrder) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const metrics = [
    { label: "Open requests", key: "open", hint: "Awaiting assignment", icon: ClipboardList },
    { label: "In progress", key: "inProgress", hint: "Repairs underway", icon: Wrench },
    { label: "Needs attention", key: "needsAttention", hint: "Past target time", icon: TriangleAlert },
    { label: "Resolved this week", key: "resolvedThisWeek", hint: "Ready for review", icon: CircleCheck },
  ] as const;
  const location = (order: WorkOrder) => { const item = locations.find((item) => item.id === order.location_id); return item ? `${item.building} · ${item.floor_room}` : "Location unavailable"; };
  const status = (order: WorkOrder) => order.status === "OPEN" ? role === "staff" ? "Unassigned" : "Submitted" : statusLabel(order.status);
  const orders = data?.orders ?? [];
  const expandedId = orders.find((order) => !["CLOSED", "RESOLVED"].includes(order.status))?.id;
  return <section className="maintenance-overview" aria-label="Maintenance overview" aria-busy={loading}>
    {error && <div className="overview-error" role="alert"><span>{error}</span><button type="button" disabled={loading} onClick={onRetry}>Retry</button></div>}
    <div className="overview-metrics">{metrics.map(({ label, key, hint, icon: Icon }) => <div className="overview-metric" key={key} title={key === "resolvedThisWeek" ? "Resolved since Monday, Bangkok time; includes requests subsequently closed." : undefined}><div><h2>{label}</h2><Icon size={29} strokeWidth={1.65} aria-hidden="true" /></div><strong>{data ? data.summary[key] : loading ? <span className="overview-skeleton" /> : "—"}</strong><p>{hint}</p></div>)}</div>
    <div className="overview-columns">
      <section className="overview-panel"><div className="overview-panel-heading"><h2>{role === "staff" ? "Needs attention" : "My requests"}</h2><button className="overview-link" type="button" onClick={onViewAll}>{role === "staff" ? "Open dispatch board" : "View all"}<ArrowRight size={19} aria-hidden="true" /></button></div>
        {loading && !data ? <div className="overview-empty" role="status"><RefreshCw size={22} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading requests…</div> : !orders.length ? <p className="overview-empty">{error ? "Requests unavailable" : role === "staff" ? "No requests need attention." : "No requests yet."}</p>
          : role === "staff" ? <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th scope="col">Request</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{orders.map((order) => {
            const overdue = targetLabel(order, categories, now).overdue;
            const assign = order.status === "OPEN";
            return <tr key={order.id}><td><strong>{order.title}</strong><small title={order.id}>{requestReference(order.id)} · {categories.find((category) => category.id === order.category_id)?.name ?? "Maintenance"}</small><span className="submitter-tag">{submitterLabel(submitterRoles[order.id])}</span>{actionErrors[order.id] && <p role="alert" className="request-action-error">{actionErrors[order.id]}</p>}</td><td>{location(order)}</td><td><span className={`overview-badge ${overdue ? "overdue" : order.status}`}>{overdue ? "Overdue" : status(order)}</span></td><td><button type="button" className="overview-link" disabled={assign && (demo || busyIds.includes(order.id))} onClick={() => assign ? onAssign(order) : onView(order)}>{busyIds.includes(order.id) ? "Saving…" : assign ? "Assign" : "View"}<ArrowRight size={18} aria-hidden="true" /><span className="sr-only"> {order.title}{assign ? " to me" : " details"}</span></button></td></tr>;
          })}</tbody></table></div>
            : <div className="overview-requests">{orders.map((order) => <article key={order.id} className="overview-request"><div className="overview-request-line"><div><h3>{order.title}</h3><p>{location(order)}</p></div><span className={`overview-badge ${order.status}`}>{status(order)}</span><button type="button" className="overview-link" onClick={() => onView(order)}>View details<ArrowRight size={18} aria-hidden="true" /><span className="sr-only"> for {order.title}</span></button></div>{order.id === expandedId && <RepairProgress status={order.status} />}</article>)}</div>}
      </section>
      <section className="overview-panel overview-updates"><div className="overview-panel-heading"><h2>Recent updates</h2></div>{!data?.updates.length ? <p className="overview-empty">{loading ? "Loading updates…" : error ? "Updates unavailable" : "No updates yet."}</p> : <ol>{data.updates.map((update) => <li key={update.id} className={`update-${update.to_status}`}><button type="button" onClick={() => onView(update.work_orders)}><strong>{updateLabel(update.to_status)}</strong><span>{location(update.work_orders)}</span><time dateTime={update.timestamp} title={new Date(update.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}>{relativeUpdate(update.timestamp, now)}</time><span className="sr-only">: {update.work_orders.title}</span></button></li>)}</ol>}</section>
    </div>
  </section>;
}
