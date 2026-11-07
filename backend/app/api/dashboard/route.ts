import { requireAuth } from "@/lib/auth";
import { errorResponse, supabaseErrorResponse, timedJson } from "@/lib/api";
import { campusWeekStart, overdueFilter } from "@/lib/dashboard";

export async function GET(request: Request) {
  const auth = await requireAuth(request, ["reporter", "staff"]);
  if (auth.response) return auth.response;
  const { supabase, user, role } = auth.context!;
  const started = performance.now();
  const now = Date.now();
  try {
    // The request-scoped user client preserves RLS; no service-role access here.
    const orders = (count = false) => {
      const query = count ? supabase.from("work_orders").select("id", { count: "exact", head: true })
        : supabase.from("work_orders").select("*");
      const active = query.is("archived_at", null);
      return role === "reporter" ? active.eq("reporter_id", user.id) : active;
    };
    const history = (count = false) => {
      const query = count
        ? supabase.from("status_history").select("id,work_orders!inner(id)", { count: "exact", head: true })
        : supabase.from("status_history").select("id,from_status,to_status,timestamp,work_orders!inner(*)");
      const active = query.is("work_orders.archived_at", null);
      return role === "reporter" ? active.eq("work_orders.reporter_id", user.id) : active;
    };
    const categories = await supabase.from("categories").select("id,sla_hours");
    if (categories.error) return supabaseErrorResponse(categories.error);
    const overdue = overdueFilter(categories.data ?? [], now);
    const overdueOrders = (count = false) => orders(count).in("status", ["OPEN", "ASSIGNED", "IN_PROGRESS"]);
    // Audit rows for edits/archive must not become duplicate repair events.
    const transitions = "from_status.is.null,and(from_status.eq.OPEN,to_status.eq.ASSIGNED),and(from_status.eq.ASSIGNED,to_status.eq.IN_PROGRESS),and(from_status.eq.IN_PROGRESS,to_status.eq.RESOLVED),and(from_status.eq.RESOLVED,to_status.eq.CLOSED)";
    const [open, inProgress, attention, resolved, recent, overdueRows, openRows, updates] = await Promise.all([
      orders(true).eq("status", "OPEN"),
      orders(true).eq("status", "IN_PROGRESS"),
      overdue ? overdueOrders(true).or(overdue) : Promise.resolve({ count: 0, error: null }),
      history(true).eq("from_status", "IN_PROGRESS").eq("to_status", "RESOLVED").gte("timestamp", campusWeekStart(now)).lte("timestamp", new Date(now).toISOString()),
      role === "reporter" ? orders().order("created_at", { ascending: false }).order("id").limit(3) : Promise.resolve({ data: [], error: null }),
      role === "staff" && overdue ? overdueOrders().or(overdue).order("created_at").order("id").limit(4) : Promise.resolve({ data: [], error: null }),
      role === "staff" ? orders().eq("status", "OPEN").order("created_at").order("id").limit(4) : Promise.resolve({ data: [], error: null }),
      history().or(transitions).order("timestamp", { ascending: false }).order("id").limit(3),
    ]);
    const failure = [open, inProgress, attention, resolved, recent, overdueRows, openRows, updates].find((result) => result.error);
    if (failure?.error) return supabaseErrorResponse(failure.error);
    // Unknown counts are an error, never a misleading zero.
    if ([open.count, inProgress.count, attention.count, resolved.count].some((count) => count === null)) {
      return errorResponse(503, "DASHBOARD_UNAVAILABLE", "Dashboard counts are temporarily unavailable");
    }
    const candidates = [...(overdueRows.data ?? []), ...(openRows.data ?? [])];
    const attentionOrders = candidates.filter((order, index) => candidates.findIndex((item) => item.id === order.id) === index).slice(0, 4);
    return timedJson({ data: {
      summary: { open: open.count, inProgress: inProgress.count, needsAttention: attention.count, resolvedThisWeek: resolved.count },
      orders: role === "staff" ? attentionOrders : recent.data,
      updates: updates.data,
      asOf: new Date(now).toISOString(),
    } }, auth.context!, started, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return errorResponse(503, "DASHBOARD_UNAVAILABLE", "Dashboard is temporarily unavailable");
  }
}
