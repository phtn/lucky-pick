/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_contacts from "../accounts/contacts.js";
import type * as accounts_d from "../accounts/d.js";
import type * as accounts_helpers from "../accounts/helpers.js";
import type * as accounts_m from "../accounts/m.js";
import type * as accounts_q from "../accounts/q.js";
import type * as credits_d from "../credits/d.js";
import type * as credits_helpers from "../credits/helpers.js";
import type * as credits_m from "../credits/m.js";
import type * as credits_q from "../credits/q.js";
import type * as csvBaseline from "../csvBaseline.js";
import type * as ledger_audit from "../ledger/audit.js";
import type * as ledger_d from "../ledger/d.js";
import type * as ledger_m from "../ledger/m.js";
import type * as ledger_post from "../ledger/post.js";
import type * as ledger_q from "../ledger/q.js";
import type * as ledger_wallets from "../ledger/wallets.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_testIdentities from "../lib/testIdentities.js";
import type * as money_d from "../money/d.js";
import type * as resultValidators from "../resultValidators.js";
import type * as resultsImport from "../resultsImport.js";
import type * as users_m from "../users/m.js";
import type * as users_q from "../users/q.js";
import type * as users_v from "../users/v.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accounts/contacts": typeof accounts_contacts;
  "accounts/d": typeof accounts_d;
  "accounts/helpers": typeof accounts_helpers;
  "accounts/m": typeof accounts_m;
  "accounts/q": typeof accounts_q;
  "credits/d": typeof credits_d;
  "credits/helpers": typeof credits_helpers;
  "credits/m": typeof credits_m;
  "credits/q": typeof credits_q;
  csvBaseline: typeof csvBaseline;
  "ledger/audit": typeof ledger_audit;
  "ledger/d": typeof ledger_d;
  "ledger/m": typeof ledger_m;
  "ledger/post": typeof ledger_post;
  "ledger/q": typeof ledger_q;
  "ledger/wallets": typeof ledger_wallets;
  "lib/auth": typeof lib_auth;
  "lib/testIdentities": typeof lib_testIdentities;
  "money/d": typeof money_d;
  resultValidators: typeof resultValidators;
  resultsImport: typeof resultsImport;
  "users/m": typeof users_m;
  "users/q": typeof users_q;
  "users/v": typeof users_v;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
