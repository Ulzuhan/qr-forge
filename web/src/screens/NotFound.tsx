import { ButtonLink } from "../ui/Button";
import { IconArrowLeft } from "../ui/icons";

export function NotFound({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="container-x flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="animate-rise">
        <div className="mx-auto grid size-24 grid-cols-4 gap-1.5 rounded-2xl border border-line bg-bg-2 p-3" aria-hidden>
          {[1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0].map((on, i) => (
            <span key={i} className={`rounded-[3px] ${on ? "bg-text-3/60" : "bg-transparent"}`} />
          ))}
        </div>
        <p className="eyebrow mt-8 justify-center">404</p>
        <h1 className="mt-3 text-3xl">This code isn't here</h1>
        <p className="mx-auto mt-3 max-w-md text-text-2">
          It may have been deleted, or it belongs to another account. Printed codes are not affected by this
          page: a redirect that exists keeps working.
        </p>
        <ButtonLink href="/" variant="primary" className="mt-8">
          <IconArrowLeft size={16} />
          {signedIn ? "Back to your codes" : "Back to the start"}
        </ButtonLink>
      </div>
    </div>
  );
}
