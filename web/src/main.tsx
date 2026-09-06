/**
 * El punto de entrada del navegador.
 *
 * Go compone el documento con la sesión ya resuelta y deja en `#app` lo que el
 * navegador no puede deducir: qué pantalla toca, quién ha entrado, cuál es el
 * origen impreso y, si viene de LinkUp, la intención ya validada. React monta
 * la pantalla que corresponda; las rutas siguen siendo las de siempre y una
 * recarga directa funciona porque el servidor las sirve.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// globals.css ya importa los otros tres y Tailwind; importarlos aquí otra vez
// sólo duplicaría reglas.
import "./globals.css";

import Link from "./shim";
import { KaiCorpHeader } from "./components/kaicorp-header";
import { KaiCorpFooter } from "./components/kaicorp-footer";
import { KaiCorpAccountMenu } from "./components/kaicorp-account-menu";
import { Landing } from "./components/Landing";
import { QrList } from "./components/QrList";
import { NewQrForm } from "./components/NewQrForm";
import { Detail } from "./screens/Detail";
import { Edit } from "./screens/Edit";
import { contexto } from "./lib/api";

const ctx = contexto();

function Pantalla() {
  switch (ctx.pagina) {
    case "dashboard":
      return (
        <div className="kc-workspace qr-workspace max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="qr-page-heading mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Your QR Codes</h1>
            <p className="text-muted-foreground mt-1">
              Dynamic, editable, trackable. The QR image never changes — you change
              where it points.
            </p>
          </div>
          <QrList baseUrl={ctx.publicUrl} />
        </div>
      );
    case "new":
      return (
        <div className="kc-workspace qr-workspace max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-3xl font-bold tracking-tight">Create new QR</h1>
          <p className="text-muted-foreground mt-1 mb-8">
            {ctx.intencion
              ? "The details came with the link. Check them and save."
              : "Generate a dynamic QR. You can change where it points later."}
          </p>
          <NewQrForm initial={ctx.intencion} />
        </div>
      );
    case "detail":
      return <Detail id={ctx.qrId} baseUrl={ctx.publicUrl} />;
    case "edit":
      return <Edit id={ctx.qrId} />;
    case "notfound":
      return (
        <div className="kc-workspace qr-workspace max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
          <p className="text-6xl mb-4">🔍</p>
          <h1 className="text-2xl font-bold tracking-tight mb-2">QR not found</h1>
          <p className="text-muted-foreground mb-6">
            It may have been deleted, or it belongs to someone else.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            ← All QRs
          </Link>
        </div>
      );
    default:
      return <Landing baseUrl={ctx.publicUrl} />;
  }
}

function App() {
  return (
    <>
      <KaiCorpHeader app="QR-Forge">
        {ctx.email ? (
          <>
            <Link
              href="/new"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {/* En móvil no cabe el texto completo junto al menú. */}
              <span className="sm:hidden">+ New</span>
              <span className="hidden sm:inline">+ New QR</span>
            </Link>
            <KaiCorpAccountMenu email={ctx.email} accountUrl={ctx.cuentaUrl} />
          </>
        ) : (
          <Link
            href="/api/auth/login"
            prefetch={false}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        )}
      </KaiCorpHeader>

      <main className="flex-1">
        <Pantalla />
      </main>

      <KaiCorpFooter current="qr-forge" />
    </>
  );
}

const raiz = document.getElementById("app");
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
