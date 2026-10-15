interface ToolSource { name: string; status: string; error?: unknown; detail?: unknown }
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function isInteractiveTool(item: ToolSource): boolean {
  const detail = record(item.detail);
  const name = item.name.toLowerCase().split(/[.:/]/).pop() ?? "";
  return ["ask", "question", "plan"].includes(String(detail.type)) ||
    /(?:^|_)(?:ask|ask_user|ask_user_question|askuserquestion|request_user_input|request_user_input_async|plan_approval|exitplanmode)$/.test(name);
}
/** Only structured status checks, never parse/scour logs for the word "error". */
export function toolActivityState(item: ToolSource): "completed" | "running" | "failed" | "canceled" {
  const detail = record(item.detail);
  const output = record(detail.output ?? detail.result);
  if (["canceled", "cancelled"].includes(item.status)) return "canceled";
  if (item.status === "failed" || item.error || detail.error || output.error || detail.isError === true || output.isError === true ||
    [detail.exitCode, output.exitCode].some(code => typeof code === "number" && code !== 0)) return "failed";
  return ["running", "executing", "pending"].includes(item.status) ? "running" : "completed";
}
