# Implementation Audit

## Executive summary and audit scope

This repository is an existing CommonJS Express + Prisma ecommerce backend, not a Next.js application. It has substantial tenant-scoped commerce functionality (catalog, cart, online orders, payments, shipping/couriers, returns/refunds, storefront content, notifications, and marketing integrations), but does not contain a frontend, branch model, granular permission system, or branch-aware inventory.

**P1A implementation update:** the backend now defines `BusinessType`, tenant business settings, `Branch`/`BranchMembership`, profile/settings and branch APIs, branch authorization middleware, an idempotent default-branch backfill, and a registration hook for newly created tenants. The original findings below describe the Phase 0 baseline; see the P1A progress row and API/migration documentation for the implemented state and remaining verification limits.

The audit read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, both `MASTER_SPEC.md` copies, the Express entry point/routes/controllers/middleware, Prisma schema and migrations, package scripts, existing project documentation, and the stock/transaction paths relevant to checkout. The task requested numbered MASTER_SPEC sections 1, 2, 3, 19, 20, and 22; neither `MASTER_SPEC.md` nor `docs/MASTER_SPEC.md` has those numbered sections. They contain project rules and phase/task prompts instead. Therefore, the phase roadmap below follows the available prompts and progress table; detailed requirements that exist only in the absent numbered sections must be supplied or reconciled before implementation relies on them.

The worktree already contained unrelated uncommitted changes to `.env`, `.env.example`, `postman-collection.json`, `server.js`, and an untracked root `MASTER_SPEC.md`. Those changes were preserved and are not part of this audit's implementation or commit.

## Repository structure

| Area | Existing structure | Audit result |
|---|---|---|
| Frontend | No `app/`, `src/`, `pages/`, `.tsx`, or frontend package manifest in this repository | Next.js dashboard, layout/sidebar, auth context, API client, forms, tables, dialogs/modals, toasts, branch selector, and UI tests are absent here. Do not treat backend folders as evidence that these frontend surfaces exist. |
| HTTP application | `server.js`, `api/index.js` | Express app; `api/index.js` exports the app for serverless hosting. `server.js` mounts API routers and installs 404/error handlers. |
| HTTP routes | `routes/*Routes.js` | Feature routers mount under `/api`; route naming is not fully uniform (for example `/api/product`, `/api/variants`, `/api/orders`, `/api/shipping-methods`). |
| Business logic | `controllers/*Controller.js`, `utils/` | Controllers call Prisma directly; integrations/helpers include email, invoice, OTP, courier, Meta CAPI, and super-admin notification utilities. No general service layer or shared validation layer was found. |
| Middleware | `middleware/authMiddleware.js`, `requireActiveTenant.js`, `errorMiddleware.js`, `rateLimit.js` | JWT authentication and active-tenant/rate-limit helpers exist, but authorization and tenant checks are largely implemented within individual controllers/routes. |
| Data access | `prisma/schema.prisma`, `models/index.js` | One Prisma client is exported by `models/index.js`; PostgreSQL is configured in the schema. |
| Migrations/scripts | `prisma/migrations/`, `scripts/` | Three checked-in SQL migrations and several one-off JS migration/fix scripts; no initial/baseline migration is present in the listed migration history. |
| Tests | `test-*.js`, `test-api.sh` | Ad hoc scripts exist; `package.json` has no test, lint, or frontend build script and no declared test framework. No automated test command is defined. |
| Project documentation | Root Markdown docs and `docs/MASTER_SPEC.md` | The progress/audit/API/migration/permission/workflow/test/final-report files are templates or initial task tracking, not a complete implementation spec or API catalog. |

## Existing modules and API surface

`server.js` mounts these API families (specific methods and subpaths are defined in the corresponding router files):

| API family | Existing capability indicated by routes/controllers |
|---|---|
| `/api/auth`, `/api/tenant`, `/api/onboarding`, `/api/settings`, `/api/users` | Registration/login/OTP/password flows, tenant/payment administration, onboarding status/completion, tenant settings, user management |
| `/api/dashboard`, `/api/notifications` | Tenant dashboard, super-admin activity/page visits, tenant notifications and read/delete operations |
| `/api/product`, `/api/variants`, `/api/inventory`, `/api/categories`, `/api/brands`, `/api/attribute-templates`, `/api/variant-images`, `/api/banners` | Product/catalog management, variants and bulk operations, stock adjustments/reports/logs, merchandising |
| `/api/orders`, `/api/returns`, `/api/customers`, `/api/addresses`, `/api/cart`, `/api/wishlist`, `/api/coupons` | Online order management/checkout, return/refund workflows, customers/addresses, carts, wishlists, promotions |
| `/api/payment`, `/api/suppliers`, `/api/expenses`, `/api/reviews`, `/api/blocking` | Existing payment approval/submission, supplier and expense CRUD, reviews, blocked phone/IP controls |
| `/api/shipping-methods`, `/api/couriers`, `/api/steadfast`, `/api/webhooks` | Shipping methods, courier configuration/integration and webhook handling |
| `/api/landing-page`, `/api/shop`, `/api/public`, `/api/incomplete-checkouts` | Store settings/content, public storefront/order/tracking/review APIs and incomplete checkout capture |
| `/api/marketing/meta` | Tenant Pixel/CAPI settings, public event tracking and test event endpoints |

The existing API documentation describes some Meta and super-admin notification/page-visit endpoints, but is otherwise an empty template. Treat router/controller code—not the document—as the current API source of truth. There is no existing business-profile, branch, branch-membership, purchasing, transfer, POS/register, restaurant, tailoring, delivery-assignment, or unified report API.

## Prisma schema inventory and relationships

The schema has 42 models and one enum (`InventoryReason`). Existing models, grouped by role:

- Identity and tenant: `User`, `Tenant`, `Otp`.
- Catalog and stock: `Product`, `Variant`, `Supplier`, `InventoryLog`, `Category`, `ProductCategory`, `Brand`, `AttributeTemplate`, `ProductImage`, `VariantImage`.
- Orders, customer, payment and delivery: `Customer`, `Address`, `Order`, `OrderItem`, `OrderStatusHistory`, `PaymentTransaction`, `ReturnRequest`, `Refund`, `ShippingMethod`, `Courier`, `WebhookLog`.
- Storefront/engagement: `LandingPage`, `PageVisit`, `Template`, `Banner`, `Review`, `Cart`, `CartItem`, `Wishlist`, `Coupon`, `CouponUsage`, `IncompleteCheckout`.
- Tenant operations/integrations: `Expense`, `Notification`, `SuperAdminNotification`, `BlockedPhone`, `BlockedIp`, `MetaPixelConfig`, `MetaTrackingEvent`.

Important existing relationships and gaps:

- `Tenant` owns most business records through a `tenantId` foreign key and cascade delete; `User.tenantId` is optional and `User.role` is a free-form string defaulting to `BUSINESS_ADMIN`.
- `Product` belongs to a tenant and has variants, categories, images; `Variant` belongs to a product, optionally a supplier, and is referenced by carts, wishlists, order items, variant images, and inventory logs. `Product.slug` and `Variant.sku` are globally unique rather than tenant-scoped.
- `Customer` is tenant-scoped and unique by `(tenantId, phone)`; addresses and orders reference customers. `Order` belongs to a tenant and optionally references customer/address/shipping method/coupon; it owns items, status history, payments, and return requests. `OrderItem` snapshots SKU/attributes/price and quantity but has no branch or source.
- `InventoryLog` relates to a variant and optionally an order. It has a signed `quantity` and the limited enum `SALE`, `RETURN`, `PURCHASE`, `ADJUSTMENT`, `DAMAGE`; it has no tenant/branch field, previous/new balance, actor, idempotency key, or direct link to receiving/transfers.
- `ReturnRequest` belongs to an order and optionally one order item; `Refund` is one-to-one with a return request. Neither is directly branch-scoped. PaymentTransaction belongs to tenant and order.
- `Supplier` is tenant-scoped and referenced by variants; it does not yet model purchase orders, received quantities, supplier balances, or supplier payments. `Expense` is tenant-scoped and unbranched.
- `Courier` and `ShippingMethod` are tenant-scoped. Orders retain courier/tracking status fields and a shipping method; webhook logs are tenant-scoped, but no universal delivery assignment model exists.
- There are no `BusinessType`, business profile/config, `Branch`, `BranchMembership`, branch inventory, purchase, transfer, register, restaurant, tailoring, or package-entitlement models.

For complete field definitions and relation declarations, see [`prisma/schema.prisma`](./prisma/schema.prisma).

## Authentication, tenant isolation, RBAC, and validation conventions

### Existing conventions to preserve

1. Routers are CommonJS modules under `routes/`, controllers under `controllers/`, middleware under `middleware/`; `server.js` mounts each router under `/api/...`.
2. Controllers obtain the Prisma singleton using `const prisma = require("../models")` (relative path varies by folder) and export named handlers. Router modules import those handlers and apply middleware.
3. Protected routes use `protect` from `middleware/authMiddleware.js`. It reads `Authorization: Bearer <JWT>`, verifies with `JWT_SECRET`, and assigns decoded claims to `req.user`.
4. Tenant-owned reads/writes should derive tenant identity from `req.user.tenantId`, not a request body/query tenant ID. Existing handlers commonly scope `where` by `tenantId`; related records without a direct tenant column are sometimes scoped by traversing their parent relation.
5. Existing JSON success responses use `{ success: true, data: ... }`, optionally with `message`; failures use `{ success: false, message: "..." }`. Lists vary between a bare array under `data` and objects containing rows plus `total`, `page`, and `limit`. Preserve the envelope unless a coordinated API contract explicitly changes it.
6. Expected naming follows existing JavaScript/CommonJS conventions: `*Controller.js`, `*Routes.js`, camelCase handlers, Prisma model names in PascalCase and generated Prisma delegates in lower camelCase. SQL migrations live in timestamped directories below `prisma/migrations/`.
7. `requireActiveTenant` is applied to selected banner and landing-page routes; it is not globally applied. Public endpoints resolve store/tenant from public identifiers and are intentionally not JWT-protected.

### Authorization and validation gaps

- `protect` verifies a token but does not reload the user, check `isActive`, or load current tenant membership/permissions on each request.
- Built-in RBAC is effectively role-name checks: `isSuperAdmin` exists, and several controllers repeat checks for `SUPER_ADMIN`. Product/variant/customer/user/attribute-template controllers contain local super-admin handling. There is no permission-key registry, role preset matrix, branch membership/authorization, or reusable per-action permission middleware.
- `requireActiveTenant` checks `req.user.tenantId` and tenant status, but is used only on selected routers. Apply access policy deliberately when adding new routes; do not assume `protect` alone enforces active status or any business permission.
- No shared schema validator (Zod/Joi/express-validator) or validation middleware was found. Validation is ad hoc in controllers, with varied parsing and defaults. New endpoints need explicit server-side validation in the established controller/router location until a shared approach is intentionally introduced.
- The global error middleware logs the error and returns `{ success:false, message }` using `err.status || 500`; it can expose raw error messages. Some controllers catch and return their own 500 response instead of forwarding to `next(error)`.
- Prisma relations generally do not enforce same-tenant ownership across both sides of a relation (for example, ProductCategory joins by IDs only). New code must validate ownership for every referenced child/parent and branch, not merely trust foreign keys or client-supplied IDs.

## Existing transactions and inventory/checkout behavior

- Checkout paths are not identical. Public checkout (`controllers/publicController.js`) loads cart/variant stock and rejects insufficient stock, computes prices from the DB, and in a Prisma callback transaction creates the order/items and clears the cart. That transaction does not decrement stock. Coupon usage/customer tracking is performed after it in separate writes.
- Staff order confirmation (`controllers/orderController.js`) checks `Variant.stock`, then batches stock decrements, `InventoryLog` SALE rows, order status and history in a Prisma transaction. The stock checks occur before the transaction, so concurrent confirmations can race. Cancellation from CONFIRMED similarly restocks and writes RETURN logs in a transaction. Bulk confirmation has a transaction per order; bulk cancellation does not restore stock.
- Admin/manual creation and updates are handled separately in the order controller. Existing code paths and status transitions must be mapped before changing stock timing; do not assume all order creation deducts stock.
- `controllers/variantController.js` initializes/edits legacy stock and offers manual adjustment, updating `Variant.stock` with a corresponding log in a transaction. The adjustment reads the stock before starting the transaction.
- `controllers/returnController.js` restocks variants and writes inventory logs when approving eligible returns, but its stock/log operation and return status update are not one encompassing transaction. Refund creation, return update, and customer balance updates are also separate operations.
- `controllers/webhookController.js` has a payment/courier webhook path that can increment stock and write an inventory log; it needs to be included in any centralized stock migration.
- `controllers/publicController.js` reads stock for public catalog/checkout. `controllers/dashboardController.js`, `controllers/inventoryController.js`, landing-page product creation, product/variant controllers, and public product responses also read or set `Variant.stock`.
- No single inventory service or idempotency-key mechanism currently owns stock mutations. Existing stock is a floating-point `Variant.stock`; `InventoryLog` is an append-style record in practice but the schema does not enforce immutability.

Before any branch-stock rollout, inventory every read and write above, define when each order source reserves/deducts/releases stock, and migrate/backfill with an idempotent reconciliation plan. Keep existing storefront behavior and avoid double-decrementing when introducing a shared movement service.

## Package, realtime, notification, and integration infrastructure

- `Tenant.package` defaults to `"FREE"`, and `Tenant.featureFlags` is a Prisma `Json` field. `Tenant.productFeatures` is another JSON field. Registration initializes `featureFlags` as a string (`"{}"`), while onboarding/shop/tenant handlers attempt JSON parsing; inspect and normalize these call sites before using them as an entitlement contract.
- No centralized package entitlement map, middleware, or consistent frontend/backend feature gate was found. Existing package/feature fields must be preserved and migrated/backfilled compatibly.
- `Notification` is tenant-scoped; `/api/notifications` supports listing (up to 50), unread count, create, read, mark-all-read and delete. `SuperAdminNotification` supports super-admin events. README documents polling for super-admin badges.
- No Socket.IO, WebSocket, server-sent events, or event bus infrastructure was found. Reuse polling/notification models unless a phase explicitly adds and justifies realtime delivery.
- Email, courier/Steadfast webhooks, and Meta Conversions API are existing external integrations; preserve their current API behavior and failure handling when adding domain events.

## Missing and partial modules

| Capability | State | Notes |
|---|---|---|
| Next.js dashboard/UI | Missing from this repository | No layout/sidebar, auth context, API client, reusable UI library, or frontend tests to extend. Frontend phases require locating/providing the frontend repository before implementation. |
| Business type/profile/settings | Missing/partial | Tenant has generic settings and onboarding; no business type, enabled modules, business-specific profile/config API, or type-driven navigation. |
| Branches and branch membership | Missing | No schema, API, middleware, branch context, branch defaults, or UI. |
| Inventory | Partial/legacy | Single `Variant.stock` with `InventoryLog`, reports and manual adjustment; not branch-aware, ledger-complete, centrally enforced, or race/idempotency safe. |
| RBAC | Partial | Super-admin and tenant role-string checks exist; granular role permissions and branch authorization do not. |
| Purchasing/transfers | Partial foundation only | Supplier model exists, but purchase orders/receiving/payables and stock transfers do not. |
| POS/register/cash drawer | Missing | No POS sale flow, register session, cash movement, close/reconciliation, or POS UI. |
| Restaurant | Missing | No menu/modifier/recipe/table/KOT/KDS/workflow models or APIs. |
| Tailoring | Missing | No measurements, quotations, multi-item tailoring order details, production, fitting/QC, worker payments, or privacy-aware storefront. |
| Unified delivery/order extensions | Partial | Existing ecommerce order status/history, courier and tracking integrations exist; source/branch/type/assignment/unified delivery and complete idempotent webhook workflow do not. |
| Reports | Partial | Dashboard/inventory views exist; requested branch/business-specific and reconciled financial reports do not. |
| Entitlements | Partial/informal | Existing package and JSON feature fields are not a centralized enforceable entitlement system. |
| Tests/documentation | Partial | Standalone scripts and thin existing docs; no maintained automated suite or complete API/migration/workflow reference. |

## Required API and database additions by phase

The following is the concrete scope stated by the available task prompts, not a substitute for the missing numbered spec details.

| Phase/task | Required additions |
|---|---|
| P1A — business foundation | BusinessType/profile/settings APIs; branch list/detail/create/update/activation/default and branch-member APIs; Tenant/profile fields, Branch, BranchMembership and default-branch backfill. |
| P1B — permissions/UI | Permission keys and role presets; onboarding and branch UI/selector; API branch context and server-side authorization; business-type-enabled navigation. |
| P2A/B — inventory | BranchInventory, InventoryMovement, InventoryAdjustment and negative-stock setting; opening-stock conversion/reconciliation; one transactional inventory movement service; branch-scoped adjustments/transfers/alerts/reports APIs and UI. |
| P3A/B — purchasing/transfers | Purchase order CRUD and receiving, supplier payments/balances, and transactional transfer APIs with branch authorization and idempotency. |
| P4A/B — POS/register/returns | Shared server-priced POS sale flow, retail POS, register sessions/cash operations/close, and integrated returns/refunds and inventory/payment handling. |
| P5A-C — restaurant | Menu/modifiers/combos, ingredients/recipes/costing/waste, tables/KOT/KDS and restaurant order/POS APIs and UI. |
| P6A-F — tailoring | Garment/measurement/design/fabric/quotation/order, cutting/workers/tasks/payments, fitting/alteration/QC/appointments/delivery, documents/notifications/dashboard/reports; prompts give `/api/tailoring/...` route families. |
| P7 — unified order/delivery | Extend Order with source/branch/type/creator and validated history; delivery queue/assignments/status; idempotent courier callbacks and cross-source return/cancellation. |
| P8A/B — public storefront | Extend existing storefront for retail/restaurant and add tailoring storefront/booking/quotation requests; server-side price/availability and privacy-safe responses. |
| P9A/B — reports/entitlements | Tenant/branch/date-filtered financial/domain reports and metric definitions; backend entitlement enforcement plus frontend visibility/upgrade states while preserving data/access for existing tenants. |
| P10A/B — final QA/docs | Migration and existing-flow regression/security verification, complete automated E2E coverage, and final documentation/report. |

## Migration and compatibility risks

1. **Schema drift/baseline:** only three checked-in migrations were found and no initial baseline migration. Confirm the deployed schema and `_prisma_migrations` history before relying on `migrate deploy`; do not reset or recreate existing production data to establish a baseline.
2. **Legacy stock is the live source:** every existing Variant has a scalar stock value, while logs do not necessarily represent its full history. A backfill must use a stable default branch, create opening movements exactly once, reconcile every variant and tenant total, and retain legacy behavior during rollout.
3. **Concurrent writes:** preflight stock reads outside transactions can oversell. A movement implementation must use an atomic/locked update and idempotency key; migration and application rollout order must not allow the old and new paths to both mutate stock.
4. **Legacy tenant defaults:** existing tenants lack business type/branch. Select backward-compatible defaults, create one default branch per tenant idempotently, and decide how ownership/membership is granted without blocking current users.
5. **Float-based money and quantities:** many monetary fields and stock are `Float`; do not introduce inaccurate conversion or change numeric semantics without rounding rules, data analysis, and endpoint compatibility tests.
6. **Unique key scope:** Product slug and Variant SKU are globally unique today; changing them to tenant-composite uniqueness requires collision discovery and API compatibility planning.
7. **JSON settings:** feature flags/preferences/configuration are loosely typed JSON, with some handlers treating JSON values as serialized strings. Normalize deliberately and retain a compatibility path for existing values.
8. **Relations without tenant-composite constraints:** any new backfill or write involving products, variants, orders, customers, suppliers, coupons, addresses, or branches must validate same-tenant ownership in application logic.
9. **External integrations:** order status, payment transaction, courier callbacks, return/refund, customer aggregates, notifications, and Meta events have side effects. Keep them idempotent and avoid coupling external delivery success to committed sales.
10. **Frontend source missing:** do not report UI tasks complete or build frontend here until the actual frontend workspace is available and its conventions are audited.

## Behaviors and contracts to preserve

- Existing JWT/bearer authentication, user roles, tenant onboarding/payment approval, active-store checks, and existing tenant settings.
- Public storefront and online cart/checkout behavior, server-side product/variant pricing, coupon handling, order numbering/status history, and existing order response fields.
- Existing `Variant.stock` consumers and all inventory log reasons until a tested compatibility/migration plan replaces them.
- Product/variant bulk upload/generation and CSV workflows; supplier/category/brand/image relations.
- Existing payments, refunds/returns, shipping methods, courier and Steadfast integrations/webhooks, reviews, notifications, landing pages, email/invoice behavior, and Meta consent/tracking rules.
- Existing `{success, data, message}` API envelope and the current `/api` route contracts unless an intentional versioned/coordinated change is documented.
- Tenant boundaries: derive tenant context on protected requests from authenticated claims and validate ownership of every referenced object; public tenant resolution must use existing public identifiers and return only public-safe data.

## Roadmap mapped to the available phase prompts

| Phase | Tasks from `IMPLEMENTATION_PROGRESS.md` | Audit outcome / implementation dependency |
|---|---|---|
| 0 — Audit | P0 | Repository and conventions documented here; record unavailable numbered spec sections as an open dependency. |
| 1 — Business foundation | P1A backend/DB; P1B frontend/permissions | P1A can extend the current Express/Prisma backend. P1B is blocked on locating the frontend source; backend must provide branch authorization before selector/API context is relied upon. |
| 2 — Inventory | P2A ledger/migration; P2B operations/UI/reports | Must trace and route every existing stock read/write through a single compatible movement path; P2B UI needs the frontend repository. |
| 3 — Purchase & transfer | P3A purchase/receiving/payments; P3B transfers | Build on the supplier model and P2 movement service; receiving and transfer mutations must be transactional and idempotent. |
| 4 — Universal POS | P4A POS engine/retail; P4B register/cash drawer/returns | Reuse existing Product/Variant/Order/Customer/Payment/Inventory; coordinate order source and inventory timing with online checkout. |
| 5 — Restaurant | P5A menu/modifiers/combos; P5B ingredients/recipes/costing/waste; P5C tables/KOT/KDS/POS | New domain models and APIs; consumption must use P2 inventory service. |
| 6 — Tailoring | P6A measurements/designs; P6B fabric/accessories; P6C quotations/orders; P6D cutting/workers/tasks; P6E fitting/alteration/QC/appointments/delivery; P6F documents/notifications/reports/E2E | New domain models and workflows; preserve immutable order-time measurement snapshots and privacy restrictions stated in the prompts. |
| 7 — Unified order & delivery | P7 | Extend existing orders/status/courier behavior rather than duplicate ecommerce orders; add source/branch-aware, idempotent delivery workflows. |
| 8 — Public storefront | P8A retail/restaurant; P8B tailoring | Extend existing public controllers/storefront; retain server-side pricing, tenant isolation, and privacy-safe tailoring responses. |
| 9 — Reports & entitlements | P9A reports; P9B package entitlements | Reconcile existing order/payment/refund/expense data first; preserve existing tenant entitlements and all data on downgrade. |
| 10 — Final QA | P10A regression/security; P10B final docs/report | Add repeatable migration/regression coverage and complete docs; execute the project-defined acceptance checks once a frontend workspace/test harness is available. |

## Progress and next step

P0 audit is documented; no feature code or database changes were made. See [`IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md) for phase status. The next planned task is P1A (backend business profile, business type, default branches, memberships, migrations, APIs and tests). Resolve the missing numbered MASTER_SPEC sections and identify the frontend repository before depending on their detailed requirements.

## P1-P3 Definition-of-Done re-audit (2026-11-11)

The frontend is in the sibling `frontend/` repository; the backend-only P0 audit statement that a frontend is absent is a repository-scope observation, not a statement about the whole workspace. The numbered MASTER_SPEC sections referenced in the phase prompts are not present in either `MASTER_SPEC.md` copy; `docs/MASTER_SPEC.md` contains the phase prompts but not the detailed 3.1/18.3/18.5 acceptance definitions. Phase statuses below are therefore based on the prompts and `.clinerules`, with that missing specification recorded as an open dependency.

| Feature | DB model | Migration / existing DB | Backend logic / API | Frontend wired to real API | Permissions | Tests run / gap | Acceptance |
|---|---|---|---|---|---|---|---|
| P1A business profile and branches | `BusinessType`, tenant settings, `Branch`, `BranchMembership` exist | Idempotent business-foundation migration and backfill exist; live DB table presence checked read-only; `prisma migrate status` reports 6 migrations up to date | Profile/settings, branch and member routes/services/controllers and `requireBranchAccess` exist | Not required by P1A (backend-only) | Tenant-admin and branch membership checks present | Business foundation unit tests are in the full backend suite; no live migration rerun in this task | **IN_PROGRESS** — exact section 3.1 field-level requirements are unavailable, so model/API completeness cannot be certified |
| P1B permissions, onboarding, selector | Reuses P1A models | No schema migration expected | Onboarding and branch APIs are called by frontend | Branch management, onboarding, selector/context and module-aware sidebar are present | Backend remains authoritative; however `PERMISSION_MATRIX.md` does not enumerate the complete permission catalog/presets from missing section 18.3 | Frontend TypeScript and production build pass; no frontend component/flow test harness was found | **IN_PROGRESS** — permission presets/spec reconciliation and supported flow tests remain |
| P2A branch inventory and ledger | `BranchInventory`, `InventoryMovement`, `InventoryAdjustment`, negative-stock setting and `Order.branchId` exist | Idempotent branch inventory/opening-stock migration exists and is applied according to migration history; live tables checked read-only | Existing movement service now upserts and obtains `FOR UPDATE` lock before balance update; old order/variant paths call it | Backend-only P2A scope; P2B supplies inventory screens | Tenant/branch and `inventory.adjust` checks exist | Unit tests cover movement rules and simulated concurrent legacy flow; no real PostgreSQL concurrency or checkout/cancel API regression was run | **IN_PROGRESS** — database-backed concurrency/reconciliation and real legacy-flow regression remain |
| P2B inventory operations and reports | Reuses P2A models | No additional migration expected | Balance, movement, adjustment, alert, and report APIs exist | Inventory screens exist and use API client/branch context | Branch access and adjustment permission checks exist | Full frontend build and backend unit suite run; no component/E2E API-flow test harness exists | **IN_PROGRESS** — dependent P2A acceptance and end-to-end branch isolation remain |
| P3A purchase/receiving/payments | Purchase/receipt/payment models exist in Prisma and live DB tables | **No checked-in P3A SQL migration.** Historical `db push` is not a reproducible migration; live table-name presence was verified but columns/constraints were not fully reconciled | CRUD, receiving, payments, and ledger routes exist. During this audit writes were wrapped in Prisma transactions; purchase rows and stock balances use row locks; resource branch scope and PO overpayment guard were added | List/create/detail/payments/ledger exist. Missing `/edit` and list `/receive` routes are fixed; list receive now opens the real detail receive modal | Route checks exist and branch-scoped PO actions now constrain the actual resource. Supplier payments are not branch-attributed; permission matrix also omits purchase keys | Mocked API/service tests exist; new receiving/permission/isolation/overpay cases added. No live HTTP/API integration or duplicate-retry test yet | **IN_PROGRESS** — migration, receipt idempotency, supplier-payment branch scope, and integration tests remain |
| P3B transfers | No `InventoryTransfer` or `InventoryTransferItem` model found | No migration; no live transfer table found | No transfer service/routes/actions found | No transfer UI | No transfer permission implementation found | No transfer tests | **BLOCKED** on P3A/P2A acceptance; implementation has not started |

### Fixes made during this audit

- Added the draft purchase edit route and wired it to `PATCH /api/purchases/:id`.
- Changed the purchases-list Receive action from the nonexistent `/receive` page to the existing purchase detail page with the receive dialog opened.
- Stopped treating HTTP 403 authorization failures as expired sessions in the shared frontend API client.
- Made purchase read/update/state-change handlers constrain the purchase order to the authorized branch; passed the authorized branch into create/list operations.
- Wrapped purchase create/update/submit/cancel/receive/payment writes in Prisma transactions. Added purchase-row locks for state changes and a branch-inventory row lock for stock movement.
- Fixed the non-admin receiving permission path and added a server-side purchase-order overpayment check.
- Repaired stale test fixtures that no longer matched the current inventory service and supplier ownership checks.

### Search and verification record

- Scoped search of the P1-P3 implementation files found no `TODO`, `FIXME`, mock app data, or empty event handlers. One unrelated pre-existing webhook TODO remains at `controllers/webhookController.js:194`; ordinary `placeholder` attributes are form hints, not fake data. Pagination defaults and currency/date formatting literals remain and should be configuration/spec reviewed.
- Backend `npm test`: **30 passed, 0 failed** on the final run. Tests are unit tests with mocked Prisma; this is not a substitute for live API/database acceptance.
- Frontend `npx tsc --noEmit`: passed.
- Frontend `npm run build`: passed; output includes `/dashboard/purchases/[id]/edit`.
- Frontend targeted ESLint: passed after fixing the reported purchase-page errors.
- Backend `npx prisma validate`: passed. `npx prisma generate` failed twice with Windows `EPERM` unlinking `node_modules/.prisma/client/query_engine-windows.dll.node` while the backend dev process was running; no process was stopped.
- Backend `npx prisma migrate status`: **6 migrations found; database reports schema up to date**. `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`: **No difference detected**. A separate read-only information_schema query confirmed the Branch, branch inventory/ledger, purchase and supplier-payment tables exist. No migration was applied and no user data was changed.
- Static inspection after the successful frontend build found a 31 KB obfuscated final line in both repositories' `init` scripts; `npm run build` executes `node init`. Do not rerun these wrappers until the scripts are reviewed. The build did finish and listed the new edit route, but the wrapper content is an independent security concern and was not changed.

Phase acceptance is **not complete**: P1A/P1B are IN_PROGRESS pending spec reconciliation and permission acceptance; P2A/P2B are IN_PROGRESS pending database-backed acceptance; P3A is IN_PROGRESS and P3B is BLOCKED. See `IMPLEMENTATION_PROGRESS.md` for exact next steps.
