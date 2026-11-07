"use client";

import { useEffect, useId, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, MapPin, RefreshCw, Search, X } from "lucide-react";
import { STAGES, selectTickets, statusLabel, targetLabel, type StatusUpdate, type CategoryItem, type LocationItem, type WorkOrder } from "@/lib/ticket-view";
import { submitterLabel } from "@/lib/dashboard-view";
import RepairProgress from "@/components/repair-progress";

export default function TicketList({ orders, categories, locations, loading, error, dispatch, demo, busyIds, actionErrors, statusUpdates, submitterRoles, onDismissStatus, onRevealStatus, hasMore, onLoadMore, onRefresh, onHistory, onAction, onReport }: {
  orders: WorkOrder[]; categories: CategoryItem[]; locations: LocationItem[]; loading: boolean; error: string | null;
  dispatch: boolean; demo: boolean; busyIds: string[]; actionErrors: Record<string, string>; hasMore: boolean;
  submitterRoles?: Record<string, string>;
  onLoadMore: () => void; onRefresh: () => void; onHistory: (order: WorkOrder) => void;
  onAction: (order: WorkOrder) => void; onReport: () => void;
  statusUpdates: Record<string, StatusUpdate>; onDismissStatus: (id: string, noticeId: number) => void; onRevealStatus: (update: StatusUpdate) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState(dispatch ? "urgent" : "newest");
  const [now, setNow] = useState(Date.now());
  const [revealedId, setRevealedId] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const filtered = selectTickets(orders, categories, { query, status, location, sort });
  const visibleUpdateIds = Object.keys(statusUpdates).filter((key) => filtered.some((order) => order.id === key)).join(",");
  useEffect(() => {
    // Hidden updates remain actionable until viewed or dismissed; visible confirmations fade after four seconds.
    const timers = Object.entries(statusUpdates).filter(([key]) => visibleUpdateIds.split(",").includes(key))
      .map(([key, update]) => setTimeout(() => onDismissStatus(key, update.noticeId), Math.max(0, update.expiresAt - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [statusUpdates, visibleUpdateIds, onDismissStatus]);
  useEffect(() => {
    if (!revealedId) return;
    const row = document.getElementById(`${id}-request-${revealedId}`);
    if (row) { row.scrollIntoView({ block: "center", behavior: "instant" }); row.focus({ preventScroll: true }); setRevealedId(null); }
  }, [revealedId, id, orders, query, status, location]);
  const hiddenUpdates = Object.values(statusUpdates).filter((update) => !filtered.some((order) => order.id === update.order.id));
  const hasFilters = !!query || status !== "ALL" || !!location;
  return <section aria-label={dispatch ? "Dispatch requests" : "Maintenance requests"} aria-busy={loading}>
    <div className="status-update-notices" aria-live="polite" aria-relevant="additions text">{hiddenUpdates.map((update) => <div className="status-update-notice" key={update.noticeId}>
      <CheckCircle2 size={17} aria-hidden="true" /><div><p className="status-update-title">{update.order.title}</p><p>Status changed to {statusLabel(update.order.status)}.</p></div>
      <button type="button" className="text-button" onClick={() => { onRevealStatus(update); setQuery(update.order.id); setStatus("ALL"); setLocation(""); setRevealedId(update.order.id); }}>View request<span className="sr-only">: {update.order.title}</span></button>
      <button type="button" className="status-update-dismiss" aria-label={`Dismiss status update for ${update.order.title}`} onClick={() => onDismissStatus(update.order.id, update.noticeId)}><X size={16} aria-hidden="true" /></button>
    </div>)}</div>
    <div className="request-toolbar">
      <div className="request-search"><label htmlFor={`${id}-search`}>Search loaded requests</label><div><Search size={18} aria-hidden="true" /><input id={`${id}-search`} type="search" placeholder="Title or request ID" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
      <div><label htmlFor={`${id}-status`}>Status</label><select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value)}>{["ALL", ...STAGES].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></div>
      <div><label htmlFor={`${id}-location`}>Location</label><select id={`${id}-location`} value={location} onChange={(e) => setLocation(e.target.value)}><option value="">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.building} · {l.floor_room}</option>)}</select></div>
      <div><label htmlFor={`${id}-sort`}>Sort by</label><select id={`${id}-sort`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="urgent">Repair target</option></select></div>
      <button type="button" className="btn-switch-role" disabled={loading || demo} onClick={onRefresh}><RefreshCw size={16} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error && <div className="request-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>Couldn’t load requests</strong><p>{error}{orders.length > 0 && " Your previously loaded requests are still shown."}</p><button type="button" className="btn-switch-role" disabled={loading} onClick={onRefresh}>Retry loading requests</button></div></div>}
    <div className="request-results"><p role="status">{loading ? "Loading requests…" : `${filtered.length} of ${orders.length} loaded requests shown`}</p>{hasFilters && <button className="text-button" onClick={() => { setQuery(""); setStatus("ALL"); setLocation(""); }}>Clear filters</button>}</div>
    {loading && !orders.length ? <div role="status" className="request-empty"><RefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><p>Loading your requests…</p></div>
      : !filtered.length && !error ? <div className="request-empty"><h2>{hasFilters ? "No matching requests" : "No requests yet"}</h2><p>{hasFilters ? "Try a different search, location or status, or clear your filters." : dispatch ? "New requests will appear here when they are reported." : "Report an issue to start tracking a repair."}</p>{!hasFilters && !dispatch && <button className="send-button" onClick={onReport}>Report an issue</button>}</div>
      : <div className="request-list">{filtered.map((order) => {
        const loc = locations.find((l) => l.id === order.location_id);
        const cat = categories.find((c) => c.id === order.category_id);
        const target = targetLabel(order, categories, now);
        const busy = busyIds.includes(order.id);
        const action = { OPEN: "Assign to me", ASSIGNED: "Start work", IN_PROGRESS: "Resolve request", RESOLVED: "Close request", CLOSED: "" }[order.status];
        const update = statusUpdates[order.id];
        return <article key={order.id} id={`${id}-request-${order.id}`} tabIndex={-1} className="request-row compact-request-card" aria-busy={busy}>
          <div className="compact-request-header"><div><h2>{order.title}</h2>{submitterRoles && <span className="submitter-tag">{submitterLabel(submitterRoles[order.id])}</span>}</div><div className="compact-request-tools"><span className={`overview-badge ${order.status}`}>{order.status === "OPEN" ? "Submitted" : statusLabel(order.status)}</span><button type="button" className="overview-link" onClick={() => onHistory(order)}>Details<ArrowRight size={18} aria-hidden="true" /><span className="sr-only"> for {order.title}</span></button></div></div>
          <div className="compact-request-meta"><div><span><MapPin size={17} strokeWidth={1.75} aria-hidden="true" />{loc ? `${loc.building} · ${loc.floor_room}` : "Location unavailable"}</span><span className="compact-request-category">{cat?.name ?? "Category unavailable"}</span></div><span className={`compact-request-target${target.overdue ? " is-overdue" : ""}${order.status === "CLOSED" ? " is-finished" : ""}`}>{order.status === "CLOSED" ? <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" /> : <Clock3 size={18} strokeWidth={1.75} aria-hidden="true" />}{order.status === "CLOSED" ? "Completed" : order.status === "RESOLVED" ? "Awaiting closure" : target.text}</span></div>
          <RepairProgress status={order.status} />
          {actionErrors[order.id] && <p className="request-action-error" role="alert">{actionErrors[order.id]}</p>}
          <div className="request-status-live" role="status" aria-live="polite" aria-atomic="true">{update && update.expiresAt > Date.now() && <p key={update.noticeId} className="request-status-confirmation" style={{ animationDuration: `${Math.max(0, update.expiresAt - Date.now())}ms` }}><CheckCircle2 size={16} aria-hidden="true" />Status changed to {statusLabel(update.order.status)}.</p>}</div>
          {dispatch && action && <div className="request-row-actions"><button type="button" className="send-button" disabled={busy || demo} onClick={() => onAction(order)}>{busy && <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{busy ? "Saving…" : action}<span className="sr-only"> for {order.title}</span></button></div>}
        </article>;
      })}</div>}
    {hasMore && <div className="request-load-more"><p>Search and filters apply to loaded requests. Load more to include older requests.</p><button className="btn-switch-role" disabled={loading} onClick={onLoadMore}>Load more requests</button></div>}
  </section>;
}
