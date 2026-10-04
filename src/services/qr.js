// ═══════════════════════════════════════════════════════════
//  QR Code Service
// ═══════════════════════════════════════════════════════════

const QRCode = require('qrcode');
const crypto = require('crypto');
const { getDb } = require('../database/connection');

// Generate unique QR code
async function generateQR(jobPositionId, baseUrl) {
  const db = getDb();

  // Generate unique code
  const code = crypto.randomBytes(16).toString('hex');

  // Save to database
  db.prepare(`
    INSERT INTO qr_codes (job_position_id, code, is_active, created_by) VALUES (?, ?, 1, ?)
  `).run(jobPositionId, code, null);

  // Generate URL
  const url = `${baseUrl}/apply/${code}`;

  // Generate QR code image as data URL
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: {
      dark: '#1E293B',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'H'
  });

  return {
    code,
    url,
    qrDataUrl
  };
}

// Generate QR as SVG
async function generateQRSvg(jobPositionId, baseUrl) {
  const db = getDb();

  const code = crypto.randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO qr_codes (job_position_id, code, is_active, created_by) VALUES (?, ?, 1, ?)
  `).run(jobPositionId, code, null);

  const url = `${baseUrl}/apply/${code}`;

  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    width: 400,
    margin: 2,
    color: {
      dark: '#1E293B',
      light: '#FFFFFF'
    }
  });

  return { code, url, qrSvg };
}

// Validate QR code
function validateQR(code) {
  const db = getDb();

  const qr = db.prepare(`
    SELECT qr.*, jp.title as position_title, jp.department_id
    FROM qr_codes qr
    LEFT JOIN job_positions jp ON qr.job_position_id = jp.id
    WHERE qr.code = ? AND qr.is_active = 1
  `).get(code);

  if (!qr) return null;

  // Increment scan count
  db.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = ?').run(qr.id);

  return qr;
}

// Get all QR codes with position info
function getAllQRCodes() {
  const db = getDb();

  return db.prepare(`
    SELECT qr.*, jp.title as position_title
    FROM qr_codes qr
    LEFT JOIN job_positions jp ON qr.job_position_id = jp.id
    ORDER BY qr.created_at DESC
  `).all();
}

module.exports = { generateQR, generateQRSvg, validateQR, getAllQRCodes };