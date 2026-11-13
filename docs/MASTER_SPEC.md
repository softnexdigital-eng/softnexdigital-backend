SETUP (একবারই)
S1 — .clinerules তৈরি
Create a file `.clinerules` in the project root with the permanent working rules below. Also create `docs/` folder if missing. Do NOT write any application code in this task.

Content of .clinerules:

# PROJECT RULES (read at the start of every task)
- This is an EXISTING multi-tenant SaaS (Next.js App Router, Express, Prisma, PostgreSQL). It is NOT greenfield. Never rewrite the app; extend it. Never break existing ecommerce, auth, payments, courier, return, refund, coupon, notification features.
- The full product spec is in `docs/MASTER_SPEC.md`. Each task tells you which sections to read. Read only those sections.
- Progress is tracked in `IMPLEMENTATION_PROGRESS.md`. At the START of every task read it. At the END update it. Statuses allowed: NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED. Never mark COMPLETED unless every item in the Definition of Done below is true.
- Definition of Done for any feature: Prisma model + safe idempotent migration + backend service/controller/route with real business logic + validation + auth + tenant isolation + branch authorization + role permission + frontend UI wired to the real API + loading/error/empty states + automated tests actually executed and passing.
- Forbidden: mock data in app code, static stats, empty handlers, TODO/FIXME/placeholders in finished features, fake success toasts, UI-only or model-only completion.
- Security: derive tenantId from authenticated server context only. Never trust client prices, totals, stock, tenantId, or payment status. Use DB transactions for POS sales, checkout, receiving, transfers, recipe consumption, fabric allocation, refunds, worker payment approval, register close. Use idempotency keys for duplicate-prone actions.
- Reuse existing components, services, API conventions, and models. Do not duplicate Product/Variant/Order/Customer/Payment/Inventory.
- Inventory ledger entries are never edited; corrections use reversal movements.
- Before major changes: run `git status`, preserve uncommitted work. After each task: run prisma validate, prisma generate, backend build, frontend build, relevant tests; fix errors. Never claim tests passed unless you ran them and saw the output.
- UI: touch targets >= 48px, responsive 1366x768 / 1920x1080 / tablet, keyboard + barcode friendly.
- Be honest: if something is unfinished, say so and keep it IN_PROGRESS or BLOCKED. Do not stop early because a task is large; split it, finish each part, and record exactly where you stopped in IMPLEMENTATION_PROGRESS.md.
- At the end of every task output: files changed, migrations added, endpoints added, tests run with real results, remaining work, exact next step.
S2 — Progress ফাইল ও docs ফোল্ডার
Read `.clinerules` and `docs/MASTER_SPEC.md` (skim headings only). Create these files with proper headings and empty tables, no application code:
- IMPLEMENTATION_PROGRESS.md (a table per Phase 0-10 from MASTER_SPEC section 22, each task row with: Status, DB models, Migration, Backend files, API endpoints, Frontend files, Permissions, Tests, Remaining work. All NOT_STARTED. Add a section 'Last completed task' and 'Exact next step'.)
- IMPLEMENTATION_AUDIT.md (empty template)
- DATABASE_MIGRATION_NOTES.md, API_DOCUMENTATION.md, PERMISSION_MATRIX.md, BUSINESS_WORKFLOW_DOCUMENTATION.md, TEST_REPORT.md, FINAL_IMPLEMENTATION_REPORT.md (title + empty sections)
Then run `git status` and commit with message 'chore: add implementation docs and rules'.
PHASE 0 — অডিট
P0 — Repository audit
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, and MASTER_SPEC sections 1, 2, 3, 19, 20, 22 (Phase 0).
Task: audit the existing repository thoroughly and write IMPLEMENTATION_AUDIT.md. Inspect: Next.js app structure, dashboard layout/sidebar, auth context, API client, reusable components (forms, tables, modals, toasts), Express structure, middleware, tenant isolation, RBAC, validation, error handling, Prisma schema (all models and relations, esp. Tenant, Product, Variant, Customer, Order, OrderItem, InventoryLog, Supplier, Expense, PaymentTransaction, ReturnRequest, Refund, Courier, ShippingMethod), existing transactions, response conventions, existing package/feature-flag system, existing realtime/notification infrastructure, existing Variant.stock usage points in checkout.
Document: existing modules, missing modules, partial modules, existing APIs, required new APIs, DB changes, migration risks, things that must be preserved, and a concrete roadmap mapped to the phases/prompts. Also record the exact conventions I must follow (file locations, naming, response shape, how permissions are checked) so later tasks do not re-explore.
Do not write feature code. Update IMPLEMENTATION_PROGRESS.md (Phase 0 COMPLETED) and commit.
PHASE 1 — Business Foundation
P1A — Business type, config, branches (backend + DB)
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_AUDIT.md`, MASTER_SPEC sections 3, 4, 17 (Business, Branches), 18.1-18.3.
Task: implement the backend and database for business foundation.
1. Prisma: BusinessType enum (SUPERMARKET, GROCERY, RETAIL, RESTAURANT, CAFE, CLOUD_KITCHEN, TAILORING, BOUTIQUE, GARMENT_WORKSHOP, UNIFORM_MANUFACTURER); extend Tenant (or a TenantBusinessProfile/Settings model, whichever matches existing architecture) with all fields in section 3.1 incl. enabledModules and business-specific config JSON; Branch; BranchMembership (user, branch, role, permissions); default branch flag; opening hours; manager.
2. Safe idempotent migration + backfill script: create a default branch per existing tenant and a default business type for existing tenants. Old data must still work.
3. APIs: /api/business-profile, /api/business-settings, /api/branches, /api/branches/:branchId, /api/branches/:branchId/members. Validation, pagination, tenant isolation, role permission, backend branch authorization middleware (reusable, e.g. requireBranchAccess).
4. Tests for CRUD, activate/deactivate, tenant isolation, branch isolation, and migration idempotency. Run them.
Only backend in this task. Update progress file; commit.
P1B — Permissions, onboarding, branch selector (frontend)
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 3, 4, 16, 18.3, 19.
Task: finish Phase 1 on the frontend and permissions.
1. Granular permission system: add the permission keys and role presets from 18.3 (extend the existing RBAC, do not replace it). Update PERMISSION_MATRIX.md.
2. Onboarding: business type selection and business profile form (section 3.1), working end-to-end with the P1A APIs.
3. Branch management UI: list, create, edit, activate/deactivate, details, members, default branch.
4. Branch selector in the dashboard header with an authorized 'All Branches' option; persist selection; pass branch context to API calls; backend must still enforce authorization.
5. Business-type-driven sidebar/navigation: show only modules enabled for the tenant's business type (modules not built yet may be hidden, not faked).
Tests: API + component/flow tests where the project supports them; build frontend and backend. Update progress; commit. Report Phase 1 acceptance status honestly.
PHASE 2 — Inventory
P2A — Branch inventory + ledger + migration
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 5, 18.5, 20.
Task: branch-wise inventory foundation.
1. Prisma: BranchInventory, InventoryMovement (all fields in 5.3, all movement types), InventoryAdjustment, plus negative-stock policy in tenant/inventory settings. Extend or wrap the existing InventoryLog rather than breaking it.
2. Migration + script: move existing Variant.stock into the default branch as OPENING_STOCK with ledger entries; verify totals match; idempotent; write a reconciliation check command and document rollback in DATABASE_MIGRATION_NOTES.md.
3. Central inventory service: one function to apply a movement inside a transaction (row lock / atomic update, prevents oversell, honors negative-stock policy, stores previous/new stock, idempotency key). Everything later (POS, purchase, transfer, restaurant, tailoring) must use it.
4. IMPORTANT: update the existing ecommerce checkout/order cancel/return flows to deduct/restore stock via this service for the correct branch, and keep Variant.stock consistent (or derived) so the storefront still works. Prove with a regression test of an old-style order.
Update progress; commit.
P2B — Stock operations, alerts, UI, reports
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 5.4, 16, 17 (Inventory, Reports).
Task: build on P2A.
1. APIs: /api/inventory/balances, /movements, /adjustments (adjustment, stock count, damage, expired, lost, with reversal for corrections), min stock and reorder level, low-stock alerts.
2. Frontend (reuse the existing Stock Adjustment and Movement Ledger pages/components; extend them with the branch selector instead of making duplicates): branch-wise balances, movement history with filters, adjustment form, stock count, low-stock list.
3. /api/reports/inventory: branch-wise stock report from real data with date and branch filters.
4. Tests incl. concurrency (two simultaneous sales of the last unit), negative-stock policy, tenant/branch isolation, reconciliation. Run all.
Update progress; commit. Report Phase 2 acceptance honestly.
PHASE 3 — Purchase & Transfer
P3A — Purchase orders, receiving, supplier payments
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 6.1-6.3, 18.5.
Task: purchasing.
Prisma: PurchaseOrder, PurchaseOrderItem, PurchaseReceipt(+items), SupplierPayment (extend existing Supplier/Expense where sensible). Statuses DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED.
APIs: /api/purchases, /:id, /:id/receive, /:id/payments. Partial receiving multiple times with ordered/received/remaining tracking; receiving updates branch inventory via the central inventory service in one transaction; idempotency key prevents duplicate receiving; supplier ledger and payment history; payment status from real paid/due calculation (server-side).
Frontend: purchase list/create/edit, receive dialog (partial), payments, supplier ledger, wired to APIs.
Tests: partial receive 60+40, duplicate receive request, overpay/over-receive validation, isolation. Run. Update progress; commit.
P3B — Stock transfers
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 6.4, 18.5.
Task: inter-branch stock transfer.
Prisma: InventoryTransfer, InventoryTransferItem with statuses (REQUESTED, APPROVED, DISPATCHED, PARTIALLY_RECEIVED, COMPLETED, REJECTED, CANCELLED). Flow: request -> approval -> dispatch (TRANSFER_OUT, in-transit tracked) -> partial/complete receive (TRANSFER_IN) with damage during transfer. Prevent duplicate dispatch/receive; all in transactions through the central inventory service; users may act only on branches they belong to.
API /api/inventory/transfers (+ action endpoints) and frontend UI (list, create, approve, dispatch, receive, in-transit view).
Tests incl. concurrent dispatch, insufficient stock, damaged quantity, isolation. Run. Update progress; commit. Report Phase 3 acceptance honestly.
PHASE 4 — Universal POS
P4A — POS engine + Retail POS
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 7.1, 7.4 (sales part), 16, 18.5.
Task: shared POS engine and Retail/Grocery/Supermarket POS.
Backend: /api/pos/catalog (branch stock aware, barcode lookup), /api/pos/sales. Create the sale using the EXISTING Order/OrderItem/PaymentTransaction (source = POS, branchId, createdBy). Server computes prices, discount, coupon, tax, totals; supports split/partial/due payments; deducts stock via central inventory service in one transaction; hold/resume sale; invoice/receipt data.
Frontend: touch-friendly POS (>=48px controls): search, barcode scan, category filter, product grid, variant select, cart (persistent), customer select/walk-in, discount, coupon, payment, hold/resume, receipt print, invoice.
Tests: sale totals tampering attempt, stock deduction, partial payment, hold/resume, isolation. Run. Update progress; commit.
P4B — Register, cash drawer, returns
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 7.4, 14 (retail part), 18.5.
Task: Registers: create, open session with opening cash, cash in/out, auto sales summary by payment method, expected vs actual cash, difference, close session (transaction), history. Every POS sale links to the open session; block sales when no open session (configurable).
POS returns/refunds: integrate existing ReturnRequest/Refund; partial/full return, restock via inventory service (damaged returns not restocked), refund payment record, register cash-out effect.
APIs: /api/pos/registers, /:id/open, /current, /:id/close. Frontend screens for all of the above.
Tests incl. closing math, duplicate close, return > sold qty. Run. Update progress; commit. Report Phase 4 acceptance (retail part) honestly; restaurant/tailoring POS come in later prompts.
PHASE 5 — Restaurant
P5A — Menu, modifiers, combos
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 8.1-8.3.
Task: Prisma + APIs + UI for menu categories, menu items (images, price, variants, prep time, branch availability, featured, schedule), modifier groups/options (required/optional, min/max, multi, price adjustment), combos (items, optional choices, price, discount, availability). Endpoints under /api/restaurant/categories, /menu, /modifiers, /combos. Server-side price calculation helper that validates modifier rules. Tests and UI wired to APIs. Update progress; commit.
P5B — Ingredients, recipes, costing, waste
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC section 8.4.
Task: ingredient inventory (use the same branch inventory + ledger, item type = ingredient), unit conversion (kg/g/l/ml/piece/pack/box) with precise decimals, recipes per menu item/variant/modifier, recipe costing, wastage and preparation loss, production batches, stock reconciliation, PRODUCTION_CONSUMPTION and WASTE movements. Consumption on sale must be transactional via the inventory service.
APIs /api/restaurant/ingredients, /recipes. UI for ingredients, recipe builder with live cost, waste entry, production batch, reconciliation. Tests: burger recipe deducts correct quantities with unit conversion. Update progress; commit.
P5C — Tables, KOT/KDS, restaurant orders, POS
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 7.2, 8.5-8.7, 21.3.
Task: tables (floor, section, capacity, QR, status, reservation, cleaning), dine-in sessions (multiple orders per session, no conflicting active session per table), order types DINE_IN/TAKEAWAY/DELIVERY/PICKUP/SCHEDULED_ORDER using the existing Order with restaurant detail model, kitchen stations and routing, KOT statuses NEW->ACCEPTED->PREPARING->READY->SERVED/CANCELLED with timers and priority, KOT print, Kitchen Display screen with realtime (existing infra or polling fallback), Restaurant POS UI, payment, ingredient deduction, cancellation/food waste rules (prepared food never returns to sellable stock).
APIs /api/restaurant/tables, /kitchen/orders, /reservations, /orders.
Run the full restaurant end-to-end test from section 21.3. Update progress; commit. Report Phase 5 acceptance honestly.
PHASE 6 — Tailoring (সবচেয়ে বড়, ৬ ভাগে)
P6A — Garment categories, measurement templates, measurements, customer, designs
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 9.2, 9.3, 9.4, 9.5, 18.4.
Task: foundation of tailoring.
1. Configurable garment categories (create/edit/deactivate/reorder) with seeded defaults for men/women/children per 9.2 (seed per tenant on enabling TAILORING, editable).
2. Measurement templates per garment with configurable fields/groups (seed the field lists in 9.4), unit support inch/cm, tenant default unit, canonical storage + reliable conversion.
3. Customer extension (alternate phone, DOB, preferred tailor, notes) without breaking existing Customer; search by phone/name/ID.
4. Measurement profiles with versioning: never overwrite; new version, duplicate previous, compare versions, history, notes, recorded by. Audit log for access/changes. Separate permissions: view/create/edit measurements.
5. Design catalog: code, images (private secure storage with signed/controlled access), est. cost/time, accessories, fabrics, branch availability, reference images with consent flag.
APIs: /api/tailoring/customers, /measurement-templates, /measurements, /measurements/:id/history, /designs, /garment-categories.
Frontend: grouped touch-friendly measurement form, previous-measurement reference, copy previous, version compare, print measurement sheet, design catalog UI.
Tests incl. versioning never overwrites, unit conversion, permission denial, isolation. Run. Update progress; commit.
P6B — Fabric, accessories, customer-owned fabric
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 9.7, 9.8, 9.9.
Task: fabric & accessories inventory on the same branch inventory/ledger (item types fabric/accessory), units meter/yard/inch/cm/piece/roll with precise decimals, fields in 9.7, roll/batch numbers, min stock alerts. Customer-owned fabric as a SEPARATE model (received qty, description, remaining, returned, wasted) never mixed with shop stock. Fabric allocation to garment items, estimated vs actual consumption (no hardcoded quantities), remnants and wastage, deduction timing per tenant workflow setting. Fabric issue slip printable.
APIs /api/tailoring/fabrics, /accessories, /fabric-allocations. UI for all. Tests incl. decimal precision, customer fabric not affecting shop stock, ledger entries. Run. Update progress; commit.
P6C — Quotations, tailoring orders, workflow, pricing
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 7.3, 9.6, 9.18, 9.19 and 10.
Task: tailoring price list (configurable by garment, design complexity, fabric, urgency, branch, extras), quotation with approval -> convert to order, tailoring order with MULTIPLE garment items (each with own measurement SNAPSHOT copied at order time, design, fabric, accessories, worker, deadline, price, status), order status workflow of 9.6 with configurable optional stages and validated transitions plus timeline entries, built on the unified Order (source = TAILORING) with a tailoring detail model. Advance/partial/final payments via existing PaymentTransaction, customer ledger, outstanding balance, refund/cancellation per configured policy. Tailoring POS screen (not a generic single-product checkout). Server-side price calculation only.
APIs: /api/tailoring/orders, /:id, /:id/status, /:id/items, /quotations. Frontend: quotation builder, order form, order board, order detail with timeline and payments.
Tests incl. snapshot immutability after measurement update, invalid status transition, payment math. Run. Update progress; commit.
P6D — Cutting, workers, tasks, piece-rate
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 9.10, 9.11, 9.12.
Task: cutting tasks (statuses PENDING/ASSIGNED/IN_PROGRESS/COMPLETED/REJECTED, fabric allocation, wastage, remaining fabric, printable cutting sheet/job card), worker profiles with role and payment type (personal info protected by permission), production task assignment to multiple workers per order across stages, workload view, configurable piece rates, approval of completed work, worker earnings, advances, deductions, payments (never auto-marked paid), payment history. Production Kanban + cutting queue + stitching queue UI with quick status updates and touch-friendly cards.
APIs: /api/tailoring/cutting, /workers, /tasks, /tasks/:id/assign, /tasks/:id/status, /worker-payments.
Tests incl. only approved work counts for earnings, overdue calculation, permission checks. Run. Update progress; commit.
P6E — Fitting, alteration, QC, appointments, delivery
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 9.13-9.17.
Task: fitting appointments with outcomes (FIT_APPROVED, ALTERATION_REQUIRED, RE_MEASUREMENT_REQUIRED, CUSTOMER_APPROVAL_PENDING) and history; alterations linked to original order (free/paid, approval, worker, status, history, extra charge); quality control checklist with rejection returning garment to correct production stage; appointments of all types with staff/branch conflict prevention; delivery (pickup/home delivery, partial delivery with delivered vs remaining qty, cannot deliver before QC passed, delivery confirmation and receipt).
APIs: /api/tailoring/fittings, /alterations, /quality-checks, /appointments, /deliveries. UI: fitting calendar, alteration queue, QC screen, delivery queue.
Tests incl. appointment conflict, QC reject loop, partial delivery. Run. Update progress; commit.
P6F — Documents, notifications, dashboard, reports, full E2E
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 9.1, 9.20, 9.21, 9.22, 16 (Tailoring UI), 21.4.
Task: printable documents (quotation, invoice, advance receipt, final receipt, measurement sheet, cutting sheet, job card, fabric issue slip, alteration slip, delivery receipt) with branding and no internal measurement/worker data on customer-facing ones; notifications using existing infrastructure (never claim delivered without provider confirmation); tailoring dashboard with real DB stats and date/branch filters; all reports in 9.22 via /api/tailoring/reports and /api/reports/tailoring.
Then write and RUN the complete 32-step tailoring end-to-end test from 21.4 as automated tests. Fix everything that fails. Update progress, TEST_REPORT.md; commit. Report Phase 6 acceptance honestly, listing anything BLOCKED or unfinished.
PHASE 7 — Unified order & delivery
P7 — Order sources, status history, delivery
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 10, 11, 14.
Task: make sure Order supports source (ONLINE, POS, RESTAURANT, TAILORING, OTHER), branch, type, createdBy, validated status transitions and status history for all sources (backfill old orders as ONLINE). Delivery queue, driver assignment, pickup, charge, ETA, proof of delivery, failed and return delivery; extend existing Courier/Steadfast integration; restaurant dine-in/pickup need no courier; tailoring supports pickup and home delivery; webhook idempotency so duplicate provider callbacks never change payment or order status twice. Complete returns/cancellation rules from section 14 for restaurant and tailoring.
APIs /api/delivery/queue, /assignments, /assignments/:id, /status. UI delivery queue and assignment.
Tests incl. duplicate callback, regression of old courier flow. Run. Update progress; commit.
PHASE 8 — Public storefront
P8A — Storefront core, retail, restaurant
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 12.1, 12.2, 17 (Storefront), 21.5.
Task: public storefront under /store/{tenant-slug} (design so custom domains can be added later) with storefront settings, business-type-specific templates. Retail: categories, listing, details, search, filters, cart, checkout, coupons, tracking. Restaurant: menu, variants, add-ons, combos, cart, dine-in/pickup/delivery, checkout, tracking. Public endpoints expose ONLY explicitly public fields; server-side price/availability validation; branch-aware stock; do not break the existing storefront (extend it). Responsive mobile-first, Bengali-friendly.
APIs /api/storefront/settings, /:slug, /:slug/catalog, /:slug/checkout, /:slug/orders/:orderNumber.
Tests incl. cross-tenant leakage, tampered price. Run. Update progress; commit.
P8B — Tailoring storefront
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 12.3, 18.4.
Task: tailoring/boutique public storefront: shop profile, services, garment categories, design gallery, fabric gallery, price guide, portfolio, appointment booking (respecting staff/branch availability), measurement appointment request, quotation request, alteration request, order request with design selection or consented reference image upload, customer login, order progress tracking, contact/location/hours. NO public body-measurement form by default and NEVER expose measurements or private image URLs in public responses.
Tests incl. privacy (no measurement/private URL in any public payload), booking conflict, quotation to staff queue. Run. Update progress; commit. Report Phase 8 acceptance honestly.
PHASE 9 — Reports & entitlements
P9A — Reports
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC section 15.
Task: /api/reports/sales, /inventory, /purchases, /profit, /restaurant, /branches plus universal financial reports (revenue, discounts, tax, refunds, COGS, expenses, gross profit, net operating result, dues, payment method breakdown). Write one documented definition of each metric in BUSINESS_WORKFLOW_DOCUMENTATION.md and make sure nothing is double-counted (orders, payments, refunds, expenses). Real data, date + branch filters, tenant/branch isolation, frontend report pages with export where the app already supports it. Tests with known fixture data verifying exact numbers. Update progress; commit.
P9B — Package entitlements
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC section 19.
Task: inspect the existing package/feature-flag architecture first, then add entitlements for modules (multi-branch, advanced inventory, purchases, restaurant, tailoring, custom domain, multiple registers, advanced reports, advanced permissions). Enforce on BACKEND middleware (403 with clear message) and FRONTEND (hide/upsell). Existing tenants keep their current access. Tests for each gated module, upgrade/downgrade behavior (data is preserved, access is blocked). Update progress; commit.
PHASE 10 — Final QA
P10A — Regression and security
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 18, 20, 21.1, 21.6.
Task: no new features. Run and fix: prisma validate/generate, migration test on a copy of a DB containing OLD data, backend tests, both builds. Regression test the existing features listed in 21.6. Security tests: tenant isolation and branch isolation on EVERY new endpoint (write an automated sweep), permission denial tests, measurement/private image access, duplicate-request idempotency, concurrency stock tests, inventory reconciliation (ledger sum = balance for every item). Fix every bug found. Record results in TEST_REPORT.md with real command output summaries. Commit.
P10B — Final documentation and report
Read `.clinerules`, `IMPLEMENTATION_PROGRESS.md`, MASTER_SPEC sections 24, 25.
Task: finalize API_DOCUMENTATION.md, PERMISSION_MATRIX.md, BUSINESS_WORKFLOW_DOCUMENTATION.md, DATABASE_MIGRATION_NOTES.md (with rollback), TEST_REPORT.md, and FINAL_IMPLEMENTATION_REPORT.md. Walk through the 11 acceptance scenarios in section 25 one by one and state honestly PASS / PARTIAL / FAIL with evidence. List remaining gaps. Do not claim completion for anything unverified. Commit.
সবসময় কাজে লাগবে
R1 — Resume (মাঝপথে থেমে গেলে)
Read `.clinerules` and `IMPLEMENTATION_PROGRESS.md`. Find the task marked IN_PROGRESS and the 'Exact next step'. Run `git status` and `git diff --stat` to see what already exists, verify those files actually work (do not trust the progress file blindly), then continue from the exact unfinished point without redoing completed work. Follow the same Definition of Done and update the progress file when finished.
F1 — Fix (build বা test ফেল করলে)
Read `.clinerules` and `IMPLEMENTATION_PROGRESS.md`. The following error/failing test occurred: <paste the exact error output here>. Find the root cause, fix it without breaking other features, re-run prisma validate, backend build, frontend build and the relevant tests, and report real results. Do not add new features.
V1 — Verify (Cline "শেষ" বললে যাচাই)
Audit the task you just marked COMPLETED against the Definition of Done in `.clinerules`. For each feature list: DB model, migration, backend logic, API, frontend wired to real API, permissions, tests (run them now and show results). Search the code you added for TODO, FIXME, mock, placeholder, hardcoded numbers and empty handlers. Anything missing: finish it now or change its status to IN_PROGRESS/BLOCKED and say why.
ক্রম এক নজরে
S1 → S2 → P0 → P1A → P1B → P2A → P2B → P3A → P3B → P4A → P4B → P5A → P5B → P5C → P6A → P6B → P6C → P6D → P6E → P6F → P7 → P8A → P8B → P9A → P9B → P10A → P10B
প্রতিটা ধাপের পর V1 চালিয়ে নিলে "অর্ধেক করে শেষ বলে দিল" সমস্যা প্রায় থাকবে না।
MASTER SPEC — MULTI-TENANT BUSINESS PLATFORM

This canonical specification consolidates the numbered acceptance requirements referenced by the phase prompts below. Later-phase permission keys describe the intended permission namespace; enforcement is required as each feature/API is implemented.

## 3.1 Business profile and configuration

Each tenant has a business type, business identity/contact details, locale and currency settings, tax and delivery defaults, onboarding completion state, enabled modules, and JSON configuration/preferences appropriate to its business type. Business types are `SUPERMARKET`, `GROCERY`, `RETAIL`, `RESTAURANT`, `CAFE`, `CLOUD_KITCHEN`, `TAILORING`, `BOUTIQUE`, `GARMENT_WORKSHOP`, and `UNIFORM_MANUFACTURER`. Tenant identity is derived from the authenticated user; profile/settings APIs must validate allowed fields and never accept a client-selected tenant ID.

## 5. Branch inventory and stock ledger

### 5.1 Data model and compatibility

Inventory is tracked per tenant, branch, and variant. Keep the existing storefront `Variant.stock` behavior compatible while branch inventory is introduced; use the central ledger as the source for branch operations and reconcile any legacy stock projection.

### 5.2 Movements and adjustments

An inventory movement is immutable and records tenant, branch, variant, movement type, quantity, previous/new balance, actor, reference, note/metadata, idempotency key, and timestamp. Movement types include opening stock, purchase, sale, return, adjustment, stock count, damage, expiry, loss, waste, transfer in/out, and reversal. Corrections append reversal/correction movements; they do not edit prior ledger entries. Adjustments and counts require a reason and appropriate branch permission.

### 5.3 Atomic stock operations

All stock changes use one transaction-aware service. It validates tenant/branch/variant ownership, serializes competing balance updates, rejects overselling unless the tenant's negative-stock policy permits it, enforces idempotency, stores previous and resulting stock, and maintains any legacy stock projection. Purchase receiving, order checkout/cancel/return, and future POS/transfer/production flows must call this service.

## 6. Purchasing and inter-branch transfers

### 6.1 Purchase orders

Purchase orders are branch-scoped and contain supplier, number, ordered/received/remaining quantities per line, costs/totals, status, actor, dates, and notes. Statuses are `DRAFT`, `ORDERED`, `PARTIALLY_RECEIVED`, `RECEIVED`, and `CANCELLED`. Reads and writes are tenant- and branch-isolated; server-calculated amounts and payment status are authoritative.

### 6.2 Receiving

Receipts may be partial and repeated; each accepted quantity is tracked against ordered and previously received quantities. Reject over-receiving. Receiving and its inventory ledger updates commit atomically, and an idempotency key prevents duplicate receipt effects.

### 6.3 Supplier payments

Supplier payments are associated with tenant, supplier, purchase/branch as applicable, actor, amount, method, and date. Reject overpayment; compute paid, due, and payment status server-side. Maintain a supplier ledger and payment history.

### 6.4 Stock transfers

Transfers follow request, approval, dispatch, partial/complete receive, and reject/cancel states. Dispatch records transfer-out and in-transit quantities; receiving records transfer-in and damaged quantities. Every transition is authorized for its source/destination branch, transactional, and duplicate-safe.

## 18.3 Granular permissions and role presets

Global user roles remain the tenant-level RBAC layer (`SUPER_ADMIN`, `TENANT_OWNER`, `BUSINESS_ADMIN`, `OWNER`, and existing application roles); branch membership adds a branch-scoped role and boolean permission overrides. Tenant administrators retain their existing tenant-level authority. Branch presets never grant tenant-wide authority or membership administration.

Permission identifiers are grouped by domain and action. The current catalog is exposed by the authenticated `GET /api/branches/permissions` endpoint:

| Domain | Permission keys |
|---|---|
| Branches | `branches.view`, `branches.update`, `branches.status`, `branches.default`, `branches.members.view`, `branches.members.create`, `branches.members.update`, `branches.members.delete` |
| Products | `products.view`, `products.create`, `products.update`, `products.delete` |
| Orders | `orders.view`, `orders.create`, `orders.update`, `orders.cancel`, `orders.refund` |
| Customers | `customers.view`, `customers.create`, `customers.update`, `customers.delete` |
| Inventory | `inventory.view`, `inventory.adjust`, `inventory.count`, `inventory.transfer` |
| Purchases | `purchase.view`, `purchase.create`, `purchase.edit`, `purchase.submit`, `purchase.cancel`, `purchase.receive`, `purchase.pay` |
| Suppliers and expenses | `suppliers.view`, `suppliers.manage`, `expenses.view`, `expenses.manage` |
| Reports | `reports.sales.view`, `reports.inventory.view`, `reports.purchases.view`, `reports.financial.view` |
| POS | `pos.use`, `pos.discount`, `pos.open_register`, `pos.close_register` |
| Restaurant | `restaurant.orders.view`, `restaurant.orders.manage`, `restaurant.menu.manage` |
| Tailoring | `tailoring.orders.view`, `tailoring.orders.manage`, `tailoring.measurements.view` |

Presets are `BRANCH_MANAGER`, `SUPERVISOR`, `CASHIER`, `INVENTORY_CLERK`, `ACCOUNTANT`, `STAFF`, and `CUSTOM`. Presets grant only the documented domain actions; `CUSTOM` starts with no grants and is configured with explicit booleans. Explicit membership values override preset defaults, including `false` to revoke an inherited grant. Branch managers may administer branch-level branch actions only for their assigned branch; only existing tenant-admin roles administer branch memberships. Permission checks are enforced server-side, with frontend visibility treated only as UX.

Pre-existing branch role identifiers remain valid for compatibility; an identifier without a defined preset grants no permissions unless explicitly configured.

## 18.5 Branch authorization

Resolve branch context from a route parameter, validated query parameter, or `X-Branch-Id` header, then verify the branch belongs to the authenticated tenant and is active for ordinary operations. Non-admin users need active tenant membership and active membership in that branch; the assigned branch manager receives only branch-administration permissions unless their membership preset grants other actions. Tenant admins may access branches in their tenant but never another tenant. Client-selected branch context is not itself authorization. Branch-scoped reads, writes, and service-layer transaction paths must apply the same checks.

## 20. Database migrations and verification

Schema changes require checked-in, repeatable, safe migrations compatible with existing tenant data. Backfills must be idempotent and preserve legacy behavior. Before/after totals for data moves must be reconciled, existing records must receive deterministic defaults, and rollback/recovery steps must be documented. Tests cover migration reruns, tenant and branch isolation, permission enforcement, transaction/idempotency behavior, and relevant legacy regressions. A feature is not accepted solely because its schema or UI exists; use the Definition of Done in `.clinerules` and report any unavailable integration/production validation explicitly.

---
