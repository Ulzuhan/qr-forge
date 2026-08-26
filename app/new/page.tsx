import { NewQrForm } from "../components/NewQrForm";
import { requireUser } from "@/lib/auth";

// Comprueba la sesión, así que se resuelve por petición (antes era estática).
export const dynamic = "force-dynamic";

export default async function NewQrPage() {
  await requireUser("/new");

  return (
    <div className="kc-workspace max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Create new QR</h1>
      <p className="text-muted-foreground mt-1 mb-8">
        Generate a dynamic QR. You can change where it points later.
      </p>
      <NewQrForm />
    </div>
  );
}
