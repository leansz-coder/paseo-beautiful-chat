// @vitest-environment jsdom
import { expect, it } from "vitest";
import { installFrostedGlass } from "../client/components/frosted";
import { updateEnhancerPreferences, resetEnhancerPreferences, DEFAULT_PREFERENCES } from "../client/preferences";
import { buildThemeTokens, type PluginSurfaceColors } from "../client/components/theme-tokens";
it("uses one restrained glass layer; disabling removes filters and cleanup releases its observer", () => {
  resetEnhancerPreferences(); const cleanup = installFrostedGlass();
  const css = document.getElementById("beautiful-chat-frosted")!;
  expect(css.textContent).toContain("blur(8px)");
  expect(css.textContent).toContain("[data-ompfrost] [data-ompfrost]");
  updateEnhancerPreferences({ frostedGlass: false });
  expect(css.textContent).not.toContain("blur("); expect(css.textContent).toContain("backdrop-filter: none");
  cleanup(); updateEnhancerPreferences({ frostedGlass: true });
  expect(document.getElementById("beautiful-chat-frosted")).toBeNull();
});
it("adds jade to neutral themes, respects chosen accents and uses opaque code backgrounds when glass is off", () => {
  const colors = { surface0: "#111111", foreground: "#eeeeee", accent: "#eeeeee", foregroundMuted: "#999999", statusDanger: "#ee5555" } as PluginSurfaceColors;
  expect(buildThemeTokens(colors).accent).toBe("#70c7b0");
  expect(buildThemeTokens(colors, { ...DEFAULT_PREFERENCES, accent: "violet" }).accent).toBe("#8b5cf6");
  expect(buildThemeTokens(colors, { ...DEFAULT_PREFERENCES, frostedGlass: false }).surfaceCodeGlass).toMatch(/^#/);
  expect(buildThemeTokens({ ...colors, accent: "#2277cc" }).accent).toBe("#2277cc");
  expect(buildThemeTokens({ ...colors, surface0: "#ffffff" }).accent).toBe("#197b66");
});
