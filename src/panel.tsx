// Production entry: a custom element Home Assistant loads via panel_custom.
// HA assigns the authenticated `hass` object; we reuse its live connection to
// read entity states and call services — no token, no login.
//
// We render into our OWN shadow root. HA nests the panel element inside its own
// shadow DOM, so document-level styles and the icon sprite never reach us —
// that's why an earlier build showed as unstyled HTML. A self-contained shadow
// root guarantees our styles apply and also isolates us from HA's CSS.
import { render } from "preact";
import { App } from "./App";
import { injectAssets } from "./styles/inject";
import { setRoots } from "./ui/root";
import { RealConnection, type Hass } from "./ha/real-connection";
import { initHa } from "./ha/adapter";

class WallPanel extends HTMLElement {
  private conn: RealConnection | null = null;
  private root: ShadowRoot | null = null;
  private appHost: HTMLDivElement | null = null;
  private mounted = false;

  set hass(hass: Hass) {
    if (!hass) return;
    if (!this.conn) {
      const root = this.attachShadow({ mode: "open" });
      this.root = root;
      // Scope styling, the sprite and DOM lookups to this shadow root, and put
      // the theme attribute on the host (`:host[data-theme=…]` overrides).
      injectAssets(root);
      setRoots(root, this);
      this.conn = new RealConnection(hass);
      initHa(this.conn);
      this.mount();
    } else {
      this.conn.updateHass(hass);
    }
  }

  private mount(): void {
    if (this.mounted || !this.root) return;
    this.mounted = true;
    this.style.display = "block";
    // HA gives a custom panel NO height (its container is display:inline / 0px),
    // so height:100% collapses to 0 and the panel renders blank. Size to the
    // viewport instead. 100vh is universally supported; dvh (set in CSS) refines
    // it on browsers that have it.
    this.style.height = "100vh";
    // preact renders into a plain element; keep the sprite/style as siblings.
    const host = document.createElement("div");
    host.style.height = "100%";
    this.root.appendChild(host);
    this.appHost = host;
    render(<App bare />, host);
  }

  disconnectedCallback(): void {
    if (this.appHost) render(null, this.appHost);
    this.mounted = false;
  }
}

if (!customElements.get("wall-panel")) {
  customElements.define("wall-panel", WallPanel);
}
