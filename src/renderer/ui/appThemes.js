// App-chrome theme registry. These style the EDITOR itself (see
// styles/appThemes.css); they are unrelated to the streamplan design
// templates in models/templates.js, which only affect the exported graphic.
// 12 static, 12 animated. Animated themes carry an `animStyle` that picks
// which keyframe animation their chrome uses (see appThemes.css) — "drift"
// is the original gentle gradient pan, the rest (pulse/sweep/rotate/aurora)
// are richer, more GPU-active motion added for variety.
export const DEFAULT_APP_THEME_ID = "midnight_violet";

export const APP_THEMES = [
  // -- Static --------------------------------------------------------------
  { id: "midnight_violet", name: "Midnight Violet", animated: false, swatch: "linear-gradient(135deg, #120f1a, #241d33, #382c52)" },
  { id: "obsidian_slate", name: "Obsidian Slate", animated: false, swatch: "linear-gradient(135deg, #101216, #242830, #38404d)" },
  { id: "crimson_dusk", name: "Crimson Dusk", animated: false, swatch: "linear-gradient(135deg, #1a0f12, #3a1e26, #5a2a35)" },
  { id: "emerald_depth", name: "Emerald Depth", animated: false, swatch: "linear-gradient(135deg, #0f1a15, #1e3529, #2c503d)" },
  { id: "sapphire_hollow", name: "Sapphire Hollow", animated: false, swatch: "linear-gradient(135deg, #070c14, #14263f, #2c4266)" },
  { id: "amber_vault", name: "Amber Vault", animated: false, swatch: "linear-gradient(135deg, #120d06, #2b1f10, #5c3f1a)" },
  { id: "void_indigo", name: "Void Indigo", animated: false, swatch: "linear-gradient(135deg, #08070f, #191428, #332a56)" },
  { id: "rose_quartz_noir", name: "Rose Quartz Noir", animated: false, swatch: "linear-gradient(135deg, #12090d, #2c1721, #5e2c40)" },
  { id: "slate_cobalt", name: "Slate Cobalt", animated: false, swatch: "linear-gradient(135deg, #0a0d10, #1b2129, #3a4756)" },
  { id: "onyx_gold", name: "Onyx Gold", animated: false, swatch: "linear-gradient(135deg, #060606, #191713, #453a20)" },
  { id: "frost_steel", name: "Frost Steel", animated: false, swatch: "linear-gradient(135deg, #090c0e, #1a2225, #38484d)" },
  { id: "wine_umbra", name: "Wine Umbra", animated: false, swatch: "linear-gradient(135deg, #100609, #29131a, #5c2836)" },

  // -- Animated --------------------------------------------------------------
  { id: "aurora_drift", name: "Aurora Drift", animated: true, animStyle: "drift", swatch: "linear-gradient(120deg, #1c1440, #123a3a, #2a1750, #103048)" },
  { id: "nebula_pulse", name: "Nebula Pulse", animated: true, animStyle: "drift", swatch: "linear-gradient(135deg, #1a0f3a, #3a1050, #103a52, #200f40)" },
  { id: "neon_grid", name: "Neon Grid", animated: true, animStyle: "drift", swatch: "linear-gradient(125deg, #12030f, #031418, #150318, #021014)" },
  { id: "ember_flow", name: "Ember Flow", animated: true, animStyle: "drift", swatch: "linear-gradient(120deg, #2a1204, #401a08, #200a10, #351506)" },
  { id: "solar_flare", name: "Solar Flare", animated: true, animStyle: "rotate", swatch: "linear-gradient(120deg, #2a0a04, #6e1f0a, #e0621f, #ffb347)" },
  { id: "glacier_pulse", name: "Glacier Pulse", animated: true, animStyle: "pulse", swatch: "linear-gradient(135deg, #06131a, #103040, #34a6c2, #baf7ff)" },
  { id: "void_spiral", name: "Void Spiral", animated: true, animStyle: "rotate", swatch: "linear-gradient(120deg, #0a0512, #2c1250, #6a2fc0, #c48bff)" },
  { id: "prism_sweep", name: "Prism Sweep", animated: true, animStyle: "sweep", swatch: "linear-gradient(100deg, #08080c, #14142a, #7c5fe0, #ffffff, #14142a)" },
  { id: "bloodmoon_pulse", name: "Bloodmoon Pulse", animated: true, animStyle: "pulse", swatch: "linear-gradient(135deg, #0e0505, #3c1414, #c22e34, #ff5c5c)" },
  { id: "cyber_sweep", name: "Cyber Sweep", animated: true, animStyle: "sweep", swatch: "linear-gradient(100deg, #07080b, #10202a, #2fb8e0, #ff4fc3, #10202a)" },
  { id: "astral_aurora", name: "Astral Aurora", animated: true, animStyle: "aurora", swatch: "linear-gradient(120deg, #10163a, #123a52, #1f6a5a, #4a2f7a)" },
  { id: "molten_aurora", name: "Molten Aurora", animated: true, animStyle: "aurora", swatch: "linear-gradient(120deg, #2a0a1c, #5c1420, #a8281e, #d9522f)" },
  { id: "galaxy_veil", name: "Galaxy Veil", animated: true, animStyle: "galaxy", swatch: "linear-gradient(135deg, #05040c, #1a1040, #4a2f7a)" },
];

export function getAppTheme(id) {
  return APP_THEMES.find((t) => t.id === id) || APP_THEMES.find((t) => t.id === DEFAULT_APP_THEME_ID);
}

export function applyAppTheme(id) {
  const theme = getAppTheme(id);
  document.body.setAttribute("data-app-theme", theme.id);
  if (theme.animated) {
    document.body.setAttribute("data-app-theme-animated", "1");
    document.body.setAttribute("data-app-anim-style", theme.animStyle || "drift");
  } else {
    document.body.removeAttribute("data-app-theme-animated");
    document.body.removeAttribute("data-app-anim-style");
  }
  return theme.id;
}
