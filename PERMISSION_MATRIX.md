# Permission Matrix

## RBAC layers and administrative boundary

Existing global `User.role` checks remain the tenant-level RBAC layer. The roles `SUPER_ADMIN`, `TENANT_OWNER`, `BUSINESS_ADMIN`, and `OWNER` retain the current tenant administrator access defined in `businessAuthorization.js`; they may access branches only within their authenticated tenant. Branch presets do not confer tenant administrator status.

Non-admin users need active tenant membership and active membership in the requested branch. Membership writes remain tenant-admin-only. An assigned branch manager can use branch-administration operations on their own branch; that exception does not grant access to other branches or silently grant operational permissions.

## Permission catalog

The canonical executable catalog and role presets are in `services/branchPermissions.js`, exposed to authenticated clients at `GET /api/branches/permissions`.

| Domain | Granular keys |
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

The catalog includes keys for planned modules; those keys do not imply that the corresponding feature or route is implemented. Each future module must apply its keys in backend authorization as part of that feature's Definition of Done.

## Branch role presets

Preset grants are defaults and may be narrowed with an explicit `false` permission override. A custom grant is a boolean map stored in `BranchMembership.permissions`; `CUSTOM` begins with no grants. Presets are applied in backend permission checks, not just displayed in the UI.

| Role | Grants |
|---|---|
| `BRANCH_MANAGER` | Operational branch management across catalog, orders, customers, inventory, purchases, supplier/expense, reports, POS, restaurant, and tailoring domains. Does not grant branch membership administration. |
| `SUPERVISOR` | Product/order/customer read, order create/update, inventory read/adjust/count, purchase read/receive, supplier read, sales/inventory reports, POS use. |
| `CASHIER` | Product/order/customer read, order create/update, customer create, inventory read, POS use. |
| `INVENTORY_CLERK` | Product/inventory read, inventory adjustment/count, purchase read/receive, supplier read, inventory reports. |
| `ACCOUNTANT` | Order/purchase/supplier read, purchase pay, expense read/manage, sales/purchase/financial reports. |
| `STAFF` | Branch/product/order/customer/inventory read only. |
| `CUSTOM` | No preset grants; explicitly selected permissions only. |

The exact grant list is kept in `services/branchPermissions.js`; the permission catalog endpoint supplies those lists to the management UI so it does not duplicate preset definitions.
Previously stored role identifiers remain accepted and have no implicit grants unless an explicit permission map is present.

## Enforced routes today

| Endpoint/action | Required branch permission | Notes |
|---|---|---|
| `GET /api/branches/:branchId/members` | `branches.members.view` | Tenant admins bypass membership checks; assigned manager retains branch-admin access. |
| `POST /api/inventory/adjustments`, reversal, threshold update | `inventory.adjust` | Uses the central inventory service and tenant stock policy. |
| Purchase create/edit/submit/cancel/receive/payment | `purchase.create`, `purchase.edit`, `purchase.submit`, `purchase.cancel`, `purchase.receive`, `purchase.pay` | Resource branch is checked in the service/controller transaction paths. |
| Inventory, purchase, and inventory-report reads | Active branch access | Read access is branch-scoped; these routes currently require membership, not a granular read key. |
| Branch profile/status/default and member mutations | Existing tenant-admin RBAC | `branches.*` member grants do not replace the tenant-admin requirement. |

`requireBranchAccess()` resolves `:branchId`, `?branchId=`, or `X-Branch-Id`, verifies tenant ownership, branch status, active user and membership, then evaluates the permission preset plus explicit overrides. Inventory and purchase services use the same permission evaluator inside their transaction paths. Existing tenant-admin bypasses and the assigned-manager branch-only exception are preserved.

Catalog entries for order, customer, product, POS, restaurant, tailoring, transfers, and reports are available for assignment, but their existing endpoints are not all wired to granular branch permission middleware yet. This is remaining P1B/feature work; the current branch-access-only legacy routes must not be described as action-level enforcement.

## Frontend behavior

Branch management fetches the permission catalog from the API, allows tenant admins to assign a branch preset, and provides per-key checkboxes for `CUSTOM`. It displays effective permissions (preset merged with explicit overrides). Business modules are separately controlled by tenant `enabledModules`; frontend visibility is advisory and never replaces backend authorization.