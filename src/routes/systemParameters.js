
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

const PARAMETER_COLUMNS = {
  productType: 'product_type',
  orgName: 'org_name',
  maxNamedUsers: 'max_named_users',
  productValidityEnd: 'product_validity_end',
  loginByEmail: 'login_by_email',
  gpsOnBeneficiary: 'gps_on_beneficiary',
  allowedUploadTypes: 'allowed_upload_types',
  facilitatorFaceRecognitionEnabled: 'facilitator_face_recognition_enabled',
};

function validateParameter(key, value) {
  switch (key) {
    case 'productType':
    case 'orgName':
      return value === null || typeof value === 'string';

    case 'maxNamedUsers':
      return value === null ||
        (Number.isInteger(value) && value > 0);

    case 'productValidityEnd':
      return value === null ||
        (typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value));

    case 'loginByEmail':
    case 'gpsOnBeneficiary':
    case 'facilitatorFaceRecognitionEnabled':
      return typeof value === 'boolean';

    case 'allowedUploadTypes':
      return Array.isArray(value) &&
        value.every((type) => ['photo', 'pdf', 'ppt'].includes(type));

    default:
      return false;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM system_parameters LIMIT 1'
    );

    res.json(rows[0] ? rowToRecord(rows[0]) : {
      productType: null,
      orgName: null,
      maxNamedUsers: null,
      productValidityEnd: null,
      loginByEmail: false,
      gpsOnBeneficiary: true,
      allowedUploadTypes: ['photo', 'pdf', 'ppt'],
      facilitatorFaceRecognitionEnabled: true,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireAdmin, async (req, res, next) => {
  try {
    const keys = Object.keys(req.body || {});

    if (keys.length !== 1) {
      return res.status(400).json({
        error: 'Provide exactly one system parameter',
      });
    }

    const key = keys[0];
    const column = PARAMETER_COLUMNS[key];
    const value = req.body[key];

    if (!column) {
      return res.status(400).json({
        error: `Unsupported system parameter: ${key}`,
      });
    }

    if (!validateParameter(key, value)) {
      return res.status(400).json({
        error: `Invalid value for system parameter: ${key}`,
      });
    }

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
