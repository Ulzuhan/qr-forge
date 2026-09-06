/** La URL corta que codifica un QR dinámico. El origen lo fija el servidor. */
export function shortUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/r/${slug}`;
}
