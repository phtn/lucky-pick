import type { AuthConfig } from 'convex/server'

// Firebase ID tokens are signed by Google's Secure Token service. Both issuer
// and audience bind accepted tokens to this project's existing Firebase app.
export default {
  providers: [{
    type: 'customJwt',
    issuer: 'https://securetoken.google.com/lucky-pick-345',
    applicationID: 'lucky-pick-345',
    jwks: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    algorithm: 'RS256',
  }],
} satisfies AuthConfig
