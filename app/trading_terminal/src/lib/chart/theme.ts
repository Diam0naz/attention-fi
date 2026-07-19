export interface ChartTheme {
  panel: string;
  text: string;
  textLow: string;
  grid: string;
  crosshair: string;
  border: string;
  up: string;
  down: string;
  upMuted: string;
  downMuted: string;
  accent: string;
  fontUi: string;
  fontNum: string;
}

function cssVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

/** Read the current design tokens off the document so charts follow the theme. */
export function readChartTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  return {
    panel: cssVar(styles, "--tk-bg-panel"),
    text: cssVar(styles, "--tk-text-mid"),
    textLow: cssVar(styles, "--tk-text-low"),
    grid: cssVar(styles, "--tk-chart-grid"),
    crosshair: cssVar(styles, "--tk-chart-crosshair"),
    border: cssVar(styles, "--tk-border"),
    up: cssVar(styles, "--tk-up"),
    down: cssVar(styles, "--tk-down"),
    upMuted: cssVar(styles, "--tk-up-muted"),
    downMuted: cssVar(styles, "--tk-down-muted"),
    accent: cssVar(styles, "--tk-accent"),
    fontUi: cssVar(styles, "--font-inter-tight") || "Inter Tight, sans-serif",
    fontNum: cssVar(styles, "--font-jetbrains-mono") || "JetBrains Mono, monospace",
  };
}
