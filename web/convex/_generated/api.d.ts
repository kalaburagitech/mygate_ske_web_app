/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessControl from "../accessControl.js";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as clientDashboard from "../clientDashboard.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as enrollment from "../enrollment.js";
import type * as images from "../images.js";
import type * as jwt from "../jwt.js";
import type * as loginLogs from "../loginLogs.js";
import type * as logs from "../logs.js";
import type * as mainOrganization from "../mainOrganization.js";
import type * as migrations_migrateUserRoles from "../migrations/migrateUserRoles.js";
import type * as migrations_stripLegacyUserRoleField from "../migrations/stripLegacyUserRoleField.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as organizationAccess from "../organizationAccess.js";
import type * as organizations from "../organizations.js";
import type * as patrolPoints from "../patrolPoints.js";
import type * as patrolSessions from "../patrolSessions.js";
import type * as regions from "../regions.js";
import type * as reports from "../reports.js";
import type * as sites from "../sites.js";
import type * as soDashboard from "../soDashboard.js";
import type * as userAccess from "../userAccess.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessControl: typeof accessControl;
  attendance: typeof attendance;
  auth: typeof auth;
  clientDashboard: typeof clientDashboard;
  crons: typeof crons;
  debug: typeof debug;
  enrollment: typeof enrollment;
  images: typeof images;
  jwt: typeof jwt;
  loginLogs: typeof loginLogs;
  logs: typeof logs;
  mainOrganization: typeof mainOrganization;
  "migrations/migrateUserRoles": typeof migrations_migrateUserRoles;
  "migrations/stripLegacyUserRoleField": typeof migrations_stripLegacyUserRoleField;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  organizationAccess: typeof organizationAccess;
  organizations: typeof organizations;
  patrolPoints: typeof patrolPoints;
  patrolSessions: typeof patrolSessions;
  regions: typeof regions;
  reports: typeof reports;
  sites: typeof sites;
  soDashboard: typeof soDashboard;
  userAccess: typeof userAccess;
  users: typeof users;
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
