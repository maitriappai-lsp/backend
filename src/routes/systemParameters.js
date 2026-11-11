// Admin-managed application-wide system parameters.
const express = require('express');
const pool = require('../db');
const { rowToRecord } = require('../caseConvert');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Only administrators can change system parameters' });
  }
  next();
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM system_parameters LIMIT 1');
    res.json(rows[0] ? rowToRecord(rows[0]) : { gpsOnBeneficiary: true, facilitatorFaceRecognitionEnabled: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['facilitatorFaceRecognitionEnabled', 'gpsOnBeneficiary'];
    const keys = Object.keys(req.body || {});
    if (keys.length !== 1 || keys.some((key) => !allowed.includes(key))) {
      return res.status(400).json({ error: 'Provide exactly one supported system parameter' });
    }
    const key = keys[0];
    const value = req.body[key];
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: `${key} must be true or false` });
    }

    const column = key === 'gpsOnBeneficiary' ? 'gps_on_beneficiary' : 'facilitator_face_recognition_enabled';
    const { rows } = await pool.query(
      `INSERT INTO system_parameters (id, ${column})
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE
         SET ${column} = EXCLUDED.${column}
       RETURNING *`,
      [value]
    );
    res.json(rowToRecord(rows[0]));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
