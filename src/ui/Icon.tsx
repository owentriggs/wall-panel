import type { JSX } from "preact";

/** Icon by sprite id, e.g. <Icon n="home" />. `fill` matches the prototype's .ic.f. */
export function Icon({ n, fill = false, class: cls = "" }: { n: string; fill?: boolean; class?: string }): JSX.Element {
  return (
    <svg class={`ic${fill ? " f" : ""}${cls ? " " + cls : ""}`} aria-hidden="true">
      <use href={`#i-${n}`} />
    </svg>
  );
}
