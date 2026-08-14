export default function RouterRemoteAccessWorkspaceLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Chargement de l’espace routeur">
      <div className="h-5 w-56 bg-clay" />
      <div className="h-9 w-72 bg-clay" />
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-48 border-2 border-line bg-paper" />
      ))}
    </div>
  );
}
