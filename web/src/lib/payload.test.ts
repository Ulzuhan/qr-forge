import { expect, it } from "vitest";
import { buildEmailPayload, buildWifiPayload } from "./payload";

it("escapes WiFi separators without losing the password", () => {
  expect(buildWifiPayload("Mi;Red", 'clave:con"cosas', "WPA", false))
    .toBe('WIFI:T:WPA;S:Mi\\;Red;P:clave\\:con\\"cosas;;');
});
it("escapes commas and backslashes and marks hidden networks", () => {
  expect(buildWifiPayload("a,b\\c", "", "nopass", true))
    .toBe("WIFI:T:nopass;S:a\\,b\\\\c;H:true;;");
});
it("does not embed a password for an open network", () => {
  expect(buildWifiPayload("guest", "unused", "nopass", false)).toBe("WIFI:T:nopass;S:guest;;");
});
it("builds a mailto with correctly encoded optional fields", () => {
  const payload = buildEmailPayload("a@b.com", "Hello & welcome", "Line 1\nLine 2");
  const parsed = new URL(payload);
  expect(parsed.protocol).toBe("mailto:");
  expect(parsed.pathname).toBe("a@b.com");
  expect(parsed.searchParams.get("subject")).toBe("Hello & welcome");
  expect(parsed.searchParams.get("body")).toBe("Line 1\nLine 2");
  expect(buildEmailPayload("a@b.com", "", "")).toBe("mailto:a@b.com");
});
