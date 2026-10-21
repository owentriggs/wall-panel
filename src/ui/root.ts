// Where the app is mounted. In dev we render into the light DOM (document);
// inside Home Assistant the panel lives in its own shadow root, so styles,
// the icon sprite and DOM lookups must all be scoped to that root instead of
// the document. These helpers keep the rest of the code root-agnostic.
let renderRoot: Document | ShadowRoot = document;
let themeEl: HTMLElement = document.documentElement;

/** Called once by the HA custom element to point lookups at its shadow root. */
export function setRoots(root: Document | ShadowRoot, theme: HTMLElement): void {
  renderRoot = root;
  themeEl = theme;
}

/** The element that carries the `data-theme` attribute for token overrides. */
export function themeTarget(): HTMLElement {
  return themeEl;
}

export function queryRoot<T extends Element>(sel: string): T | null {
  return renderRoot.querySelector<T>(sel);
}

export function byId(id: string): HTMLElement | null {
  // Both Document and ShadowRoot implement getElementById.
  return (renderRoot as Document | ShadowRoot).getElementById(id);
}
