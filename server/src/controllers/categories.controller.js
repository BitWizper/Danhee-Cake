const db = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const [categories] = await db.execute('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
    res.json({
      success: true,
      data: categories
    });
  } catch (err) {
    next(err);
  }
};
