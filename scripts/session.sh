#!/bin/sh
# ورود با کاربر مدیر ارشد از طریق API و ذخیره کوکی نشست (برای اسکریپت‌های تست/توسعه)
# استفاده:  SID=$(scripts/session.sh)  یا  . scripts/session.sh
BASE="${HRM_BASE:-http://localhost:3000}"
LOGIN="${HRM_LOGIN:-09123456789}"
PASS="${HRM_PASS:-Hrm@12345}"
rm -f /tmp/cj.txt
curl -s -c /tmp/cj.txt -o /dev/null -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Requested-With: HRM' \
  --data "{\"login\":\"$LOGIN\",\"password\":\"$PASS\"}"
grep -o 'hrm_sid[[:space:]]*[a-f0-9]*' /tmp/cj.txt | awk '{print $2}'
