export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="qr-card p-5" aria-hidden>
      <div className="mx-auto w-full max-w-48 aspect-square skeleton rounded-2xl" />
      <div className="mt-5 space-y-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
