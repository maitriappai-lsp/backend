// ---------------------------------------------------------------------------
// Schedule rules shared by every route that writes schedule rows (the
// generic CRUD route in routes/tables.js and the Excel import in
// routes/import.js), so the overlap rule can't drift between them.
//
// A schedule entry only has a start time, so each session is treated as
// lasting SESSION_MINUTES. A person (as facilitator OR assistant) can't be in
// two sessions on the same day whose start times are closer than that. Keep
// this in step with SESSION_MINUTES in the app's ScheduleScreen.js.
// ---------------------------------------------------------------------------
const SESSION_MINUTES = 60;

// "10:00" or "10:00 AM" -> minutes since midnight, or null if unparseable.
function timeToMinutes(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(String(t || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3] && m[3].toLowerCase();
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

// Looks for an existing schedule row that clashes with the given entry.
// Returns { id, time, names } for the first clash, or null. `ignoreId`
// skips the row being edited. An unparseable time can't be compared, so it
// is treated as no clash (same as before this rule existed).
async function findScheduleConflict(pool, { date, time, facilitatorId, assistantId, ignoreId }) {
  const start = timeToMinutes(time);
  const people = [facilitatorId, assistantId].filter(Boolean);
  if (start == null || !date || people.length === 0) return null;

  const { rows } = await pool.query(
    `SELECT id, time, facilitator_id, assistant_id FROM schedule
     WHERE date = $1 AND ($2::text IS NULL OR id <> $2)
       AND (facilitator_id = ANY($3::text[]) OR assistant_id = ANY($3::text[]))`,
    [date, ignoreId || null, people]
  );
  const hit = rows.find((r) => {
    const m = timeToMinutes(r.time);
    return m != null && Math.abs(m - start) < SESSION_MINUTES;
  });
  if (!hit) return null;

  const clashingIds = people.filter((p) => p === hit.facilitator_id || p === hit.assistant_id);
  const { rows: nameRows } = await pool.query('SELECT name FROM resources WHERE id = ANY($1::text[])', [clashingIds]);
  return { id: hit.id, time: hit.time, names: nameRows.map((n) => n.name) };
}

function clashMessage(conflict, date) {
  const who = conflict.names.length ? conflict.names.join(' & ') : 'A facilitator or assistant';
  return `Time clash: ${who} already booked at ${conflict.time} on ${date}.`;
}

module.exports = { SESSION_MINUTES, timeToMinutes, findScheduleConflict, clashMessage };
