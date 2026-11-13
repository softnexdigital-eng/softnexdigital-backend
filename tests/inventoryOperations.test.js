const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const modelsPath = require.resolve("../models");
const controllerPath = require.resolve("../controllers/inventoryOperationsController");
const originalModelsModule = require.cache[modelsPath];

const fakePrisma = {
  branchInventory: {
    findMany: async ({ where }) => {
      fakePrisma.lastBalanceWhere = where;
      return [];
    },
    count: async ({ where }) => {
      fakePrisma.lastBalanceCountWhere = where;
      return 0;
    },
  },
  inventoryMovement: {
    findMany: async ({ where }) => {
      fakePrisma.lastMovementWhere = where;
      return [];
    },
    count: async ({ where }) => {
      fakePrisma.lastMovementCountWhere = where;
      return 0;
    },
  },
};

require.cache[modelsPath] = {
  ...originalModelsModule,
  exports: fakePrisma,
};
delete require.cache[controllerPath];
const controller = require(controllerPath);
after(() => {
  require.cache[modelsPath] = originalModelsModule;
  delete require.cache[controllerPath];
});

const call = async (handler, req) => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let forwarded;
  await handler(req, res, (error) => { forwarded = error; });
  if (forwarded) throw forwarded;
  return res;
};

test("inventory reads scope every query to the authenticated tenant and authorized branch", async () => {
  const req = {
    user: { tenantId: "tenant-1", id: "staff-1" },
    branch: { id: "branch-1" },
    query: { page: "1", limit: "25" },
  };
  const balances = await call(controller.listBalances, req);
  const movements = await call(controller.listMovements, req);
  assert.equal(balances.body.success, true);
  assert.equal(movements.body.success, true);
  assert.deepEqual(fakePrisma.lastBalanceWhere, { tenantId: "tenant-1", branchId: "branch-1" });
  assert.deepEqual(fakePrisma.lastMovementWhere, { tenantId: "tenant-1", branchId: "branch-1" });
});

test("inventory movement filters reject invalid types and date ranges", async () => {
  const invalidType = await call(controller.listMovements, {
    user: { tenantId: "tenant-1" },
    branch: { id: "branch-1" },
    query: { type: "NOT_A_MOVEMENT" },
  });
  assert.equal(invalidType.statusCode, 400);
  assert.equal(invalidType.body.success, false);

  await assert.rejects(
    call(controller.listAdjustments, {
      user: { tenantId: "tenant-1" },
      branch: { id: "branch-1" },
      query: { startDate: "2026-12-01", endDate: "2026-11-01" },
    }),
    /startDate must be before endDate/,
  );
});
