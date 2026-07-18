export default function AgenticOsLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-5 w-32 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="h-4 w-96 max-w-full rounded bg-muted animate-pulse" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-3 h-16 animate-pulse" />
        ))}
      </div>

      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, s) => (
          <section key={s} className="space-y-3">
            <div className="h-5 w-40 rounded bg-muted animate-pulse border-b border-border pb-2" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, c) => (
                <div
                  key={c}
                  className="bg-card border border-border rounded-2xl p-4 h-44 animate-pulse"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
