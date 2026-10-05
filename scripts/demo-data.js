'use strict';
/**
 * ایجاد داده‌های نمایشی (پس از نصب): موقعیت‌های شغلی، متقاضیان با نتایج MBTI
 * اجرا: node scripts/demo-data.js
 */
const path = require('path');
const crypto = require('crypto');
const config = require('../src/config');
const db = require('../src/db');
const mbtiEngine = require('../src/lib/mbti');

function jg(y, m, d) {
  // شمسی -> میلادی ساده برای created_at
  const jalaali = require('jalaali-js');
  const g = jalaali.toGregorian(y, m, d);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

function answersForType(typeCode, questions, flipCount) {
  // انتخاب گزینه مطابق حروف تیپ هدف (با کمی تنوع)
  const targets = {
    E: typeCode.includes('E'), I: typeCode.includes('I'),
    N: typeCode.includes('N'), S: typeCode.includes('S'),
    T: typeCode.includes('T'), F: typeCode.includes('F'),
    J: typeCode.includes('J'), P: typeCode.includes('P')
  };
  const winTrait = {
    E: 'E', I: 'I', N: 'N', S: 'S', T: 'T', F: 'F', J: 'J', P: 'P'
  };
  const answers = [];
  let flips = 0;
  for (const q of questions) {
    const wantA = targets[q.trait_a] && !targets[q.trait_b] ? true
      : targets[q.trait_b] && !targets[q.trait_a] ? false
      : true;
    let choice = wantA ? 'a' : 'b';
    if (flips < flipCount && Math.random() < 0.25) {
      choice = choice === 'a' ? 'b' : 'a';
      flips++;
    }
    answers.push({ number: q.number, choice });
  }
  return answers;
}

async function main() {
  if (!config.isInstalled()) {
    console.error('ابتدا سامانه را نصب کنید (ویزارد نصب).');
    process.exit(1);
  }
  await db.init(config.DB_PATH);

  const questions = db.prepare('SELECT * FROM mbti_questions WHERE enabled = 1 ORDER BY sort').all();
  const prefix = require('../src/lib/helpers').getSetting('tracking_prefix', 'ERF');

  /* ---- موقعیت‌های شغلی ---- */
  const positions = [
    { code: 'POSDEV', title: 'کارشناس ارشد نرم‌افزار', department: 'فناوری اطلاعات', employment_type: 'full_time',
      description: 'طراحی، توسعه و نگهداری سامانه‌های نرم‌افزاری شرکت و مشارکت در معماری محصولات دانش‌بنیان.',
      requirements: 'کارشناسی یا بالاتر مهندسی کامپیوتر — تسلط بر Node.js و پایگاه‌های داده — حداقل ۳ سال سابقه',
      benefits: 'بیمه تکمیلی، پاداش عملکرد، امکان دورکاری', status: 'open' },
    { code: 'POSHR', title: 'کارشناس منابع انسانی', department: 'منابع انسانی', employment_type: 'full_time',
      description: 'اجرای فرایندهای جذب، استخدام، آموزش و توسعه سرمایه انسانی شرکت.',
      requirements: 'کارشناسی مدیریت بازرگانی/منابع انسانی — آشنایی با فرایندهای استخدام — مهارت ارتباطی بالا',
      benefits: 'بیمه، محیط کاری دوستانه، فرصت‌های رشد', status: 'open' },
    { code: 'POSMKT', title: 'کارشناس بازاریابی دیجیتال', department: 'بازاریابی', employment_type: 'full_time',
      description: 'برنامه‌ریزی و اجرای کمپین‌های دیجیتال مارکتینگ و توسعه بازار محصولات شرکت.',
      requirements: 'سابقه کار در دیجیتال مارکتینگ — آشنایی با تحلیل داده‌های کمپین — خلاقیت بالا',
      benefits: 'پاداش فروش، آموزش‌های تخصصی', status: 'open' }
  ];
  const posIds = {};
  for (const p of positions) {
    const ex = db.prepare('SELECT id FROM positions WHERE code = ?').get(p.code);
    if (ex) { posIds[p.code] = ex.id; continue; }
    const info = db.prepare(`INSERT INTO positions (code, title, department, employment_type, description, requirements, benefits, status)
      VALUES (?,?,?,?,?,?,?,'open')`).run(p.code, p.title, p.department, p.employment_type, p.description, p.requirements, p.benefits);
    posIds[p.code] = info.lastInsertRowid;
    console.log('position:', p.title);
  }

  /* ---- متقاضیان نمونه ---- */
  const applicants = [
    {
      first: 'سارا', last: 'محمدی', phone: '09121110001', nat: '0012345678', gender: 'female',
      pos: 'POSHR', type: 'ENFP', status: 'interview', flip: 2, tests: { disc: 'I', eq: 'EM', holland: 'S' },
      email: 'sara@example.com', birth: '1368/03/15', marital: 'married',
      salary: '55,000,000 ریال', coop: 'full_time', start: '1404/09/01',
      exp: { company: 'شرکت پویا', position: 'کارشناس منابع انسانی', period: '1397/04/01 - 1402/07/31', duration: '5 سال', last_salary: '48,000,000 ریال', leave_reason: 'جستجوی چالش جدید', work_phone: '03133334455' },
      edu: { level: 'کارشناسی ارشد', major: 'مدیریت بازرگانی — منابع انسانی', institute: 'دانشگاه اصفهان', year: '1396' }
    },
    {
      first: 'امیر', last: 'حسینی', phone: '09121110002', nat: '0087654321', gender: 'male',
      pos: 'POSDEV', type: 'INTJ', status: 'submitted', flip: 1, tests: { disc: 'C', eq: 'SA', holland: 'I' },
      email: 'amir@example.com', birth: '1372/11/02', marital: 'single',
      salary: '85,000,000 ریال', coop: 'full_time', start: '1404/08/15',
      exp: { company: 'فناوران هوشمند', position: 'توسعه‌دهنده ارشد', period: '1396/02/01 - 1403/01/30', duration: '7 سال', last_salary: '75,000,000 ریال', leave_reason: 'مهاجرت شغلی', work_phone: '02144455667' },
      edu: { level: 'کارشناسی ارشد', major: 'مهندسی نرم‌افزار', institute: 'دانشگاه صنعتی اصفهان', year: '1395' }
    },
    {
      first: 'مریم', last: 'کریمی', phone: '09121110003', nat: '0022334455', gender: 'female',
      pos: 'POSMKT', type: 'ESFJ', status: 'reviewing', flip: 3, tests: { disc: 'I', eq: 'SS', holland: 'E' },
      email: 'maryam@example.com', birth: '1375/06/24', marital: 'married',
      salary: '60,000,000 ریال', coop: 'part_time', start: '1404/10/01',
      exp: { company: 'آژانس نوآور', position: 'کارشناس دیجیتال مارکتینگ', period: '1398/09/01 - 1403/05/31', duration: '5 سال', last_salary: '52,000,000 ریال', leave_reason: 'تغییر محل سکونت', work_phone: '03198765432' },
      edu: { level: 'کارشناسی', major: 'بازاریابی', institute: 'دانشگاه علوم و تحقیقات', year: '1397' }
    },
    {
      first: 'رضا', last: 'نادری', phone: '09121110004', nat: '0099887766', gender: 'male',
      pos: 'POSDEV', type: 'ISTJ', status: 'accepted', flip: 1, tests: { disc: 'D', eq: 'SR', holland: 'R' },
      email: 'reza@example.com', birth: '1366/09/10', marital: 'married',
      salary: '95,000,000 ریال', coop: 'full_time', start: '1404/08/01',
      exp: { company: 'سیستم‌های یکپارچه', position: 'مدیر فنی', period: '1392/01/01 - 1403/02/29', duration: '11 سال', last_salary: '90,000,000 ریال', leave_reason: 'پایان مأموریت', work_phone: '02532223344' },
      edu: { level: 'کارشناسی', major: 'مهندسی کامپیوتر — نرم‌افزار', institute: 'دانشگاه کاشان', year: '1389' }
    }
  ];

  for (const a of applicants) {
    const exists = db.prepare('SELECT id FROM applicants WHERE phone = ?').get(a.phone);
    if (exists) { console.log('exists:', a.first, a.last); continue; }

    const answers = answersForType(a.type, questions, a.flip);
    const result = mbtiEngine.score(answers, questions);
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(100000, 999999)}`;

    const data = {
      first_name: a.first, last_name: a.last, father_name: 'محمد',
      national_id: a.nat, birth_serial: '12345', birth_date: a.birth,
      issue_place: 'اصفهان', gender: a.gender, religion: 'اسلام', sect: 'شیعه',
      phone_mobile: a.phone, phone_landline: '03132223344', email: a.email,
      address: 'اصفهان، خیابان چهارباغ بالا، کوچه نمونه، پلاک ۱۲', postal_code: '8159643112',
      has_insurance: 'yes', insurance_years: '5', insurance_number: '12345678',
      military_status: a.gender === 'male' ? 'finished' : 'na',
      marital_status: a.marital, spouse_name: a.marital === 'married' ? 'نمونه' : '',
      spouse_phone: a.marital === 'married' ? '09121234567' : '',
      spouse_job: a.marital === 'married' ? 'کارمند' : '',
      children_count: a.marital === 'married' ? '1' : '0',
      experiences: [a.exp], educations: [a.edu],
      languages: [{ language: 'انگلیسی', level: 'good' }, { language: 'آلمانی', level: 'average' }],
      skills: [{ name: 'Microsoft Office', level: 'excellent' }, { name: a.pos === 'POSDEV' ? 'Node.js' : 'Photoshop', level: 'good' }],
      courses: [{ title: 'مهارت‌های ارتباطی', institute: 'آموزشگاه نمونه', duration: '40 ساعت', certificate: 'yes' }],
      satisfaction_factors: 'محیط حرفه‌ای، امکان یادگیری و رشد، همکاری با تیم‌های خلاق',
      dissatisfaction_factors: 'بی‌برنامگی، عدم شفافیت در ارزیابی عملکرد',
      cooperation_type: a.coop, part_time_hours: a.coop === 'part_time' ? 'شنبه تا سه‌شنبه ۹ تا ۱۳' : '',
      expected_salary: a.salary, desired_position: a.exp.position,
      start_date: a.start, how_found_us: 'معرفی آگهی استخدام و شبکه‌های اجتماعی',
      overtime_ready: 'yes_special', mission_ready: ['domestic_short'],
      health_ok: 'yes', illness: '',
      references: [{ full_name: 'دکتر نمونه', relation: 'استاد دانشگاه', phone: '09127778899' }],
      consent: true
    };

    const info = db.prepare(`INSERT INTO applicants
      (tracking_code, phone, position_id, first_name, last_name, national_id, birth_date, email, gender,
       status, step, data, mbti_type, mbti_scores, mbti_answers, consent_at, submitted_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'), datetime('now'), datetime('now'), datetime('now'))`)
      .run(code, a.phone, posIds[a.pos], a.first, a.last, a.nat, a.birth, a.email, a.gender,
        a.status, 'review', JSON.stringify(data), result.typeCode,
        JSON.stringify({ counts: result.counts, dimensions: result.dimensions }),
        JSON.stringify(answers));

    db.prepare('INSERT INTO applicant_events (applicant_id, event, detail) VALUES (?,?,?)')
      .run(info.lastInsertRowid, 'submitted', 'ارسال فرم استخدام (داده نمایشی)');

    // ---- نتایج آزمون‌های روان‌شناختی (DISC / EQ / Holland) ----
    const assessments = require('../src/lib/assessments');
    const testPatterns = a.tests || {};
    for (const t of db.prepare('SELECT * FROM tests WHERE enabled = 1').all()) {
      const tqs = db.prepare('SELECT * FROM test_questions WHERE test_code = ? AND enabled = 1 ORDER BY number').all(t.code);
      const hi = testPatterns[t.code]; // بُعد غالب
      const tAnswers = tqs.map(q => {
        let v;
        if (hi && q.dimension === hi) v = q.reverse ? 1 : 5;
        else v = (q.number % 3 === 0) ? 4 : 3;
        return { number: q.number, value: v };
      });
      const scored = assessments.score(tAnswers, tqs);
      const summary = assessments.quickSummary(t.code, scored);
      db.prepare(`INSERT INTO test_results (applicant_id, test_code, answers, scores, summary, completed_at)
        VALUES (?,?,?,?,?,datetime('now'))`)
        .run(info.lastInsertRowid, t.code, JSON.stringify(tAnswers), JSON.stringify(scored.percents), JSON.stringify(summary));
    }

    if (a.status === 'interview' || a.status === 'accepted') {
      db.prepare('INSERT INTO applicant_events (applicant_id, event, detail) VALUES (?,?,?)')
        .run(info.lastInsertRowid, 'status_change', JSON.stringify({ from: 'submitted', to: a.status }));
      db.prepare('INSERT INTO applicant_notes (applicant_id, user_id, kind, note, decision) VALUES (1, 1, ?, ?, ?)')
        .run(a.status === 'accepted' ? 'management' : 'interview',
          a.status === 'accepted'
            ? 'متقاضی از نظر فنی و فرهنگ سازمانی مناسب تشخیص داده شد و برای استخدام تایید گردید.'
            : 'سوابق کاری مرتبط و مهارت‌های ارتباطی خوب. پیشنهاد می‌شود مصاحبه تخصصی برگزار شود.',
          a.status === 'accepted' ? 'accept' : 'review');
    }
    console.log(`applicant: ${a.first} ${a.last} — ${result.typeCode} (${a.status})`);
  }

  console.log('✅ داده‌های نمایشی آماده شد.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
