export function buildWifiPayload(
  ssid: string,
  password: string,
  encryption: "WPA" | "WEP" | "nopass",
  hidden: boolean
): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/"/g, '\\"')
      .replace(/:/g, "\\:");
  let p = `WIFI:T:${encryption};S:${esc(ssid)};`;
  if (password && encryption !== "nopass") p += `P:${esc(password)};`;
  if (hidden) p += "H:true;";
  p += ";";
  return p;
}

export function buildEmailPayload(to: string, subject: string, body: string): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return `mailto:${to}${query ? "?" + query : ""}`;
}
