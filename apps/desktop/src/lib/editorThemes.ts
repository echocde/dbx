import type { Extension } from "@codemirror/state";
import type { EditorTheme } from "@/stores/settingsStore";
import type { AppThemeAppearance } from "@/lib/appTheme";

type CodeMirrorStyleSpec = Parameters<typeof import("@codemirror/view").EditorView.theme>[0];

export const EDITOR_FONT_SIZE_CSS_VAR = "--dbx-editor-font-size";
export const EDITOR_FONT_FAMILY_CSS_VAR = "--dbx-editor-font-family";

/** Load a CodeMirror theme extension by theme name. */
export function resolveEditorTheme(theme: EditorTheme, appAppearance: AppThemeAppearance): Exclude<EditorTheme, "app"> {
  if (theme === "app") return appAppearance === "dark" ? "one-dark" : "vscode-light";
  return theme;
}

/** Load a CodeMirror theme extension by theme name. */
export async function loadEditorTheme(
  theme: EditorTheme,
  appAppearance: AppThemeAppearance = "dark",
): Promise<Extension> {
  const resolvedTheme = resolveEditorTheme(theme, appAppearance);
  switch (resolvedTheme) {
    case "one-dark":
      return (await import("@codemirror/theme-one-dark")).oneDark;
    case "vscode-dark":
      return (await import("@uiw/codemirror-theme-vscode")).vscodeDark;
    case "vscode-light":
      return (await import("@uiw/codemirror-theme-vscode")).vscodeLight;
    case "nord":
      return (await import("@uiw/codemirror-theme-nord")).nord;
    case "okaidia":
      return (await import("@uiw/codemirror-theme-okaidia")).okaidia;
    case "material":
      return (await import("@uiw/codemirror-theme-material")).materialDark;
    case "duotone-light":
      return (await import("@uiw/codemirror-theme-duotone")).duotoneLight;
    case "duotone-dark":
      return (await import("@uiw/codemirror-theme-duotone")).duotoneDark;
    case "xcode":
      return (await import("@uiw/codemirror-theme-xcode")).xcodeLight;
    default:
      return (await import("@codemirror/theme-one-dark")).oneDark;
  }
}

export function buildEditorFontThemeRules(
  opts?: { fixedHeight?: boolean; scrollable?: boolean },
  defaults?: { size?: number; family?: string },
): CodeMirrorStyleSpec {
  return {
    "&": {
      ...(opts?.fixedHeight ? { height: "100%" } : {}),
      fontSize: `var(${EDITOR_FONT_SIZE_CSS_VAR}, ${defaults?.size ?? 13}px)`,
    },
    ...(opts?.scrollable ? { ".cm-scroller": { overflow: "auto" } } : {}),
    ".cm-content": {
      fontFamily: `var(${EDITOR_FONT_FAMILY_CSS_VAR}, ${defaults?.family ?? "monospace"})`,
    },
    ".cm-gutters": {
      borderRight: "0 !important",
      fontSize: `var(${EDITOR_FONT_SIZE_CSS_VAR}, ${defaults?.size ?? 13}px)`,
      position: "relative",
    },
    ".cm-gutters:after": {
      background: "rgba(148, 163, 184, 0.38)",
      bottom: "0",
      content: "''",
      pointerEvents: "none",
      position: "absolute",
      right: "0",
      top: "0",
      width: "1px",
      zIndex: "10",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingRight: "16px",
    },
  };
}

/** Build a CodeMirror theme extension for font size + font family. */
export function editorFontTheme(
  EditorView: typeof import("@codemirror/view").EditorView,
  size: number,
  family: string,
  opts?: { fixedHeight?: boolean; scrollable?: boolean },
): Extension {
  return EditorView.theme(buildEditorFontThemeRules(opts, { size, family }));
}

export function buildSqlCompletionThemeRules(): CodeMirrorStyleSpec {
  return {
    ".cm-tooltip.cm-tooltip-autocomplete": {
      background: "var(--popover)",
      border: "1px solid color-mix(in oklch, var(--border) 82%, var(--foreground) 18%)",
      borderRadius: "8px",
      boxShadow: "0 8px 18px rgb(0 0 0 / 0.14)",
      color: "var(--popover-foreground)",
      fontFamily: `var(${EDITOR_FONT_FAMILY_CSS_VAR}, var(--font-mono, monospace))`,
      maxWidth: "min(520px, calc(100vw - 24px))",
      minWidth: "min(280px, calc(100vw - 24px))",
      overflow: "hidden",
      padding: "4px 0",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      maxHeight: "min(280px, calc(100vh - 32px))",
      minWidth: "min(280px, calc(100vw - 24px))",
      padding: "0 4px 0 !important",
      scrollbarColor: "color-mix(in oklch, var(--muted-foreground) 44%, transparent) transparent",
      scrollbarWidth: "thin",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      alignItems: "center",
      borderRadius: "6px",
      color: "var(--popover-foreground)",
      display: "flex",
      fontSize: `clamp(12px, var(${EDITOR_FONT_SIZE_CSS_VAR}, 13px), 14px)`,
      fontWeight: "520",
      height: "28px",
      letterSpacing: "0",
      lineHeight: "28px",
      padding: "0 10px !important",
      transition: "background-color 90ms ease, color 90ms ease",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "color-mix(in oklch, var(--primary) 14%, var(--popover)) !important",
      color: "var(--popover-foreground) !important",
      outline: "1px solid color-mix(in oklch, var(--primary) 22%, transparent)",
    },
    ".cm-completionIcon": {
      display: "none !important",
      height: "0",
      margin: "0",
      paddingRight: "0 !important",
      width: "0",
    },
    ".cm-completionLabel": {
      color: "inherit",
      fontFamily: `var(${EDITOR_FONT_FAMILY_CSS_VAR}, var(--font-mono, monospace))`,
      fontSize: `clamp(12px, var(${EDITOR_FONT_SIZE_CSS_VAR}, 13px), 14px)`,
      fontWeight: "520",
      letterSpacing: "0",
    },
    ".cm-completionMatchedText": {
      color: "oklch(0.62 0.19 255)",
      fontWeight: "700",
      textDecoration: "none",
    },
    ".cm-completionDetail": {
      color: "color-mix(in oklch, var(--popover-foreground) 68%, var(--popover))",
      fontSize: `clamp(11px, calc(var(${EDITOR_FONT_SIZE_CSS_VAR}, 13px) - 1px), 13px)`,
      fontWeight: "500",
      fontStyle: "normal",
      marginLeft: "10px",
      opacity: "1",
    },
  };
}

export function sqlCompletionTheme(EditorView: typeof import("@codemirror/view").EditorView): Extension {
  return EditorView.theme(buildSqlCompletionThemeRules());
}
