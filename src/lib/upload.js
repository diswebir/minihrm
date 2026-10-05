'use strict';
/** آپلود فایل (عکس و رزومه) */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const ALLOWED_IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_DOC = ['.pdf', '.doc', '.docx', '.zip', '.jpg', '.jpeg', '.png'];
const MAX_IMG = 2 * 1024 * 1024;
const MAX_DOC = 6 * 1024 * 1024;

function makeUploader(kind) {
  const allowed = kind === 'image' ? ALLOWED_IMG : ALLOWED_DOC;
  const max = kind === 'image' ? MAX_IMG : MAX_DOC;
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(config.UPLOAD_DIR, kind === 'image' ? 'photos' : 'docs');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, crypto.randomBytes(12).toString('hex') + ext);
    }
  });
  return multer({
    storage,
    limits: { fileSize: max },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      cb(new Error('فرمت فایل مجاز نیست. فرمت‌های مجاز: ' + allowed.join(', ')));
    }
  });
}

const uploadPhoto = makeUploader('image');
const uploadDoc = makeUploader('doc');

module.exports = { uploadPhoto, uploadDoc, ALLOWED_IMG, ALLOWED_DOC };
