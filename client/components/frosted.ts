import type { ViewProps } from "react-native";
import { getEnhancerPreferences, subscribeEnhancerPreferences } from "../preferences";

const STYLE_ELEMENT_ID = "beautiful-chat-frosted";

/**
 * `backdrop-filter` has no React Native style equivalent, and React Native Web
 * drops style keys it does not recognise. So the blur is declared once as a
 * real CSS rule and matched by attribute, the same technique the host itself
 * uses for `data-pmono`.
 *
 * `saturate` is included because blurring alone washes colour out of whatever
 * sits behind the surface; pushing saturation back up keeps syntax highlighting
 * under a nested block from turning grey.
 */
const FROSTED_RULE = `[data-ompfrost] {
  -webkit-backdrop-filter: blur(8px) saturate(115%);
  backdrop-filter: blur(8px) saturate(115%);
  background-image: linear-gradient(135deg, rgba(116, 197, 177, 0.065), rgba(255, 255, 255, 0.025) 40%, transparent 70%);
}
[data-ompfrost] [data-ompfrost] {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background-image: none;
}`;
const SOLID_RULE = `[data-ompfrost] {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background-image: none;
}`;

/**
 * Installs the blur rule. A no-op off web, and idempotent so a second client
 * mount reuses the existing element.
 */
export function installFrostedGlass(): () => void {
  if (typeof document === "undefined") return () => {};
  if (document.getElementById(STYLE_ELEMENT_ID)) return () => {};

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  const update = () => { style.textContent = getEnhancerPreferences().frostedGlass ? FROSTED_RULE : SOLID_RULE; };
  update();
  const unsubscribe = subscribeEnhancerPreferences(update);
  document.head.appendChild(style);

  return () => {
    unsubscribe();
    style.remove();
  };
}

/**
 * Marks a surface for blurring. Spread onto a `View` whose background is one of
 * the translucent `glass` tokens — an opaque background has nothing to show
 * through and the blur would be invisible.
 *
 * On native the attribute is ignored and the surface simply renders
 * translucent, which degrades honestly: a real blur there needs a native view
 * the plugin sandbox does not expose.
 */
export const frosted = {
  dataSet: { ompfrost: true },
} as unknown as ViewProps;
