const BRANCH_PERMISSION_GROUPS = {
  branches: [
    "branches.view",
    "branches.update",
    "branches.status",
    "branches.default",
    "branches.members.view",
    "branches.members.create",
    "branches.members.update",
    "branches.members.delete",
  ],
  products: ["products.view", "products.create", "products.update", "products.delete"],
  orders: [
    "orders.view",
    "orders.create",
    "orders.update",
    "orders.cancel",
    "orders.refund",
  ],
  customers: ["customers.view", "customers.create", "customers.update", "customers.delete"],
  inventory: ["inventory.view", "inventory.adjust", "inventory.count", "inventory.transfer"],
  purchases: [
    "purchase.view",
    "purchase.create",
    "purchase.edit",
    "purchase.submit",
    "purchase.cancel",
    "purchase.receive",
    "purchase.pay",
  ],
  suppliers: ["suppliers.view", "suppliers.manage"],
  expenses: ["expenses.view", "expenses.manage"],
  reports: [
    "reports.sales.view",
    "reports.inventory.view",
    "reports.purchases.view",
    "reports.financial.view",
  ],
  pos: ["pos.use", "pos.discount", "pos.open_register", "pos.close_register"],
  restaurant: ["restaurant.orders.view", "restaurant.orders.manage", "restaurant.menu.manage"],
  tailoring: ["tailoring.orders.view", "tailoring.orders.manage", "tailoring.measurements.view"],
};

const BRANCH_PERMISSION_KEYS = Object.freeze(
  Object.values(BRANCH_PERMISSION_GROUPS).flat(),
);

const BRANCH_ROLE_PRESETS = Object.freeze({
  BRANCH_MANAGER: [
    "branches.view",
    "products.view",
    "products.create",
    "products.update",
    "orders.view",
    "orders.create",
    "orders.update",
    "orders.cancel",
    "customers.view",
    "customers.create",
    "customers.update",
    "inventory.view",
    "inventory.adjust",
    "inventory.count",
    "purchase.view",
    "purchase.create",
    "purchase.edit",
    "purchase.submit",
    "purchase.cancel",
    "purchase.receive",
    "purchase.pay",
    "suppliers.view",
    "suppliers.manage",
    "expenses.view",
    "expenses.manage",
    "reports.sales.view",
    "reports.inventory.view",
    "reports.purchases.view",
    "reports.financial.view",
    "pos.use",
    "pos.discount",
    "pos.open_register",
    "pos.close_register",
    "restaurant.orders.view",
    "restaurant.orders.manage",
    "restaurant.menu.manage",
    "tailoring.orders.view",
    "tailoring.orders.manage",
  ],
  SUPERVISOR: [
    "branches.view",
    "products.view",
    "orders.view",
    "orders.create",
    "orders.update",
    "customers.view",
    "inventory.view",
    "inventory.adjust",
    "inventory.count",
    "purchase.view",
    "purchase.receive",
    "suppliers.view",
    "reports.sales.view",
    "reports.inventory.view",
    "pos.use",
  ],
  CASHIER: [
    "branches.view",
    "products.view",
    "orders.view",
    "orders.create",
    "orders.update",
    "customers.view",
    "customers.create",
    "inventory.view",
    "pos.use",
  ],
  INVENTORY_CLERK: [
    "branches.view",
    "products.view",
    "inventory.view",
    "inventory.adjust",
    "inventory.count",
    "purchase.view",
    "purchase.receive",
    "suppliers.view",
    "reports.inventory.view",
  ],
  ACCOUNTANT: [
    "branches.view",
    "orders.view",
    "purchase.view",
    "purchase.pay",
    "suppliers.view",
    "expenses.view",
    "expenses.manage",
    "reports.sales.view",
    "reports.purchases.view",
    "reports.financial.view",
  ],
  STAFF: [
    "branches.view",
    "products.view",
    "orders.view",
    "customers.view",
    "inventory.view",
  ],
  CUSTOM: [],
});

const getEffectivePermissions = (role, overrides = {}) => {
  const permissions = Object.fromEntries(
    (BRANCH_ROLE_PRESETS[role] || []).map((permission) => [permission, true]),
  );
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    Object.assign(permissions, overrides);
  }
  return permissions;
};

const hasBranchPermission = (membership, permission) => {
  const permissions = getEffectivePermissions(membership?.role, membership?.permissions);
  return permissions[permission] === true || permissions["*"] === true;
};

const getBranchPermissionCatalog = () => ({
  groups: BRANCH_PERMISSION_GROUPS,
  presets: BRANCH_ROLE_PRESETS,
});

module.exports = {
  BRANCH_PERMISSION_GROUPS,
  BRANCH_PERMISSION_KEYS,
  BRANCH_ROLE_PRESETS,
  getBranchPermissionCatalog,
  getEffectivePermissions,
  hasBranchPermission,
};
