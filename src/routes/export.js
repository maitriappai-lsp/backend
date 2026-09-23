// ---------------------------------------------------------------------------
// Real Excel export -- replaces the "Export to Excel" alert that used to
// just say what it would do without doing it. Builds an actual .xlsx
// workbook server-side with exceljs and returns it as base64 in a JSON
// response (simpler and more reliable from Expo/React Native than handling
// a raw binary response body), which the client writes to a temp file and
// hands to the OS share sheet.
// ---------------------------------------------------------------------------
const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db');

const router = express.Router();

const EXPORTS = {
  attendance: {
    sheetName: 'Attendance',
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Facilitator', key: 'facilitator', width: 22 },
      { header: 'School', key: 'school', width: 20 },
      { header: 'Class', key: 'klass', width: 10 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Time In', key: 'time_in', width: 12 },
      { header: 'Time Out', key: 'time_out', width: 12 },
      { header: 'Students Present', key: 'students_present', width: 16 },
      { header: 'Geofence Verified', key: 'geo_verified', width: 16 },
      { header: 'Ad-hoc', key: 'ad_hoc', width: 10 },
    ],
    query: `
      SELECT a.date, r.name AS facilitator, b.school, b.class AS klass, b.section,
             a.time_in, a.time_out, a.students_present, a.geo_verified, a.ad_hoc
      FROM attendance a
      LEFT JOIN resources r ON r.id = a.facilitator_id
      LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE a.date >= $1 AND a.date <= $2 AND ($3::text IS NULL OR a.facilitator_id = $3)
      ORDER BY a.date DESC
    `,
  },
  sessions: {
    sheetName: 'Sessions',
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Facilitator', key: 'facilitator', width: 22 },
      { header: 'School', key: 'school', width: 20 },
      { header: 'Class', key: 'klass', width: 10 },
      { header: 'Category', key: 'category', width: 26 },
      { header: 'Students Present', key: 'students_present', width: 16 },
      { header: 'Rating', key: 'rating', width: 14 },
      { header: 'RAG', key: 'rag', width: 10 },
      { header: 'Facilitator Feedback', key: 'facilitator_feedback', width: 30 },
      { header: 'School Feedback', key: 'school_feedback', width: 30 },
    ],
    query: `
      SELECT p.date, r.name AS facilitator, b.school, b.class AS klass,
             CONCAT(c.pillar, ' / ', c.topic) AS category,
             p.students_present, p.rating, p.rag, p.facilitator_feedback, p.school_feedback
      FROM psr p
      LEFT JOIN resources r ON r.id = p.facilitator_id
      LEFT JOIN beneficiaries b ON b.id = p.beneficiary_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.date >= $1 AND p.date <= $2 AND ($3::text IS NULL OR p.facilitator_id = $3)
      ORDER BY p.date DESC
    `,
  },
  uploads: {
    sheetName: 'Uploads',
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Facilitator', key: 'facilitator', width: 22 },
      { header: 'School', key: 'school', width: 20 },
      { header: 'File Name', key: 'file_name', width: 30 },
      { header: 'Description', key: 'description', width: 30 },
    ],
    query: `
      SELECT u.date, r.name AS facilitator, b.school, u.file_name, u.description
      FROM uploads u
      LEFT JOIN resources r ON r.id = u.facilitator_id
      LEFT JOIN beneficiaries b ON b.id = u.beneficiary_id
      WHERE u.date >= $1 AND u.date <= $2 AND ($3::text IS NULL OR u.facilitator_id = $3)
      ORDER BY u.date DESC
    `,
  },
};

router.get('/:type', async (req, res, next) => {
  try {
    const config = EXPORTS[req.params.type];
    if (!config) return res.status(404).json({ error: `Unknown export type "${req.params.type}"` });

    const { from, to, facilitatorId } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });

    const { rows } = await pool.query(config.query, [from, to, facilitatorId === 'all' ? null : facilitatorId || null]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(config.sheetName);
    sheet.columns = config.columns;
    sheet.getRow(1).font = { bold: true };
    rows.forEach((row) => sheet.addRow(row));

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${config.sheetName.toLowerCase()}-${from}-to-${to}.xlsx`;
    res.json({ filename, base64: Buffer.from(buffer).toString('base64') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
