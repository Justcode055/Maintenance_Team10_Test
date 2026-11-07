export default function LocationHint({ building }: { building: string | null }) {
  const label = building?.match(/^([A-Z]+\d+(?:\s*\/\s*[A-Z]+\d+)?)(?=\s|$)/)?.[1] ?? building;
  return <p id="report-location-hint" className={building ? "field-help location-hint" : "sr-only"} role="status" aria-live="polite" title={building ?? undefined}>
    {building ? `${label} mentioned. Confirm building and room.` : ""}
  </p>;
}
