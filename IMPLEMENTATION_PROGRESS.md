# Implementation Progress

> `docs/MASTER_SPEC.md` is the canonical specification and now contains the numbered acceptance sections requested for 3.1, 5, 6, 18.3, 18.5, and 20. Phase 1 remains IN_PROGRESS until the full Definition of Done is verified.

## Phase 0 â€” Audit

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P0 â€” Repository audit | COMPLETED | No changes | No changes | Audit only | Existing API families inventoried; no new endpoints | Frontend absent from repository | Existing bearer JWT, tenant scoping and role-check conventions recorded; gaps documented | Documentation-only; no automated tests run | Resolve missing numbered MASTER_SPEC sections and locate frontend workspace before implementing frontend phases |

## Phase 1 â€” Business Foundation

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P1A â€” Business type, config, branches (backend + DB) | IN_PROGRESS | BusinessType, Tenant business profile/settings fields, Branch, BranchMembership | Idempotent migration and rerunnable backfill; migration history and live schema checked | Express controllers, routes, auth registration default-branch hook, branch/permission middleware | Business profile/settings, branch CRUD/status/default, branch membership CRUD | Not in scope (backend-only task) | Tenant-admin role checks and branch membership/permission middleware | 8 business foundation tests pass in the 30-test suite | Verify field-by-field P1A acceptance against section 3.1 now documented; P1A has not been revalidated or accepted by this task |
| P1B â€” Permissions, onboarding, branch selector (frontend) | IN_PROGRESS | Reuses P1A profile, settings, branch and membership models | No DB changes | Shared branch permission catalog/evaluator; branch member controller and authorization middleware; existing P1A APIs | `GET /api/branches/permissions`; branch membership create/update/list return effective grants | Branch member UI assigns role presets and edits custom grants using the API catalog | Catalog and `BRANCH_MANAGER`, `SUPERVISOR`, `CASHIER`, `INVENTORY_CLERK`, `ACCOUNTANT`, `STAFF`, `CUSTOM` presets implemented; explicit false overrides supported; tenant-admin RBAC retained | Backend `tests/*.test.js`: 32/32 pass; frontend `npx tsc --noEmit`: pass. Broad `node --test` also discovered legacy root `test-tenant.js`, which fails with Node `ERR_AMBIGUOUS_MODULE_SYNTAX` | P1B remains IN_PROGRESS: wire action-level checks to remaining branch-scoped legacy routes; verify onboarding/branch-selector flows with supported automated tests; full acceptance not established |

## Phase 2 â€” Inventory

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P2A â€” Branch inventory + ledger + migration | IN_PROGRESS | BranchInventory, InventoryMovement, InventoryAdjustment, Tenant.allowNegativeStock, Order.branchId | Idempotent branch inventory migration is applied; database has core tables | Central movement service now upserts and row-locks balances; legacy order/return and variant paths call it | Existing order and variant APIs wired to the movement service | No P2A UI by task scope | Branch and tenant validation; `inventory.adjust`; tenant-admin bypass | Mocked service tests cover stock rules and simulated concurrency; full suite now passes after fixture repairs | Still needs real PostgreSQL concurrency/reconciliation tests and an integration regression of the existing checkout/cancel flow |
| P2B â€” Stock operations, alerts, UI, reports | IN_PROGRESS | Reuses P2A models | No additional migration | Inventory balances/movements/adjustments/low-stock/report controllers and routes | `/api/inventory/{balances,movements,adjustments,alerts/low-stock}`, `/api/reports/inventory` | Branch balances, movement filters, adjustment/count/damage/expiry/loss, reversals, low-stock and policy controls | Branch access for reads; `inventory.adjust` for changes | Backend unit suite and frontend production build pass; no frontend integration/component tests | Complete branch-level API/UI acceptance tests after P2A PostgreSQL concurrency and checkout regression validation |

## Phase 3 â€” Purchase & Transfer

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P3A â€” Purchase orders, receiving, supplier payments | IN_PROGRESS | PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, PurchaseReceiptItem, SupplierPayment, PurchaseOrderStatus exist in Prisma and live DB | No checked-in P3A SQL migration; DB tables were created outside migration history via `db push` | Services/controllers/routes; write handlers now use transactions, order/balance row locks, branch-scoped access, and overpayment guard | `/api/purchases` CRUD/submit/cancel/receive, payments, supplier ledger | Purchase list/create/detail/edit/receive, payments, supplier ledger; missing edit page and incorrect receive link fixed | Route permissions exist; PERMISSION_MATRIX.md does not document these purchase keys; resource branch scope enforced in controllers/services | Backend unit suite: 30/30 pass; no live API/E2E tests | Add safe idempotent migration and receive idempotency key, scope supplier payments to branch, verify receipt/payment behavior with integration tests |
| P3B â€” Stock transfers | BLOCKED | No transfer models found | No migration | No transfer service/controllers | No transfer endpoints | No transfer UI | No transfer permissions | No transfer tests | Blocked until P2A and P3A acceptance; all transfer work remains |

## Phase 4 â€” Universal POS

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P4A â€” POS engine + Retail POS | NOT_STARTED | - | - | - | - | - | - | - | - |
| P4B â€” Register, cash drawer, returns | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 5 â€” Restaurant

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P5A â€” Menu, modifiers, combos | NOT_STARTED | - | - | - | - | - | - | - | - |
| P5B â€” Ingredients, recipes, costing, waste | NOT_STARTED | - | - | - | - | - | - | - | - |
| P5C â€” Tables, KOT/KDS, restaurant orders, POS | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 6 â€” Tailoring

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P6A â€” Garment categories, measurement templates, measurements, customer, designs | NOT_STARTED | - | - | - | - | - | - | - | - |
| P6B â€” Fabric, accessories, customer-owned fabric | NOT_STARTED | - | - | - | - | - | - | - | - |
| P6C â€” Quotations, tailoring orders, workflow, pricing | NOT_STARTED | - | - | - | - | - | - | - | - |
| P6D â€” Cutting, workers, tasks, piece-rate | NOT_STARTED | - | - | - | - | - | - | - | - |
| P6E â€” Fitting, alteration, QC, appointments, delivery | NOT_STARTED | - | - | - | - | - | - | - | - |
| P6F â€” Documents, notifications, dashboard, reports, full E2E | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 7 â€” Unified Order & Delivery

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P7 â€” Order sources, status history, delivery | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 8 â€” Public Storefront

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P8A â€” Storefront core, retail, restaurant | NOT_STARTED | - | - | - | - | - | - | - | - |
| P8B â€” Tailoring storefront | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 9 â€” Reports & Entitlements

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|2|
| P9A â€” Reports | NOT_STARTED | - | - | - | - | - | - | - | - |
| P9B â€” Package entitlements | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 10 â€” Final QA

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P10A â€” Regression and security | NOT_STARTED | - | - | - | - | - | - | - | - |
| P10B â€” Final documentation and report | NOT_STARTED | - | - | - | - | - | - | - | - |

## Last completed task

P1B granular permission implementation and specification reconciliation: canonical numbered sections and permission catalog/presets added; branch APIs/UI now use effective preset permissions and custom overrides. P1B as a whole remains IN_PROGRESS; Phase 1, Phase 2, and Phase 3 are not accepted as complete.

## Exact next step

Close the remaining P1B onboarding/branch-selector acceptance gaps with supported flow tests; keep P1B IN_PROGRESS until the full Definition of Done is verified. Separately repair the root `test-tenant.js` Node module-format failure before relying on broad `node --test` discovery. Continue with P2A PostgreSQL concurrency and legacy checkout regressions, P3A migration/idempotency/payment branch scope, and only then unblock P3B.