/**
 * Opens Asgard's client-side gate so the console can be worked on without a
 * god session.
 *
 * This is a view of the console, not access to it: every `/api/asgard/*` route
 * still verifies the session cookie and the `god` claim, so an open gate shows
 * the chrome and whatever the page can read without the server — it cannot
 * read the roster or anything else privileged.
 *
 * Both conditions are build-time constants, so a production bundle folds this
 * to `false` and drops the branch entirely. Setting the variable in a deployed
 * environment therefore does nothing: it is only honoured by a dev build.
 */
export const isAsgardGateOpen =
  import.meta.env.DEV === true && import.meta.env.PUBLIC_ASGARD_OPEN === 'true'
