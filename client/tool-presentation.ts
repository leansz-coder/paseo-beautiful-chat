import type { ToolCalloutData } from "../shared/contracts";

/** Only presentation derived from recorded tool data; never controls the tool. */
export function toolPresentation(data: ToolCalloutData) {
  const failed = data.status === "failed" || (data.exitCode !== undefined && data.exitCode !== 0) || Boolean(data.mcp?.error);
  const awaitingAnswer = !failed && data.tool === "ask" && data.status === "running" && !data.askAnswer?.length;
  const running = data.status === "running" && !failed;
  const source = failed
    ? data.mcp?.error || data.shell?.stderr || data.output || "执行失败，请展开查看详情"
    : awaitingAnswer
      ? "等待你的回答"
      : running
        ? "正在执行，展开查看实时输出"
        : data.shell?.stderr || data.shell?.stdout || data.output || (typeof data.mcp?.result === "string" ? data.mcp.result : "");
  // Bound work before cleaning: a long terminal log must not be parsed to
  // produce a one-line preview. The full body remains untouched.
  const excerpt = source.slice(0, 600).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim().split(/\r?\n/).find(line => line.trim())?.trim();
  const summary = excerpt || (data.filePath ? `${data.filePath}${data.lineRange ? ` · ${data.lineRange}` : ""}` : data.tool === "ask" && data.askAnswer?.length ? data.askAnswer.join(" · ") : "执行完成，展开查看详情");
  return { failed, awaitingAnswer, running, summary: summary.length > 160 ? `${summary.slice(0, 160)}…` : summary };
}

export function formatToolDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor(ms % 60_000 / 1000)}s`;
}
