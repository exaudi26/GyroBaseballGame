// Orientation logger. Enabled with:  node server.js --log
// Type a label in the terminal + Enter to tag what you're doing (e.g. "bat_up"), "save" to finish.
// Output (in ./logs/):  session_<time>.csv  (raw rows)   session_<time>_summary.txt  (per-label stats)
const fs = require('fs'), path = require('path');

const enabled = process.argv.includes('--log');
const rows = [];
let label = 'unlabeled', stream, base, t0, done = false;

function start() {
  const dir = path.join(__dirname, 'logs'); fs.mkdirSync(dir, { recursive: true });
  base = path.join(dir, 'session_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  stream = fs.createWriteStream(base + '.csv');
  stream.write('t_ms,label,pitch,roll,yaw,swing,peak\n');
  console.log(`[log] writing ${base}.csv\n[log] type a label + Enter to tag poses (e.g. ready, bat_up, swing). "save" = finish.`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => {
    const t = d.trim(); if (!t) return;
    if (t === 'save' || t === 'quit') return finish();
    label = t.replace(/[^\w-]/g, '_'); console.log('[log] label =', label);
  });
  process.on('SIGINT', finish);
}

function record(msg) {
  if (!enabled || done) return;
  if (!stream) { start(); t0 = Date.now(); }
  const t = Date.now() - t0;
  if (msg === 'CALIBRATE') { stream.write(`${t},CALIBRATE,,,,,\n`); return; }
  const [p, r, y, s, k] = msg.split(',').map(Number);
  if ([p, r, y, s, k].some(isNaN)) return;
  stream.write(`${t},${label},${p},${r},${y},${s},${k}\n`);
  rows.push({ label, p, r, y, s, k });
}

function finish() {
  if (done) return; done = true;
  const by = {};
  for (const r of rows) (by[r.label] ??= []).push(r);
  const st = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return `mean ${m.toFixed(0)}  min ${Math.min(...a).toFixed(0)}  max ${Math.max(...a).toFixed(0)}`; };
  let out = `Orientation log summary (degrees). Rows: ${rows.length}\n`;
  for (const [l, a] of Object.entries(by))
    out += `\n[${l}] n=${a.length}\n  pitch ${st(a.map(x => x.p))}\n  roll  ${st(a.map(x => x.r))}\n  yaw   ${st(a.map(x => x.y))}\n  swing flags ${a.filter(x => x.s).length}, max peak ${Math.max(...a.map(x => x.k)).toFixed(1)}\n`;
  fs.writeFileSync(base + '_summary.txt', out); console.log(out + `\n[log] saved ${base}_summary.txt`);
  stream.end(() => process.exit(0));
}

module.exports = { record };