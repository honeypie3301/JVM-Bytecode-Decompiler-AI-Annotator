/**
 * UI THEME CONTRACT — Warm Obsidian & Muted Brass
 *
 * MANDATORY RULE FOR ALL UI ELEMENTS:
 * 1. Never render unstyled OS-native form controls (<select>, <input type="checkbox">,
 *    <input type="radio">, native scrollbars) that introduce stark white/blue browser chrome.
 * 2. Always build custom controls using the dark obsidian surfaces and brass accents below.
 * 3. Keep status semantics restricted to brass (active), sage (success), and muted crimson (error).
 */
export const WARM_OBSIDIAN_THEME = {
  bgCanvas: "#11100F",
  bgSurface: "#141210",
  bgElevated: "#181614",
  bgHover: "#1F1C1A",
  borderHairline: "#2A2623",
  borderControl: "#2E2A26",
  borderInteractive: "#35302B",
  textPrimary: "#EAE5DE",
  textSecondary: "#C4BCB3",
  textMuted: "#A69E94",
  textSubtle: "#706961",
  accentBrass: "#C5A880",
  accentBrassHover: "#D2B894",
  statusSuccess: "#7EA287",
  statusError: "#C76E6E",
} as const;
