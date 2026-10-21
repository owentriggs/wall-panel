import type { JSX } from "preact";

/** Render a raw SVG/HTML string (album art, charts) without adding a layout box. */
export function Raw({ html }: { html: string }): JSX.Element {
  return <span style="display:contents" dangerouslySetInnerHTML={{ __html: html }} />;
}

interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  fill?: string;
  label: string;
  onInput: (v: number) => void;
}
/** Range slider matching the prototype's `.rng` (drag-to-set, live fill). */
export function Slider({ min, max, step = 1, value, fill, label, onInput }: SliderProps): JSX.Element {
  const pct = (v: number): string => (((v - min) / (max - min)) * 100).toFixed(1) + "%";
  const style: Record<string, string> = { "--p": pct(value) };
  if (fill) style["--fill"] = fill;
  return (
    <input
      class="rng"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      style={style}
      onInput={(e) => {
        const v = Number((e.currentTarget as HTMLInputElement).value);
        (e.currentTarget as HTMLInputElement).style.setProperty("--p", pct(v));
        onInput(v);
      }}
    />
  );
}

/** Pill switch matching the prototype's `.sw` (visual only; parent handles taps). */
export function Switch({ on }: { on: boolean }): JSX.Element {
  return <span class="sw" aria-checked={on ? "true" : "false"} />;
}
