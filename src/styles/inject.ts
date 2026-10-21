// Inject styles + icon sprite once. Styles are imported as strings so the
// production build is a single self-contained JS file.
//
// The target is the render root: `document` in dev, or the panel's shadow root
// inside Home Assistant. Styles and the sprite MUST live in the same tree as
// the rendered app, or custom properties and `<use href="#i-…">` won't resolve
// across the shadow boundary (the "no styling" symptom when embedded in HA).
import hearth from "./hearth.css?inline";
import fonts from "./fonts.css?inline";
import { ICON_SPRITE } from "../ui/sprite";

const injected = new WeakSet<Document | ShadowRoot>();

export function injectAssets(root: Document | ShadowRoot = document): void {
  if (injected.has(root)) return;
  injected.add(root);

  const styleParent: Node = root instanceof Document ? root.head : root;
  const spriteParent: Node = root instanceof Document ? root.body : root;

  const style = document.createElement("style");
  style.textContent = fonts + "\n" + hearth;
  styleParent.appendChild(style);

  const holder = document.createElement("div");
  holder.style.display = "none";
  holder.innerHTML = ICON_SPRITE;
  spriteParent.appendChild(holder);
}
