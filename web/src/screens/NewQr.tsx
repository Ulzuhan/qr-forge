import { PageHeader } from "../components/PageHeader";
import { QrEditor, type Initial } from "../components/QrEditor";
import Link from "../navigation";
import { IconArrowLeft } from "../ui/icons";

export function NewQr({ baseUrl, initial }: { baseUrl: string; initial: Initial | null }) {
  return (
    <div className="container-x py-8 sm:py-12">
      <PageHeader
        above={
          <Link href="/" className="link-quiet inline-flex items-center gap-1.5 text-sm">
            <IconArrowLeft size={15} /> All codes
          </Link>
        }
        eyebrow="New code"
        title="Create a QR code"
        lede={
          initial
            ? "The details came with the link. Check them and save; nothing is created until you do."
            : "Pick a kind, say what it should do, and download it at print size. Dynamic codes can be changed after printing."
        }
      />
      <div className="mt-8">
        <QrEditor mode="create" baseUrl={baseUrl} initial={initial} />
      </div>
    </div>
  );
}
