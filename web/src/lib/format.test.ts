import { expect, it } from "vitest";
import { buildEmailPayload, buildWifiPayload } from "./payload";
import {
  describeUserAgent,
  flagEmoji,
  fromLocalInputValue,
  normalizeSlug,
  parseEmailPayload,
  parseWifiPayload,
  timeAgo,
  toLocalInputValue,
  withScheme,
} from "./format";

it("normalizes a custom slug exactly like the server", () => {
  expect(normalizeSlug("  Hello World!  ")).toBe("hello-world");
  expect(normalizeSlug("--a--b--")).toBe("a-b");
  expect(normalizeSlug("Menú_de_Verano")).toBe("men-de-verano");
  expect(normalizeSlug("ÁÉ")).toBe("");
  expect(normalizeSlug("x".repeat(60))).toHaveLength(40);
});

it("reads back the WiFi payload it builds", () => {
  const payload = buildWifiPayload("Mi;Red", 'clave:con"cosas,\\raras', "WPA", true);
  expect(parseWifiPayload(payload)).toEqual({
    ssid: "Mi;Red",
    password: 'clave:con"cosas,\\raras',
    security: "WPA",
    hidden: true,
  });
  expect(parseWifiPayload(buildWifiPayload("guest", "", "nopass", false))).toEqual({
    ssid: "guest",
    password: "",
    security: "nopass",
    hidden: false,
  });
  expect(parseWifiPayload("not wifi")).toBeNull();
});

it("reads back the email payload it builds", () => {
  expect(parseEmailPayload(buildEmailPayload("a@b.com", "Hello & welcome", "Line 1\nLine 2"))).toEqual({
    to: "a@b.com",
    subject: "Hello & welcome",
    body: "Line 1\nLine 2",
  });
  expect(parseEmailPayload("https://x")).toBeNull();
});

it("round-trips a datetime-local value in local time", () => {
  const iso = fromLocalInputValue("2026-03-01T09:30");
  expect(iso).not.toBeNull();
  expect(toLocalInputValue(iso)).toBe("2026-03-01T09:30");
  expect(toLocalInputValue(null)).toBe("");
  expect(fromLocalInputValue("")).toBeNull();
});

it("summarizes user agents and flags", () => {
  expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"))
    .toBe("iPhone · Safari");
  expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"))
    .toBe("Android · Chrome");
  expect(describeUserAgent("curl/8.4.0")).toBe("Bot or crawler");
  expect(describeUserAgent(null)).toBe("Unknown device");
  expect(flagEmoji("ES")).toBe("🇪🇸");
  expect(flagEmoji(null)).toBe("🌐");
});

it("adds a scheme only to what looks like a bare domain", () => {
  expect(withScheme("example.com/menu")).toBe("https://example.com/menu");
  expect(withScheme("http://example.com")).toBe("http://example.com");
  expect(withScheme("not a url")).toBe("not a url");
});

it("describes recent moments without negative numbers", () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0);
  expect(timeAgo(new Date(now - 10_000).toISOString(), now)).toBe("just now");
  expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toMatch(/5 minutes ago/);
  expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString(), now)).toMatch(/3 hours ago/);
});
