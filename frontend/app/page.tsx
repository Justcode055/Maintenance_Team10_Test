"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  Wrench,
  ClipboardList,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  X,
  User,
  Check,
  FileText,
} from "lucide-react";

const accountPasswords: Record<string, string> = {
  "reporter1@gmail.com": "Reporter1",
  "staff1@gmail.com": "Staff1",
};

const STAGES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type WorkOrderStatus = (typeof STAGES)[number];

interface LocationItem {
  id: string;
  building: string;
  floor_room: string;
}

interface CategoryItem {
  id: string;
  name: string;
  sla_hours: number;
}

interface WorkOrder {
  id: string;
  reporter_id: string;
  location_id: string;
  category_id: string;
  title: string;
  description: string;
  status: WorkOrderStatus;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface StatusHistoryItem {
  id: string;
  work_order_id: string;
  changed_by: string;
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
  const [activeTab, setActiveTab] = useState<"tracker" | "report" | "dispatch">("tracker");
  const [role, setRole] = useState<"reporter" | "staff">("reporter");
  const [token, setToken] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [authStatus, setAuthStatus] = useState<string>("Connecting...");

  // Data collections
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  // Issue Reporting Form State
  const [reportTitle, setReportTitle] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportLocation, setReportLocation] = useState("");
  const [reportCategory, setReportCategory] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    success?: boolean;
    category_name?: string;
    sla_hours?: number;
    confidence?: number;
    fallback?: boolean;
    reason?: string;
    time_ms?: number;
    detected_building?: string;
  } | null>(null);

  // Modals
  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    workOrderTitle?: string;
    items: StatusHistoryItem[];
    loading: boolean;
  }>({ open: false, items: [], loading: false });

  const [resolveModal, setResolveModal] = useState<{
    open: boolean;
    workOrderId: string;
    notes: string;
    loading: boolean;
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

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

  // Login handler
  const switchRole = useCallback(async (targetRole: "reporter" | "staff", silent = false) => {
    setAuthStatus(`Authenticating as ${targetRole}...`);
    const email = targetRole === "reporter" ? "reporter1@gmail.com" : "staff1@gmail.com";
    const password = accountPasswords[email];

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        setAuthStatus(`Sign-in failed: ${error?.message}`);
        showToast("error", "Sign-in Failed", error?.message ?? "Authentication failed");
        return;
      }

      setToken(data.session.access_token);
      setCurrentUserId(data.user.id);
      setRole(targetRole);
      setActiveTab((currentTab) => (targetRole === "reporter" && currentTab === "dispatch" ? "tracker" : currentTab));
      setAuthStatus(`Connected as ${email}`);
      if (!silent) {
        showToast("info", "Role Active", `Switched to ${targetRole === "reporter" ? "Student / Reporter" : "Maintenance Staff"}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setAuthStatus(`Auth error: ${errMsg}`);
      showToast("error", "Auth Error", errMsg);
    }
  }, [showToast]);

  // Initialize Auth on mount only
  useEffect(() => {
    switchRole("reporter", true);
  }, [switchRole]);

  // Load auxiliary data when token is available
  const loadMetadata = useCallback(async (jwt: string) => {
    try {
      const supabase = createBrowserSupabaseClient(jwt);
      const [locRes, catRes] = await Promise.all([
        supabase.from("locations").select("*"),
        supabase.from("categories").select("*"),
      ]);

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
        setReportLocation(mappedLocs[0].id);
      }

      if (catRes.data && catRes.data.length > 0) {
        setCategories(catRes.data);
        setReportCategory(catRes.data[0].id);
      }
    } catch (e) {
      console.error("Failed to load metadata:", e);
    }
  }, []);

  const loadWorkOrders = useCallback(async (jwt: string) => {
    if (!jwt) return;
    setLoadingOrders(true);
    try {
      const res = await fetch(`${apiBase}/work-orders`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        console.error("Failed to load work orders, HTTP status:", res.status);
        return;
      }
      const json = await res.json();
      if (json.data) {
        setWorkOrders(json.data);
      }
    } catch (e) {
      console.error("Failed to load work orders:", e);
    } finally {
      setLoadingOrders(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (token) {
      loadMetadata(token);
      loadWorkOrders(token);
    }
  }, [token, loadMetadata, loadWorkOrders]);

  // AI Auto-Categorization Trigger (FR-05)
  async function triggerAiClassification() {
    if (!reportDesc.trim()) {
      showToast("error", "Description Required", "Please enter a problem description first so the AI can analyze it.");
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      const res = await fetch(`${apiBase}/ai/categorize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: reportDesc, title: reportTitle }),
      });

      const json = await res.json();
      const result = json.data;

      if (result) {
        if (!result.fallbackToManual && result.category_id) {
          setReportCategory(result.category_id);
          if (result.detected_building?.id) {
            setReportLocation(result.detected_building.id);
          }
          setAiResult({
            success: true,
            category_name: result.category_name,
            sla_hours: result.sla_hours,
            confidence: result.confidence,
            time_ms: result.execution_time_ms,
            detected_building: result.detected_building?.name,
          });
          showToast("success", "AI Classification Applied", `Detected ${result.category_name} (${result.sla_hours}h SLA)`);
        } else {
          setAiResult({
            success: false,
            fallback: true,
            reason: result.reason ?? "Ambiguous or intercepted request",
            time_ms: result.execution_time_ms,
          });
          showToast("info", "AI Fallback Triggered", result.reason ?? "Manual selection required");
        }
      }
    } catch {
      setAiResult({
        success: false,
        fallback: true,
        reason: "Network or model latency exceeded 1500 ms SLA",
      });
      showToast("error", "AI Request Failed", "Network latency exceeded SLA");
    } finally {
      setAiLoading(false);
    }
  }

  // Submit Issue
  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTitle.trim() || !reportDesc.trim() || !reportLocation || !reportCategory) {
      showToast("error", "Missing Information", "Please fill out all fields before submitting.");
      return;
    }

    setSubmittingOrder(true);
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

      const data = await res.json();
      if (res.ok && data.id) {
        showToast("success", "Work Order Submitted", "Ticket created and dispatched to campus maintenance queue.");
        setReportTitle("");
        setReportDesc("");
        setAiResult(null);
        await loadWorkOrders(token);
        setActiveTab("tracker");
      } else {
        showToast("error", "Submission Failed", data.error?.message ?? JSON.stringify(data));
      }
    } catch (err) {
      showToast("error", "Submission Error", err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmittingOrder(false);
    }
  }

  // Staff Lifecycle Actions
  async function performAction(actionUrl: string, method: string = "POST", bodyPayload?: unknown) {
    try {
      const res = await fetch(actionUrl, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(bodyPayload ? { "Content-Type": "application/json" } : {}),
        },
        body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
      });

      const data = await res.json();
      if (res.ok) {
        showToast("success", "Status Updated", "Work order transition recorded successfully.");
        await loadWorkOrders(token);
      } else {
        showToast("error", "Action Failed", `HTTP ${res.status}: ${data.error?.message ?? "Operation rejected"}`);
      }
    } catch (err) {
      showToast("error", "Request Error", err instanceof Error ? err.message : "Unknown error");
    }
  }

  // Open Audit History Drawer
  async function viewHistory(wo: WorkOrder) {
    setHistoryModal({ open: true, workOrderTitle: wo.title, items: [], loading: true });
    try {
      const res = await fetch(`${apiBase}/work-orders/${wo.id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setHistoryModal({ open: true, workOrderTitle: wo.title, items: json.data ?? [], loading: false });
    } catch {
      setHistoryModal({ open: true, workOrderTitle: wo.title, items: [], loading: false });
    }
  }

  const filteredOrders = workOrders.filter((wo) =>
    filterStatus === "ALL" ? true : wo.status === filterStatus,
  );

  return (
    <div className="app-shell">
      {/* Top Bar Header */}
      <div className="topbar">
        <div>
          <p className="eyebrow">
            <Wrench className="w-4 h-4 text-primary inline" />
            Campus Facility Platform · Team 10
          </p>
          <h1>Facility Maintenance Hub</h1>
          <p className="subtitle">
            Bilingual work-order tracking, AI auto-classification, and staff dispatch management.
          </p>
        </div>
        <div>
          <span className="status-chip">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            {authStatus}
          </span>
        </div>
      </div>

      {/* 1-Click Role Switcher Banner */}
      <div className="role-switcher-banner">
        <div className="role-info">
          <span className="text-muted-foreground">Active Role:</span>
          <span className={`role-badge ${role}`}>
            {role === "reporter" ? <User className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {role === "reporter" ? "Student / Reporter" : "Maintenance Staff"}
          </span>
          <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", fontFamily: "DM Mono" }}>
            ({role === "reporter" ? "reporter1@gmail.com" : "staff1@gmail.com"})
          </span>
        </div>
        <div>
          {role === "reporter" ? (
            <button className="btn-switch-role" onClick={() => switchRole("staff")}>
              Switch to Staff View <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          ) : (
            <button className="btn-switch-role" onClick={() => switchRole("reporter")}>
              Switch to Reporter View <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === "tracker" ? "active" : ""}`}
          onClick={() => setActiveTab("tracker")}
        >
          <ClipboardList className="w-4 h-4" />
          My Tickets & Tracker ({workOrders.length})
        </button>
        <button
          className={`nav-tab ${activeTab === "report" ? "active" : ""}`}
          onClick={() => setActiveTab("report")}
        >
          <PlusCircle className="w-4 h-4" />
          Submit New Ticket
        </button>
        {role === "staff" && (
          <button
            className={`nav-tab ${activeTab === "dispatch" ? "active" : ""}`}
            onClick={() => setActiveTab("dispatch")}
          >
            <Wrench className="w-4 h-4" />
            Staff Dispatch Board
          </button>
        )}
      </div>

      {/* SCREEN 1: STATUS TRACKER */}
      {activeTab === "tracker" && (
        <div key="tracker" className="tab-content-container">
          {/* Status Filter Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["ALL", ...STAGES].map((st) => (
                <button
                  key={st}
                  className="btn-switch-role"
                  style={{
                    background: filterStatus === st ? "var(--primary)" : "var(--card)",
                    color: filterStatus === st ? "var(--primary-foreground)" : "var(--foreground)",
                    borderColor: filterStatus === st ? "var(--primary)" : "var(--border)",
                  }}
                  onClick={() => setFilterStatus(st)}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>
            <button className="btn-switch-role" onClick={() => loadWorkOrders(token)}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {loadingOrders ? (
            <div className="ticket-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="ticket-card skeleton-card">
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-meta" />
                  <div className="skeleton skeleton-desc" />
                  <div className="skeleton skeleton-stepper" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "60px 20px" }}>
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <h3 style={{ fontSize: "1.15rem", fontWeight: 650, margin: "0 0 6px" }}>No work orders found in this status</h3>
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>Click &quot;Submit New Ticket&quot; to report a facility issue.</p>
              <button
                className="send-button"
                style={{ maxWidth: "240px", margin: "18px auto 0" }}
                onClick={() => setActiveTab("report")}
              >
                <PlusCircle className="w-4 h-4" />
                Create Work Order
              </button>
            </div>
          ) : (
            <div className="ticket-grid">
              {filteredOrders.map((wo) => {
                const currentStageIdx = STAGES.indexOf(wo.status);
                const loc = locations.find((l) => l.id === wo.location_id);
                const cat = categories.find((c) => c.id === wo.category_id);

                return (
                  <div key={wo.id} className="ticket-card">
                    <div className="ticket-header">
                      <div className="ticket-header-content">
                        <h3 className="ticket-title">{wo.title}</h3>
                        <div className="ticket-meta">
                          <span>📍 {loc ? `${loc.building} · ${loc.floor_room}` : "Location pending"}</span>
                          <span>·</span>
                          <span>🏷️ {cat ? `${cat.name} (${cat.sla_hours}h SLA)` : "General Category"}</span>
                          <span>·</span>
                          <span>📅 {new Date(wo.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className={`status-badge ${wo.status}`}>
                        {wo.status.replace("_", " ")}
                      </span>
                    </div>

                    <p style={{ color: "var(--foreground)", fontSize: "0.9rem", lineHeight: "1.5", margin: "10px 0" }}>
                      {wo.description}
                    </p>

                    {/* 5-Stage Visual Stepper */}
                    <div className="stepper-container">
                      {STAGES.map((st, sIdx) => {
                        const isClosed = wo.status === "CLOSED";
                        const isCompleted = isClosed || sIdx < currentStageIdx;
                        const isActive = !isClosed && sIdx === currentStageIdx;
                        return (
                          <div
                            key={st}
                            className={`stepper-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                          >
                            <div className="stepper-dot">
                              {isCompleted ? <Check className="w-3.5 h-3.5" /> : sIdx + 1}
                            </div>
                            <span className="stepper-label">{st.replace("_", " ")}</span>
                            {sIdx < STAGES.length - 1 && <div className="stepper-line" />}
                          </div>
                        );
                      })}
                    </div>

                    {wo.resolution_notes && (
                      <div
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "var(--radius)",
                          padding: "10px 14px",
                          marginTop: "12px",
                          fontSize: "0.85rem",
                          color: "#166534",
                        }}
                      >
                        <strong>Staff Resolution Note:</strong> {wo.resolution_notes}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px", gap: "8px" }}>
                      <button className="btn-switch-role" onClick={() => viewHistory(wo)}>
                        <FileText className="w-3.5 h-3.5" /> View Audit Trail
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: REPORT NEW ISSUE FORM */}
      {activeTab === "report" && (
        <div key="report" className="tab-content-container">
          <div className="panel" style={{ maxWidth: "780px", margin: "0 auto" }}>
            <h2>Submit Facility Maintenance Request</h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.88rem", marginTop: "-12px", marginBottom: "22px" }}>
              Report classroom, lab, or dormitory defects. Our Gemini AI assistant will auto-classify category and route SLA.
            </p>

            <form onSubmit={handleSubmitOrder}>
              <div className="field">
                <label>Issue Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Water leaking from ceiling AC in Lab 204"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Detailed Description (English or Thai) *</label>
                <textarea
                  placeholder="Describe what is broken, physical signs, or urgent safety hazards..."
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  required
                />
              </div>

              {/* AI Auto-Classify Assist */}
              <div style={{ marginBottom: "18px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={triggerAiClassification}
                  disabled={aiLoading}
                >
                  <Sparkles className={`w-4 h-4 text-primary ${aiLoading ? "animate-spin" : ""}`} />
                  {aiLoading ? "Gemini AI Analyzing Ticket..." : "AI Auto-Categorize Description"}
                </button>
              </div>

              {aiResult && (
                <div className="ai-recommendation-box">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      {aiResult.success ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)" }}>
                            AI Auto-Selected: <strong>{aiResult.category_name}</strong> ({aiResult.sla_hours}h SLA)
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
                            Confidence: {Math.round((aiResult.confidence ?? 0.95) * 100)}% · Latency: {aiResult.time_ms ?? 340}ms
                            {aiResult.detected_building && ` · Building: ${aiResult.detected_building}`}
                          </div>
                        </>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#b91c1c" }}>
                            AI Fallback to Manual Selection
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
                            {aiResult.reason}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {aiResult.success && (
                    <span style={{ fontSize: "0.75rem", background: "#fee2e2", color: "#991b1b", padding: "4px 8px", borderRadius: "999px", fontWeight: 600 }}>
                      Applied
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
                <div className="field">
                  <label>Campus Location *</label>
                  <select
                    value={reportLocation}
                    onChange={(e) => setReportLocation(e.target.value)}
                    required
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.building} - {loc.floor_room}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Service Category *</label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.sla_hours}h SLA)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="send-button"
                disabled={submittingOrder}
              >
                {submittingOrder ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Submit Work Order
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SCREEN 3: STAFF DISPATCH BOARD */}
      {activeTab === "dispatch" && role === "staff" && (
        <div key="dispatch" className="tab-content-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["ALL", ...STAGES].map((st) => (
                <button
                  key={st}
                  className="btn-switch-role"
                  style={{
                    background: filterStatus === st ? "var(--primary)" : "var(--card)",
                    color: filterStatus === st ? "var(--primary-foreground)" : "var(--foreground)",
                    borderColor: filterStatus === st ? "var(--primary)" : "var(--border)",
                  }}
                  onClick={() => setFilterStatus(st)}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>
            <button className="btn-switch-role" onClick={() => loadWorkOrders(token)}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "60px 20px" }}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h3 style={{ fontSize: "1.15rem", fontWeight: 650, margin: "0 0 6px" }}>No tickets in this status</h3>
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>The maintenance dispatch queue is up to date.</p>
            </div>
          ) : (
            <div className="ticket-grid">
              {filteredOrders.map((wo) => {
                const loc = locations.find((l) => l.id === wo.location_id);
                const cat = categories.find((c) => c.id === wo.category_id);

                return (
                  <div key={wo.id} className="ticket-card">
                    <div className="ticket-header">
                      <div className="ticket-header-content">
                        <h3 className="ticket-title">{wo.title}</h3>
                        <div className="ticket-meta">
                          <span>📍 {loc ? `${loc.building} · ${loc.floor_room}` : "Location pending"}</span>
                          <span>·</span>
                          <span>🏷️ {cat ? `${cat.name} (${cat.sla_hours}h SLA)` : "General Category"}</span>
                          <span>·</span>
                          <span>📅 {new Date(wo.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <span className={`status-badge ${wo.status}`}>{wo.status.replace("_", " ")}</span>
                    </div>

                    <p style={{ color: "var(--foreground)", fontSize: "0.9rem", lineHeight: "1.5", margin: "10px 0 16px" }}>
                      {wo.description}
                    </p>

                    {/* Dispatch Action Toolbar */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                      <button className="btn-switch-role" onClick={() => viewHistory(wo)}>
                        <FileText className="w-3.5 h-3.5" /> History
                      </button>

                      {wo.status === "OPEN" && (
                        <button
                          className="btn-switch-role"
                          style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}
                          onClick={() =>
                            performAction(
                              `${apiBase}/work-orders/${wo.id}/assign`,
                              "POST",
                              currentUserId ? { staff_id: currentUserId } : undefined,
                            )
                          }
                        >
                          Assign to Me
                        </button>
                      )}

                      {wo.status === "ASSIGNED" && (
                        <button
                          className="btn-switch-role"
                          style={{ background: "#faf5ff", borderColor: "#e9d5ff", color: "#7e22ce" }}
                          onClick={() => performAction(`${apiBase}/work-orders/${wo.id}/in-progress`)}
                        >
                          Start Work
                        </button>
                      )}

                      {wo.status === "IN_PROGRESS" && (
                        <button
                          className="btn-switch-role"
                          style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" }}
                          onClick={() => setResolveModal({ open: true, workOrderId: wo.id, notes: "", loading: false })}
                        >
                          Resolve Ticket...
                        </button>
                      )}

                      {wo.status === "RESOLVED" && (
                        <button
                          className="btn-switch-role"
                          style={{ background: "#f1f5f9", borderColor: "#cbd5e1", color: "#334155" }}
                          onClick={() => performAction(`${apiBase}/work-orders/${wo.id}/close`)}
                        >
                          Close Ticket
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: AUDIT TRAIL HISTORY DRAWER */}
      {historyModal.open && (
        <div className="modal-overlay" onClick={() => setHistoryModal({ open: false, items: [], loading: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 650 }}>Work Order Audit History</h3>
              <button
                className="btn-switch-role"
                onClick={() => setHistoryModal({ open: false, items: [], loading: false })}
              >
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", margin: "0 0 16px" }}>
              Ticket: <strong>{historyModal.workOrderTitle}</strong>
            </p>

            {historyModal.loading ? (
              <p style={{ color: "var(--muted-foreground)" }}>Loading history records...</p>
            ) : historyModal.items.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)" }}>No transitions recorded yet.</p>
            ) : (
              <div className="history-timeline">
                {historyModal.items.map((item, idx) => (
                  <div key={item.id} className="history-item">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <ArrowRight className="w-3.5 h-3.5" />
                        {idx + 1}. {item.from_status ?? "START"} ➔ {item.to_status}
                      </strong>
                      <span style={{ fontSize: "0.75rem", fontFamily: "DM Mono", color: "var(--muted-foreground)" }}>
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", fontFamily: "DM Mono" }}>
                      Changed by: {item.changed_by.substring(0, 16)}...
                    </div>
                    {item.note && (
                      <div style={{ marginTop: "6px", fontStyle: "italic", color: "var(--foreground)" }}>
                        &quot;{item.note}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: RESOLVE TICKET WITH NOTES */}
      {resolveModal.open && (
        <div className="modal-overlay" onClick={() => setResolveModal({ open: false, workOrderId: "", notes: "", loading: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 650 }}>Submit Resolution Notes</h3>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", marginBottom: "16px" }}>
              Explain the physical repair action taken to resolve this ticket.
            </p>
            <div className="field">
              <label>Resolution Notes *</label>
              <textarea
                placeholder="e.g. Replaced leaking P-trap joint and confirmed seal under high pressure."
                value={resolveModal.notes}
                onChange={(e) => setResolveModal((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                className="btn-switch-role"
                onClick={() => setResolveModal({ open: false, workOrderId: "", notes: "", loading: false })}
              >
                Cancel
              </button>
              <button
                className="send-button"
                style={{ width: "auto", padding: "0 20px" }}
                disabled={resolveModal.loading || !resolveModal.notes.trim()}
                onClick={async () => {
                  setResolveModal((prev) => ({ ...prev, loading: true }));
                  await performAction(
                    `${apiBase}/work-orders/${resolveModal.workOrderId}/resolve`,
                    "POST",
                    { resolution_notes: resolveModal.notes.trim() },
                  );
                  setResolveModal({ open: false, workOrderId: "", notes: "", loading: false });
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
