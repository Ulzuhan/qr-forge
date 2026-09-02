import { NewQrForm } from "../components/NewQrForm";
import { requireUser } from "@/lib/auth";
import { parseIntent } from "@/lib/intent";

// Comprueba la sesión, así que se resuelve por petición (antes era estática).
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

/** Reconstruye la ruta con su query para que el login sepa a dónde volver. */
function rutaConIntencion(params: Params): string {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (typeof valor === "string") query.set(clave, valor);
    else if (Array.isArray(valor) && valor[0]) query.set(clave, valor[0]);
  }
  const cadena = query.toString();
  return cadena ? `/new?${cadena}` : "/new";
}

export default async function NewQrPage({
  searchParams,
}: {
  // En Next 15 los parámetros llegan como promesa.
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  // La ruta COMPLETA, no "/new": quien llega sin sesión pasa por el proveedor,
  // y con "/new" a secas volvería a un formulario vacío habiendo traído la
  // intención puesta. safeNext admite la query; solo rechaza lo que no empieza
  // por "/" o empieza por "//".
  await requireUser(rutaConIntencion(params));

  const intencion = parseIntent(params);

  return (
    <div className="kc-workspace qr-workspace max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Create new QR</h1>
      <p className="text-muted-foreground mt-1 mb-8">
        {intencion
          ? "The details came with the link. Check them and save."
          : "Generate a dynamic QR. You can change where it points later."}
      </p>
      <NewQrForm initial={intencion} />
    </div>
  );
}
