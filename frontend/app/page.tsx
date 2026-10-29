"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  Wrench,
  ClipboardList,
  PlusCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Trash2,
  MapPin,
  Tag,
  Calendar,
  UserCheck,
  ShieldCheck,
  X,
  User,
  Check,
  Building2,
  FileText,
  AlertTriangle,
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

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

  // Login handler
  const switchRole = useCallback(async (targetRole: "reporter" | "staff") => {
    setAuthStatus(`Authenticating as ${targetRole}...`);
    const email = targetRole === "reporter" ? "reporter1@gmail.com" : "staff1@gmail.com";
    const password = accountPasswords[email];

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        setAuthStatus(`Sign-in failed: ${error?.message}`);
        return;
      }

      setToken(data.session.access_token);
      setCurrentUserId(data.user.id);
      setRole(targetRole);
      setAuthStatus(`Connected as ${email}`);
    } catch (err) {
      setAuthStatus(`Auth error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, []);

  // Initialize Auth on mount
  useEffect(() => {
    switchRole("reporter");
  }, [switchRole]);

  // Load auxiliary data when token is available
  const loadMetadata = useCallback(async (jwt: string) => {
    try {
      const supabase = createBrowserSupabaseClient();
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

  // AI Auto-Categorization Trigger (FR-05 & Lab 1 Defense)
  async function triggerAiClassification() {
    if (!reportDesc.trim()) {
      alert("Please enter a problem description first so the AI can analyze it.");
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
        } else {
          setAiResult({
            success: false,
            fallback: true,
            reason: result.reason ?? "Ambiguous or intercepted attack",
            time_ms: result.execution_time_ms,
          });
        }
      }
    } catch {
      setAiResult({
        success: false,
        fallback: true,
        reason: "Network or model latency exceeded 1500 ms SLA",
      });
    } finally {
      setAiLoading(false);
    }
  }

  // Submit Issue
  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTitle.trim() || !reportDesc.trim() || !reportLocation || !reportCategory) {
      alert("Please fill out all fields before submitting.");
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
        alert("Work order submitted successfully!");
        setReportTitle("");
        setReportDesc("");
        setAiResult(null);
        await loadWorkOrders(token);
        setActiveTab("tracker");
      } else {
        alert(`Submission failed: ${data.error?.message ?? JSON.stringify(data)}`);
      }
    } catch (err) {
      alert(`Error submitting work order: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setSubmittingOrder(false);
    }
  }

  // Staff Lifecycle Actions
  async function performAction(actionUrl: string, method: string = "POST", bodyPayload?: any) {
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
        await loadWorkOrders(token);
      } else {
        alert(`Action failed (HTTP ${res.status}): ${data.error?.message ?? "Operation rejected"}`);
      }
    } catch (err) {
      alert(`Request error: ${err instanceof Error ? err.message : "Unknown error"}`);
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

      {/* Navigation Tabs (3 Core PRD Screens) */}
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
        <button
          className={`nav-tab ${activeTab === "dispatch" ? "active" : ""}`}
          onClick={() => setActiveTab("dispatch")}
        >
          <Wrench className="w-4 h-4" />
          Staff Dispatch Board
        </button>
      </div>

      {/* SCREEN 1: STATUS TRACKER */}
      {activeTab === "tracker" && (
        <div className="tab-content-container">
          {/* Filter Bar */}
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
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loadingOrders ? (
            <p style={{ textAlign: "center", color: "var(--muted-foreground)", margin: "40px 0" }}>Loading work orders...</p>
          ) : filteredOrders.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "60px 20px" }}>
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <h3 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 6px" }}>No work orders found in this status</h3>
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
                          <span className="inline-flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1 text-primary" />
                            {loc ? `${loc.building} (${loc.floor_room})` : wo.location_id}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center">
                            <Tag className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                            {cat ? `${cat.name} (${cat.sla_hours}h SLA)` : wo.category_id}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center">
                            <Calendar className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                            {new Date(wo.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <span className={`status-badge ${wo.status}`}>{wo.status}</span>
                    </div>

                    <p style={{ margin: "14px 0", color: "var(--foreground)", fontSize: "0.92rem", lineHeight: "1.55" }}>
                      {wo.description}
                    </p>

                    {wo.resolution_notes && (
                      <div style={{ padding: "12px 14px", background: "#f0fdf4", borderLeft: "3px solid #16a34a", borderRadius: "0 6px 6px 0", margin: "12px 0", fontSize: "0.85rem" }}>
                        <strong style={{ color: "#166534" }}>Resolution Notes:</strong> {wo.resolution_notes}
                      </div>
                    )}

                    {/* 5-Step Visual Progress Stepper */}
                    <div className="stepper-container">
                      {STAGES.map((st, idx) => {
                        const isCompleted = idx < currentStageIdx;
                        const isActive = idx === currentStageIdx;
                        return (
                          <div
                            key={st}
                            className={`stepper-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                          >
                            <div className="stepper-dot">
                              {isCompleted ? <Check className="w-3.5 h-3.5 text-white" /> : idx + 1}
                            </div>
                            <span className="stepper-label">{st.replace("_", " ")}</span>
                            {idx < STAGES.length - 1 && <div className="stepper-line" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                      <button className="btn-switch-role" onClick={() => viewHistory(wo)}>
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        Audit Trail ({wo.id.substring(0, 8)})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: SUBMIT ISSUE FORM */}
      {activeTab === "report" && (
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div className="panel">
            <h2>Report Campus Facility Issue</h2>
            <form onSubmit={handleSubmitOrder}>
              <div className="field">
                <label>Issue Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Broken water bidet spray valve in building C1"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Problem Description *</label>
                <textarea
                  placeholder="Provide symptoms (e.g. Water dripping continuously from sprayer joint onto restroom tiles)..."
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  required
                />
              </div>

              {/* AI Categorization Trigger (FR-05) */}
              <div style={{ marginBottom: "18px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={triggerAiClassification}
                  disabled={aiLoading}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  {aiLoading ? "Analyzing Context with Campus AI..." : "AI Auto-Detect Category & Building (FR-05)"}
                </button>

                {aiResult && (
                  <div className="ai-recommendation-box">
                    {aiResult.success ? (
                      <div>
                        <strong style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Sparkles className="w-4 h-4" />
                          AI Match: {aiResult.category_name}
                          {aiResult.detected_building ? ` · 📍 ${aiResult.detected_building}` : ""}
                        </strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
                          Target SLA: {aiResult.sla_hours}h · Confidence: {Math.round((aiResult.confidence ?? 1) * 100)}% · Latency: {aiResult.time_ms}ms
                        </div>
                      </div>
                    ) : (
                      <div>
                        <strong style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <AlertTriangle className="w-4 h-4" />
                          AI Fallback Triggered
                        </strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
                          {aiResult.reason}
                        </div>
                      </div>
                    )}
                    <span style={{ fontSize: "0.75rem", fontFamily: "DM Mono", color: "var(--primary)", fontWeight: 600 }}>
                      {aiResult.success ? "Auto-Applied" : "Manual Select"}
                    </span>
                  </div>
                )}
              </div>

              <div className="field">
                <label>Building & Location *</label>
                <select value={reportLocation} onChange={(e) => setReportLocation(e.target.value)} required>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.building} — {loc.floor_room}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Discipline Category & SLA Target *</label>
                <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} required>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.sla_hours} Hours SLA)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="send-button"
                style={{ marginTop: "16px" }}
                disabled={submittingOrder}
              >
                <PlusCircle className="w-4 h-4" />
                {submittingOrder ? "Submitting..." : "Submit Ticket to Campus Maintenance"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SCREEN 3: STAFF DISPATCH BOARD */}
      {activeTab === "dispatch" && (
        <div className="tab-content-container">
          {role !== "staff" ? (
            <div className="panel" style={{ textAlign: "center", padding: "50px 20px" }}>
              <ShieldCheck className="w-10 h-10 text-primary mx-auto mb-3" />
              <h3 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 6px" }}>Staff Access Required</h3>
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>
                You are currently viewing as a Student / Reporter. Click below to switch to the Staff role.
              </p>
              <button
                className="send-button"
                style={{ maxWidth: "260px", margin: "16px auto 0" }}
                onClick={() => switchRole("staff")}
              >
                <ShieldCheck className="w-4 h-4" />
                Switch to Staff (staff1@gmail.com)
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Active Dispatch Work-Orders</h2>
                <button className="btn-switch-role" onClick={() => loadWorkOrders(token)}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Queue
                </button>
              </div>

              <div className="ticket-grid">
                {workOrders.map((wo) => {
                  const loc = locations.find((l) => l.id === wo.location_id);
                  const cat = categories.find((c) => c.id === wo.category_id);

                  return (
                    <div key={wo.id} className="ticket-card">
                      <div className="ticket-header">
                        <div className="ticket-header-content">
                          <h3 className="ticket-title">{wo.title}</h3>
                          <div className="ticket-meta">
                            <span className="inline-flex items-center">
                              <MapPin className="w-3.5 h-3.5 mr-1 text-primary" />
                              {loc?.building}
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center">
                              <Tag className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                              {cat?.name} ({cat?.sla_hours}h SLA)
                            </span>
                            <span>•</span>
                            <span style={{ fontFamily: "DM Mono" }}>ID: {wo.id.substring(0, 8)}</span>
                          </div>
                        </div>
                        <span className={`status-badge ${wo.status}`}>{wo.status}</span>
                      </div>

                      <p style={{ margin: "10px 0 16px", color: "var(--foreground)", fontSize: "0.9rem" }}>{wo.description}</p>

                      {/* Staff Lifecycle Buttons */}
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {wo.status === "OPEN" && (
                          <button
                            className="btn-switch-role"
                            style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#dbeafe" }}
                            onClick={() =>
                              performAction(`${apiBase}/work-orders/${wo.id}/assign`, "POST", { staff_id: currentUserId })
                            }
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Assign to Me
                          </button>
                        )}

                        {wo.status === "ASSIGNED" && (
                          <button
                            className="btn-switch-role"
                            style={{ background: "#fefce8", color: "#a16207", borderColor: "#fef08a" }}
                            onClick={() => performAction(`${apiBase}/work-orders/${wo.id}/in-progress`, "POST")}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            Start Repair Work
                          </button>
                        )}

                        {wo.status === "IN_PROGRESS" && (
                          <button
                            className="btn-switch-role"
                            style={{ background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }}
                            onClick={() => setResolveModal({ open: true, workOrderId: wo.id, notes: "", loading: false })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resolve Issue...
                          </button>
                        )}

                        {wo.status === "RESOLVED" && (
                          <button
                            className="btn-switch-role"
                            style={{ background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" }}
                            onClick={() => performAction(`${apiBase}/work-orders/${wo.id}/close`, "POST")}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Confirm & Close Ticket
                          </button>
                        )}

                        <button className="btn-switch-role" onClick={() => viewHistory(wo)}>
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          Audit Trail
                        </button>

                        <button
                          className="btn-switch-role"
                          style={{ color: "var(--destructive)" }}
                          onClick={() => {
                            if (confirm("Are you sure you want to archive this ticket?")) {
                              performAction(`${apiBase}/work-orders/${wo.id}`, "DELETE");
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: AUDIT TRAIL HISTORY DRAWER */}
      {historyModal.open && (
        <div className="modal-overlay" onClick={() => setHistoryModal({ open: false, items: [], loading: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Work Order Audit History</h3>
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
            <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 600 }}>Submit Resolution Notes</h3>
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
    </div>
  );
}
