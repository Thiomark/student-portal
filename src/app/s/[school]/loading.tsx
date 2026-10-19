// Shown while a page loads and, with useOffline, while a navigation waits for
// the connection to come back.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-200" />
      <div className="h-40 rounded bg-slate-100" />
    </div>
  );
}
