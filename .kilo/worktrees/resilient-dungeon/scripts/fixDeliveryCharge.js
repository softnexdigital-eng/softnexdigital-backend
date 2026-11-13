/**
 * Migration Script: Fix Delivery Charge for Existing Orders
 * 
 * This script backfills deliveryCharge for orders that were created
 * before the deliveryCharge field was added to the Order schema.
 * 
 * Usage: node scripts/fixDeliveryCharge.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDeliveryCharge() {
  console.log('Starting delivery charge backfill...\n');
  
  try {
    // Get all orders with deliveryCharge = 0 or null
    const orders = await prisma.order.findMany({
      where: {
        deliveryCharge: { lte: 0 },
      },
      include: {
        tenant: true,
      },
    });

    console.log(`Found ${orders.length} orders with zero delivery charge.\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      const tenantDeliveryCharge = order.tenant?.deliveryCharge || 0;
      
      if (tenantDeliveryCharge > 0) {
        // Recalculate total with delivery charge
        const newTotal = order.subtotal + tenantDeliveryCharge;
        
        await prisma.order.update({
          where: { id: order.id },
          data: {
            deliveryCharge: tenantDeliveryCharge,
            total: newTotal,
          },
        });
        
        console.log(`✅ Order ${order.orderNumber}: deliveryCharge = 0 → ${tenantDeliveryCharge}, total = ${order.total} → ${newTotal}`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✅ Complete! Updated ${updatedCount} orders, skipped ${skippedCount} (tenant has no delivery charge).`);
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDeliveryCharge();