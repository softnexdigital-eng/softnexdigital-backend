const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const modelsPath = require.resolve("../models");
const controllerPath = require.resolve("../controllers/purchaseController");
const servicePath = require.resolve("../services/purchaseService");
const originalModelsModule = require.cache[modelsPath];
const originalControllerModule = require.cache[controllerPath];
const originalServiceModule = require.cache[servicePath];

const fakePrisma = {
  tenant: {
    findUnique: async ({ where }) => {
      if (where.id === "tenant-1") return { id: "tenant-1", orderCounter: 0 };
      if (where.id === "tenant-2") return { id: "tenant-2", orderCounter: 0 };
      return null;
    },
    update: async ({ where, data, select }) => {
      if (where.id === "tenant-1" && data.orderCounter) {
        fakePrisma.lastOrderCounter = (fakePrisma.lastOrderCounter || 0) + 1;
        return { orderCounter: fakePrisma.lastOrderCounter };
      }
      return null;
    },
  },
  supplier: {
    findFirst: async ({ where }) => {
      if (where.id === "supplier-1" && where.tenantId === "tenant-1" && where.isActive === true) {
        return { id: "supplier-1", name: "Test Supplier", tenantId: "tenant-1" };
      }
      return null;
    },
  },
  branch: {
    findFirst: async ({ where }) => {
      if (where.tenantId === "tenant-1" && (!where.id || where.id === "branch-1")) {
        return { id: "branch-1", tenantId: "tenant-1", isDefault: true, isActive: true, managerId: null };
      }
      return null;
    },
  },
  variant: {
    findMany: async ({ where }) => {
      const variantIds = where.id?.in || [];
      return variantIds.map((id) => ({
        id,
        sku: `SKU-${id}`,
        costPrice: 10,
        productId: "product-1",
        supplierId: "supplier-1",
        product: { tenantId: "tenant-1" },
      }));
    },
    findFirst: async ({ where }) => {
      if (where.id === "variant-1" && where.product?.tenantId === "tenant-1") {
        return { id: "variant-1", sku: "SKU-1", costPrice: 10, productId: "product-1" };
      }
      return null;
    },
  },
  purchaseOrder: {
    create: async ({ data, include }) => {
      const orderNumber = `PO-TEST-${Date.now()}`;
      fakePrisma.lastPurchaseOrder = {
        id: `po-${Date.now()}`,
        ...data,
        orderNumber,
        items: data.items?.create?.map((item, idx) => ({
          id: `po-item-${idx}`,
          ...item,
          variant: { id: item.variantId, sku: `SKU-${item.variantId}`, attributes: {} },
        })) || [],
        supplier: { id: data.supplierId, name: "Test Supplier" },
        branch: { id: data.branchId, name: "Main Branch", code: "MB" },
      };
      return fakePrisma.lastPurchaseOrder;
    },
    findFirst: async ({ where, include }) => {
      if (where.branchId && where.branchId !== "branch-1") return null;
      if (where.id === fakePrisma.lastPurchaseOrder?.id) return fakePrisma.lastPurchaseOrder;
      if (where.id === "po-received") {
        return {
          id: "po-received",
          tenantId: "tenant-1",
          supplierId: "supplier-1",
          branchId: "branch-1",
          orderNumber: "PO-RECEIVED-001",
          status: "ORDERED",
          subtotal: 100,
          taxAmount: 0,
          totalAmount: 100,
          items: [
            { id: "po-item-1", purchaseOrderId: "po-received", variantId: "variant-1", quantity: 10, receivedQty: 0, costPrice: 10, variant: { id: "variant-1", sku: "SKU-1", costPrice: 10 } },
          ],
          branch: { id: "branch-1", isActive: true },
        };
      }
      if (where.id === "po-partially-received") {
        return {
          id: "po-partially-received",
          tenantId: "tenant-1",
          supplierId: "supplier-1",
          branchId: "branch-1",
          orderNumber: "PO-PARTIAL-001",
          status: "PARTIALLY_RECEIVED",
          subtotal: 100,
          taxAmount: 0,
          totalAmount: 100,
          items: [
            { id: "po-item-1", purchaseOrderId: "po-partially-received", variantId: "variant-1", quantity: 10, receivedQty: 3, costPrice: 10, variant: { id: "variant-1", sku: "SKU-1", costPrice: 10 } },
          ],
          branch: { id: "branch-1", isActive: true },
        };
      }
      if (where.id === "po-1") {
        return {
          id: "po-1",
          tenantId: "tenant-1",
          supplierId: "supplier-1",
          branchId: "branch-1",
          orderNumber: "PO-001",
          status: "DRAFT",
          subtotal: 100,
          taxAmount: 0,
          totalAmount: 100,
          supplier: { id: "supplier-1", name: "Test Supplier" },
          branch: { id: "branch-1", name: "Main Branch", code: "MB" },
          items: [{ id: "po-item-1", variantId: "variant-1" }],
        };
      }
      return null;
    },
    findMany: async ({ where, include, orderBy, skip, take }) => {
      return [
        {
          id: "po-1",
          tenantId: "tenant-1",
          supplierId: "supplier-1",
          branchId: "branch-1",
          orderNumber: "PO-001",
          status: "DRAFT",
          subtotal: 100,
          taxAmount: 0,
          totalAmount: 100,
          supplier: { id: "supplier-1", name: "Test Supplier" },
          branch: { id: "branch-1", name: "Main Branch", code: "MB" },
          items: [{ id: "po-item-1", variantId: "variant-1" }],
        },
      ];
    },
    count: async ({ where }) => 1,
    update: async ({ where, data, include }) => {
      fakePrisma.lastPurchaseOrder = { ...fakePrisma.lastPurchaseOrder, ...data, id: where.id };
      return fakePrisma.lastPurchaseOrder;
    },
  },
  branchMembership: {
    findFirst: async ({ where }) => ({
      id: "membership-1",
      tenantId: where.tenantId,
      branchId: where.branchId,
      userId: where.userId,
      isActive: true,
      permissions: { "purchase.receive": true },
    }),
  },
  purchaseOrderItem: {
    findMany: async ({ where }) => {
      return [
        { id: "po-item-1", purchaseOrderId: "po-received", variantId: "variant-1", quantity: 10, receivedQty: 0, costPrice: 10, variant: { id: "variant-1", sku: "SKU-1", costPrice: 10 } },
      ];
    },
    update: async ({ where, data }) => {
      return { ...fakePrisma.lastPurchaseOrder?.items[0], ...data };
    },
  },
  purchaseReceipt: {
    create: async ({ data, include }) => {
      return {
        id: `receipt-${Date.now()}`,
        ...data,
        items: data.items?.create?.map((item, idx) => ({
          id: `receipt-item-${idx}`,
          ...item,
          variant: { id: item.variantId, sku: `SKU-${item.variantId}`, attributes: {} },
        })) || [],
      };
    },
  },
  inventoryMovement: {
    findUnique: async ({ where }) => null,
  },
  $queryRawUnsafe: async () => [],
  supplierPayment: {
    create: async ({ data, include }) => {
      return {
        id: `payment-${Date.now()}`,
        ...data,
        supplier: { id: data.supplierId, name: "Test Supplier" },
        purchaseOrder: data.purchaseOrderId ? { id: data.purchaseOrderId, orderNumber: "PO-001" } : null,
      };
    },
    findMany: async ({ where, include, orderBy, skip, take }) => {
      return [];
    },
    count: async ({ where }) => 0,
  },
  $transaction: async (callback) => {
    return callback(fakePrisma);
  },
};

require.cache[modelsPath] = {
  ...originalModelsModule,
  exports: fakePrisma,
};
delete require.cache[controllerPath];
delete require.cache[servicePath];
const controller = require(controllerPath);
const service = require(servicePath);

after(() => {
  require.cache[modelsPath] = originalModelsModule;
  require.cache[controllerPath] = originalControllerModule;
  require.cache[servicePath] = originalServiceModule;
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

test("createPurchaseOrder validates required fields", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    body: { supplierId: "supplier-1", items: [] },
  };
  await assert.rejects(call(controller.createPurchaseOrder, req), /At least one item is required/);
});

test("createPurchaseOrder requires supplierId", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    body: { supplierId: "", items: [{ variantId: "variant-1", quantity: 5 }] },
  };
  await assert.rejects(call(controller.createPurchaseOrder, req), /supplierId is required/);
});

test("createPurchaseOrder creates draft order with items", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    body: {
      supplierId: "supplier-1",
      items: [{ variantId: "variant-1", quantity: 5, costPrice: 20 }],
      notes: "Test order",
    },
  };
  const result = await call(controller.createPurchaseOrder, req);
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.status, "DRAFT");
  assert.equal(result.body.data.items.length, 1);
  assert.equal(result.body.data.items[0].quantity, 5);
  assert.equal(result.body.data.subtotal, 100);
});

test("submitPurchaseOrder requires DRAFT status", async () => {
  fakePrisma.lastPurchaseOrder = {
    id: "po-1",
    tenantId: "tenant-1",
    status: "ORDERED",
    items: [{ id: "po-item-1" }],
  };
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    params: { id: "po-1" },
  };
  await assert.rejects(call(controller.submitPurchaseOrder, req), /Only draft purchase orders can be submitted/);
});

test("receivePurchaseOrder validates items and quantities", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    params: { id: "po-received" },
    body: { items: [] },
  };
  await assert.rejects(call(controller.receivePurchaseOrder, req), /At least one receipt item is required/);
});

test("receivePurchaseOrder rejects over-receiving", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    params: { id: "po-received" },
    body: { items: [{ purchaseOrderItemId: "po-item-1", quantity: 15 }] },
  };
  await assert.rejects(call(controller.receivePurchaseOrder, req), /Received quantity exceeds ordered quantity/);
});

test("createSupplierPayment validates required fields", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    body: { amount: 100, method: "CASH" },
  };
  await assert.rejects(call(controller.createSupplierPayment, req), /supplierId is required/);
});

test("createSupplierPayment creates payment record", async () => {
  const req = {
    prisma: fakePrisma,
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    body: { supplierId: "supplier-1", amount: 500, method: "BANK_TRANSFER", reference: "TXN-123" },
  };
  const result = await call(controller.createSupplierPayment, req);
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.amount, 500);
});

test("createSupplierPayment rejects an amount above the purchase order balance", async () => {
  const tx = {
    supplier: { findFirst: async () => ({ id: "supplier-1" }) },
    purchaseOrder: {
      findFirst: async () => ({ id: "po-1", totalAmount: 100, status: "DRAFT" }),
    },
    supplierPayment: {
      findMany: async () => [],
      create: async () => {
        throw new Error("Overpayment must not be persisted");
      },
    },
    $queryRawUnsafe: async () => [],
  };
  await assert.rejects(
    service.createSupplierPayment(tx, {
      tenantId: "tenant-1",
      user: { id: "user-1" },
      supplierId: "supplier-1",
      purchaseOrderId: "po-1",
      amount: 101,
      method: "CASH",
    }),
    /Payment exceeds the remaining amount due/,
  );
});

test("service layer: generateOrderNumber increments counter", async () => {
  const tx = {
    tenant: {
      update: async ({ where, data, select }) => {
        return { orderCounter: 5 };
      },
    },
  };
  const { generateOrderNumber } = service;
  const orderNumber = await generateOrderNumber(tx, "tenant-1");
  assert.ok(orderNumber.startsWith("PO-"));
  assert.ok(orderNumber.includes("-0005-"));
});

test("receivePurchaseOrder applies stock and branch permission for authorized members", async () => {
  const order = {
    id: "po-receive-success",
    tenantId: "tenant-1",
    supplierId: "supplier-1",
    branchId: "branch-1",
    orderNumber: "PO-RECEIVE-001",
    status: "ORDERED",
    items: [{
      id: "po-item-receive",
      purchaseOrderId: "po-receive-success",
      variantId: "variant-1",
      quantity: 10,
      receivedQty: 0,
      costPrice: 10,
      variant: { id: "variant-1", sku: "SKU-1", costPrice: 10 },
    }],
    branch: { id: "branch-1", isActive: true },
  };
  let stock = 0;
  const tx = {
    purchaseOrder: {
      findFirst: async ({ where }) =>
        where.branchId && where.branchId !== order.branchId ? null : order,
      update: async ({ data }) => Object.assign(order, data),
    },
    purchaseOrderItem: {
      update: async ({ where, data }) => {
        const item = order.items.find((candidate) => candidate.id === where.id);
        Object.assign(item, data);
        return item;
      },
    },
    purchaseReceipt: {
      create: async ({ data }) => ({
        id: "receipt-receive-001",
        ...data,
        items: data.items.create,
      }),
    },
    branch: {
      findFirst: async ({ where }) => ({
        id: where.id,
        isActive: true,
        managerId: null,
      }),
    },
    branchMembership: {
      findFirst: async () => ({
        id: "membership-1",
        permissions: { "purchase.receive": true },
      }),
    },
    branchInventory: {
      upsert: async () => ({ quantity: stock }),
      findUnique: async () => ({ quantity: stock }),
      update: async ({ data }) => {
        stock = data.quantity;
        return { quantity: stock };
      },
    },
    inventoryMovement: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: "movement-1", ...data }),
    },
    inventoryLog: { create: async () => ({}) },
    $queryRawUnsafe: async () => [],
    tenant: { findUnique: async () => ({ allowNegativeStock: false }) },
    variant: {
      findFirst: async () => ({ id: "variant-1" }),
      update: async () => ({ id: "variant-1" }),
    },
  };

  const result = await service.receivePurchaseOrder(tx, {
    tenantId: "tenant-1",
    user: { id: "user-1", role: "BRANCH_MANAGER" },
    purchaseOrderId: order.id,
    branchId: "branch-1",
    items: [{ purchaseOrderItemId: "po-item-receive", quantity: 10 }],
  });

  assert.equal(result.order.status, "RECEIVED");
  assert.equal(order.items[0].receivedQty, 10);
  assert.equal(stock, 10);
});

test("receivePurchaseOrder rejects a branch member without receive permission", async () => {
  const tx = {
    branch: {
      findFirst: async () => ({ id: "branch-1", isActive: true, managerId: null }),
    },
    branchMembership: {
      findFirst: async () => ({ id: "membership-1", permissions: {} }),
    },
  };
  await assert.rejects(
    service.resolveBranchForPurchase(tx, {
      tenantId: "tenant-1",
      user: { id: "user-1", role: "BRANCH_MANAGER" },
      branchId: "branch-1",
      permission: "purchase.receive",
    }),
    /Branch permission purchase.receive is required/,
  );
});

test("purchase detail cannot be read through a different authorized branch", async () => {
  const req = {
    user: { tenantId: "tenant-1", id: "user-1", role: "BUSINESS_ADMIN" },
    branch: { id: "branch-2" },
    params: { id: "po-1" },
  };
  await assert.rejects(call(controller.getPurchaseOrder, req), /Purchase order not found/);
});