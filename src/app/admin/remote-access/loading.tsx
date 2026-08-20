export default function RemoteAccessLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Chargement des accès distants">
      <div className="h-8 w-56 bg-clay" />
      <div className="h-5 w-full max-w-2xl bg-clay" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 border border-line bg-paper" />
        ))}
      </div>
      <div className="h-96 border border-line bg-paper" />
    </div>
  );
}
