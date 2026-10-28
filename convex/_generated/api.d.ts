/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_d from "../accounts/d.js";
import type * as accounts_helpers from "../accounts/helpers.js";
import type * as accounts_m from "../accounts/m.js";
import type * as accounts_q from "../accounts/q.js";
import type * as csvBaseline from "../csvBaseline.js";
import type * as lib_auth from "../lib/auth.js";
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
  "accounts/d": typeof accounts_d;
  "accounts/helpers": typeof accounts_helpers;
  "accounts/m": typeof accounts_m;
  "accounts/q": typeof accounts_q;
  csvBaseline: typeof csvBaseline;
  "lib/auth": typeof lib_auth;
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
