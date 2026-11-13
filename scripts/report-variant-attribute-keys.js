#!/usr/bin/env node
/**
 * Read-only report: variant attribute key consistency per product/tenant.
 * Prints products whose variants use different attribute key sets, variants with empty attributes,
 * and variants with array/JSON-string attribute values (legacy).
 *
 * Usage: node scripts/report-variant-attribute-keys.js
 */
const prisma = require('../models');

function isJsonArrayString(v) {
  return typeof v === 'string' && v.trim().startsWith('[') && v.trim().endsWith(']');
}

function analyzeVariantAttributes(attrs) {
  const issues = [];
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    issues.push('attributes is empty or not an object');
    return { keys: [], issues };
  }
  const keys = Object.keys(attrs);
  if (keys.length === 0) issues.push('attributes object is empty');
  for (const [k, v] of Object.entries(attrs)) {
    if (Array.isArray(v)) issues.push(`key "${k}" has array value`);
    else if (isJsonArrayString(v)) issues.push(`key "${k}" has JSON-string array value`);
  }
  return { keys, issues };
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log(`Tenants: ${tenants.length}`);

  let totalProducts = 0;
  let flaggedProducts = 0;
  let flaggedVariants = 0;

  for (const tenant of tenants) {
    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        slug: true,
        variants: { select: { id: true, sku: true, attributes: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    totalProducts += products.length;

    for (const product of products) {
      const variants = product.variants || [];
      if (variants.length === 0) continue;

      const keySets = new Set();
      const variantReports = [];
      for (const v of variants) {
        const { keys, issues } = analyzeVariantAttributes(v.attributes);
        const keySig = [...keys].sort().join('|');
        keySets.add(keySig);
        if (issues.length > 0) {
          variantReports.push({ variantId: v.id, sku: v.sku, issues, keys });
          flaggedVariants++;
        }
      }

      const inconsistentKeys = keySets.size > 1;
      if (inconsistentKeys || variantReports.length > 0) {
        flaggedProducts++;
        console.log('\n---');
        console.log(`Tenant: ${tenant.name || tenant.id} (${tenant.slug || tenant.id})`);
        console.log(`Product: ${product.name} (${product.slug || product.id}) [${variants.length} variants]`);
        if (inconsistentKeys) {
          console.log(`  ! Inconsistent attribute key sets across variants: ${[...keySets].map(s => `[${s || '(empty)'}]`).join(' vs ')}`);
        }
        for (const vr of variantReports) {
          console.log(`  Variant ${vr.sku} (${vr.variantId}) keys=[${vr.keys.join(', ')}]: ${vr.issues.join('; ')}`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Products scanned: ${totalProducts}`);
  console.log(`Products flagged: ${flaggedProducts}`);
  console.log(`Variants with attribute issues: ${flaggedVariants}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
