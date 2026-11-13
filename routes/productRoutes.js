const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  bulkUpdateCategories,
} = require('../controllers/productController');

const router = express.Router();

router.use(protect); // All routes protected

// GET /api/product - list all products for tenant
// POST /api/product - create a new product
router.route('/')
  .get(listProducts)
  .post(createProduct);

// Bulk operations
router.post('/bulk/delete', bulkDeleteProducts);
router.post('/bulk/update-categories', bulkUpdateCategories);

// GET /api/product/:id - get single product
// PUT /api/product/:id - update product
// DELETE /api/product/:id - delete product
router.route('/:id')
  .get(getProduct)
  .put(updateProduct)
  .delete(deleteProduct);

module.exports = router;
