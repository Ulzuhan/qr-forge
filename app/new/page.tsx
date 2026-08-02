import { NewQrForm } from "../components/NewQrForm";

export const dynamic = "force-static";

export default function NewQrPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Create new QR</h1>
      <p className="text-muted-foreground mt-1 mb-8">
        Generate a dynamic QR. You can change where it points later.
      </p>
      <NewQrForm />
    </div>
  );
}
