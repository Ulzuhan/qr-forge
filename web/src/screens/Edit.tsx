import { useEffect, useState } from "react";
import { DeleteDialog } from "../components/DeleteDialog";
import { PageHeader } from "../components/PageHeader";
import { QrEditor } from "../components/QrEditor";
import { verQr, type Qr } from "../lib/api";
import Link from "../navigation";
import { useNavigation } from "../navigation";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { flash } from "../ui/Toast";
import { IconArrowLeft, IconTrash } from "../ui/icons";
import { LoadError } from "./Detail";

export function Edit({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useNavigation();

  useEffect(() => {
    verQr(id).then(setQr, (e: Error) => setError(e.message));
  }, [id]);

  if (error) return <LoadError message={error} />;

  return (
    <div className="container-x py-8 sm:py-12">
      <PageHeader
        above={
          <Link href={`/${id}`} className="link-quiet inline-flex items-center gap-1.5 text-sm">
            <IconArrowLeft size={15} /> Back to the code
          </Link>
        }
        eyebrow={
          <>
            Edit · <span className="normal-case tracking-normal">{id}</span>
          </>
        }
        title={qr ? qr.title : <Skeleton className="h-10 w-72" />}
        lede={
          qr?.type === "dynamic"
            ? "Change anything here. The printed image stays exactly the same; only where it leads moves."
            : "The content lives in the image: changing it means a new code, and whatever is already printed keeps the old one."
        }
      />
      <div className="mt-8">
        {qr ? (
          <>
            <QrEditor mode="edit" baseUrl={baseUrl} qr={qr} />
            <section className="mt-10 rounded-2xl border border-danger/25 bg-danger/5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base">Delete this code</h2>
                  <p className="mt-1 text-sm text-text-2">
                    {qr.type === "dynamic"
                      ? "Every printed copy stops working and the scan history goes with it."
                      : "It disappears from your list. Printed copies keep working on their own."}
                  </p>
                </div>
                <Button variant="danger" onClick={() => setDeleting(true)}>
                  <IconTrash size={16} /> Delete
                </Button>
              </div>
            </section>
            <DeleteDialog
              qr={qr}
              open={deleting}
              onClose={() => setDeleting(false)}
              onDeleted={() => {
                flash({ tone: "ok", title: "Code deleted" });
                router.push("/");
              }}
            />
          </>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy="true">
            <div className="space-y-5">
              <Skeleton className="h-40" />
              <Skeleton className="h-56" />
            </div>
            <Skeleton className="h-96" />
          </div>
        )}
      </div>
    </div>
  );
}
