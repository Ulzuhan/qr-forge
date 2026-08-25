import { redirect } from "next/navigation";
import { AuthForm } from "../components/AuthForm";
import { currentUser, registrationOpen } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/");
  // Con el registro cerrado no hay página de alta: se manda al login, que ya
  // explica que está cerrado.
  if (!registrationOpen()) redirect("/login");

  return <AuthForm mode="register" />;
}
