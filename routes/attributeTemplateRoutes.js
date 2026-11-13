const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addOptions,
  removeOptions,
} = require('../controllers/attributeTemplateController');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getTemplates)
  .post(createTemplate);

router.route('/:id')
  .get(getTemplate)
  .put(updateTemplate)
  .delete(deleteTemplate);

router.post('/:id/options', addOptions);
router.delete('/:id/options', removeOptions);

module.exports = router;