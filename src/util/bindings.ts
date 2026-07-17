/** Build a tiao `options` map from string labels or `{ text, value }` entries. */
export const listOptions = (entries: Array<string | { text: string; value: string }>) =>
  Object.fromEntries(entries.map((e) => (typeof e === "string" ? [e, e] : [e.text, e.value])));

type UniformBinding = {
  value: unknown;
  min?: number;
  max?: number;
  label?: string;
  step?: number;
  hideControls?: boolean;
};

export const addUniforms = (
  folder: { addBinding: (...args: any[]) => unknown },
  uniforms: Record<string, UniformBinding>
) => {
  for (const key in uniforms) {
    const { min = 0, max = 1, label, step = 0.01, value, hideControls = false } = uniforms[key];

    if (hideControls) {
      continue;
    }

    const uniformLabel = label || key;

    if (typeof value === "number") {
      folder.addBinding(uniforms[key], "value", {
        min,
        max,
        step,
        label: uniformLabel,
      });
    } else {
      folder.addBinding(uniforms[key], "value", {
        label: uniformLabel,
      });
    }
  }

  return folder;
};
