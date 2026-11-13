# API Documentation

## API conventions

Protected business-foundation routes require `Authorization: Bearer <JWT>`. Tenant context is read from the verified `req.user.tenantId`; request-supplied tenant IDs are rejected as unsupported input. Success responses use `{ "success": true, "data": ... }` and may include `message`; errors use `{ "success": false, "message": "..." }`.

Paginated list endpoints accept `page` (default `1`) and `limit` (default `20`, maximum `100`) and return `{ data: { <rows>, total, page, limit } }`.

## Authentication and permissions

## Business foundation

Business type values: `SUPERMARKET`, `GROCERY`, `RETAIL`, `RESTAURANT`, `CAFE`, `CLOUD_KITCHEN`, `TAILORING`, `BOUTIQUE`, `GARMENT_WORKSHOP`, `UNIFORM_MANUFACTURER`.

All endpoints below derive the tenant from the authenticated user. Business profile/settings writes and branch administration require a tenant-administrator role (`BUSINESS_ADMIN`, `OWNER`, `TENANT_OWNER`; `SUPER_ADMIN` only when operating with a tenant context). Branch reads and member reads require branch access; membership changes are tenant-admin-only. Branch membership permissions are stored as boolean JSON entries and checked by `requireBranchPermission`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/business-profile` | Read tenant business profile and enabled modules |
| PUT | `/api/business-profile` | Update profile fields including business type |
| GET | `/api/business-settings` | Read enabled modules and business configuration/settings |
| PUT | `/api/business-settings` | Update enabled modules, business config, preferences, social links, or terms |
| GET | `/api/branches?page=1&limit=20&search=&isActive=` | List branches; administrators see all tenant branches, other users see active memberships |
| POST | `/api/branches` | Create branch; accepts `name` and optional `code`, contact/address, timezone, openingHours, managerId, isDefault |
| GET | `/api/branches/:branchId` | Read branch details |
| PUT | `/api/branches/:branchId` | Update branch profile fields |
| PATCH | `/api/branches/:branchId/status` | Activate/deactivate with `{ "isActive": boolean }`; the only active default branch cannot be deactivated |
| PATCH | `/api/branches/:branchId/default` | Make the branch active and the tenant's sole default |
| GET | `/api/branches/:branchId/members?page=1&limit=20&isActive=` | Paginated branch membership list; requires `branches.members.view` for non-admins |
| POST | `/api/branches/:branchId/members` | Add/reactivate a same-tenant user; accepts `userId`, optional `role`, optional boolean-map `permissions` |
| PATCH | `/api/branches/:branchId/members/:membershipId` | Update membership role, permissions, or active status |
| DELETE | `/api/branches/:branchId/members/:membershipId` | Soft-deactivate membership (does not delete the audit/history row) |

`openingHours` is an object keyed by lowercase weekday names. Each day's value may contain `closed: boolean` and/or `open`/`close` values in `HH:mm` format. Branch codes are normalized to uppercase hyphen-separated identifiers and are unique within a tenant.

The initial business settings defaults are `enabledModules: ["catalog","orders","customers","inventory"]` and `businessConfig: {}`. New tenant registrations receive a default branch and a membership for their registering user. The section 3.1 field list was not present in the supplied MASTER_SPEC; P1A therefore uses the existing Tenant profile fields plus `businessType`, `enabledModules`, and `businessConfig`. Expand this contract only when the authoritative field list is supplied.

## Endpoints by module

### Branch inventory (P2B)

Inventory read/write requests require an authorized active branch from `:branchId`, `?branchId=`, or `x-branch-id`. Writes also require active tenant-admin privileges or the branch membership permission `inventory.adjust`. The server derives tenant scope from the verified user. Stock-changing operations require an `Idempotency-Key` header (8-128 characters); ledger movements are immutable, and corrections use the reversal endpoint.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/inventory/balances?branchId=&page=1&limit=50&lowStock=true` | Paginated branch balances; `lowStock=true` filters to configured minimum/reorder thresholds |
| PATCH | `/api/inventory/balances/:variantId/thresholds?branchId=` | Set non-negative `minStock` and/or `reorderLevel` |
| GET | `/api/inventory/alerts/low-stock?branchId=&page=1&limit=50` | List branch balances at/below configured thresholds |
| GET | `/api/inventory/movements?branchId=&variantId=&type=&startDate=&endDate=&page=1&limit=50` | Paginated immutable movement ledger |
| GET | `/api/inventory/adjustments?branchId=&variantId=&status=&page=1&limit=50` | Paginated stock adjustment history |
| POST | `/api/inventory/adjustments?branchId=` | Record `ADJUSTMENT`, `STOCK_COUNT`, `DAMAGE`, `EXPIRED`, or `LOST`; send variant and quantity or countedStock |
| POST | `/api/inventory/adjustments/:adjustmentId/reverse?branchId=` | Append an opposite `REVERSAL` movement for a completed adjustment |
| GET | `/api/reports/inventory?branchId=&startDate=&endDate=` | Branch balances, configured low-stock flags, valuation, and movement totals for the date range |

Inventory operations are implemented but depend on the additive P2A schema migration being applied and the matching Prisma Client being generated. The migration is intentionally not applied to the connected database during this task.

## Validation and error responses

Business-foundation inputs are validated in `controllers/businessFoundationController.js`. Duplicate unique values return HTTP 409; invalid references/input return HTTP 400; records outside the authenticated tenant return HTTP 404. Unexpected errors are forwarded to the global error handler.
