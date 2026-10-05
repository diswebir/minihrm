'use strict';

(() => {
  const BASE = window.APP_BASE_PATH || '/';
  const root = document.getElementById('apply-app');
  const toastStack = document.getElementById('toast-stack');
  const state = { init: null, step: 0, selectedJob: '', phone: '', otpSent: false, otpVerified: false, otpCode: '', demoCode: '', alreadyApplied: false, formData: {}, answers: {}, done: null, sending: false, error: '' };
  const missionOptions = [
    ['short_domestic','فقط مأموریت کوتاه‌مدت داخلی (چند روز تا چند هفته)'],
    ['long_domestic','مأموریت کوتاه‌مدت و بلندمدت داخلی (چند روز تا چند ماه)'],
    ['short_foreign','فقط مأموریت کوتاه‌مدت خارجی'],
    ['long_foreign','مأموریت کوتاه‌مدت و بلندمدت خارجی'],
    ['unavailable','امکان انجام مأموریت کاری را ندارم']
  ];
  const axisText = { EI: 'تعامل', SN: 'سبک اطلاعات', TF: 'تصمیم‌گیری', JP: 'سازمان‌دهی' };
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function apiUrl(path) { return `${BASE}${path.replace(/^\/+/, '')}`; }
  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(apiUrl(path), { credentials: 'same-origin', ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    if (!response.ok) { const error = new Error(data?.error || 'درخواست انجام نشد.'); error.status = response.status; error.code = data?.code; throw error; }
    return data;
  }
  function icon(kind, size = 18) {
    const paths = {
      lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/>',
      person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
      shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
      arrow: '<path d="m15 18-6-6 6-6"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
      phone: '<path d="M21 16.5v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 10 18.4a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.5 3.2 2 2 0 0 1 3.5 1h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7.4 9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.3 2.6Z"/>',
      sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.info}</svg>`;
  }
  function faNum(value) { return new Intl.NumberFormat('fa-IR').format(Number(value || 0)); }
  function toast(message, type = 'info') {
    const node = document.createElement('div'); node.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
    node.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'close' : 'info', 16)}<span>${esc(message)}</span>`;
    toastStack.appendChild(node); setTimeout(() => node.remove(), 4000);
  }
  function steps() { return ['انتخاب موقعیت','تأیید موبایل','مشخصات فردی','سوابق و مهارت‌ها','انتظارات شغلی',...(state.init.psychologyEnabled ? ['ارزیابی'] : []),'بازبینی']; }
  function setError(message) { state.error = message || ''; }
  function cleanValue(value) { return String(value || '').trim(); }
  function asciiDigits(value) { return String(value || '').replace(/[۰-۹٠-٩]/g, (digit) => { const persian = '۰۱۲۳۴۵۶۷۸۹', arabic = '٠١٢٣٤٥٦٧٨٩'; return String(persian.includes(digit) ? persian.indexOf(digit) : arabic.indexOf(digit)); }); }
  function validIranNationalId(value) { const code = asciiDigits(value).replace(/\D/g, ''); if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false; const sum = code.slice(0,9).split('').reduce((total,digit,index) => total + Number(digit) * (10-index),0); const rest = sum % 11; return Number(code[9]) === (rest < 2 ? rest : 11-rest); }
  function required(key) { return (state.init.requiredFields || []).includes(key) || ['firstName','lastName','nationalId'].includes(key); }
  function requiredMark(key) { return required(key) ? '<span class="required-star">*</span>' : '<span class="optional">اختیاری</span>'; }
  function value(key) { return state.formData[key] ?? ''; }
  function field(label, key, options = {}) {
    const type = options.type || 'text', asText = options.textarea, placeholder = options.placeholder || '', hint = options.hint || '', req = required(key);
    let control;
    if (options.select) {
      control = `<select id="field-${esc(key)}" name="${esc(key)}" data-field="${esc(key)}" ${options.attrs || ''}><option value="">انتخاب کنید…</option>${options.select.map((item) => `<option value="${esc(item[0])}" ${value(key) === item[0] ? 'selected' : ''}>${esc(item[1])}</option>`).join('')}</select>`;
    } else if (asText) {
      control = `<textarea id="field-${esc(key)}" name="${esc(key)}" data-field="${esc(key)}" ${options.attrs || ''} placeholder="${esc(placeholder)}">${esc(value(key))}</textarea>`;
    } else {
      control = `<input id="field-${esc(key)}" name="${esc(key)}" data-field="${esc(key)}" type="${type}" value="${esc(value(key))}" ${options.attrs || ''} placeholder="${esc(placeholder)}" ${type === 'email' ? 'autocomplete="email"' : ''} />`;
    }
    return `<div class="form-field ${options.span ? 'span-2' : ''}"><label for="field-${esc(key)}">${esc(label)} ${requiredMark(key)}</label>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
  }
  function radioGroup(label, key, options, layout = 'radio-grid') {
    return `<div class="form-field span-2"><span class="field-label">${esc(label)} ${requiredMark(key)}</span><div class="${layout}">${options.map(([val, text]) => `<label class="radio-card"><input type="radio" name="${esc(key)}" data-field="${esc(key)}" value="${esc(val)}" ${value(key) === val ? 'checked' : ''} /><span>${esc(text)}</span></label>`).join('')}</div></div>`;
  }
  function repeater(key, title, fields, requiredHint = '') {
    let items = state.formData[key];
    if (!Array.isArray(items) || !items.length) items = [{}];
    const itemsHtml = items.map((item, index) => `<div class="repeater-item" data-repeater-item="${esc(key)}" data-index="${index}">${items.length > 1 ? `<button type="button" class="repeater-remove" data-action="remove-repeater" data-key="${esc(key)}" data-index="${index}" aria-label="حذف">${icon('close', 13)}</button>` : ''}<div class="form-grid">${fields.map((itemField) => `<div class="form-field ${itemField.span ? 'span-2' : ''}"><label>${esc(itemField.label)} <span class="optional">اختیاری</span></label>${itemField.textarea ? `<textarea data-repeat-key="${esc(key)}" data-repeat-index="${index}" data-repeat-field="${esc(itemField.key)}" placeholder="${esc(itemField.placeholder || '')}">${esc(item[itemField.key] || '')}</textarea>` : `<input type="text" data-repeat-key="${esc(key)}" data-repeat-index="${index}" data-repeat-field="${esc(itemField.key)}" value="${esc(item[itemField.key] || '')}" placeholder="${esc(itemField.placeholder || '')}" />`}</div>`).join('')}</div></div>`).join('');
    return `<section class="repeater-card"><div class="repeater-head"><div><strong>${esc(title)} ${required(key) ? '<span class="required-star">*</span>' : '<span class="optional">اختیاری</span>'}</strong>${requiredHint ? `<div class="tiny muted">${esc(requiredHint)}</div>` : ''}</div><button type="button" class="btn btn-soft btn-sm" data-action="add-repeater" data-key="${esc(key)}">${icon('plus', 13)} افزودن مورد</button></div>${itemsHtml}</section>`;
  }
  function renderStep0() {
    const selected = state.init.jobs.find((job) => job.id === state.selectedJob);
    return `<div class="step-panel"><h3>برای کدام موقعیت درخواست می‌دهید؟</h3><p class="step-description">یک موقعیت فعال انتخاب کنید. اطلاعات شغل در ادامه فرم هم قابل مشاهده خواهد بود.</p><div class="job-choice-list">${state.init.jobs.map((job) => `<article class="job-choice ${state.selectedJob === job.id ? 'selected' : ''}" data-action="select-job" data-id="${esc(job.id)}" tabindex="0" role="button" aria-pressed="${state.selectedJob === job.id}"><h4>${esc(job.title)}</h4><p>${esc(job.department || 'واحد سازمانی مشخص نشده')} · ${esc(job.location || 'محل کار در مصاحبه اعلام می‌شود')}</p><div class="job-meta"><span class="meta-chip">${esc(({full_time:'تمام‌وقت',part_time:'پاره‌وقت',remote:'دورکاری',project:'پروژه‌ای'})[job.employmentType] || 'تمام‌وقت')}</span>${job.closesAt ? `<span class="meta-chip">مهلت: ${esc(job.closesAt)}</span>` : ''}</div></article>`).join('')}</div>${selected ? `<div class="job-detail-card"><strong>${esc(selected.title)}</strong>${selected.description ? esc(selected.description) : 'شرح تکمیلی شغل از سوی واحد منابع انسانی ارائه می‌شود.'}${selected.requirements ? `<div style="margin-top:7px"><strong>شرایط موردنیاز</strong>${esc(selected.requirements)}</div>` : ''}</div>` : ''}${!state.init.jobs.length ? `<div class="notice warning" style="margin-top:12px">${icon('info',16)}در حال حاضر موقعیت فعالی برای ثبت درخواست وجود ندارد.</div>` : ''}</div>`;
  }
  function renderStep1() {
    return `<div class="step-panel"><h3>تأیید شماره موبایل</h3><p class="step-description">برای حفظ امنیت و امکان پیگیری درخواست، شماره همراه خود را با کد یک‌بارمصرف تأیید کنید.</p>${state.selectedJob ? `<div class="soft-pill" style="margin-bottom:12px">${icon('briefcase',13)} ${esc(state.init.jobs.find((j) => j.id === state.selectedJob)?.title || '')}</div>` : ''}<div class="otp-row"><div class="form-field"><label for="apply-phone">شماره موبایل</label><input id="apply-phone" name="phone" value="${esc(state.phone)}" placeholder="09123456789" inputmode="tel" autocomplete="tel" ${state.otpVerified ? 'readonly' : ''} dir="ltr" style="text-align:right" /></div><button type="button" class="btn btn-primary" data-action="send-otp" ${state.otpVerified || state.sending ? 'disabled' : ''}>${state.otpSent ? 'ارسال دوباره کد' : 'ارسال کد تأیید'} ${icon('phone', 15)}</button></div>${state.otpSent && !state.otpVerified ? `<div class="otp-row"><div class="form-field"><label for="apply-otp">کد شش‌رقمی پیامک‌شده</label><input id="apply-otp" class="otp-digit" value="${esc(state.otpCode || state.demoCode)}" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="۰۰۰۰۰۰" dir="ltr" /></div><button type="button" class="btn btn-mint" data-action="verify-otp" ${state.sending ? 'disabled' : ''}>تأیید کد ${icon('check', 15)}</button></div>` : ''}${state.otpVerified ? `<div class="auth-success">${icon('check', 15)} شماره ${esc(state.maskedPhone || state.phone)} تأیید شد. اطلاعات فرم فقط پس از ثبت نهایی ذخیره می‌شود.</div>` : ''}${state.alreadyApplied ? `<div class="notice warning" style="margin-top:12px">${icon('info',16)}با این شماره برای موقعیت انتخاب‌شده قبلاً درخواست ثبت شده است. برای پیگیری با منابع انسانی شرکت تماس بگیرید.</div>` : ''}${state.demoCode ? `<div class="notice info" style="margin-top:12px"><span>${icon('info',16)}</span><div><strong>حالت آزمایشی پیامک</strong>کد آزمایشی شما: <b class="mono">${esc(state.demoCode)}</b>. این کد فقط در محیط توسعه نمایش داده می‌شود.</div></div>` : ''}<div class="notice info" style="margin-top:14px">${icon('lock',15)}<div>کد اعتبار پنج دقیقه دارد و فقط برای ورود به فرم همین موقعیت استفاده می‌شود.</div></div></div>`;
  }
  function renderStep2() {
    return `<div class="step-panel"><h3>مشخصات فردی</h3><p class="step-description">اطلاعات پایه را مطابق فرم استخدام شرکت وارد کنید. موارد ستاره‌دار الزامی‌اند.</p><div class="form-grid">${field('نام','firstName',{attrs:'maxlength="80" autocomplete="given-name" placeholder="نام"'})}${field('نام خانوادگی','lastName',{attrs:'maxlength="100" autocomplete="family-name" placeholder="نام خانوادگی"'})}${field('نام پدر','fatherName',{attrs:'maxlength="100"'})}${field('کد ملی','nationalId',{attrs:'maxlength="10" inputmode="numeric" placeholder="۱۰ رقم"'})}${field('شماره شناسنامه','identityNumber',{attrs:'maxlength="30"'})}${field('تاریخ تولد','birthDate',{type:'date'})}${field('محل صدور','placeOfIssue')}${field('دین','religion')}${field('مذهب','denomination')}${field('شماره تماس ثابت','landline',{attrs:'inputmode="tel" dir="ltr"'})}${field('ایمیل','email',{type:'email',attrs:'maxlength="160"'})}${radioGroup('سابقه بیمه','insuranceHistory',[['yes','دارم'],['no','ندارم']])}${field('سنوات بیمه (سال)','insuranceYears',{type:'number',attrs:'min="0" max="60"'})}${field('شماره بیمه','insuranceNumber')}${field('کد پستی','postalCode',{attrs:'maxlength="10" inputmode="numeric"'})}${field('نشانی محل سکونت','address',{textarea:true,span:true,attrs:'maxlength="1500" rows="3"'})}<div class="form-field"><label>عکس پرسنلی <span class="optional">اختیاری</span></label><input id="apply-photo" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">یک عکس واضح انتخاب کنید؛ تصویر در مرورگر کوچک‌سازی می‌شود.</span>${state.formData.photoData ? `<img src="${esc(state.formData.photoData)}" alt="پیش‌نمایش عکس" style="margin-top:8px;width:72px;height:72px;object-fit:cover;border-radius:15px" />` : ''}</div>${field('وضعیت نظام‌وظیفه','militaryService',{select:[['completed','پایان خدمت'],['exempt','معافیت'],['subject','مشمول'],['not_applicable','موضوعیت ندارد']]})}${field('وضعیت تأهل','maritalStatus',{select:[['single','مجرد'],['married','متأهل'],['other','سایر']]})}${field('نام و نام خانوادگی همسر','spouseName')}${field('تلفن تماس همسر','spousePhone',{attrs:'inputmode="tel" dir="ltr"'})}${field('شغل و محل کار همسر','spouseJob')}${field('تعداد فرزند','childrenCount',{type:'number',attrs:'min="0" max="30"'})}</div></div>`;
  }
  function renderStep3() {
    return `<div class="step-panel"><h3>سوابق کاری و توانمندی‌ها</h3><p class="step-description">موارد را به ترتیب جدیدترین سابقه وارد کنید. اطلاعات این بخش مطابق فرم اصلی استخدام تنظیم شده است.</p>${repeater('workHistory','سوابق کاری',[{key:'company',label:'نام شرکت'},{key:'position',label:'سمت سازمانی'},{key:'period',label:'تاریخ شروع / پایان',placeholder:'مثلاً ۱۴۰۱ تا ۱۴۰۴'},{key:'duration',label:'مدت همکاری'},{key:'lastSalary',label:'آخرین حقوق'},{key:'reason',label:'علت قطع همکاری',span:true},{key:'workPhone',label:'تلفن محل کار'}],'شرکت، سمت، مدت همکاری و در صورت امکان دلیل پایان همکاری را وارد کنید.')}${repeater('education','تحصیلات',[{key:'degree',label:'مقطع تحصیلی'},{key:'major',label:'رشته یا گرایش'},{key:'institute',label:'محل تحصیل'},{key:'year',label:'سال اخذ مدرک'}])}<div class="dash-grid equal" style="gap:12px">${repeater('languages','زبان خارجی',[{key:'language',label:'عنوان زبان'},{key:'level',label:'سطح تسلط',placeholder:'بسیار خوب، خوب، متوسط، ضعیف'}])}${repeater('softwareSkills','مهارت نرم‌افزاری',[{key:'software',label:'نام نرم‌افزار'},{key:'level',label:'سطح تسلط',placeholder:'عالی، خوب، متوسط'}])}</div>${repeater('training','دوره‌های آموزشی',[{key:'title',label:'نام دوره'},{key:'institute',label:'مؤسسه آموزشی'},{key:'duration',label:'مدت دوره'},{key:'certificate',label:'وضعیت مدرک',placeholder:'دارد / ندارد'}])}</div>`;
  }
  function renderStep4() {
    return `<div class="step-panel"><h3>انتظارات و شرایط شغلی</h3><p class="step-description">پاسخ‌ها به منابع انسانی کمک می‌کند شرایط همکاری را بهتر با هم هماهنگ کند.</p><div class="form-grid">${field('عوامل رضایت شما از محیط کار','satisfaction',{textarea:true,span:true,attrs:'maxlength="1500" rows="3"'})}${field('عوامل نارضایتی شما از محیط کار','dissatisfaction',{textarea:true,span:true,attrs:'maxlength="1500" rows="3"'})}${field('نوع همکاری موردنظر','employmentType',{select:[['full_time','تمام‌وقت'],['part_time','پاره‌وقت'],['remote','دورکاری'],['project','پروژه‌ای']]})}${field('روزها و ساعات همکاری پاره‌وقت','availabilityHours',{attrs:'maxlength="200"',hint:'در صورت انتخاب پاره‌وقت تکمیل شود.'})}${field('حقوق و دستمزد مورد انتظار','expectedSalary',{attrs:'maxlength="100" placeholder="مثلاً بازه ماهانه به تومان"'})}${field('زمان آمادگی برای شروع همکاری','startAvailability',{attrs:'maxlength="120" placeholder="مثلاً از ابتدای ماه آینده"'})}${field('نحوه آشنایی با شرکت','referral',{attrs:'maxlength="200"'})}${radioGroup('آمادگی انجام اضافه‌کاری','overtime',[['yes_full','بله، آمادگی کامل دارم'],['yes_notice','در شرایط خاص و با اطلاع قبلی'],['no','خیر، امکان اضافه‌کاری ندارم']])}<div class="form-field span-2"><span class="field-label">آمادگی برای مأموریت کاری ${requiredMark('missions')}</span><span class="hint">در صورت تمایل می‌توانید بیش از یک گزینه را انتخاب کنید.</span><div class="radio-grid">${missionOptions.map(([v,label]) => `<label class="radio-card"><input type="checkbox" data-mission="${v}" ${(state.formData.missions || []).includes(v) ? 'checked' : ''} /><span>${esc(label)}</span></label>`).join('')}</div></div>${radioGroup('آیا وضعیت سلامت جسمی و روانی شما برای انجام وظایف شغلی مطلوب است؟','healthStatus',[['yes','بله'],['no','خیر']])}${field('در صورت ابتلا به بیماری خاص، توضیح دهید','healthDetails',{textarea:true,span:true,attrs:'maxlength="1000" rows="2"',hint:'ذکر این مورد اختیاری است؛ فقط در صورت ارتباط با وظایف شغلی.'})}</div><div class="divider-title">اطلاعات معرف اضطراری</div><p class="step-description">فردی را معرفی کنید که در صورت نیاز یا عدم دسترسی به شما بتوان با او تماس گرفت.</p><div class="form-grid">${field('نام و نام خانوادگی معرف','referenceName')}${field('نسبت فرد با شما','referenceRelation')}${field('شماره تماس معرف','referencePhone',{attrs:'inputmode="tel" dir="ltr"'})}</div><div class="consent-box"><input type="checkbox" id="declare-accurate" ${state.formData.declaredAccurate ? 'checked' : ''} /><label for="declare-accurate">صحت اطلاعات واردشده را تأیید می‌کنم و می‌دانم این اطلاعات برای بررسی درخواست استخدام استفاده می‌شود.</label></div></div>`;
  }
  function renderStep5() {
    if (!state.init.psychologyEnabled) return renderReviewStep();
    return `<div class="step-panel"><h3>پرسش‌نامه خودشناسی شغلی</h3><p class="step-description">پاسخ درست یا غلط وجود ندارد. گزینه‌ای را انتخاب کنید که معمولاً رفتار شما را بهتر توصیف می‌کند.</p><div class="test-intro"><strong>اطلاع‌رسانی و محرمانگی</strong><br>نتیجه توصیفی این پرسش‌نامه فقط برای تیم منابع انسانی قابل مشاهده است و در این صفحه نمایش داده نمی‌شود. این ابزار تشخیص بالینی یا معیار قطعی پذیرش استخدام نیست؛ تکمیل آن به‌تنهایی تصمیم استخدام را تعیین نمی‌کند.</div>${state.init.questions.map((q) => `<article class="psych-q-card"><div class="psych-q-title"><span class="q-num">${faNum(q.id)}</span><span>${esc(q.text)}</span></div><div class="psych-q-options"><label class="radio-card"><input type="radio" name="answer-${q.id}" data-answer-id="${q.id}" value="a" ${state.answers[q.id] === 'a' ? 'checked' : ''} /><span><b>الف)</b> ${esc(q.options.a)}</span></label><label class="radio-card"><input type="radio" name="answer-${q.id}" data-answer-id="${q.id}" value="b" ${state.answers[q.id] === 'b' ? 'checked' : ''} /><span><b>ب)</b> ${esc(q.options.b)}</span></label></div></article>`).join('')}${state.init.psychologyRequired ? `<label class="consent-box"><input type="checkbox" id="assessment-consent" ${state.formData.assessmentConsent ? 'checked' : ''} /><span>موافقم پاسخ‌ها برای بررسی درخواست استخدام در اختیار تیم منابع انسانی قرار گیرد. می‌دانم نتیجه محرمانه است، ابزار تشخیصی نیست و به‌تنهایی مبنای تصمیم استخدام نخواهد بود.</span></label>` : `<label class="consent-box"><input type="checkbox" id="assessment-consent" ${state.formData.assessmentConsent ? 'checked' : ''} /><span>در صورت تمایل، با ثبت پاسخ‌ها و مشاهده محرمانه آن توسط تیم منابع انسانی موافقم.</span></label>`}</div>`;
  }
  function renderReviewStep() {
    const fullName = [state.formData.firstName,state.formData.lastName].filter(Boolean).join(' '), selected = state.init.jobs.find((j) => j.id === state.selectedJob);
    const list = [['موقعیت شغلی', selected?.title],['نام و نام خانوادگی',fullName],['شماره موبایل',state.phone],['کد ملی',state.formData.nationalId],['ایمیل',state.formData.email],['نوع همکاری',({full_time:'تمام‌وقت',part_time:'پاره‌وقت',remote:'دورکاری',project:'پروژه‌ای'})[state.formData.employmentType]],['حقوق مورد انتظار',state.formData.expectedSalary],['سوابق کاری',`${(state.formData.workHistory || []).filter((x) => Object.values(x).some(Boolean)).length} مورد`],['تحصیلات',`${(state.formData.education || []).filter((x) => Object.values(x).some(Boolean)).length} مورد`],['آزمون روان‌شناسی',state.init.psychologyEnabled ? `${Object.keys(state.answers).length} از ${state.init.questions.length} پاسخ` : 'غیرفعال']];
    return `<div class="step-panel"><h3>بازبینی پیش از ارسال</h3><p class="step-description">اطلاعات را مرور کنید. پس از ثبت، نتیجه آزمون برای شما نمایش داده نمی‌شود و فقط تیم منابع انسانی آن را می‌بیند.</p><div class="review-section-title">خلاصه درخواست</div><div class="review-grid">${list.map(([label,val]) => `<div class="review-item"><small>${esc(label)}</small><strong>${val ? esc(val) : '—'}</strong></div>`).join('')}</div><div class="notice info" style="margin-top:14px">${icon('lock',16)}<div><strong>حریم خصوصی</strong>اطلاعات فقط برای بررسی درخواست استخدام در اختیار کاربران مجاز منابع انسانی قرار می‌گیرد.</div></div><div class="consent-box"><input type="checkbox" id="final-declaration" ${state.formData.declaredAccurate ? 'checked' : ''} /><label for="final-declaration">صحت همه اطلاعات را تأیید می‌کنم و با ثبت نهایی درخواست موافقم.</label></div></div>`;
  }
  function getCurrentContent() {
    if (state.step === 0) return renderStep0();
    if (state.step === 1) return renderStep1();
    if (state.step === 2) return renderStep2();
    if (state.step === 3) return renderStep3();
    if (state.step === 4) return renderStep4();
    const reviewIndex = state.init.psychologyEnabled ? 6 : 5;
    if (state.init.psychologyEnabled && state.step === 5) return renderStep5();
    if (state.step === reviewIndex) return renderReviewStep();
    return renderStep0();
  }
  function render() {
    if (state.done) {
      root.innerHTML = `<div class="apply-panel confirmation-box"><div class="confirmation-icon">${icon('check', 33)}</div><h2>درخواست شما ثبت شد</h2><p>${esc(state.done.message || 'درخواست شما با موفقیت ثبت شد. نتیجه بررسی از طریق اطلاعات تماس اعلام می‌شود.')}</p><div class="reference-number">${esc(state.done.reference || '')}</div><p style="margin-top:12px">کد پیگیری را برای پیگیری‌های بعدی نگه دارید.</p><a class="btn btn-soft" href="./" style="margin-top:18px">بازگشت به ابتدای فرم</a></div>`;
      return;
    }
    if (!state.init?.installed || !state.init?.portalEnabled) {
      root.innerHTML = `<section class="public-empty"><div class="empty-icon">${icon('info',24)}</div><h2>${state.init?.installed ? 'پرتال استخدام در دسترس نیست' : 'سامانه هنوز راه‌اندازی نشده است'}</h2><p>${state.init?.installed ? 'در حال حاضر فرم عمومی استخدام غیرفعال است یا موقعیت فعالی منتشر نشده. لطفاً بعداً دوباره مراجعه کنید.' : 'لطفاً برای پیگیری فرصت‌های شغلی با واحد منابع انسانی سازمان تماس بگیرید.'}</p></section>`;
      return;
    }
    if (!state.init.jobs?.length) {
      root.innerHTML = `<section class="public-empty"><div class="empty-icon">${icon('briefcase',24)}</div><h2>در حال حاضر فرصت شغلی فعالی نداریم</h2><p>ممنون از علاقه‌مندی شما به همکاری با ${esc(state.init.organizationName)}. لطفاً در زمان دیگری دوباره مراجعه کنید.</p></section>`;
      return;
    }
    const stepsList = steps(), reviewIndex = state.init.psychologyEnabled ? 6 : 5;
    const content = state.step === 5 && state.init.psychologyEnabled ? renderStep5() : state.step === reviewIndex ? renderReviewStep() : getCurrentContent();
    document.getElementById('public-brand-name').textContent = state.init.organizationName || 'مینی HRM';
    root.innerHTML = `<section class="apply-hero"><div><h1>فرم درخواست همکاری</h1><p>از ${esc(state.init.organizationName)} برای تکمیل فرم استخدام دعوت می‌کنیم. اطلاعات را با دقت وارد کنید؛ تکمیل فرم حدود ۱۰ تا ۱۵ دقیقه زمان می‌برد.</p></div><span class="apply-hero-mark">${icon('person',32)}</span></section><section class="apply-panel"><div class="apply-heading"><div><h2>${esc(stepsList[state.step] || 'درخواست استخدام')}</h2><p>مرحله ${faNum(state.step + 1)} از ${faNum(stepsList.length)} · اطلاعات شما در حین تکمیل روی این صفحه می‌ماند.</p></div>${state.selectedJob ? `<span class="soft-pill">${icon('briefcase',13)} ${esc(state.init.jobs.find((j) => j.id === state.selectedJob)?.title || '')}</span>` : ''}</div><div class="apply-stepper">${stepsList.map((title,index) => `<div class="apply-step ${index === state.step ? 'active' : ''} ${index < state.step ? 'done' : ''}"><span class="step-circle">${index < state.step ? '✓' : faNum(index + 1)}</span><span>${esc(title)}</span></div>`).join('')}</div><div id="step-content">${content}</div>${state.error ? `<div class="form-error" role="alert">${esc(state.error)}</div>` : ''}<div class="apply-nav"><div>${state.step > 0 ? `<button class="btn btn-outline" data-action="previous">${icon('arrow',14)} مرحله قبل</button>` : ''}</div><div>${state.step === reviewIndex ? `<button class="btn btn-primary" data-action="submit-application" ${state.sending ? 'disabled' : ''}>${state.sending ? 'در حال ثبت…' : 'ثبت نهایی درخواست'} ${icon('check',15)}</button>` : `<button class="btn btn-primary" data-action="next">ادامه ${icon('arrow',14)}</button>`}</div></div></section><div style="text-align:center;font-size:9px;color:#a0a2b1;margin-top:5px">فرم استخدام امن · هر ستاره نشان‌دهنده فیلد الزامی است.</div>`;
  }
  function captureForm() {
    document.querySelectorAll('#step-content [data-field]').forEach((el) => {
      if (el.type === 'radio') { if (el.checked) state.formData[el.dataset.field] = el.value; }
      else state.formData[el.dataset.field] = el.value;
    });
    const missions = [...document.querySelectorAll('#step-content [data-mission]:checked')].map((el) => el.dataset.mission);
    if (document.querySelector('#step-content [data-mission]')) state.formData.missions = missions;
    document.querySelectorAll('#step-content [data-repeat-key]').forEach((el) => {
      const key = el.dataset.repeatKey, index = Number(el.dataset.repeatIndex), fieldKey = el.dataset.repeatField;
      state.formData[key] ||= []; state.formData[key][index] ||= {}; state.formData[key][index][fieldKey] = el.value;
    });
    const declare = document.getElementById('declare-accurate') || document.getElementById('final-declaration');
    if (declare) state.formData.declaredAccurate = declare.checked;
    const consent = document.getElementById('assessment-consent');
    if (consent) state.formData.assessmentConsent = consent.checked;
    document.querySelectorAll('#step-content [data-answer-id]').forEach((el) => { if (el.checked) state.answers[el.dataset.answerId] = el.value; });
  }
  function validateCurrentStep() {
    const error = (message) => { setError(message); render(); return false; };
    if (state.step === 0) return state.selectedJob ? true : error('برای ادامه یک موقعیت شغلی انتخاب کنید.');
    if (state.step === 1) {
      if (!state.otpVerified) return error(state.otpSent ? 'ابتدا کد پیامکی را تأیید کنید.' : 'ابتدا کد تأیید را برای شماره موبایل خود دریافت کنید.');
      if (state.alreadyApplied) return error('برای این موقعیت قبلاً درخواست ثبت کرده‌اید.');
      return true;
    }
    if (state.step === 2) {
      const personalKeys = ['firstName','lastName','fatherName','nationalId','identityNumber','birthDate','placeOfIssue','religion','denomination','landline','email','insuranceHistory','insuranceYears','insuranceNumber','address','postalCode','militaryService','maritalStatus','spouseName','spousePhone','spouseJob','childrenCount'];
      for (const key of ['firstName','lastName',...(state.init.requiredFields || []).filter((item) => personalKeys.includes(item))]) {
        if (!required(key)) continue;
        if (!cleanValue(state.formData[key])) return error(`تکمیل «${({firstName:'نام',lastName:'نام خانوادگی',nationalId:'کد ملی',email:'ایمیل',address:'نشانی'})[key] || key}» الزامی است.`);
      }
      if (!validIranNationalId(state.formData.nationalId)) return error('کد ملی معتبر وارد کنید؛ ۱۰ رقم را بررسی کنید.');
      if (state.formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.formData.email)) return error('نشانی ایمیل معتبر نیست.');
      return true;
    }
    if (state.step === 3) {
      for (const key of ['workHistory','education','languages','softwareSkills','training']) if (required(key) && !(state.formData[key] || []).some((item) => Object.values(item).some((v) => cleanValue(v)))) return error(`حداقل یک مورد برای «${({workHistory:'سوابق کاری',education:'تحصیلات',languages:'زبان خارجی',softwareSkills:'مهارت نرم‌افزاری',training:'دوره آموزشی'})[key]}» وارد کنید.`);
      return true;
    }
    if (state.step === 4) {
      for (const key of (state.init.requiredFields || [])) if (['satisfaction','dissatisfaction','employmentType','availabilityHours','expectedSalary','startAvailability','referral','overtime','missions','healthStatus','healthDetails','referenceName','referenceRelation','referencePhone'].includes(key) && required(key)) {
        const selected = key === 'missions' ? (state.formData.missions || []).length : cleanValue(state.formData[key]);
        if (!selected) return error(`تکمیل «${({satisfaction:'عوامل رضایت',dissatisfaction:'عوامل نارضایتی',employmentType:'نوع همکاری',expectedSalary:'حقوق مورد انتظار',startAvailability:'زمان شروع',overtime:'آمادگی اضافه‌کاری',missions:'آمادگی مأموریت',healthStatus:'وضعیت سلامت',referenceName:'نام معرف',referencePhone:'تلفن معرف'})[key] || key}» الزامی است.`);
      }
      if (required('missions') && !(state.formData.missions || []).length) return error('گزینه آمادگی برای مأموریت را انتخاب کنید.');
      if (!state.formData.declaredAccurate) return error('برای ادامه، تأیید صحت اطلاعات را علامت بزنید.');
      return true;
    }
    if (state.init.psychologyEnabled && state.step === 5) {
      if (state.init.psychologyRequired && Object.keys(state.answers).length < state.init.questions.length) return error('برای ادامه به همه پرسش‌ها پاسخ دهید.');
      if (state.init.psychologyRequired && !state.formData.assessmentConsent) return error('رضایت آگاهانه درباره نگهداری محرمانه پاسخ‌ها را تأیید کنید.');
      return true;
    }
    return true;
  }
  async function nextStep() {
    captureForm(); setError('');
    if (!validateCurrentStep()) return;
    const reviewIndex = state.init.psychologyEnabled ? 6 : 5;
    if (state.step < reviewIndex) state.step += 1;
    render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function sendOtp() {
    const phoneInput = document.getElementById('apply-phone'); state.phone = cleanValue(phoneInput?.value || state.phone); setError('');
    if (!state.phone) { setError('شماره موبایل را وارد کنید.'); render(); return; }
    if (!state.selectedJob) { setError('ابتدا یک موقعیت شغلی انتخاب کنید.'); state.step = 0; render(); return; }
    state.sending = true; render();
    try {
      const result = await api('api/public/otp/send', { method: 'POST', body: JSON.stringify({ phone: state.phone, jobId: state.selectedJob }) });
      state.otpSent = true; state.demoCode = result.demoCode || ''; state.otpCode = result.demoCode || ''; state.maskedPhone = result.phone; setError(''); toast(`کد تأیید برای ${result.phone} ارسال شد.`, 'success');
    } catch (error) { setError(error.message); }
    finally { state.sending = false; render(); }
  }
  async function verifyOtp() {
    state.phone = cleanValue(document.getElementById('apply-phone')?.value || state.phone); state.otpCode = cleanValue(document.getElementById('apply-otp')?.value || state.otpCode); setError('');
    if (!state.phone || !state.otpCode) { setError('شماره موبایل و کد شش‌رقمی را وارد کنید.'); render(); return; }
    state.sending = true; render();
    try {
      const result = await api('api/public/otp/verify', { method: 'POST', body: JSON.stringify({ phone: state.phone, code: state.otpCode, jobId: state.selectedJob }) });
      state.otpVerified = true; state.maskedPhone = result.phone; state.alreadyApplied = result.alreadyApplied; state.formData.phone = state.phone; setError(''); toast('شماره موبایل با موفقیت تأیید شد.', 'success');
    } catch (error) { setError(error.message); }
    finally { state.sending = false; render(); }
  }
  async function submitApplication() {
    captureForm(); setError('');
    if (!state.formData.declaredAccurate) { setError('برای ثبت نهایی، صحت اطلاعات را تأیید کنید.'); render(); return; }
    if (state.init.psychologyEnabled && state.init.psychologyRequired && !state.formData.assessmentConsent) { setError('رضایت آگاهانه آزمون را تأیید کنید.'); state.step = 5; render(); return; }
    if (state.init.psychologyEnabled && state.init.psychologyRequired && Object.keys(state.answers).length < state.init.questions.length) { setError('همه پرسش‌های ارزیابی را تکمیل کنید.'); state.step = 5; render(); return; }
    const completeAnswers = Object.keys(state.answers).length === state.init.questions.length ? state.answers : {};
    const body = { formData: state.formData, answers: completeAnswers };
    state.sending = true; render();
    try { const result = await api('api/public/apply', { method: 'POST', body: JSON.stringify(body) }); state.done = result; toast('درخواست استخدام شما ثبت شد.', 'success'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (error) { state.sending = false; if (error.status === 401) { state.otpVerified = false; state.step = 1; } setError(error.message); render(); }
  }
  async function compressPhoto(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('فقط تصویر PNG، JPG یا WEBP مجاز است.');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم عکس باید کمتر از ۵ مگابایت باشد.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const max = 480, ratio = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .75);
    } finally { URL.revokeObjectURL(url); }
  }
  async function clickAction(event) {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const action = target.dataset.action;
    if (action === 'select-job') { const nextJob = target.dataset.id; if (nextJob !== state.selectedJob) { state.otpSent = false; state.otpVerified = false; state.demoCode = ''; state.otpCode = ''; state.alreadyApplied = false; } state.selectedJob = nextJob; setError(''); render(); return; }
    if (action === 'next') { await nextStep(); return; }
    if (action === 'previous') { captureForm(); setError(''); state.step = Math.max(0, state.step - 1); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (action === 'send-otp') { await sendOtp(); return; }
    if (action === 'verify-otp') { await verifyOtp(); return; }
    if (action === 'submit-application') { await submitApplication(); return; }
    if (action === 'add-repeater') { captureForm(); const key = target.dataset.key; state.formData[key] ||= []; state.formData[key].push({}); render(); return; }
    if (action === 'remove-repeater') { captureForm(); const key = target.dataset.key, index = Number(target.dataset.index); if (state.formData[key]?.length > 1) state.formData[key].splice(index,1); render(); return; }
  }
  root.addEventListener('click', clickAction);
  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.id === 'apply-photo' && target.files?.[0]) {
      try { state.formData.photoData = await compressPhoto(target.files[0]); render(); toast('عکس آماده شد.', 'success'); }
      catch (error) { toast(error.message, 'error'); }
    }
    if (target.id === 'apply-phone') { state.phone = target.value; state.otpSent = false; state.demoCode = ''; state.otpVerified = false; }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id === 'apply-phone') { state.phone = event.target.value; state.otpSent = false; state.otpVerified = false; state.demoCode = ''; }
    if (event.target.id === 'apply-otp') state.otpCode = event.target.value;
  });
  root.addEventListener('keydown', (event) => {
    const choice = event.target.closest('.job-choice');
    if (choice && ['Enter',' '].includes(event.key)) { event.preventDefault(); if (state.selectedJob !== choice.dataset.id) { state.otpSent = false; state.otpVerified = false; state.demoCode = ''; state.otpCode = ''; state.alreadyApplied = false; } state.selectedJob = choice.dataset.id; setError(''); render(); }
    if (event.target.id === 'apply-otp' && event.key === 'Enter') verifyOtp();
  });
  async function boot() {
    try {
      state.init = await api('api/public/init');
      const requestedJob = new URLSearchParams(window.location.search).get('job');
      if (requestedJob && state.init.jobs.some((job) => job.id === requestedJob)) { state.selectedJob = requestedJob; state.step = 1; }
      render();
    } catch (error) {
      root.innerHTML = `<section class="public-empty"><div class="empty-icon">${icon('info',24)}</div><h2>فرم در دسترس نیست</h2><p>${esc(error.message || 'چند لحظه دیگر دوباره تلاش کنید.')}</p><button class="btn btn-soft" data-action="retry">تلاش دوباره</button></section>`;
      root.addEventListener('click', (event) => { if (event.target.closest('[data-action="retry"]')) boot(); });
    }
  }
  boot();
})();
