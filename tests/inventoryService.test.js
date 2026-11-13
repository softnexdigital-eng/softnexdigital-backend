const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyMovementInTransaction,
  applyOrderMovementsInTransaction,
} = require("../services/inventoryService");

const createMemoryDb = ({ allowNegativeStock = false, initialStock = 0 } = {}) => {
  const state = {
    branch: { id: "branch-1", tenantId: "tenant-1", isDefault: true, isActive: true, managerId: null },
    variant: { id: "variant-1", tenantId: "tenant-1", stock: 0 },
    tenant: { id: "tenant-1", allowNegativeStock },
    membership: { id: "membership-1", tenantId: "tenant-1", branchId: "branch-1", userId: "user-1", isActive: true, permissions: { "inventory.adjust": true } },
    balances: new Map(),
    movements: new Map(),
    logs: [],
  };
  const key = (branchId, variantId) => `${branchId}:${variantId}`;
  let queue = Promise.resolve();

  const createTransaction = () => ({
    branch: {
      findFirst: async ({ where }) => where.tenantId === state.branch.tenantId &&
        (!where.id || where.id === state.branch.id) &&
        (!where.isDefault || state.branch.isDefault) ? state.branch : null,
    },
    variant: {
      findFirst: async ({ where }) => where.id === state.variant.id &&
        where.product.tenantId === state.variant.tenantId ? state.variant : null,
      update: async ({ data }) => {
        state.variant.stock += data.stock.increment;
        return state.variant;
      },
    },
    tenant: {
      findUnique: async ({ where }) => where.id === state.tenant.id ? state.tenant : null,
    },
    branchMembership: {
      findFirst: async ({ where }) => where.branchId === state.membership.branchId &&
        where.userId === state.membership.userId ? state.membership : null,
    },
    inventoryMovement: {
      findUnique: async ({ where }) => state.movements.get(
        `${where.tenantId_idempotencyKey.tenantId}:${where.tenantId_idempotencyKey.idempotencyKey}`,
      ) || null,
      create: async ({ data }) => {
        const movement = { id: `movement-${state.movements.size + 1}`, ...data };
        state.movements.set(`${data.tenantId}:${data.idempotencyKey}`, movement);
        return movement;
      },
    },
    branchInventory: {
      create: async ({ data }) => {
        const balanceKey = key(data.branchId, data.variantId);
        state.balances.set(balanceKey, data.quantity);
        return { quantity: data.quantity };
      },
      upsert: async ({ where, create }) => {
        const balanceKey = key(where.branchId_variantId.branchId, where.branchId_variantId.variantId);
        if (!state.balances.has(balanceKey)) state.balances.set(balanceKey, create.quantity);
        return { quantity: state.balances.get(balanceKey) };
      },
      update: async ({ where, data }) => {
        const balanceKey = key(where.branchId_variantId.branchId, where.branchId_variantId.variantId);
        state.balances.set(balanceKey, data.quantity);
        return { quantity: data.quantity };
      },
      findUnique: async ({ where }) => {
        const balanceKey = key(where.branchId_variantId.branchId, where.branchId_variantId.variantId);
        const quantity = state.balances.get(balanceKey);
        return quantity !== undefined ? { quantity } : null;
      },
    },
    inventoryLog: {
      create: async ({ data }) => state.logs.push(data),
    },
    $queryRawUnsafe: async (_query, _tenantId, branchId, variantId) => [{
      quantity: state.balances.get(key(branchId, variantId)),
    }],
  });

  return {
    state,
    transaction: async (callback) => {
      let release;
      const previous = queue;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(createTransaction());
      } finally {
        release();
      }
    },
    initialStock,
  };
};

const movement = (quantity, idempotencyKey, overrides = {}) => ({
  tenantId: "tenant-1",
  branchId: "branch-1",
  variantId: "variant-1",
  type: quantity < 0 ? "SALE" : "ADJUSTMENT",
  quantity,
  idempotencyKey,
  actorId: "user-1",
  ...overrides,
});

test("inventory movements keep branch balance and legacy Variant.stock in sync", async () => {
  const db = createMemoryDb();
  const result = await db.transaction((tx) =>
    applyMovementInTransaction(tx, movement(4, "opening:test")),
  );
  assert.equal(result.movement.previousStock, 0);
  assert.equal(result.movement.newStock, 4);
  assert.equal(db.state.balances.get("branch-1:variant-1"), 4);
  assert.equal(db.state.variant.stock, 4);
  assert.equal(db.state.logs[0].reason, "ADJUSTMENT");
});

test("inventory idempotency prevents applying the same movement twice", async () => {
  const db = createMemoryDb();
  await db.transaction((tx) => applyMovementInTransaction(tx, movement(4, "opening:replay")));
  const replay = await db.transaction((tx) =>
    applyMovementInTransaction(tx, movement(4, "opening:replay")),
  );
  assert.equal(replay.duplicate, true);
  assert.equal(db.state.balances.get("branch-1:variant-1"), 4);
  assert.equal(db.state.variant.stock, 4);
  assert.equal(db.state.movements.size, 1);
});

test("stock counts calculate their delta while holding the balance lock and are idempotent", async () => {
  const db = createMemoryDb();
  await db.transaction((tx) => applyMovementInTransaction(tx, movement(10, "opening:stock-count")));
  const input = {
    tenantId: "tenant-1",
    branchId: "branch-1",
    variantId: "variant-1",
    type: "STOCK_COUNT",
    countedStock: 7,
    idempotencyKey: "stock-count:target-seven",
    actorId: "user-1",
  };
  const counted = await db.transaction((tx) => applyMovementInTransaction(tx, input));
  const replay = await db.transaction((tx) => applyMovementInTransaction(tx, input));
  assert.equal(counted.movement.quantity, -3);
  assert.equal(counted.movement.newStock, 7);
  assert.equal(replay.duplicate, true);
  assert.equal(db.state.balances.get("branch-1:variant-1"), 7);
  assert.equal(db.state.variant.stock, 7);
});

test("negative stock is rejected unless tenant policy explicitly allows it", async () => {
  const db = createMemoryDb();
  await assert.rejects(
    db.transaction((tx) => applyMovementInTransaction(tx, movement(-1, "sale:empty"))),
    /Insufficient stock/,
  );
  assert.equal(db.state.variant.stock, 0);

  const allowedDb = createMemoryDb({ allowNegativeStock: true });
  const result = await allowedDb.transaction((tx) =>
    applyMovementInTransaction(tx, movement(-1, "sale:negative")),
  );
  assert.equal(result.movement.newStock, -1);
  assert.equal(allowedDb.state.variant.stock, -1);
});

test("tenant isolation rejects a branch or variant from another tenant", async () => {
  const db = createMemoryDb();
  await assert.rejects(
    db.transaction((tx) => applyMovementInTransaction(
      tx,
      movement(1, "cross-tenant", { tenantId: "tenant-other" }),
    )),
    /Branch not found/,
  );
});

test("concurrent sales cannot oversell the last unit", async () => {
  const db = createMemoryDb();
  await db.transaction((tx) => applyMovementInTransaction(tx, movement(1, "opening:one")));
  const results = await Promise.allSettled([
    db.transaction((tx) => applyMovementInTransaction(tx, movement(-1, "sale:first"))),
    db.transaction((tx) => applyMovementInTransaction(tx, movement(-1, "sale:second"))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.state.balances.get("branch-1:variant-1"), 0);
  assert.equal(db.state.variant.stock, 0);
});

test("legacy orders without a branch confirm and cancel against the default branch", async () => {
  const db = createMemoryDb();
  await db.transaction((tx) => applyMovementInTransaction(tx, movement(3, "opening:legacy-order")));
  const order = { id: "legacy-order-1", branchId: null };
  const items = [{ id: "legacy-item-1", variantId: "variant-1", quantity: 2 }];

  await db.transaction((tx) => applyOrderMovementsInTransaction(tx, {
    tenantId: "tenant-1",
    user: { id: "admin-1", role: "BUSINESS_ADMIN" },
    order,
    items,
    type: "SALE",
  }));
  assert.equal(db.state.balances.get("branch-1:variant-1"), 1);
  assert.equal(db.state.variant.stock, 1);

  await db.transaction((tx) => applyOrderMovementsInTransaction(tx, {
    tenantId: "tenant-1",
    user: { id: "admin-1", role: "BUSINESS_ADMIN" },
    order,
    items,
    type: "RETURN",
  }));
  assert.equal(db.state.balances.get("branch-1:variant-1"), 3);
  assert.equal(db.state.variant.stock, 3);
});
