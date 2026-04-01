export function isEmbedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("embed") === "1";
}