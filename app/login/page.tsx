import { redirect } from "next/navigation";
import { AuthForm } from "../components/AuthForm";
import { currentUser, registrationOpen } from "@/lib/auth";

// Lee la cookie de sesión, así que se resuelve por petición.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { next } = await searchParams;

  return <AuthForm mode="login" next={next} registrationOpen={await registrationOpen()} />;
}
