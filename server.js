require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const shopRoutes = require("./routes/shopRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const { errorHandler } = require("./middleware/errorMiddleware");
const productRoutes = require('./routes/productRoutes');
const variantRoutes = require('./routes/variantRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const publicRoutes = require('./routes/publicRoutes');
const returnRoutes = require("./routes/returnRoutes");
const landingPageRoutes = require("./routes/landingPageRoutes");
const attributeTemplateRoutes = require('./routes/attributeTemplateRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require("./routes/paymentRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const blockingRoutes = require("./routes/blockingRoutes");
const categoryRoutes = require('./routes/categoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const couponRoutes = require('./routes/couponRoutes');
const shippingMethodRoutes = require('./routes/shippingMethodRoutes');
const addressRoutes = require('./routes/addressRoutes');
const brandRoutes = require('./routes/brandRoutes');
const variantImageRoutes = require('./routes/variantImageRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const incompleteCheckoutRoutes = require('./routes/incompleteCheckoutRoutes');
const steadfastRoutes = require('./routes/steadfastRoutes');
const courierRoutes = require('./routes/courierRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// Health check endpoint
app.get("/health", (req, res) => {
  return res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/settings", settingsRoutes);
app.use('/api/product', productRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/public', publicRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/landing-page", landingPageRoutes);
app.use('/api/attribute-templates', attributeTemplateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/blocking", blockingRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/shipping-methods', shippingMethodRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/variant-images', variantImageRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/incomplete-checkouts', incompleteCheckoutRoutes);
app.use('/api/steadfast', steadfastRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server only when run directly (not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
      ╔═════════════════════════════════════════╗
      ║   Multi-Tenant SaaS Backend Started    ║
      ╠════════════════════════════════════════╣
      ║  Server running on port ${PORT.toString().padEnd(30)} ║
      ║  Environment: ${(process.env.NODE_ENV || "development").padEnd(27)} ║
      ║  Database: ${(process.env.DATABASE_URL || "sqlite").padEnd(33)} ║
      ╚═════════════════════════════════════════╝
    `);
  });
}

module.exports = app;
