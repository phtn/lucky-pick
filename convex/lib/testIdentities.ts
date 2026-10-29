/**
 * Identities shared by the Convex tests. They mirror what Firebase puts on a
 * verified ID token, so a test authorizes through the same claims production
 * does. Kept free of test-runner imports because everything under `convex/` is
 * bundled for deploy.
 */
export const ISSUER = 'https://securetoken.google.com/lucky-pick-345'

export const identity = (subject: string, claims: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  subject,
  tokenIdentifier: `${ISSUER}|${subject}`,
  ...claims
})

export const god = identity('god', { god: true })
export const godB = identity('god-b', { god: true })
export const topg = identity('topg', { god: true, topg: true })
export const staff = identity('staff', { admin: true })

/** A signed-in partner; `emailVerified` is what gates linking by email. */
export const member = (subject: string, email: string, emailVerified = true) =>
  identity(subject, { email, emailVerified })
