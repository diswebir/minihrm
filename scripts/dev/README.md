# اسکریپت‌های توسعه (اختیاری — بخشی از سامانه نیستند)

این اسکریپت‌ها برای «تست دودی» و «تست سرتاسری» سامانه در محیط توسعه‌اند. هیچ‌کدام در اجرای
واقعی سامانه استفاده نمی‌شوند و به پکیج‌های نصب‌شده در `package.json` وابسته نیستند.

## پیش‌نیازها

1. سامانه در حال اجرا باشد: `node app.js` (پیش‌فرض روی `http://localhost:3000`).
2. برای تست‌های مرورگری، `jsdom` را *خارج از پروژه* نصب کنید تا وابستگی‌های سامانه صفر بماند:

```bash
mkdir -p /tmp/hrm-test && cd /tmp/hrm-test && npm init -y && npm i jsdom
# سپس هنگام اجرا:
export JSDOM_PATH=/tmp/hrm-test/node_modules/jsdom
```

3. نشست مدیر ارشد را بگیرید (اسکریپت `scripts/session.sh`):

```bash
export SID=$(scripts/session.sh)
```

## اسکریپت‌ها

| فایل | کار |
| --- | --- |
| `smoke-admin.js` | پنل مدیریت را در یک DOM واقعی بالا می‌آورد و همه صفحه‌ها و همه زبانه‌ها را بازدید می‌کند؛ خطای JS و خروجی `[object …]` را گزارش می‌دهد. |
| `tx-admin.js` | عملیات نوشتن را از خود رابط کاربری انجام می‌دهد (اگر پرونده‌ای موجود نباشد، ابتدا `e2e-portal.js` را برای ساخت داده اولیه اجرا می‌کند): تغییر وضعیت پرونده، ویرایش درجای پاسخ، یادداشت، تفسیر HR، ذخیره فرم‌ساز، تنظیمات، ویرایش موقعیت شغلی، ساخت/حذف کاربر، ساخت/حذف نقش، خاموش/روشن کردن ماژول، ویرایش قالب پیامک (و بازگردانی همه). |
| `e2e-portal.js` | مسیر کامل متقاضی: انتخاب موقعیت → ورود با کد پیامکی (کد از لاگ پیامک خوانده می‌شود) → ۱۲ مرحله فرم → ثبت نهایی → آزمون ۲۸ سؤالی → بررسی، آزمون و پیگیری وضعیت (`/track`). |
| `api-shape.js` | شکل پاسخ APIهای اصلی را چاپ می‌کند (برای توسعه کلاینت). |
| `routes.js` | وضعیت مسیرهای عمومی و ایستا را بدون مرورگر بررسی می‌کند. |
| `proxy-subpath.js` | شبیه‌ساز نصب در زیرمسیر (cPanel/Passenger): پروکسی `BASE=/hrm` روی پورت ۳۲۰۰. |
| `cleanup-test-data.js` | گزارش/حذف داده‌های آزمایشی ساخته‌شده توسط تست‌ها (با `--yes`). |

### تست حالت cPanel (زیرمسیر)

```bash
# ۱) برنامه را با پیشوند واقعی Passenger بالا بیاورید (روی یک کپی تازه)
cd /tmp/hrm-test-app && PORT=3300 PASSENGER_BASE_URI=/hrm node app.js
# ۲) یا با پروکسی شبیه‌ساز روی برنامه اصلی
node scripts/dev/proxy-subpath.js            # → http://localhost:3200/hrm

# اجرای تست‌ها روی همان پیشوند:
export HRM_BASE=http://localhost:3300/hrm      # یا http://localhost:3200/hrm
export HRM_APP_ROOT=/tmp/hrm-test-app          # برای خواندن کد پیامکی e2e (اختیاری)
export SID=$(HRM_LOGIN=0912... HRM_PASS=... scripts/session.sh)
node scripts/dev/routes.js $HRM_BASE
JSDOM_PATH=... node scripts/dev/smoke-admin.js
JSDOM_PATH=... node scripts/dev/tx-admin.js
JSDOM_PATH=... node scripts/dev/e2e-portal.js
```

## نمونه اجرا

```bash
export SID=$(scripts/session.sh)
node scripts/dev/routes.js
node scripts/dev/api-shape.js
JSDOM_PATH=/tmp/hrm-test/node_modules/jsdom node scripts/dev/smoke-admin.js
JSDOM_PATH=/tmp/hrm-test/node_modules/jsdom node scripts/dev/tx-admin.js
JSDOM_PATH=/tmp/hrm-test/node_modules/jsdom node scripts/dev/e2e-portal.js
```

> نکته: `e2e-portal.js` هر بار یک متقاضی آزمایشی جدید می‌سازد (شماره موبایل تصادفی) و
> `tx-admin.js` همه تغییرات آزمایشی خود را بازگردانی می‌کند؛ با این حال روی داده‌های واقعی
> اجرا نکنید.
