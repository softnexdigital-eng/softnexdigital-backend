const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBusinessFoundationController,
  validateBranchData,
  validateBusinessProfile,
  validateBusinessSettings,
} = require("../controllers/businessFoundationController");
const { createRequireBranchAccess } = require("../middleware/branchAuthorization");
const { requireTenantAdmin } = require("../middleware/businessAuthorization");
const { backfillBusinessFoundation } = require("../scripts/backfill-business-foundation");
const {
  BRANCH_PERMISSION_KEYS,
  getEffectivePermissions,
  hasBranchPermission,
} = require("../services/branchPermissions");

class FakePrisma {
  constructor() {
    this.tenants = [
      { id: "tenant-1", name: "One", timezone: "Asia/Dhaka", businessType: "RETAIL" },
      { id: "tenant-2", name: "Two", timezone: "Asia/Dhaka", businessType: "RETAIL" },
    ];
    this.users = [
      { id: "user-1", tenantId: "tenant-1", name: "Admin", email: "admin1@example.com", role: "BUSINESS_ADMIN", isActive: true },
      { id: "staff-1", tenantId: "tenant-1", name: "Staff", email: "staff@example.com", role: "STAFF", isActive: true },
      { id: "user-2", tenantId: "tenant-2", name: "Other", email: "admin2@example.com", role: "BUSINESS_ADMIN", isActive: true },
    ];
    this.branches = [];
    this.memberships = [];
    this.nextId = 1;
    this.tenant = {
      findMany: async ({ select } = {}) => this.tenants.map((tenant) => select
        ? Object.fromEntries(Object.keys(select).map((key) => [key, tenant[key]]))
        : tenant),
      findUnique: async ({ where }) => this.tenants.find((tenant) => tenant.id === where.id) || null,
      update: async ({ where, data }) => {
        const tenant = this.tenants.find((item) => item.id === where.id);
        if (!tenant) throw Object.assign(new Error("not found"), { code: "P2025" });
        Object.assign(tenant, data);
        return tenant;
      },
    };
    this.user = {
      findMany: async ({ where }) => this.users.filter((user) => this.matches(user, where)),
      findFirst: async ({ where }) => this.users.find((user) => this.matches(user, where)) || null,
    };
    this.branch = {
      findMany: async (args) => {
        let rows = this.branches.filter((branch) => this.matchesBranch(branch, args.where));
        if (args.orderBy) {
          rows = [...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
        }
        return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
      },
      findFirst: async ({ where }) => {
        const branch = this.branches.find((item) => this.matchesBranch(item, where));
        return branch ? { ...branch } : null;
      },
      count: async ({ where }) => this.branches.filter((branch) => this.matchesBranch(branch, where)).length,
      create: async ({ data, include }) => {
        if (this.branches.some((branch) => branch.tenantId === data.tenantId && branch.code === data.code)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const row = {
          id: `branch-${this.nextId++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          openingHours: {},
          isDefault: false,
          isActive: true,
          ...data,
        };
        this.branches.push(row);
        return include ? this.branchWithManager(row) : row;
      },
      update: async ({ where, data, include }) => {
        const row = this.branches.find((branch) => branch.id === where.id);
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        Object.assign(row, data, { updatedAt: new Date() });
        return include ? this.branchWithManager(row) : row;
      },
      updateMany: async ({ where, data }) => {
        const rows = this.branches.filter((branch) => this.matchesBranch(branch, where));
        rows.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));
        return { count: rows.length };
      },
    };
    this.branchMembership = {
      findUnique: async ({ where }) => this.memberships.find((membership) =>
        membership.branchId === where.branchId_userId.branchId &&
        membership.userId === where.branchId_userId.userId) || null,
      findFirst: async ({ where }) => this.memberships.find((membership) => this.matches(membership, where)) || null,
      findMany: async ({ where, skip = 0, take, include }) => this.memberships
        .filter((membership) => this.matches(membership, where))
        .slice(skip, skip + (take || this.memberships.length))
        .map((membership) => include
          ? { ...membership, user: this.users.find((user) => user.id === membership.userId) }
          : membership),
      count: async ({ where }) => this.memberships.filter((membership) => this.matches(membership, where)).length,
      upsert: async ({ where, create, update, include }) => {
        const { branchId, userId } = where.branchId_userId;
        let row = this.memberships.find((membership) => membership.branchId === branchId && membership.userId === userId);
        if (row) Object.assign(row, update);
        else {
          row = { id: `membership-${this.nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...create };
          this.memberships.push(row);
        }
        return include ? { ...row, user: this.users.find((user) => user.id === userId) } : row;
      },
      update: async ({ where, data }) => {
        const row = this.memberships.find((membership) => membership.id === where.id);
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const rows = this.memberships.filter((membership) => this.matches(membership, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    };
  }

  matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((condition) => this.matches(row, condition));
      if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
      if (value && typeof value === "object" && "contains" in value) {
        return String(row[key] || "").toLowerCase().includes(value.contains.toLowerCase());
      }
      return row[key] === value;
    });
  }

  matchesBranch(branch, where = {}) {
    if (where.memberships && !this.memberships.some((membership) =>
      membership.branchId === branch.id && this.matches(membership, where.memberships.some))) return false;
    return this.matches(branch, Object.fromEntries(Object.entries(where).filter(([key]) =>
      key !== "memberships" && key !== "OR")));
  }

  branchWithManager(branch) {
    return { ...branch, manager: this.users.find((user) => user.id === branch.managerId) || null };
  }

  async $transaction(callback) {
    return callback(this);
  }
}

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const call = async (handler, req) => {
  const res = response();
  let unexpectedError;
  await handler(req, res, (error) => { unexpectedError = error; });
  if (unexpectedError) throw unexpectedError;
  return res;
};

test("validates business type, business settings, and opening-hours input", () => {
  assert.equal(validateBusinessProfile({ businessType: "TAILORING" }).businessType, "TAILORING");
  assert.throws(() => validateBusinessProfile({ businessType: "UNKNOWN" }), /businessType is invalid/);
  assert.deepEqual(validateBusinessSettings({ enabledModules: ["catalog", "pos"] }).enabledModules, ["catalog", "pos"]);
  assert.equal(validateBusinessSettings({ allowNegativeStock: true }).allowNegativeStock, true);
  assert.throws(() => validateBusinessSettings({ allowNegativeStock: "true" }), /must be a boolean/);
  assert.throws(() => validateBusinessSettings({ enabledModules: ["Catalog"] }), /lowercase module identifiers/);
  assert.throws(() => validateBranchData({ name: "Main", openingHours: { funday: {} } }), /invalid day/);
});

test("business profile and settings updates are tenant-scoped and administrator-only", async () => {
  const db = new FakePrisma();
  const controller = createBusinessFoundationController(db);
  const updatedProfile = await call(controller.updateBusinessProfile, {
    user: { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" },
    body: { businessType: "TAILORING", companyName: "Tailoring Co", currency: "bdt" },
  });
  assert.equal(updatedProfile.body.data.businessType, "TAILORING");
  assert.equal(updatedProfile.body.data.currency, "BDT");
  assert.equal(db.tenants.find((tenant) => tenant.id === "tenant-2").businessType, "RETAIL");

  const settings = await call(controller.updateBusinessSettings, {
    user: { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" },
    body: {
      enabledModules: ["catalog", "tailoring"],
      businessConfig: { tailoring: { fittingEnabled: true } },
      allowNegativeStock: true,
    },
  });
  assert.deepEqual(settings.body.data.enabledModules, ["catalog", "tailoring"]);
  assert.equal(settings.body.data.businessConfig.tailoring.fittingEnabled, true);
  assert.equal(settings.body.data.allowNegativeStock, true);

  const forbidden = response();
  let forbiddenNext = false;
  requireTenantAdmin({
    user: { id: "staff-1", tenantId: "tenant-1", role: "STAFF" },
  }, forbidden, () => { forbiddenNext = true; });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbiddenNext, false);
});

test("branch CRUD, activation, default selection, and tenant isolation", async () => {
  const db = new FakePrisma();
  const controller = createBusinessFoundationController(db);
  const admin = { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" };
  const created = await call(controller.createBranch, {
    user: admin,
    body: { name: "Dhaka Main", openingHours: { monday: { open: "09:00", close: "18:00" } }, isDefault: true },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.data.code, "DHAKA-MAIN");
  assert.equal(created.body.data.isDefault, true);

  const second = await call(controller.createBranch, {
    user: admin,
    body: { name: "Uttara" },
  });
  assert.equal(second.statusCode, 201);
  const listed = await call(controller.listBranches, { user: admin, query: {} });
  assert.equal(listed.body.data.total, 2);

  const updated = await call(controller.updateBranch, {
    user: admin,
    params: { branchId: created.body.data.id },
    body: { address: "Dhaka" },
  });
  assert.equal(updated.body.data.address, "Dhaka");

  const deactivated = await call(controller.updateBranchStatus, {
    user: admin,
    params: { branchId: created.body.data.id },
    body: { isActive: false },
  });
  assert.equal(deactivated.body.data.isActive, false);
  assert.equal(db.branches.find((branch) => branch.id === second.body.data.id).isDefault, true);

  const activated = await call(controller.updateBranchStatus, {
    user: admin,
    params: { branchId: created.body.data.id },
    body: { isActive: true },
  });
  assert.equal(activated.body.data.isActive, true);

  const otherTenant = { id: "user-2", tenantId: "tenant-2", role: "BUSINESS_ADMIN" };
  const isolated = await call(controller.getBranch, {
    user: otherTenant,
    params: { branchId: created.body.data.id },
  });
  assert.equal(isolated.statusCode, 404);
  const otherList = await call(controller.listBranches, { user: otherTenant, query: {} });
  assert.equal(otherList.body.data.total, 0);

  const defaulted = await call(controller.setDefaultBranch, {
    user: admin,
    params: { branchId: second.body.data.id },
  });
  assert.equal(defaulted.body.data.isDefault, true);
  assert.equal(db.branches.filter((branch) => branch.tenantId === "tenant-1" && branch.isDefault).length, 1);
});

test("branch member APIs reject cross-tenant users and keep membership scoped", async () => {
  const db = new FakePrisma();
  const controller = createBusinessFoundationController(db);
  const branch = await db.branch.create({
    data: { tenantId: "tenant-1", name: "Main", code: "MAIN", isDefault: true, isActive: true },
  });
  const admin = { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" };
  const rejected = await call(controller.addBranchMember, {
    user: admin,
    params: { branchId: branch.id },
    body: { userId: "user-2" },
  });
  assert.equal(rejected.statusCode, 400);

  const added = await call(controller.addBranchMember, {
    user: admin,
    params: { branchId: branch.id },
    body: { userId: "staff-1", role: "CASHIER" },
  });
  assert.equal(added.statusCode, 201);
  assert.equal(added.body.data.effectivePermissions["orders.create"], true);
  assert.equal(added.body.data.effectivePermissions["inventory.adjust"], undefined);
  const members = await call(controller.listBranchMembers, {
    user: admin,
    params: { branchId: branch.id },
    query: {},
  });
  assert.equal(members.body.data.total, 1);
  assert.equal(members.body.data.memberships[0].user.id, "staff-1");

  const removed = await call(controller.removeBranchMember, {
    user: admin,
    params: { branchId: branch.id, membershipId: added.body.data.id },
  });
  assert.equal(removed.body.data.isActive, false);
});

test("permission presets grant scoped defaults and explicit overrides can revoke them", async () => {
  assert.equal(BRANCH_PERMISSION_KEYS.includes("purchase.receive"), true);
  assert.equal(hasBranchPermission({ role: "CASHIER", permissions: {} }, "orders.create"), true);
  assert.equal(hasBranchPermission({ role: "CASHIER", permissions: {} }, "inventory.adjust"), false);
  assert.equal(hasBranchPermission({
    role: "CASHIER",
    permissions: { "orders.create": false, "inventory.adjust": true },
  }, "orders.create"), false);
  assert.equal(hasBranchPermission({
    role: "CASHIER",
    permissions: { "orders.create": false, "inventory.adjust": true },
  }, "inventory.adjust"), true);
  assert.deepEqual(getEffectivePermissions("CUSTOM"), {});
});

test("changing a membership preset resets custom grants and legacy roles get no preset grants", async () => {
  const db = new FakePrisma();
  const controller = createBusinessFoundationController(db);
  const branch = await db.branch.create({
    data: { tenantId: "tenant-1", name: "Main", code: "MAIN", isDefault: true, isActive: true },
  });
  const admin = { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" };
  const added = await call(controller.addBranchMember, {
    user: admin,
    params: { branchId: branch.id },
    body: { userId: "staff-1", role: "CUSTOM", permissions: { "purchase.pay": true } },
  });
  const changed = await call(controller.updateBranchMember, {
    user: admin,
    params: { branchId: branch.id, membershipId: added.body.data.id },
    body: { role: "STAFF" },
  });
  assert.deepEqual(changed.body.data.permissions, {});
  assert.equal(changed.body.data.effectivePermissions["purchase.pay"], undefined);
  assert.equal(changed.body.data.effectivePermissions["orders.view"], true);

  const legacyRole = await call(controller.addBranchMember, {
    user: admin,
    params: { branchId: branch.id },
    body: { userId: "staff-1", role: "ARBITRARY_ADMIN" },
  });
  assert.equal(legacyRole.statusCode, 201);
  assert.deepEqual(legacyRole.body.data.effectivePermissions, {});
});

test("branch manager changes keep manager membership aligned", async () => {
  const db = new FakePrisma();
  const controller = createBusinessFoundationController(db);
  const admin = { id: "user-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" };
  const created = await call(controller.createBranch, {
    user: admin,
    body: { name: "Managed", managerId: "user-1" },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(db.memberships[0].role, "BRANCH_MANAGER");

  await call(controller.updateBranch, {
    user: admin,
    params: { branchId: created.body.data.id },
    body: { managerId: "staff-1" },
  });
  assert.equal(db.memberships.find((membership) => membership.userId === "user-1").role, "STAFF");
  assert.equal(db.memberships.find((membership) => membership.userId === "staff-1").role, "BRANCH_MANAGER");
});

test("branch middleware rejects cross-tenant and non-member access", async () => {
  const db = new FakePrisma();
  const branch = await db.branch.create({
    data: { tenantId: "tenant-1", name: "Main", code: "MAIN", isDefault: true, isActive: true },
  });
  const middleware = createRequireBranchAccess(db, { required: true });
  const denied = response();
  let deniedNext = false;
  await middleware({
    user: { id: "user-2", tenantId: "tenant-2", role: "STAFF" },
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, denied, () => { deniedNext = true; });
  assert.equal(denied.statusCode, 404);
  assert.equal(deniedNext, false);

  const noMembership = response();
  await middleware({
    user: { id: "staff-1", tenantId: "tenant-1", role: "STAFF" },
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, noMembership, () => {});
  assert.equal(noMembership.statusCode, 403);

  db.memberships.push({
    id: "member-1",
    tenantId: "tenant-1",
    branchId: branch.id,
    userId: "staff-1",
    isActive: true,
    permissions: {},
  });
  const allowed = response();
  let allowedNext = false;
  await middleware({
    user: { id: "staff-1", tenantId: "tenant-1", role: "STAFF" },
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, allowed, () => { allowedNext = true; });
  assert.equal(allowedNext, true);
  assert.equal(allowed.statusCode, 200);

  const permissionMiddleware = createRequireBranchAccess(db, { required: true, permission: "purchase.pay" });
  const permissionDenied = response();
  await permissionMiddleware({
    user: { id: "staff-1", tenantId: "tenant-1", role: "STAFF" },
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, permissionDenied, () => {});
  assert.equal(permissionDenied.statusCode, 403);

  db.memberships[0].permissions = { "purchase.pay": true };
  const permissionAllowed = response();
  let permissionNext = false;
  await permissionMiddleware({
    user: { id: "staff-1", tenantId: "tenant-1", role: "STAFF" },
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, permissionAllowed, () => { permissionNext = true; });
  assert.equal(permissionNext, true);
});

test("inactive branches deny inventory access even to tenant admins unless explicitly allowed", async () => {
  const db = new FakePrisma();
  const branch = await db.branch.create({
    data: { tenantId: "tenant-1", name: "Closed", code: "CLOSED", isDefault: false, isActive: false },
  });
  const admin = { id: "admin-1", tenantId: "tenant-1", role: "BUSINESS_ADMIN" };
  const denied = response();
  await createRequireBranchAccess(db, { required: true })({
    user: admin,
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, denied, () => {});
  assert.equal(denied.statusCode, 403);

  const allowed = response();
  let nextCalled = false;
  await createRequireBranchAccess(db, { required: true, allowInactive: true })({
    user: admin,
    params: { branchId: branch.id },
    query: {},
    headers: {},
  }, allowed, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(allowed.statusCode, 200);
});

test("business foundation backfill is idempotent and grants existing tenant users the default branch", async () => {
  const db = new FakePrisma();
  const first = await backfillBusinessFoundation(db);
  const second = await backfillBusinessFoundation(db);
  assert.equal(first.branchesCreated, 2);
  assert.equal(second.branchesCreated, 0);
  assert.equal(db.branches.length, 2);
  assert.equal(db.branches.filter((branch) => branch.isDefault).length, 2);
  assert.equal(db.memberships.length, 3);
  assert.equal(second.membershipsCreated, 0);
});
