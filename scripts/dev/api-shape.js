const SID = process.env.SID;
async function get(p) {
  const r = await fetch('http://localhost:3000' + p, { headers: { Cookie: 'hrm_sid=' + SID, 'X-Requested-With': 'HRM' } });
  const j = await r.json().catch(() => null);
  if (!j || j.ok === false) return { __error: (j && j.error) || 'HTTP ' + r.status };
  return j.data;
}
function shape(v, d = 0, max = 2) {
  if (v === null || v === undefined) return typeof v;
  if (Array.isArray(v)) return v.length ? ['(' + v.length + ')', shape(v[0], d + 1, max)] : '(0)';
  if (typeof v === 'object') { if (d > max) return '{…}'; const o = {}; for (const k of Object.keys(v)) o[k] = shape(v[k], d + 1, max); return o; }
  return typeof v;
}
(async () => {
  for (const [label, url] of [
    ['ASSESSMENTS', '/api/assessments?perPage=2'],
    ['ASSESSMENT-DETAIL', null],
    ['ANALYTICS', '/api/assessments/analytics/overview'],
    ['QUESTIONS', '/api/assessments/questions'],
    ['INTERVIEW-QUESTIONS', '/api/interview-questions'],
    ['SETTINGS', '/api/settings'],
    ['SMS-LOGS', '/api/sms/logs'],
    ['SMS-TEMPLATES', '/api/sms/templates'],
    ['REPORTS', '/api/reports/overview?days=30'],
    ['AUDIT', '/api/audit?perPage=2'],
  ]) {
    let u = url;
    if (!u) {
      const list = await get('/api/assessments?perPage=1');
      if (!list || !list.rows || !list.rows.length) { console.log(label, 'NO DATA'); continue; }
      u = '/api/assessments/' + list.rows[0].id;
    }
    const d = await get(u);
    console.log('\n' + label + ':', JSON.stringify(shape(d)).slice(0, 1500));
  }
})();
