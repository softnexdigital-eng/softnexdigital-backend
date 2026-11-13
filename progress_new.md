# Implementation Progress

> The phase/task sequence below follows the available prompts in `MASTER_SPEC.md`. The root and `docs/MASTER_SPEC.md` currently do not contain the requested numbered sections (including section 22's phase table); see `IMPLEMENTATION_AUDIT.md` for scope and requirements gaps.

## Phase 0 â€” Audit

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P0 â€” Repository audit | COMPLETED | No changes | No changes | Audit only | Existing API families inventoried; no new endpoints | Frontend absent from repository | Existing bearer JWT, tenant scoping and role-check conventions recorded; gaps documented | Documentation-only; no automated tests run | Resolve missing numbered MASTER_SPEC sections and locate frontend workspace before implementing frontend phases |

## Phase 1 â€” Business Foundation

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P1A â€” Business type, config, branches (backend + DB) | COMPLETED | BusinessType, Tenant business profile/settings fields, Branch, BranchMembership | Idempotent migration and rerunnable backfill script; migration applied and verified on the existing database without deleting tenant data | Express controllers, routes, auth registration default-branch hook, branch/permission middleware | Business profile/settings, branch CRUD/status/default, branch membership CRUD | Not in scope (backend only) | Tenant-admin role checks and branch membership/permission middleware | 7 controller/middleware/backfill tests pass; Prisma Client was regenerated and verified against auth and Branch delegates | Detailed numbered MASTER_SPEC sections were absent; assumptions and unresolved specification gaps are documented in the audit |
| P1B â€” Permissions, onboarding, branch selector (frontend) | COMPLETED | Reuses P1A profile, settings, branch and membership models | No DB changes | P1A APIs and backend branch authorization; existing permission checks retained | Uses business profile/settings, onboarding completion, branch/member APIs | Onboarding, branch management, branch selector/context, shared API branch header, sidebar module filtering | Existing branch membership permissions and module settings; backend is authoritative | Frontend TypeScript check passed; P1A/API tests passed | No frontend component/E2E test suite was available; detailed numbered MASTER_SPEC sections were absent |

## Phase 2 â€” Inventory

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P2A â€” Branch inventory + ledger + migration | IN_PROGRESS | BranchInventory, InventoryMovement, InventoryAdjustment, Tenant.allowNegativeStock, Order.branchId | Additive, idempotent migration and opening-stock/order backfill added; intentionally not deployed | Transaction-scoped movement service; order confirmation/cancellation, returns, courier cancellation, variant opening/manual/CSV stock, public and landing-page branch association; read-only reconciler | Existing order and variant APIs wired to the movement service | No P2A UI | Branch and tenant validation; `inventory.adjust` membership permission; tenant-admin bypass | Service tests cover synchronization, idempotency, negative stock, tenant isolation, concurrent simulated sales, legacy orders, and locked stock-count deltas; syntax and Prisma schema validation passed | Regenerate P2A Prisma Client after the Windows engine lock is released; test the migration on a disposable PostgreSQL snapshot; run regression and reconciliation before deployment |
| P2B â€” Stock operations, alerts, UI, reports | IN_PROGRESS | Reuses P2A BranchInventory, InventoryMovement, InventoryAdjustment | No additional schema changes; depends on the unapplied P2A migration | Inventory balances/movements/adjustments/low-stock/report controller and routes | `/api/inventory/{balances,movements,adjustments,alerts/low-stock}`, `/api/reports/inventory` | Branch inventory balances, movement filters, adjustment/count/damage/expiry/loss form, reversals, low-stock filter, threshold and negative-stock policy controls | Branch access for reads; `inventory.adjust` for adjustments and threshold changes; tenant scope from auth context | Backend suite: 17/17 passed; Prisma validate, frontend TypeScript and targeted ESLint passed | Apply and verify P2A migration only on a disposable PostgreSQL database; run an end-to-end flow with the generated P2A client; frontend production build remains pending because the dev server is active |

## Phase 3 â€” Purchase & Transfer

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P3A â€” Purchase orders, receiving, supplier payments | NOT_STARTED | - | - | - | - | - | - | - | - |
| P3B â€” Stock transfers | NOT_STARTED | - | - | - | - | - | - | - | - |

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
|---|---|---|---|---|---|---|---|---|---|
| P9A â€” Reports | NOT_STARTED | - | - | - | - | - | - | - | - |
| P9B â€” Package entitlements | NOT_STARTED | - | - | - | - | - | - | - | - |

## Phase 10 â€” Final QA

| Task | Status | DB models | Migration | Backend files | API endpoints | Frontend files | Permissions | Tests | Remaining work |
|---|---|---|---|---|---|---|---|---|---|
| P10A â€” Regression and security | NOT_STARTED | - | - | - | - | - | - | - | - |
| P10B â€” Final documentation and report | NOT_STARTED | - | - | - | - | - | - | - | - |

## Last completed task

P1B â€” Business foundation onboarding, branch management/selection, and module-aware sidebar are implemented and type-checked.

## Exact next step

Finish P2A/P2B verification: stop the active backend server to release the Windows query-engine DLL, regenerate the repository Prisma Client, validate/apply the additive inventory migration only on a disposable PostgreSQL database, then exercise the inventory endpoints and reconciliation end-to-end. P3+ roadmap phases have not started. Do not deploy the inventory migration to the connected database without a backup and explicit deployment confirmation.
