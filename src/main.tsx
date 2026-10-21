// Dev entry: run the panel against the MOCK Home Assistant (seeded with the
// real entity ids from the brief). Add ?bare to preview the in-HA look.
import { render } from "preact";
import { App } from "./App";
import { injectAssets } from "./styles/inject";
import { MockConnection } from "./ha/mock-connection";
import { initHa } from "./ha/adapter";

injectAssets();
initHa(new MockConnection());

const bare = new URLSearchParams(location.search).has("bare");
render(<App demo={!bare} bare={bare} />, document.getElementById("app")!);
