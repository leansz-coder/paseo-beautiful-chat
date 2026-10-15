import { expect, it } from "vitest";
import { toolActivityState, isInteractiveTool } from "../client/tool-grouping";

const ordinary = { name: "exec_command", status: "completed", detail: { type: "shell", exitCode: 0 } };

it("counts errors and interruptions separately within groups", () => {
  for (const item of [
    { ...ordinary, status: "failed" },
    { ...ordinary, status: "canceled" },
    { ...ordinary, error: "Permission denied" },
    { ...ordinary, detail: { type: "shell", exitCode: 1 } },
    { ...ordinary, detail: { output: { exitCode: 2 } } },
    { ...ordinary, detail: { output: { isError: true } } },
    { ...ordinary, detail: { result: { error: "RPC failed" } } },
  ]) expect(["failed", "canceled"]).toContain(toolActivityState(item));
});

it("keeps questions visible across common provider tool names", () => {
  for (const name of ["ask", "AskUserQuestion", "functions.request_user_input", "functions.request_user_input_async", "mcp__tools__ask_user_question"])
    expect(isInteractiveTool({ ...ordinary, status: "running", name })).toBe(true);
  expect(isInteractiveTool({ ...ordinary, detail: { type: "ask" } })).toBe(true);
});

it("classifies running and completed calls without inspecting output text", () => {
  expect(toolActivityState(ordinary)).toBe("completed");
  expect(toolActivityState({ ...ordinary, status: "running" })).toBe("running");
  expect(toolActivityState({ ...ordinary, name: "task", detail: { output: "Example mentions error and failure" } })).toBe("completed");
});
