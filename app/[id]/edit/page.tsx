import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EditQrForm } from "../../components/EditQrForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getQr(id: string, userId: string) {
  // Acotado al dueño: editar un QR ajeno da 404, no un formulario.
  const [qr] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, userId)))
    .limit(1);
  return qr ?? null;
}

export default async function EditQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/${id}/edit`);
  const qr = await getQr(id, user.id);
  if (!qr) notFound();

  return (
    <div className="kc-workspace qr-workspace max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit QR</h1>
        <p className="text-muted-foreground mt-1">
          <span className="font-mono">{qr.id}</span> — change anything. The QR
          image stays the same.
        </p>
      </div>
      <div className="p-4 rounded-md bg-primary/10 border border-primary/30 mb-6 text-sm">
        <strong>💡 Tip:</strong> Cambias la URL destino y los QRs que ya
        imprimiste apuntan al nuevo destino. Magia.
      </div>
      <EditQrForm
        qr={{
          id: qr.id,
          type: qr.type,
          staticKind: qr.staticKind,
          title: qr.title,
          description: qr.description,
          destinationUrl: qr.destinationUrl ?? "",
          staticPayload: qr.staticPayload,
          campaign: qr.campaign,
          isActive: qr.isActive,
          expiresAt: qr.expiresAt
            ? new Date(qr.expiresAt).toISOString().slice(0, 16)
            : "",
        }}
      />
    </div>
  );
}
