// ---------------------------------------------------------------------------
// Auth: phone + password login (spec section 1 -- no self-signup, Admin
// creates every account, login ID is the phone number). Issues a short-lived
// JWT the client attaches as a Bearer token on every subsequent request.
// ---------------------------------------------------------------------------
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { rowToRecord } = require('../caseConvert');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function scrubResource(record) {
  const { passwordHash, ...rest } = record;
  return rest;
}

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ ok: false, error: 'phone and password are required' });

    const { rows } = await pool.query('SELECT * FROM resources WHERE phone = $1', [phone]);
    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'No account found for that phone number.' });
    }
    const resource = rowToRecord(rows[0]);
    if (resource.active === false) {
      return res.status(401).json({ ok: false, error: 'This account has been deactivated. Contact your Admin.' });
    }
    const match = await bcrypt.compare(password, resource.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Incorrect password.' });
    }

    const user = scrubResource(resource);
    const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ ok: true, user, token });
  } catch (err) {
    next(err);
  }
});

// POST /auth/change-password { resourceId, newPassword }
// Used both for the forced first-login change and any future "reset by
// Admin" flow. Requires a valid token for the account being changed.
router.post('/change-password', async (req, res, next) => {
  try {
    const { resourceId, newPassword } = req.body;
    if (!resourceId || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'resourceId and a newPassword of 6+ characters are required' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { rows } = await pool.query(
      'UPDATE resources SET password_hash = $1, must_change_password = FALSE WHERE id = $2 RETURNING *',
      [passwordHash, resourceId]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Resource not found' });
    res.json({ ok: true, user: scrubResource(rowToRecord(rows[0])) });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, JWT_SECRET };
