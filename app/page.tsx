import { QrList } from "./components/QrList";
import { Landing } from "./components/Landing";
import { currentUser } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

/**
 * La puerta de entrada, decidida en el servidor: quien no ha entrado ve la
 * landing (sin JavaScript de cliente), y quien tiene sesión va directo a sus
 * QRs. Antes esto redirigía al login, que para un desconocido es una puerta
 * cerrada sin explicar qué hay dentro.
 */
export default async function Home() {
  const user = await currentUser();
  const baseUrl = await publicBaseUrl();

  if (!user) {
    return <Landing baseUrl={baseUrl} />;
  }

  return (
    <div className="kc-workspace qr-workspace max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="qr-page-heading mb-8">
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
