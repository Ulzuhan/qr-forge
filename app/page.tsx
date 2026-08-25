import { QrList } from "./components/QrList";
import { requireUser } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const baseUrl = await publicBaseUrl();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Your QR Codes</h1>
        <p className="text-muted-foreground mt-1">
          Dynamic, editable, trackable. The QR image never changes — you change
          where it points.
        </p>
      </div>
      <QrList userId={user.id} baseUrl={baseUrl} />
    </div>
  );
}
