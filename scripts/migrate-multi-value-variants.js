require('dotenv').config();
const prisma = require('../models');

function splitLegacyValue(value) {
  if (Array.isArray(value)) return value.flatMap(splitLegacyValue);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.flatMap(splitLegacyValue);
    } catch {
      return [];
    }
  }
  return trimmed.includes(',')
    ? trimmed.split(',').map((part) => part.trim()).filter(Boolean)
    : [trimmed];
}

function hasLegacyValues(attributes) {
  return Object.values(attributes || {}).some((value) => {
    if (Array.isArray(value)) return true;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        return Array.isArray(JSON.parse(trimmed));
      } catch {
        return false;
      }
    }
    return trimmed.split(',').filter(Boolean).length > 1;
  });
}

function expandAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return [];
  const entries = Object.entries(attributes).map(([key, value]) => [key, [...new Set(splitLegacyValue(value))]]);
  if (entries.some(([, values]) => values.length === 0)) return [];
  return entries.reduce(
    (combinations, [key, values]) =>
      combinations.flatMap((combination) => values.map((value) => ({ ...combination, [key]: value }))),
    [{}],
  );
}

function combinationKey(attributes) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function imageForCombination(variant, combination) {
  const images = variant.variantImages || [];
  const colorKey = Object.keys(combination).find((key) => key.toLowerCase().includes('color'));
  if (colorKey) {
    const color = combination[colorKey].toLowerCase();
    const matching = images.find(
      (image) => image.color?.toLowerCase() === color || image.altText?.toLowerCase() === color,
    );
    if (matching) return matching;
  }
  return images.find((image) => image.isPrimary) || images[0] || null;
}

async function uniqueSku(baseSku) {
  let sku = baseSku.slice(0, 180);
  let suffix = 1;
  while (await prisma.variant.findUnique({ where: { sku }, select: { id: true } })) {
    sku = `${baseSku.slice(0, 170)}-${suffix++}`;
  }
  return sku;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const productArg = process.argv.indexOf('--product');
  const productId = productArg >= 0 ? process.argv[productArg + 1] : undefined;
  const legacyVariants = await prisma.variant.findMany({
    where: productId ? { productId } : undefined,
    orderBy: { id: 'asc' },
    include: { variantImages: true },
  });
  let migrated = 0;
  let created = 0;
  let skipped = 0;

  for (const variant of legacyVariants) {
    if (!hasLegacyValues(variant.attributes)) continue;
    const combinations = expandAttributes(variant.attributes);
    if (combinations.length === 0) {
      console.warn(`Skipped ${variant.id}: attributes contain no usable scalar values.`);
      continue;
    }

    const existing = await prisma.variant.findMany({
      where: { productId: variant.productId, id: { not: variant.id } },
      select: { attributes: true },
    });
    const existingCombinations = new Set(
      existing.map((entry) => combinationKey(entry.attributes || {})),
    );
    if (!apply) {
      migrated++;
      created += combinations.slice(1).filter((combo) => !existingCombinations.has(combinationKey(combo))).length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.variant.findUnique({ where: { id: variant.id } });
      if (!current || !hasLegacyValues(current.attributes)) return;
      const primaryImage = imageForCombination(variant, combinations[0]);
      await tx.variant.update({
        where: { id: current.id },
        data: { attributes: combinations[0], image: primaryImage?.url || current.image },
      });
      await tx.variantImage.deleteMany({ where: { variantId: current.id } });
      if (primaryImage) {
        await tx.variantImage.create({
          data: {
            variantId: current.id,
            url: primaryImage.url,
            altText: primaryImage.altText,
            color: primaryImage.color,
            isPrimary: primaryImage.isPrimary,
            sortOrder: primaryImage.sortOrder,
          },
        });
      }
      existingCombinations.add(combinationKey(combinations[0]));

      for (let index = 1; index < combinations.length; index++) {
        const combination = combinations[index];
        const key = combinationKey(combination);
        if (existingCombinations.has(key)) {
          skipped++;
          continue;
        }
        const sku = await uniqueSku(`${current.sku}-M${index + 1}`);
        const combinationImage = imageForCombination(variant, combination);
        const createdVariant = await tx.variant.create({
          data: {
            productId: current.productId,
            sku,
            attributes: combination,
            price: current.price,
            compareAtPrice: current.compareAtPrice,
            costPrice: current.costPrice,
            stock: 0,
            image: combinationImage?.url || current.image,
            supplierId: current.supplierId,
          },
        });
        if (combinationImage) {
          await tx.variantImage.create({
            data: {
              variantId: createdVariant.id,
              url: combinationImage.url,
              altText: combinationImage.altText,
              color: combinationImage.color,
              isPrimary: combinationImage.isPrimary,
              sortOrder: combinationImage.sortOrder,
            },
          });
        }
        existingCombinations.add(key);
        created++;
      }
    });
    migrated++;
  }

  console.log(
    `${apply ? 'Applied' : 'Dry run'}: ${migrated} legacy variant(s) inspected; ${created} new variant(s) ${apply ? 'created' : 'would be created'}; ${skipped} duplicate combination(s) skipped.`,
  );
  if (!apply) console.log('No data changed. Re-run with --apply to perform this migration.');
}

main()
  .catch((error) => {
    console.error('Variant migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
