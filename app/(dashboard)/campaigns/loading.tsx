export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-4 bg-slate-200 rounded w-64" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    </div>
  )
}
