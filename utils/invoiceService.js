const PDFDocument = require('pdfkit');

async function generateInvoice(order) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const currencySymbol = order.tenant?.currencySymbol || '৳';
    const formatCurrency = (amount) => `${currencySymbol}${Number(amount).toFixed(2)}`;

    // Header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Order #: ${order.orderNumber}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
    doc.text(`Status: ${order.status}`);
    doc.moveDown();
    doc.text(`Customer: ${order.customerName}`);
    doc.text(`Phone: ${order.customerPhone}`);
    if (order.customerAddress) doc.text(`Address: ${order.customerAddress}`);
    if (order.customerEmail) doc.text(`Email: ${order.customerEmail}`);
    doc.moveDown();

    // Table header
    let y = doc.y;
    doc.text('Product', 50, y);
    doc.text('Qty', 250, y);
    doc.text('Price', 320, y);
    doc.text('Total', 420, y);
    doc.moveDown();

    // Items
    for (const item of order.items) {
      const variant = item.variant;
      const productName = variant?.sku || 'Product';
      y = doc.y;
      doc.text(productName.substring(0, 30), 50, y);
      doc.text(item.quantity.toString(), 250, y);
      doc.text(formatCurrency(item.priceAtTime), 320, y);
      doc.text(formatCurrency(item.total), 420, y);
      doc.moveDown();
    }

    doc.moveDown();
    doc.text(`Subtotal: ${formatCurrency(order.subtotal)}`, { align: 'right' });
    if (order.deliveryCharge && order.deliveryCharge > 0) {
      doc.text(`Delivery Charge: ${formatCurrency(order.deliveryCharge)}`, { align: 'right' });
    }
    if (order.discount && order.discount > 0) {
      doc.text(`Discount: -${formatCurrency(order.discount)}`, { align: 'right' });
    }
    doc.text(`Total: ${formatCurrency(order.total)}`, { align: 'right' });
    doc.end();
  });
}

module.exports = { generateInvoice };