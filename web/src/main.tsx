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

import "./styles.css";

import { KaiCorpAccountMenu } from "./components/kaicorp-account-menu";
import { KaiCorpFooter } from "./components/kaicorp-footer";
import { KaiCorpHeader } from "./components/kaicorp-header";
import { contexto } from "./lib/api";
import { Dashboard } from "./screens/Dashboard";
import { Detail } from "./screens/Detail";
import { Edit } from "./screens/Edit";
import { Landing } from "./screens/Landing";
import { NewQr } from "./screens/NewQr";
import { NotFound } from "./screens/NotFound";
import { ButtonLink } from "./ui/Button";
import { ToastProvider } from "./ui/Toast";
import { IconLogIn, IconPlus } from "./ui/icons";

const ctx = contexto();

function Screen() {
  switch (ctx.pagina) {
    case "dashboard":
      return <Dashboard baseUrl={ctx.publicUrl} />;
    case "new":
      return <NewQr baseUrl={ctx.publicUrl} initial={ctx.intencion} />;
    case "detail":
      return <Detail id={ctx.qrId} baseUrl={ctx.publicUrl} />;
    case "edit":
      return <Edit id={ctx.qrId} baseUrl={ctx.publicUrl} />;
    case "notfound":
      return <NotFound signedIn={Boolean(ctx.email)} />;
    default:
      return <Landing baseUrl={ctx.publicUrl} />;
  }
}

function App() {
  return (
    <ToastProvider>
      <div className="atmosphere" aria-hidden />
      <KaiCorpHeader app="QR-Forge">
        {ctx.email ? (
          <>
            <ButtonLink href="/new" variant="primary" size="sm">
              <IconPlus size={15} />
              New QR
            </ButtonLink>
            <KaiCorpAccountMenu email={ctx.email} accountUrl={ctx.cuentaUrl} />
          </>
        ) : (
          <ButtonLink href="/api/auth/login" variant="secondary" size="sm">
            <IconLogIn size={15} />
            Sign in
          </ButtonLink>
        )}
      </KaiCorpHeader>

      <main className="flex flex-1 flex-col">
        <Screen />
      </main>

      <KaiCorpFooter current="qr-forge" />
    </ToastProvider>
  );
}

const root = document.getElementById("app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
