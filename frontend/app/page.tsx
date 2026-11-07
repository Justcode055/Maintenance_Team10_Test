"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { maintenanceRole } from "@/lib/maintenance-role";
import { canUseLocalDemo, demoLocations, demoCategories, sampleWorkOrders } from "@/lib/local-demo";
import { useRouter } from "next/navigation";
import { requestCategorySuggestion } from "@/lib/category-request";
import { reviewCategorySuggestion } from "@/lib/category-review";
import LocationHint from "@/components/location-hint";
import AccessibleDialog from "@/components/accessible-dialog";
import TicketList from "@/components/ticket-list";
import WorkspaceShell, { type WorkspaceTab } from "@/components/workspace-shell";
import MaintenanceOverview from "@/components/maintenance-overview";
import RepairProgress from "@/components/repair-progress";
import RequestDetailSummary from "@/components/request-detail-summary";
import type { DashboardData } from "@/lib/dashboard-view";
import { STAGES, statusLabel, type StatusUpdate, type WorkOrderStatus, type WorkOrder, type LocationItem, type CategoryItem } from "@/lib/ticket-view";
import {
  Wrench,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";

interface StatusHistoryItem {
  id: string;
  work_order_id: string;
  changed_by: string | null;
  from_status: WorkOrderStatus | null;
  to_status: WorkOrderStatus;
  note?: string | null;
  timestamp: string;
}

interface ToastNotification {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

export default function MaintenanceApp() {
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [role, setRole] = useState<"reporter" | "staff">("reporter");
  const [token, setToken] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitterRoles, setSubmitterRoles] = useState<Record<string, string>>({});
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const dashboardRequestId = useRef(0);
  const sessionUserId = useRef<string | null>(null);
  const sessionRole = useRef<"staff" | "reporter" | null>(null);
  const activeAccessToken = useRef("");

  // Data collections
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const loadedCount = useRef(0);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const actionLocks = useRef(new Map<string, symbol>());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [statusUpdates, setStatusUpdates] = useState<Record<string, StatusUpdate>>({});
  const statusNoticeId = useRef(0);
  const historyRequestId = useRef(0);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const ordersRequestId = useRef(0);

  // Issue Reporting Form State
  const [reportTitle, setReportTitle] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [descriptionError, setDescriptionError] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [reportLocation, setReportLocation] = useState("");
  const [reportCategory, setReportCategory] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const submissionInFlight = useRef<symbol | null>(null);
  const [submissionSlow, setSubmissionSlow] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequestInFlight = useRef<symbol | null>(null);
  const suggestionRevision = useRef(0);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [categoryHighlighted, setCategoryHighlighted] = useState(false);
  const [aiResult, setAiResult] = useState<{
    success?: boolean;
    category_name?: string;
    sla_hours?: number;
    confidence?: number;
    fallback?: boolean;
    reason?: string;
    time_ms?: number;
  } | null>(null);

  function clearSuggestionFeedback(clearLocation = true) {
    suggestionRevision.current++;
    setAiResult(null);
    if (clearLocation) setLocationHint(null);
  }

  useEffect(() => {
    if (!aiResult?.success) {
      setCategoryHighlighted(false);
      if (aiResult?.fallback) categoryRef.current?.focus();
      return;
    }
    setCategoryHighlighted(true);
    const highlightTimer = setTimeout(() => setCategoryHighlighted(false), 1800);
    const feedbackTimer = setTimeout(() => setAiResult(null), 3000);
    return () => { clearTimeout(highlightTimer); clearTimeout(feedbackTimer); };
  }, [aiResult]);

  // Modals
  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    workOrderTitle?: string;
    items: StatusHistoryItem[];
    loading: boolean;
    error?: string;
    order?: WorkOrder;
  }>({ open: false, items: [], loading: false });

  const [resolveModal, setResolveModal] = useState<{
    open: boolean;
    workOrderId: string;
    notes: string;
    loading: boolean;
    error?: string;
  }>({ open: false, workOrderId: "", notes: "", loading: false });

  // Dynamic Toast Notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const showToast = useCallback((type: "success" | "error" | "info", title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissStatusUpdate = useCallback((id: string, noticeId: number) => {
    setStatusUpdates((previous) => {
      if (previous[id]?.noticeId !== noticeId) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  const revealUpdatedRequest = useCallback((update: StatusUpdate) => {
    setWorkOrders((previous) => previous.some((order) => order.id === update.order.id) ? previous : [update.order, ...previous]);
    setStatusUpdates((previous) => previous[update.order.id]?.noticeId === update.noticeId
      ? { ...previous, [update.order.id]: { ...update, expiresAt: Date.now() + 4000 } } : previous);
  }, []);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [activeTab]);

  async function signOut() {
    if (demoMode) { router.replace("/login"); return; }
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
  }

  useEffect(() => {
    const previewRole = new URLSearchParams(window.location.search).get("demo");
    if (canUseLocalDemo(window.location.hostname) && (previewRole === "reporter" || previewRole === "staff")) {
      setDemoMode(true);
      setRole(previewRole);
      setCurrentUserId("demo-user");
      setCurrentEmail("Local preview");
      setDisplayName(previewRole === "staff" ? "Staff member" : "Campus reporter");
      setLocations(demoLocations);
      setCategories(demoCategories);
      setReportLocation(demoLocations[0].id);
      setReportCategory(demoCategories[0].id);
      setWorkOrders(sampleWorkOrders());
      const samples = sampleWorkOrders();
      setSubmitterRoles(Object.fromEntries(samples.map((order, index) => [order.id, index === 3 ? "staff" : "reporter"])));
      setDashboard({ summary: { open: samples.filter((order) => order.status === "OPEN").length, inProgress: samples.filter((order) => order.status === "IN_PROGRESS").length, needsAttention: 1, resolvedThisWeek: 1 }, orders: previewRole === "staff" ? [samples[3], samples[0]] : [samples[3], samples[0], samples[2]], updates: [samples[3], samples[1], samples[2]].map((order) => ({ id: order.id, from_status: null, to_status: order.status, timestamp: order.updated_at, work_orders: order })), asOf: new Date().toISOString() });
      setDashboardLoading(false);
      setSessionReady(true);
      return;
    }
    let supabase;
    try { supabase = createBrowserSupabaseClient(); } catch {
      router.replace("/login");
      return;
    }
    let active = true;
    const applySession = (session: import("@supabase/supabase-js").Session | null) => {
      if (!active) return;
      const assignedRole = maintenanceRole(session?.user);
      activeAccessToken.current = session && (assignedRole === "staff" || assignedRole === "reporter") ? session.access_token : "";
      const nextUserId = session?.user.id ?? null;
      if (sessionUserId.current !== nextUserId || sessionRole.current !== assignedRole) {
        setWorkOrders([]);
        setCategories([]);
        setLocations([]);
        setReportTitle("");
        setReportDesc("");
        setDescriptionError(false);
        setReportLocation("");
        setReportCategory("");
        setAiResult(null);
        setLoadingOrders(false);
        setAiLoading(false);
        aiRequestInFlight.current = null;
        suggestionRevision.current++;
        setLocationHint(null);
        setSubmittingOrder(false);
        submissionInFlight.current = null;
        setSubmissionSlow(false);
        setSubmissionError(null);
        setCreatedOrderId(null);
        ordersRequestId.current++;
        loadedCount.current = 0;
        historyRequestId.current++;
        setOrdersError(null);
        setMetadataError(null);
        setHasMoreOrders(false);
        actionLocks.current.clear();
        setBusyIds([]);
        setActionErrors({});
        setStatusUpdates({});
        setHistoryModal({ open: false, items: [], loading: false });
        setResolveModal({ open: false, workOrderId: "", notes: "", loading: false });
        setToasts([]);
        setDashboard(null);
        setSubmitterRoles({});
        setDashboardError(null);
        setDashboardLoading(true);
        dashboardRequestId.current++;
        setActiveTab("overview");
        sessionUserId.current = nextUserId;
        sessionRole.current = assignedRole;
      }
      if (session && (assignedRole === "staff" || assignedRole === "reporter")) {
        setToken(session.access_token);
        setCurrentUserId(session.user.id);
        setCurrentEmail(session.user.email ?? "");
        const name = session.user.user_metadata?.full_name;
        setDisplayName(typeof name === "string" && name.trim() ? name.trim() : session.user.email?.split("@")[0] ?? "Campus user");
        setRole(assignedRole);
      } else {
        setToken("");
        setCurrentUserId("");
        setCurrentEmail("");
        setDisplayName("");
        setRole("reporter");
        router.replace("/login");
      }
      setSessionReady(true);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
      applySession(session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!submittingOrder) return;
    const timer = setTimeout(() => setSubmissionSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [submittingOrder]);

  // Load auxiliary data when token is available
  const loadMetadata = useCallback(async (jwt: string) => {
    setMetadataError(null);
    try {
      const supabase = createBrowserSupabaseClient(jwt);
      const [locRes, catRes] = await Promise.all([
        supabase.from("locations").select("*"),
        supabase.from("categories").select("*"),
      ]);
      if (activeAccessToken.current !== jwt) return;
      if (locRes.error || catRes.error || !locRes.data?.length || !catRes.data?.length) throw new Error("Metadata unavailable");

      if (locRes.data && locRes.data.length > 0) {
        const mfuLabels: Record<string, { building: string; floor_room: string }> = {
          "11111111-1111-4111-8111-111111111111": { building: "S1 Science Laboratory Wing", floor_room: "Lab 204" },
          "11111111-1111-1111-1111-111111111111": { building: "C1 / C2 Lecture Complex", floor_room: "Room 204" },
          "44444444-4444-4444-8444-444444444444": { building: "E1 School of Information Tech", floor_room: "Studio 305" },
          "33333333-3333-4333-8333-333333333333": { building: "AD1 Administration Building", floor_room: "Admin 001" },
        };
        const mappedLocs = locRes.data.map((l: LocationItem) => {
          const match = mfuLabels[l.id];
          return match ? { ...l, building: match.building, floor_room: match.floor_room } : l;
        });
        setLocations(mappedLocs);
      }

      if (catRes.data && catRes.data.length > 0) {
        setCategories(catRes.data);
      }
    } catch {
      if (activeAccessToken.current === jwt) setMetadataError("Locations and categories could not be loaded. Please retry before reporting an issue.");
    }
  }, []);

  const loadWorkOrders = useCallback(async (jwt: string, append = false) => {
    if (!jwt) return;
    const requestId = ++ordersRequestId.current;
    setLoadingOrders(true);
    setOrdersError(null);
    const offset = append ? loadedCount.current : 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${apiBase}/work-orders?limit=100&offset=${offset}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Unable to load requests");
      const json = await res.json();
      if (activeAccessToken.current !== jwt || requestId !== ordersRequestId.current) return;
      if (!Array.isArray(json.data)) throw new Error("Invalid response");
      loadedCount.current = offset + json.data.length;
      setHasMoreOrders(json.data.length === 100);
      setWorkOrders((previous) => append ? [...previous, ...json.data.filter((o: WorkOrder) => !previous.some((p) => p.id === o.id))] : json.data);
    } catch {
      if (activeAccessToken.current === jwt && requestId === ordersRequestId.current) setOrdersError("Check your connection and try again. If this continues, sign in again.");
    } finally {
      clearTimeout(timer);
      if (activeAccessToken.current === jwt && requestId === ordersRequestId.current) setLoadingOrders(false);
    }
  }, [apiBase, activeTab, role]);

  const loadDashboard = useCallback(async (jwt: string) => {
    if (!jwt) return;
    const requestId = ++dashboardRequestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await fetch(`${apiBase}/dashboard`, { headers: { Authorization: `Bearer ${jwt}` }, signal: controller.signal });
      if (!response.ok) throw new Error("Dashboard unavailable");
      const json = await response.json();
      if (!json.data?.summary || !Array.isArray(json.data.orders) || !Array.isArray(json.data.updates)) throw new Error("Invalid dashboard");
      if (activeAccessToken.current === jwt && requestId === dashboardRequestId.current) setDashboard(json.data);
    } catch {
      if (activeAccessToken.current === jwt && requestId === dashboardRequestId.current) setDashboardError("Couldn’t refresh the overview. Please try again.");
    } finally {
      clearTimeout(timer);
      if (activeAccessToken.current === jwt && requestId === dashboardRequestId.current) setDashboardLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { if (token && activeTab === "overview") void loadDashboard(token); }, [token, activeTab, loadDashboard]);

  const submitterIds = role === "staff" ? Array.from(new Set([...workOrders, ...(dashboard?.orders ?? [])].map((order) => order.id))).join(",") : "";
  useEffect(() => {
    if (!token || role !== "staff" || !submitterIds) return;
    const controller = new AbortController();
    let active = true;
    const jwt = token;
    void (async () => {
      const ids = submitterIds.split(",");
      try {
        for (let offset = 0; offset < ids.length; offset += 100) {
          const response = await fetch(`${apiBase}/work-orders/submitters`, { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }), signal: controller.signal });
          if (!response.ok) return;
          const result = await response.json();
          if (active && activeAccessToken.current === jwt && result.data) setSubmitterRoles((previous) => ({ ...previous, ...result.data }));
        }
      } catch { /* Missing attribution stays unknown; it never affects permissions. */ }
    })();
    return () => { active = false; controller.abort(); };
  }, [token, role, submitterIds, apiBase]);

  useEffect(() => {
    if (token) {
      loadWorkOrders(token);
    }
  }, [token, loadWorkOrders]);

  useEffect(() => { if (token) void loadMetadata(token); }, [token, loadMetadata]);

  // AI Auto-Categorization Trigger (FR-05)
  async function triggerAiClassification() {
    if (demoMode) { showToast("info", "Preview only", "Sign in with your campus account to use AI classification."); return; }
    if (submissionInFlight.current || aiRequestInFlight.current) return;
    if (!reportDesc.trim()) {
      setDescriptionError(true);
      descriptionRef.current?.focus();
      return;
    }

    setDescriptionError(false);
    const requestId = Symbol("category-suggestion");
    const ownerId = sessionUserId.current;
    const revision = suggestionRevision.current;
    aiRequestInFlight.current = requestId;
    const isCurrentRequest = () => aiRequestInFlight.current === requestId && sessionUserId.current === ownerId && !!activeAccessToken.current && suggestionRevision.current === revision;
    setAiLoading(true);
    setAiResult(null);
    setLocationHint(null);

    try {
      const json = await requestCategorySuggestion(`${apiBase}/ai/categorize`, token, { description: reportDesc, title: reportTitle });
      if (!isCurrentRequest()) return;
      const result = json.data;
      if (!result) throw new Error("Invalid category suggestion");

      if (result) {
        const review = reviewCategorySuggestion({ categoryId: reportCategory, locationId: reportLocation }, result, categories);
        setLocationHint(review.buildingHint);
        if (review.applied) {
          setReportCategory(review.categoryId);
          setAiResult({
            success: true,
            category_name: review.categoryName,
            sla_hours: result.sla_hours,
            confidence: result.confidence,
            time_ms: result.execution_time_ms,
          });
        } else {
          setAiResult({
            success: false,
            fallback: true,
            reason: "Please choose the category and location yourself before sending.",
            time_ms: result.execution_time_ms,
          });
        }
      }
    } catch {
      if (!isCurrentRequest()) return;
      setAiResult({
        success: false,
        fallback: true,
        reason: "Suggestions are unavailable right now. Choose a category and location to continue.",
      });
    } finally {
      if (aiRequestInFlight.current === requestId) { aiRequestInFlight.current = null; setAiLoading(false); }
    }
  }

  // Submit Issue
  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (demoMode) { showToast("info", "Preview only", "Sign in with your campus account to create a real work order."); return; }
    if (submissionInFlight.current || aiLoading || !token || !currentUserId) return;
    if (!reportTitle.trim() || !reportDesc.trim() || !reportLocation || !reportCategory) {
      showToast("error", "Missing Information", "Please fill out all fields before submitting.");
      return;
    }

    // The synchronous lock also covers repeated events before React rerenders.
    const submissionId = Symbol("work-order-submission");
    const ownerId = currentUserId;
    submissionInFlight.current = submissionId;
    const isCurrentSubmission = () => submissionInFlight.current === submissionId
      && sessionUserId.current === ownerId && !!activeAccessToken.current;
    setSubmittingOrder(true);
    setSubmissionSlow(false);
    setSubmissionError(null);
    setCreatedOrderId(null);
    try {
      const res = await fetch(`${apiBase}/work-orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_id: reportLocation,
          category_id: reportCategory,
          title: reportTitle.trim(),
          description: reportDesc.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!isCurrentSubmission()) return;
      if (res.ok && typeof data?.id === "string" && data.id) {
        setCreatedOrderId(data.id);
        setWorkOrders((previous) => [data as WorkOrder, ...previous.filter((order) => order.id !== data.id)]);
        setReportTitle("");
        setReportDesc("");
        setAiResult(null);
        setLocationHint(null);
        setActiveTab("tracker");
        // Creation is confirmed. Refreshing the tracker has its own indicator.
        void loadWorkOrders(activeAccessToken.current);
      } else {
        setSubmissionError(res.ok
          ? "We couldn’t confirm whether your work order was created. Check my requests before submitting again."
          : typeof data?.error?.message === "string" ? data.error.message : "Your work order could not be created. Please try again.");
      }
    } catch {
      if (!isCurrentSubmission()) return;
      setSubmissionError("We couldn’t confirm whether your work order was created. Check my requests before submitting again.");
    } finally {
      if (submissionInFlight.current === submissionId) {
        submissionInFlight.current = null;
        setSubmittingOrder(false);
      }
    }
  }

  // Only verified staff sessions can reach live lifecycle endpoints.
  async function performAction(order: WorkOrder, action: string, bodyPayload?: unknown): Promise<boolean> {
    if (demoMode || role !== "staff" || !token || actionLocks.current.has(order.id)) return false;
    const lock = Symbol(order.id);
    const owner = sessionUserId.current;
    actionLocks.current.set(order.id, lock);
    setBusyIds((previous) => [...previous, order.id]);
    setActionErrors((previous) => ({ ...previous, [order.id]: "" }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiBase}/work-orders/${order.id}/${action}`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
      });
      const data = await response.json().catch(() => null);
      if (sessionUserId.current !== owner || actionLocks.current.get(order.id) !== lock) return false;
      if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : "The update could not be saved. Please try again.");
      if (data?.id === order.id && STAGES.includes(data.status)) {
        // The atomic endpoint returns the saved record, so confirmation can appear immediately.
        setWorkOrders((previous) => previous.map((item) => item.id === order.id ? data : item));
        const update = { order: data as WorkOrder, noticeId: ++statusNoticeId.current, expiresAt: Date.now() + 4000 };
        setStatusUpdates((previous) => ({ ...previous, [order.id]: update }));
        void loadDashboard(activeAccessToken.current);
      } else {
        setActionErrors((previous) => ({ ...previous, [order.id]: "The update was accepted. Refresh requests to see the latest status." }));
        void loadWorkOrders(activeAccessToken.current);
      }
      return true;
    } catch (error) {
      if (sessionUserId.current !== owner || actionLocks.current.get(order.id) !== lock) return false;
      const message = error instanceof TypeError || controller.signal.aborted
        ? "We couldn’t confirm the update. Refresh the requests to check the status before retrying. Your notes are kept here."
        : error instanceof Error ? error.message : "The update could not be saved. Please try again.";
      setActionErrors((previous) => ({ ...previous, [order.id]: message }));
      setResolveModal((previous) => previous.workOrderId === order.id ? { ...previous, loading: false, error: message } : previous);
      return false;
    } finally {
      clearTimeout(timer);
      if (actionLocks.current.get(order.id) === lock) {
        actionLocks.current.delete(order.id);
        setBusyIds((previous) => previous.filter((id) => id !== order.id));
      }
    }
  }

  function dispatchAction(order: WorkOrder) {
    if (order.status === "IN_PROGRESS") { setResolveModal({ open: true, workOrderId: order.id, notes: "", loading: false }); return; }
    const action = { OPEN: "assign", ASSIGNED: "in-progress", RESOLVED: "close" }[order.status as "OPEN" | "ASSIGNED" | "RESOLVED"];
    if (action) void performAction(order, action, order.status === "OPEN" ? { staff_id: currentUserId } : undefined);
  }

  function closeHistory() {
    historyRequestId.current++;
    setHistoryModal({ open: false, items: [], loading: false });
  }

  async function viewHistory(order: WorkOrder) {
    const requestId = ++historyRequestId.current;
    if (demoMode) {
      const stages = STAGES.slice(0, STAGES.indexOf(order.status) + 1);
      setHistoryModal({ open: true, order, workOrderTitle: order.title, loading: false, items: stages.map((stage, index) => ({ id: `demo-history-${index}`, work_order_id: order.id, changed_by: "Demo user", from_status: index ? STAGES[index - 1] : null, to_status: stage, note: "Sample history for the local preview.", timestamp: order.created_at })) });
      return;
    }
    setHistoryModal({ open: true, order, workOrderTitle: order.title, items: [], loading: true });
    try {
      const response = await fetch(`${apiBase}/work-orders/${order.id}/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("History unavailable");
      const json = await response.json();
      if (!Array.isArray(json.data)) throw new Error("Invalid history");
      if (activeAccessToken.current !== token || requestId !== historyRequestId.current) return;
      setHistoryModal({ open: true, order, workOrderTitle: order.title, items: json.data, loading: false });
    } catch {
      if (activeAccessToken.current !== token || requestId !== historyRequestId.current) return;
      setHistoryModal({ open: true, order, workOrderTitle: order.title, items: [], loading: false, error: "Request history couldn’t be loaded. Please try again." });
    }
  }

  if (!sessionReady || (!token && !demoMode)) return (
    <main className="auth-route-loading" role="status" aria-live="polite">
      <Wrench className="w-7 h-7" aria-hidden="true" />
      <RefreshCw className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <p>Opening your workspace…</p>
    </main>
  );

  return (
    <WorkspaceShell activeTab={activeTab} role={role} name={displayName || currentEmail} demo={demoMode} onNavigate={(tab) => { if (tab !== "dispatch" || role === "staff") setActiveTab(tab); }} onSignOut={() => void signOut()}>
      {activeTab === "overview" && <MaintenanceOverview role={role} data={dashboard} loading={dashboardLoading} error={dashboardError}
        categories={categories} locations={locations} busyIds={busyIds} actionErrors={actionErrors} demo={demoMode} submitterRoles={submitterRoles}
        onRetry={() => void loadDashboard(token)} onViewAll={() => setActiveTab(role === "staff" ? "dispatch" : "tracker")}
        onView={(order) => void viewHistory(order)} onAssign={dispatchAction} />}
      {(activeTab === "tracker" || (activeTab === "dispatch" && role === "staff")) && <div key={activeTab} id="workspace-content" className="tab-content-container">
        {createdOrderId && <div className="work-order-confirmation" role="status"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>Request sent</strong><p>Request ID: <span className="work-order-confirmation-id">{createdOrderId}</span></p></div><button type="button" className="work-order-dismiss" aria-label="Dismiss request confirmation" onClick={() => setCreatedOrderId(null)}><X size={18} aria-hidden="true" /></button></div>}
        <TicketList orders={workOrders} categories={categories} locations={locations} loading={loadingOrders} error={ordersError} submitterRoles={role === "staff" ? submitterRoles : undefined}
          dispatch={activeTab === "dispatch" && role === "staff"} demo={demoMode} busyIds={busyIds} actionErrors={actionErrors}
          statusUpdates={statusUpdates} onDismissStatus={dismissStatusUpdate} onRevealStatus={revealUpdatedRequest}
          hasMore={hasMoreOrders} onLoadMore={() => void loadWorkOrders(token, true)} onRefresh={() => void loadWorkOrders(token)}
          onHistory={(order) => void viewHistory(order)} onAction={dispatchAction} onReport={() => setActiveTab("report")} />
      </div>}

      {/* SCREEN 2: REPORT NEW ISSUE FORM */}
      {activeTab === "report" && (
        <div key="report" id="workspace-content" className="tab-content-container">
          <div className="panel" style={{ maxWidth: "780px", margin: "0 auto" }}>

            {metadataError && <div className="request-error" role="alert"><div><p>{metadataError}</p><button className="btn-switch-role" onClick={() => void loadMetadata(token)}>Retry locations and categories</button></div></div>}
            <form onSubmit={handleSubmitOrder} aria-busy={submittingOrder} aria-describedby={submissionError ? "work-order-submission-error" : "work-order-submission-status"}>
              <fieldset className="work-order-fields" disabled={submittingOrder}>
                <legend className="sr-only">New work order details</legend>
                <div className="field">
                  <label htmlFor="report-title">Issue title (required)</label>
                  <input
                    id="report-title"
                    type="text"
                    placeholder="e.g. Water leaking from ceiling AC in Lab 204"
                    value={reportTitle}
                    onChange={(e) => { setReportTitle(e.target.value); clearSuggestionFeedback(); }}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="report-description">Description (required)</label>
                  <textarea
                    id="report-description"
                    ref={descriptionRef}
                    aria-invalid={descriptionError || undefined}
                    aria-describedby="report-description-help"
                    placeholder="Describe what is broken, physical signs, or urgent safety hazards..."
                    value={reportDesc}
                    onChange={(e) => { setReportDesc(e.target.value); setDescriptionError(false); clearSuggestionFeedback(); }}
                    required
                  />
                  <p id="report-description-help" className={descriptionError ? "field-inline-error" : "field-help"} role={descriptionError ? "alert" : undefined}>
                    {descriptionError ? "Please describe the issue first." : "Add a description to get a category suggestion."}
                  </p>
                </div>

                {/* AI Auto-Classify Assist */}
                <div style={{ marginBottom: "18px" }}>
                  <button
                    type="button"
                    className={`secondary-button category-suggest-button${aiResult?.success ? " is-success" : ""}`}
                    onClick={aiResult?.fallback ? () => categoryRef.current?.focus() : triggerAiClassification}
                    disabled={aiLoading || submittingOrder || !!metadataError || demoMode}
                  >
                    {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : aiResult?.success ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : !aiResult?.fallback && <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />}
                    {aiLoading ? "Finding a category…" : aiResult?.success ? `${aiResult.category_name} suggested` : aiResult?.fallback ? "Choose a category manually" : "Suggest a category"}
                  </button>
                  <span id="category-suggestion-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">{aiLoading ? "Finding a category suggestion." : aiResult?.success ? `${aiResult.category_name} suggested. The category dropdown has been updated. Please review the category and location before sending.` : aiResult?.fallback ? "Choose a category manually from the Category dropdown." : ""}</span>
                </div>

                <div className="report-select-grid">
                  <div className="field">
                    <label htmlFor="report-location">Campus location (required)</label>
                    <select
                      id="report-location"
                      value={reportLocation}
                      onChange={(e) => { setReportLocation(e.target.value); clearSuggestionFeedback(); }}
                      aria-describedby="report-location-hint"
                      required
                    >
                      <option value="">Choose the campus location</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.building} - {loc.floor_room}
                        </option>
                      ))}
                    </select>
                    <LocationHint building={locationHint} />
                  </div>

                  <div className="field">
                    <label htmlFor="report-category">Category (required)</label>
                    <select
                      id="report-category"
                      ref={categoryRef}
                      className={categoryHighlighted ? "category-suggestion-highlight" : undefined}
                      aria-describedby="category-suggestion-status"
                      value={reportCategory}
                      onChange={(e) => { setReportCategory(e.target.value); clearSuggestionFeedback(false); }}
                      required
                    >
                      <option value="">Choose a category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} · {cat.sla_hours}h repair target
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="send-button"
                  disabled={submittingOrder || aiLoading || !!metadataError || !locations.length || !categories.length || demoMode}
                >
                  {submittingOrder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      Sending request…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Send request
                    </>
                  )}
                </button>
              </fieldset>
            </form>
            <p id="work-order-submission-status" className="work-order-submission-status" role="status" aria-live="polite" aria-atomic="true">
              {submittingOrder ? submissionSlow ? "Still creating your request…" : "Sending your request…" : ""}
            </p>
            {submissionError && (
              <div className="work-order-submission-error" id="work-order-submission-error" role="alert">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
                <div>
                  <p>{submissionError}</p>
                  <button type="button" className="work-order-check-tickets" onClick={() => { setActiveTab("tracker"); void loadWorkOrders(activeAccessToken.current); }}>
                    Check my requests
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {historyModal.open && <AccessibleDialog id="request-history" title="Request details" onClose={closeHistory}>
        <h3 className="request-detail-title">{historyModal.workOrderTitle}</h3>
        {historyModal.order && <div className="request-detail-content"><RequestDetailSummary order={historyModal.order} categories={categories} locations={locations} /><RepairProgress status={historyModal.order.status} />{historyModal.order.resolution_notes && <p className="request-resolution"><strong>Repair notes:</strong> {historyModal.order.resolution_notes}</p>}<h3>Update history</h3></div>}
        {historyModal.loading ? <p role="status">Loading request history…</p> : historyModal.error ? <div className="request-error" role="alert"><div><p>{historyModal.error}</p><button className="btn-switch-role" onClick={() => historyModal.order && void viewHistory(historyModal.order)}>Retry history</button></div></div> : !historyModal.items.length ? <p>No updates have been recorded yet.</p> : <ol className="history-timeline">{historyModal.items.map((item) => <li key={item.id} className="history-item"><strong>{item.from_status ? `${statusLabel(item.from_status)} → ` : ""}{statusLabel(item.to_status)}</strong><p><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time></p><p>Updated by: {item.changed_by ? `${item.changed_by.substring(0, 16)}${item.changed_by.length > 16 ? "…" : ""}` : "Partner service"}</p>{item.note && <p>{item.note}</p>}</li>)}</ol>}
      </AccessibleDialog>}

      {resolveModal.open && <AccessibleDialog id="resolve-request" title="Resolve request" busy={resolveModal.loading} onClose={() => setResolveModal({ open: false, workOrderId: "", notes: "", loading: false })}>
        <p className="dialog-description">{workOrders.find((order) => order.id === resolveModal.workOrderId)?.title}</p>
        <form onSubmit={async (event) => {
          event.preventDefault();
          const order = workOrders.find((item) => item.id === resolveModal.workOrderId);
          if (!order || !resolveModal.notes.trim() || resolveModal.loading || actionLocks.current.has(order.id)) return;
          if (order.status !== "IN_PROGRESS") { setResolveModal((previous) => ({ ...previous, error: `This request is now ${statusLabel(order.status).toLowerCase()}. Your notes have not been sent again.` })); return; }
          setResolveModal((previous) => ({ ...previous, loading: true, error: undefined }));
          const saved = await performAction(order, "resolve", { resolution_notes: resolveModal.notes.trim() });
          if (saved) setResolveModal({ open: false, workOrderId: "", notes: "", loading: false });
        }} aria-busy={resolveModal.loading}>
          <div className="field"><label htmlFor="resolution-notes">Repair notes (required)</label><p id="resolution-help" className="field-help">Describe what you repaired and how you checked it.</p><textarea id="resolution-notes" aria-describedby="resolution-help" required disabled={resolveModal.loading} value={resolveModal.notes} onChange={(event) => setResolveModal((previous) => ({ ...previous, notes: event.target.value }))} /></div>
          {resolveModal.error && <div className="request-action-error" role="alert"><p>{resolveModal.error}</p><button type="button" className="btn-switch-role" disabled={loadingOrders || resolveModal.loading} onClick={() => void loadWorkOrders(token)}>Refresh request status</button>{ordersError && <p>{ordersError}</p>}</div>}
          <p role="status" className="field-help">{resolveModal.loading ? "Saving the repair notes. Please wait…" : ""}</p>
          <div className="dialog-actions"><button type="button" className="btn-switch-role" disabled={resolveModal.loading} onClick={() => setResolveModal({ open: false, workOrderId: "", notes: "", loading: false })}>Cancel</button><button type="submit" className="send-button" disabled={resolveModal.loading || !resolveModal.notes.trim()}>{resolveModal.loading && <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{resolveModal.loading ? "Saving…" : "Save and resolve"}</button></div>
        </form>
      </AccessibleDialog>}

      {/* Dynamic Toast Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type}`}>
            <div className={`toast-icon ${toast.type}`}>
              {toast.type === "success" && <CheckCircle2 className="w-5 h-5" />}
              {toast.type === "error" && <AlertCircle className="w-5 h-5" />}
              {toast.type === "info" && <Sparkles className="w-5 h-5" />}
            </div>
            <div className="toast-body">
              <h4 className="toast-title">{toast.title}</h4>
              {toast.message && <p className="toast-message">{toast.message}</p>}
            </div>
            <button
              className="toast-close"
              aria-label="Close notification"
              onClick={() => removeToast(toast.id)}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="toast-progress">
              <div className="toast-progress-bar" />
            </div>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  );
}
