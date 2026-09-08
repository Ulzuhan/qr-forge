/** Full-page navigation: Go resolves the session and serves every route. */
import type { AnchorHTMLAttributes } from "react";

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

// A reload must not cancel a navigation that has already been requested.
let navigating = false;
export function useNavigation() {
  return {
    push(url: string) { navigating = true; window.location.assign(url); },
    refresh() { if (!navigating) window.location.reload(); },
    back() { navigating = true; window.history.back(); },
  };
}
