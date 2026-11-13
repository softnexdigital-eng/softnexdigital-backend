const {
  getBranchPermissionCatalog,
  getEffectivePermissions,
} = require("../services/branchPermissions");

const BUSINESS_TYPES = new Set([
  "SUPERMARKET",
  "GROCERY",
  "RETAIL",
  "RESTAURANT",
  "CAFE",
  "CLOUD_KITCHEN",
  "TAILORING",
  "BOUTIQUE",
  "GARMENT_WORKSHOP",
  "UNIFORM_MANUFACTURER",
]);
const PROFILE_FIELDS = new Set([
  "name",
  "companyName",
  "tenantEmail",
  "phone",
  "phone2",
  "logo",
  "address",
  "timezone",
  "businessType",
  "currency",
  "currencySymbol",
  "taxPercentage",
  "deliveryCharge",
]);

const SETTING_FIELDS = new Set([
  "enabledModules",
  "businessConfig",
  "preferences",
  "socialLinks",
  "termsAndConditions",
  "timezone",
  "currency",
  "currencySymbol",
  "taxPercentage",
  "deliveryCharge",
  "allowNegativeStock",
]);

const BRANCH_FIELDS = new Set([
  "name",
  "code",
  "phone",
  "email",
  "address",
  "timezone",
  "openingHours",
  "managerId",
]);

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  phone2: true,
  companyName: true,
  tenantEmail: true,
  logo: true,
  address: true,
  timezone: true,
  currency: true,
  currencySymbol: true,
  taxPercentage: true,
  deliveryCharge: true,
  businessType: true,
  enabledModules: true,
  businessConfig: true,
  preferences: true,
  socialLinks: true,
  termsAndConditions: true,
  onboardingCompleted: true,
  createdAt: true,
  updatedAt: true,
};

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const isPlainObject = (value) => value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const validateObject = (value, field, maxBytes = 32768) => {
  if (!isPlainObject(value)) fail(400, `${field} must be a JSON object`);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
    fail(400, `${field} exceeds the maximum size`);
  }
  return value;
};

const validateOpeningHours = (value) => {
  validateObject(value, "openingHours", 8192);
  const days = new Set([
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  ]);
  for (const [day, hours] of Object.entries(value)) {
    if (!days.has(day)) fail(400, `openingHours contains an invalid day: ${day}`);
    if (!isPlainObject(hours)) fail(400, `openingHours.${day} must be an object`);
    if (hours.closed !== undefined && typeof hours.closed !== "boolean") {
      fail(400, `openingHours.${day}.closed must be a boolean`);
    }
    for (const key of ["open", "close"]) {
      if (hours[key] !== undefined &&
        (typeof hours[key] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours[key]))) {
        fail(400, `openingHours.${day}.${key} must use HH:mm format`);
      }
    }
    if (!hours.closed && Boolean(hours.open) !== Boolean(hours.close)) {
      fail(400, `openingHours.${day} must include both open and close times`);
    }
  }
  return value;
};

const parsePagination = (query) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1) fail(400, "page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail(400, "limit must be an integer between 1 and 100");
  }
  return { page, limit, skip: (page - 1) * limit };
};

const rejectUnknownFields = (body, allowed) => {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) fail(400, `Unsupported field: ${unknown[0]}`);
};

const validateString = (value, field, maxLength, options = {}) => {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") fail(400, `${field} must be a string`);
  const normalized = value.trim();
  if (!normalized && options.required) fail(400, `${field} is required`);
  if (normalized.length > maxLength) fail(400, `${field} must be at most ${maxLength} characters`);
  if (!normalized && options.nullable) return null;
  return normalized;
};

const normalizeCode = (value) => value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const validateBusinessProfile = (body) => {
  rejectUnknownFields(body, PROFILE_FIELDS);
  const data = {};
  const stringLimits = {
    name: 120,
    companyName: 160,
    tenantEmail: 254,
    phone: 40,
    phone2: 40,
    logo: 2048,
    address: 1000,
    timezone: 100,
    currency: 3,
    currencySymbol: 8,
  };
  for (const [field, maxLength] of Object.entries(stringLimits)) {
    if (body[field] === undefined) continue;
    const value = validateString(body[field], field, maxLength, {
      required: field === "name",
      nullable: !["name", "currency", "currencySymbol"].includes(field),
    });
    if (field === "currency" && !/^[A-Za-z]{3}$/.test(value)) {
      fail(400, "currency must be a three-letter currency code");
    }
    if (field === "tenantEmail" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      fail(400, "tenantEmail must be a valid email address");
    }
    if (field === "timezone" && value) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
      } catch {
        fail(400, "timezone must be a valid IANA timezone");
      }
    }
    data[field] = field === "currency" ? value.toUpperCase() : value;
  }
  if (body.businessType !== undefined) {
    if (!BUSINESS_TYPES.has(body.businessType)) fail(400, "businessType is invalid");
    data.businessType = body.businessType;
  }
  for (const field of ["taxPercentage", "deliveryCharge"]) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) {
      fail(400, `${field} must be a non-negative number`);
    }
    if (field === "taxPercentage" && value > 100) {
      fail(400, "taxPercentage must not exceed 100");
    }
    data[field] = value;
  }
  return data;
};

const validateBusinessSettings = (body) => {
  rejectUnknownFields(body, SETTING_FIELDS);
  const data = {};
  if (body.timezone !== undefined) {
    const timezone = validateString(body.timezone, "timezone", 100, { nullable: true });
    if (timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        fail(400, "timezone must be a valid IANA timezone");
      }
    }
    data.timezone = timezone;
  }
  if (body.currency !== undefined) {
    const currency = validateString(body.currency, "currency", 3, { required: true });
    if (!/^[A-Za-z]{3}$/.test(currency)) fail(400, "currency must be a three-letter currency code");
    data.currency = currency.toUpperCase();
  }
  if (body.currencySymbol !== undefined) {
    data.currencySymbol = validateString(body.currencySymbol, "currencySymbol", 8, { required: true });
  }
  for (const field of ["taxPercentage", "deliveryCharge"]) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) {
      fail(400, `${field} must be a non-negative number`);
    }
    if (field === "taxPercentage" && value > 100) {
      fail(400, "taxPercentage must not exceed 100");
    }
    data[field] = value;
  }
  if (body.enabledModules !== undefined) {
    if (!Array.isArray(body.enabledModules) || body.enabledModules.length > 100) {
      fail(400, "enabledModules must be an array of at most 100 module names");
    }
    const modules = body.enabledModules.map((moduleName) => {
      if (typeof moduleName !== "string" ||
        !/^[a-z][a-z0-9-]{0,49}$/.test(moduleName)) {
        fail(400, "enabledModules entries must be lowercase module identifiers");
      }
      return moduleName;
    });
    if (new Set(modules).size !== modules.length) fail(400, "enabledModules must not contain duplicates");
    data.enabledModules = modules;
  }
  for (const field of ["businessConfig", "preferences", "socialLinks"]) {
    if (body[field] !== undefined) data[field] = validateObject(body[field], field);
  }
  if (body.termsAndConditions !== undefined) {
    data.termsAndConditions = validateString(body.termsAndConditions, "termsAndConditions", 20000, {
      nullable: true,
    });
  }
  if (body.allowNegativeStock !== undefined) {
    if (typeof body.allowNegativeStock !== "boolean") {
      fail(400, "allowNegativeStock must be a boolean");
    }
    data.allowNegativeStock = body.allowNegativeStock;
  }
  return data;
};

const validateBranchData = (body, { partial = false, allowDefault = false } = {}) => {
  const allowedFields = new Set(BRANCH_FIELDS);
  if (allowDefault) allowedFields.add("isDefault");
  rejectUnknownFields(body, allowedFields);
  if (!partial && (typeof body.name !== "string" || !body.name.trim())) {
    fail(400, "name is required");
  }
  const data = {};
  const limits = { name: 120, code: 32, phone: 40, email: 254, address: 1000, timezone: 100 };
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] === undefined) continue;
    let value = validateString(body[field], field, limit, {
      required: field === "name" && !partial,
      nullable: ["phone", "email", "address", "timezone"].includes(field),
    });
    if (field === "code") {
      value = normalizeCode(value);
      if (!value || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)) fail(400, "code is invalid");
    }
    if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      fail(400, "email must be a valid email address");
    }
    if (field === "timezone" && value) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
      } catch {
        fail(400, "timezone must be a valid IANA timezone");
      }
    }
    data[field] = value;
  }
  if (body.openingHours !== undefined) data.openingHours = validateOpeningHours(body.openingHours);
  if (body.managerId !== undefined) {
    data.managerId = validateString(body.managerId, "managerId", 80, { nullable: true });
  }
  if (body.isDefault !== undefined && allowDefault && typeof body.isDefault !== "boolean") {
    fail(400, "isDefault must be a boolean");
  }
  return data;
};

const validatePermissions = (permissions) => {
  validateObject(permissions, "permissions", 8192);
  for (const [key, value] of Object.entries(permissions)) {
    if (!/^[a-z][a-z0-9.*-]{0,79}$/.test(key) || typeof value !== "boolean") {
      fail(400, "permissions must map permission identifiers to booleans");
    }
  }
  return permissions;
};

const createBusinessFoundationController = (prisma) => {
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(409).json({ success: false, message: "A record with the same unique value already exists" });
      }
      if (error.code === "P2025") {
        return res.status(404).json({ success: false, message: "Record not found" });
      }
      if (error.code === "P2003") {
        return res.status(400).json({ success: false, message: "Referenced record does not exist in this tenant" });
      }
      if (error.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      return next(error);
    }
  };

  const getTenant = async (tenantId) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) fail(404, "Tenant not found");
    return tenant;
  };

  const getBranch = async (tenantId, branchId) => {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) fail(404, "Branch not found");
    return branch;
  };

  const validateManager = async (tenantId, managerId) => {
    if (!managerId) return null;
    const manager = await prisma.user.findFirst({
      where: { id: managerId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!manager) fail(400, "managerId must belong to an active user in this tenant");
    return manager;
  };

  const ensureManagerMembership = async (tx, tenantId, branchId, managerId) => {
    if (!managerId) return;
    await tx.branchMembership.upsert({
      where: { branchId_userId: { branchId, userId: managerId } },
      create: {
        tenantId,
        branchId,
        userId: managerId,
        role: "BRANCH_MANAGER",
        permissions: {},
      },
      update: { isActive: true, role: "BRANCH_MANAGER" },
    });
  };

  return {
    getBusinessProfile: wrap(async (req, res) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user.tenantId },
        select: PROFILE_SELECT,
      });
      if (!tenant) fail(404, "Tenant not found");
      res.json({ success: true, data: tenant });
    }),

    updateBusinessProfile: wrap(async (req, res) => {
      const data = validateBusinessProfile(req.body || {});
      if (!Object.keys(data).length) fail(400, "At least one profile field is required");
      await getTenant(req.user.tenantId);
      const tenant = await prisma.tenant.update({
        where: { id: req.user.tenantId },
        data,
        select: PROFILE_SELECT,
      });
      res.json({ success: true, message: "Business profile updated", data: tenant });
    }),

    getBusinessSettings: wrap(async (req, res) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user.tenantId },
        select: {
          enabledModules: true,
          businessConfig: true,
          preferences: true,
          socialLinks: true,
          termsAndConditions: true,
          timezone: true,
          currency: true,
          currencySymbol: true,
          taxPercentage: true,
          deliveryCharge: true,
          allowNegativeStock: true,
        },
      });
      if (!tenant) fail(404, "Tenant not found");
      res.json({ success: true, data: tenant });
    }),

    updateBusinessSettings: wrap(async (req, res) => {
      const data = validateBusinessSettings(req.body || {});
      if (!Object.keys(data).length) fail(400, "At least one setting is required");
      await getTenant(req.user.tenantId);
      const tenant = await prisma.tenant.update({
        where: { id: req.user.tenantId },
        data,
        select: {
          enabledModules: true,
          businessConfig: true,
          preferences: true,
          socialLinks: true,
          termsAndConditions: true,
          allowNegativeStock: true,
        },
      });
      res.json({ success: true, message: "Business settings updated", data: tenant });
    }),

    listBranches: wrap(async (req, res) => {
      const { page, limit, skip } = parsePagination(req.query);
      const where = { tenantId: req.user.tenantId };
      if (!["SUPER_ADMIN", "TENANT_OWNER", "BUSINESS_ADMIN", "OWNER"].includes(req.user.role)) {
        where.memberships = { some: { tenantId: req.user.tenantId, userId: req.user.id, isActive: true } };
      }
      if (req.query.isActive !== undefined) {
        if (!["true", "false"].includes(req.query.isActive)) fail(400, "isActive must be true or false");
        where.isActive = req.query.isActive === "true";
      }
      if (req.query.search !== undefined) {
        const search = validateString(req.query.search, "search", 100);
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ];
      }
      const [branches, total] = await Promise.all([
        prisma.branch.findMany({
          where,
          include: { manager: { select: { id: true, name: true, email: true } } },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          skip,
          take: limit,
        }),
        prisma.branch.count({ where }),
      ]);
      res.json({ success: true, data: { branches, total, page, limit } });
    }),

    createBranch: wrap(async (req, res) => {
      const body = req.body || {};
      const data = validateBranchData(body, { allowDefault: true });
      await getTenant(req.user.tenantId);
      await validateManager(req.user.tenantId, data.managerId);
      const branchCount = await prisma.branch.count({ where: { tenantId: req.user.tenantId } });
      const isDefault = body.isDefault === true || branchCount === 0;
      if (!data.code) {
        const base = normalizeCode(data.name).slice(0, 24) || "BRANCH";
        data.code = base;
        let suffix = 2;
        while (await prisma.branch.findFirst({
          where: { tenantId: req.user.tenantId, code: data.code },
          select: { id: true },
        })) {
          data.code = `${base.slice(0, 27)}-${suffix++}`;
        }
      }
      const branch = await prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.branch.updateMany({
            where: { tenantId: req.user.tenantId, isDefault: true },
            data: { isDefault: false },
          });
        }
        const created = await tx.branch.create({
          data: { ...data, tenantId: req.user.tenantId, isDefault },
          include: { manager: { select: { id: true, name: true, email: true } } },
        });
        await ensureManagerMembership(tx, req.user.tenantId, created.id, data.managerId);
        return created;
      });
      res.status(201).json({ success: true, data: branch });
    }),

    getBranch: wrap(async (req, res) => {
      const branch = await prisma.branch.findFirst({
        where: { id: req.params.branchId, tenantId: req.user.tenantId },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { memberships: true } },
        },
      });
      if (!branch) fail(404, "Branch not found");
      res.json({ success: true, data: branch });
    }),

    updateBranch: wrap(async (req, res) => {
      const data = validateBranchData(req.body || {}, { partial: true });
      if (!Object.keys(data).length) fail(400, "At least one branch field is required");
      const current = await getBranch(req.user.tenantId, req.params.branchId);
      await validateManager(req.user.tenantId, data.managerId);
      const branch = await prisma.$transaction(async (tx) => {
        const updated = await tx.branch.update({
          where: { id: req.params.branchId },
          data,
          include: { manager: { select: { id: true, name: true, email: true } } },
        });
        if (data.managerId !== undefined && current.managerId &&
          current.managerId !== data.managerId) {
          await tx.branchMembership.updateMany({
            where: {
              tenantId: req.user.tenantId,
              branchId: updated.id,
              userId: current.managerId,
              role: "BRANCH_MANAGER",
            },
            data: { role: "STAFF" },
          });
        }
        await ensureManagerMembership(tx, req.user.tenantId, updated.id, data.managerId);
        return updated;
      });
      res.json({ success: true, message: "Branch updated", data: branch });
    }),

    updateBranchStatus: wrap(async (req, res) => {
      const body = req.body || {};
      if (typeof body.isActive !== "boolean") fail(400, "isActive must be a boolean");
      const branch = await getBranch(req.user.tenantId, req.params.branchId);
      if (body.isActive === false) {
        const nextDefault = branch.isDefault
          ? await prisma.branch.findFirst({
            where: { tenantId: req.user.tenantId, isActive: true, id: { not: branch.id } },
            orderBy: { createdAt: "asc" },
          })
          : null;
        if (branch.isDefault && !nextDefault) {
          fail(400, "The only active branch cannot be deactivated");
        }
        const updated = await prisma.$transaction(async (tx) => {
          if (nextDefault) {
            await tx.branch.update({
              where: { id: branch.id },
              data: { isDefault: false, isActive: false },
            });
            await tx.branch.update({
              where: { id: nextDefault.id },
              data: { isDefault: true },
            });
            return tx.branch.findFirst({ where: { id: branch.id, tenantId: req.user.tenantId } });
          }
          return tx.branch.update({
            where: { id: branch.id },
            data: { isActive: false },
          });
        });
        return res.json({
          success: true,
          message: "Branch deactivated",
          data: updated,
        });
      }
      const updated = await prisma.branch.update({
        where: { id: branch.id },
        data: { isActive: true },
      });
      res.json({ success: true, message: "Branch activated", data: updated });
    }),

    setDefaultBranch: wrap(async (req, res) => {
      await getBranch(req.user.tenantId, req.params.branchId);
      const branch = await prisma.$transaction(async (tx) => {
        await tx.branch.updateMany({
          where: { tenantId: req.user.tenantId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.branch.update({
          where: { id: req.params.branchId },
          data: { isDefault: true, isActive: true },
          include: { manager: { select: { id: true, name: true, email: true } } },
        });
      });
      res.json({ success: true, message: "Default branch updated", data: branch });
    }),

    getBranchPermissionCatalog: async (req, res) => {
      res.json({ success: true, data: getBranchPermissionCatalog() });
    },

    listBranchMembers: wrap(async (req, res) => {
      const { page, limit, skip } = parsePagination(req.query);
      const where = {
        tenantId: req.user.tenantId,
        branchId: req.params.branchId,
      };
      if (req.query.isActive !== undefined) {
        if (!["true", "false"].includes(req.query.isActive)) fail(400, "isActive must be true or false");
        where.isActive = req.query.isActive === "true";
      }
      const [memberships, total] = await Promise.all([
        prisma.branchMembership.findMany({
          where,
          include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          skip,
          take: limit,
        }),
        prisma.branchMembership.count({ where }),
      ]);
      res.json({
        success: true,
        data: {
          memberships: memberships.map((membership) => ({
            ...membership,
            effectivePermissions: getEffectivePermissions(membership.role, membership.permissions),
          })),
          total,
          page,
          limit,
        },
      });
    }),

    addBranchMember: wrap(async (req, res) => {
      const body = req.body || {};
      const userId = validateString(body.userId, "userId", 80, { required: true });
      const role = body.role === undefined
        ? "STAFF"
        : validateString(body.role, "role", 50, { required: true }).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(role)) fail(400, "role must be an uppercase role identifier");
      const permissions = body.permissions === undefined ? {} : validatePermissions(body.permissions);
      const user = await prisma.user.findFirst({
        where: { id: userId, tenantId: req.user.tenantId, isActive: true },
        select: { id: true },
      });
      if (!user) fail(400, "userId must belong to an active user in this tenant");
      const membership = await prisma.branchMembership.upsert({
        where: {
          branchId_userId: { branchId: req.params.branchId, userId },
        },
        create: {
          tenantId: req.user.tenantId,
          branchId: req.params.branchId,
          userId,
          role,
          permissions,
          isActive: true,
        },
        update: { role, permissions, isActive: true },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      res.status(201).json({
        success: true,
        data: { ...membership, effectivePermissions: getEffectivePermissions(role, permissions) },
      });
    }),

    updateBranchMember: wrap(async (req, res) => {
      const body = req.body || {};
      const data = {};
      if (body.role !== undefined) {
        data.role = validateString(body.role, "role", 50, { required: true }).toUpperCase();
        if (!/^[A-Z][A-Z0-9_]*$/.test(data.role)) fail(400, "role must be an uppercase role identifier");
        if (body.permissions === undefined) data.permissions = {};
      }
      if (body.permissions !== undefined) data.permissions = validatePermissions(body.permissions);
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== "boolean") fail(400, "isActive must be a boolean");
        data.isActive = body.isActive;
      }
      if (!Object.keys(data).length) fail(400, "At least one membership field is required");
      const current = await prisma.branchMembership.findFirst({
        where: {
          id: req.params.membershipId,
          tenantId: req.user.tenantId,
          branchId: req.params.branchId,
        },
      });
      if (!current) fail(404, "Branch membership not found");
      const membership = await prisma.branchMembership.update({
        where: { id: current.id },
        data,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      res.json({
        success: true,
        message: "Branch membership updated",
        data: {
          ...membership,
          effectivePermissions: getEffectivePermissions(membership.role, membership.permissions),
        },
      });
    }),

    removeBranchMember: wrap(async (req, res) => {
      const membership = await prisma.branchMembership.findFirst({
        where: {
          id: req.params.membershipId,
          tenantId: req.user.tenantId,
          branchId: req.params.branchId,
        },
      });
      if (!membership) fail(404, "Branch membership not found");
      const updated = await prisma.branchMembership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });
      res.json({ success: true, message: "Branch membership deactivated", data: updated });
    }),
  };
};

module.exports = {
  BUSINESS_TYPES,
  createBusinessFoundationController,
  validateBranchData,
  validateBusinessProfile,
  validateBusinessSettings,
  validateOpeningHours,
};
