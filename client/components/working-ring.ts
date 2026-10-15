/** Restyle only the running footer of chats containing this plugin's activity rows. */
export function installWorkingRing(): () => void {
  if (typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.id = "bc-working-ring";
  const target = '[data-testid="agent-chat-scroll"]:has([data-bc-activity]) [data-testid="turn-working-indicator"] > div > div:first-child';
  style.textContent = `
${target} { position: relative; width: 16px; height: 16px; }
${target} > * { visibility: hidden; }
${target}::after {
  content: ""; position: absolute; inset: 0; box-sizing: border-box;
  border-radius: 50%; border: 2px solid rgba(112,199,176,.18);
  border-top-color: #8ba5e8; border-right-color: #70c7b0;
  animation: bc-working-spin 1.1s linear infinite;
  pointer-events: none;
}
@keyframes bc-working-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { ${target}::after { animation: none; } }
`;
  document.head.append(style);
  return () => style.remove();
}
