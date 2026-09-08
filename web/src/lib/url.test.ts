import { expect, it } from "vitest";
import { shortUrl } from "./url";

it("encodes the server's explicit origin and existing slug", () => {
  expect(shortUrl("https://qr.example", "printed-code")).toBe("https://qr.example/r/printed-code");
});
