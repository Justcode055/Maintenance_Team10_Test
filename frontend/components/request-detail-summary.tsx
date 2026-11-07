import { targetTime, type CategoryItem, type LocationItem, type WorkOrder } from "@/lib/ticket-view";

const campusDate = (timestamp: string | number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(timestamp));

export default function RequestDetailSummary({ order, categories, locations }: { order: WorkOrder; categories: CategoryItem[]; locations: LocationItem[] }) {
  const location = locations.find((item) => item.id === order.location_id);
  const category = categories.find((item) => item.id === order.category_id);
  const target = targetTime(order, categories);
  return <div className="request-detail-summary">
    <dl>
      <div className="request-detail-id"><dt>Request ID</dt><dd><code>{order.id}</code></dd></div>
      <div><dt>Location</dt><dd>{location ? `${location.building} · ${location.floor_room}` : "Location unavailable"}</dd></div>
      <div><dt>Category</dt><dd>{category?.name ?? "Category unavailable"}</dd></div>
      <div><dt>Reported</dt><dd><time dateTime={order.created_at}>{campusDate(order.created_at)}</time></dd></div>
      {Number.isFinite(target) && <div><dt>Repair target</dt><dd><time dateTime={new Date(target).toISOString()}>{campusDate(target)}</time></dd></div>}
    </dl>
    <p>{order.description}</p>
  </div>;
}
