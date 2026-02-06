import { createFileRoute } from '@tanstack/react-router'
import { variants } from '~/variants'
import { VariantCard } from '~/components/VariantCard'

export const Route = createFileRoute('/proposals')({
  component: ProposalsPage,
})

function ProposalsPage() {
  return (
    <div className="proposals-page">
      <div className="page-header">
        <h1>Meet / Style Exploration</h1>
        <p>
          13 oryginalnych wariantow stylistycznych — kazdy z unikalna metafora
          wizualna i wlasnym UX patternem.
        </p>
      </div>
      {variants.map((v, i) => (
        <VariantCard key={v.meta.id} meta={v.meta} index={i}>
          <v.component />
        </VariantCard>
      ))}
    </div>
  )
}
