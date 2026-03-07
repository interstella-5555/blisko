import type { VariantMeta } from "~/variants/types";

export function VariantDescription({ meta }: { meta: VariantMeta }) {
  return (
    <div className="variant-desc">
      <h2>
        {meta.id}. {meta.name}
      </h2>
      <p className="tagline">{meta.tagline}</p>
      <p className="inspiration">Insp: {meta.inspiration}</p>

      <h3>Wyrozniki wizualne</h3>
      <ul>
        {meta.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <h3>Dlaczego dobry UX</h3>
      <ul>
        {meta.uxAnalysis.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>

      <div className="ux-pattern">
        <strong>UX Pattern:</strong> {meta.uxPattern}
      </div>
    </div>
  );
}
