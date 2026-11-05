#!/usr/bin/env node
// Ham HTTP/1.1 yük istemcisi: gerçek eşzamanlılık, keep-alive soket havuzu.
// Kullanım: node blast.mjs --url U --concurrency 200 --seconds 30 [--method POST --body '...']
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const target = opt('url');
if (!target) { console.error('--url zorunlu'); process.exit(1); }
const CONC = Number(opt('concurrency', 50));
const SECS = Number(opt('seconds', 20));
const TIMEOUT = Number(opt('timeout', 20000));
const METHOD = (opt('method', 'GET') || 'GET').toUpperCase();
const BODY = opt('body', null);
const u = new URL(target);
const mod = u.protocol === 'http:' ? http : https;
const RANDOM = argv.includes('--random');
const agent = new mod.Agent({ keepAlive: true, maxSockets: CONC, maxFreeSockets: CONC });

// --random: her istege rastgele parametre ekler, onbellegi atlatir.
const nextUrl = () => {
  if (!RANDOM) return u;
  const x = new URL(u.href);
  x.searchParams.set('r', Math.random().toString(36).slice(2));
  return x;
};

const lat = [];
const codes = new Map();
const errs = new Map();
let done = 0, stop = false;
const t0 = Date.now();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

function one() {
  return new Promise((resolve) => {
    const s = performance.now();
    const req = mod.request(nextUrl(), {
      method: METHOD,
      agent,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
        'accept-encoding': 'gzip, br',
        'accept': 'text/html,*/*',
        ...(BODY ? { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(BODY) } : {}),
      },
    }, (res) => {
      let n = 0;
      res.on('data', (c) => { n += c.length; });
      res.on('end', () => { lat.push(performance.now() - s); bump(codes, String(res.statusCode)); done++; resolve(); });
      res.on('error', (e) => { bump(errs, e.code || e.name); done++; resolve(); });
    });
    req.setTimeout(TIMEOUT, () => req.destroy(new Error('TIMEOUT')));
    req.on('error', (e) => { lat.push(performance.now() - s); bump(errs, e.code || e.message || 'ERR'); done++; resolve(); });
    if (BODY) req.write(BODY);
    req.end();
  });
}

const pct = (p) => { if (!lat.length) return 0; const s = [...lat].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };

const MAXSOCK = CONC;
let inflight = 0;
async function worker() {
  while (!stop) {
    if (inflight >= MAXSOCK) { await new Promise((r) => setImmediate(r)); continue; }
    inflight++;
    await one();
    inflight--;
  }
}

console.log(`${METHOD} ${target} | conc=${CONC} sure=${SECS}s timeout=${TIMEOUT}ms\n`);
const ticker = setInterval(() => {
  const el = (Date.now() - t0) / 1000;
  console.log(`  ${el.toFixed(0)}s istek=${done} rps=${(done / el).toFixed(1)} p50=${pct(50).toFixed(0)}ms`);
}, 5000);
setTimeout(() => { stop = true; }, SECS * 1000);

await Promise.all(Array.from({ length: CONC }, worker));
clearInterval(ticker);
agent.destroy();

const el = (Date.now() - t0) / 1000;
const success = [...codes.entries()].filter(([k]) => k.startsWith('2') || k === '304').reduce((a, [, v]) => a + v, 0);
console.log(`\n=== SONUC === ${done} istek / ${el.toFixed(1)}s = ${(done / el).toFixed(1)} rps | basari %${((success / Math.max(done, 1)) * 100).toFixed(1)}`);
console.log(`p50/p90/p99 = ${pct(50).toFixed(0)}/${pct(90).toFixed(0)}/${pct(99).toFixed(0)} ms`);
console.log('kodlar:', [...codes.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
if (errs.size) console.log('hatalar:', [...errs.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
