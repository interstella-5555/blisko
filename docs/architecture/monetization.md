# Monetization

> Not implemented — planned in PRODUCT.md.

## Product Vision

Three subscription tiers per PRODUCT.md:

| | Basic (free) | Premium (19 PLN/mies) | Premium+ (cena TBD) |
|---|---|---|---|
| Pings/day | 5 | 20 | 20 + Groups |
| Trial | — | 3 days, no card | — |
| Groups | No | No | Create & manage |

### Referral Program (planned)
- New user via link: 50% discount on first month/year
- Referrer: 50% of payment value as credit
- Credits > subscription cost → next year free

### B2B (future)
- "Blisko for [institution]" — closed community for members
- Venues (cafes, restaurants) register as users with daily offer status on map

### What We Don't Monetize
- No user data sales
- No banner ads
- Only firm presence: organic statuses on map

## Current Implementation

**None.** Ping limit is hardcoded at 5/day for all users. No subscription management, no payment integration, no plan differentiation.

## Implementation Notes

When implementing, consider:
- Payment provider (Stripe? RevenueCat for mobile?)
- Plan storage (new table or profile field?)
- Ping limit should read from plan, not hardcoded constant
- Feature gates table (`featureGates`) could be extended for plan-based gating
- Rate limiting config would need plan-aware limits
