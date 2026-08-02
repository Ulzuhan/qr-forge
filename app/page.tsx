import { QrList } from "./components/QrList";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Your QR Codes</h1>
        <p className="text-muted-foreground mt-1">
          Dynamic, editable, trackable. The QR image never changes — you change
          where it points.
        </p>
      </div>
      <QrList />
    </div>
  );
}
