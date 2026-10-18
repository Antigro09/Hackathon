// Zero-dependency build script: TEAM_PLAYBOOK.md -> index.html
// Run from the repo root: node docs/build-playbook.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(dir, 'TEAM_PLAYBOOK.md'), 'utf8');
const outPath = join(dir, 'index.html');

const PEOPLE = [
  { id: 'ricardo', name: 'Ricardo', role: 'Business lead', color: '#2563eb', terms: ['ricardo', 'business lead'] },
  { id: 'vihaan', name: 'Vihaan', role: 'Technical lead', color: '#7c3aed', terms: ['technical lead', 'vihaan'] },
  { id: 'anthony', name: 'Anthony', role: 'Demo lead', color: '#16a34a', terms: ['demo lead', 'anthony'] },
  { id: 'tate', name: 'Tate', role: 'Evidence', color: '#ea580c', terms: ['tate'] },
];
const mentions = (text, p) => p.terms.some(term => new RegExp('\\b' + term + '\\b', 'i').test(text));
const personFor = text => PEOPLE.find(p => mentions(text, p)) || null;
const peopleIn = text => PEOPLE.filter(p => mentions(text, p)).map(p => p.id).join(' ');

// ---------- inline formatting ----------
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
function inline(s) {
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => link(u, t));
  s = s.replace(/(?<![\w"'>])https?:\/\/[^\s<"']+/g, u => link(u, u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}
const stripMd = s => s
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/~~([^~]+)~~/g, '$1')
  .trim();

// ---------- block parsing ----------
const isHr = l => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isQ = l => /^>/.test(l);
const isT = l => /^\s*\|.*\|/.test(l);
const isUl = l => /^\s*[-*+]\s+/.test(l);
const isOl = l => /^\s*\d+\.\s+/.test(l);
const startsBlock = l => /^#{1,6}\s+/.test(l) || isHr(l) || isQ(l) || isT(l) || isUl(l) || isOl(l);

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (isHr(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (isQ(line)) {
      const q = [];
      while (i < lines.length && isQ(lines[i])) q.push(lines[i++].replace(/^> ?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(q) });
      continue;
    }
    if (isT(line)) {
      const rows = [];
      while (i < lines.length && isT(lines[i])) rows.push(lines[i++].trim());
      blocks.push({ type: 'table', rows });
      continue;
    }
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line), items = [];
      while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i])))
        items.push(lines[i++].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const p = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) p.push(lines[i++]);
    blocks.push({ type: 'p', text: p.join(' ') });
  }
  return blocks;
}
function splitRow(row) {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|')) r = r.slice(0, -1);
  return r.split('|').map(c => c.trim());
}
const tableRows = b => {
  const rows = b.rows.map(splitRow);
  const isSep = r => r.length && r.every(c => /^:?-{2,}:?$/.test(c));
  return { head: rows[0], body: isSep(rows[1] || []) ? rows.slice(2) : rows.slice(1) };
};

// ---------- rendering ----------
let taskId = 0;
function renderBlocks(blocks, opts = {}) {
  let out = '';
  for (const b of blocks) {
    if (b.type === 'h') out += `<h${b.level + 1}>${inline(b.text)}</h${b.level + 1}>\n`;
    else if (b.type === 'hr') continue;
    else if (b.type === 'p') out += `<p>${inline(b.text)}</p>\n`;
    else if (b.type === 'quote') {
      let inner = renderBlocks(b.blocks, opts);
      if (opts.script) inner = inner.replace(/<em>\(/g, '<em class="dir">(');
      out += `<blockquote${opts.script ? ' class="say"' : ''}>\n${inner}</blockquote>\n`;
    } else if (b.type === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      out += `<${tag}>\n`;
      for (const it of b.items) {
        const t = it.match(/^\[([ xX])\]\s+(.*)$/);
        if (t) out += `<li class="task"><label><input type="checkbox" id="task-${taskId++}"${t[1] !== ' ' ? ' checked' : ''}> <span>${inline(t[2])}</span></label></li>\n`;
        else out += `<li${/^~~/.test(it) ? ' class="never"' : ''}>${inline(it)}</li>\n`;
      }
      out += `</${tag}>\n`;
    } else if (b.type === 'table') {
      const { head, body } = tableRows(b);
      out += '<div class="tw"><table>\n<thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>\n<tbody>\n'
        + body.map(r => {
          const ids = peopleIn(stripMd(r.join(' ')));
          return `<tr${ids ? ` data-people="${ids}"` : ''}>` + r.map((c, ci) =>
            `<td data-label="${esc(stripMd(head[ci] || ''))}"${/^(\*\*)?(now|\d{1,2}:\d{2})/i.test(c) && c.length < 22 ? ' class="t"' : ''}>${inline(c)}</td>`).join('') + '</tr>';
        }).join('\n') + '\n</tbody></table></div>\n';
    }
  }
  return out;
}

// ---------- document structure ----------
const blocks = parseBlocks(md.split(/\r?\n/));
let title = 'Team Playbook';
const sections = [], pre = [];
for (const b of blocks) {
  if (b.type === 'h' && b.level === 1) { title = stripMd(b.text); continue; }
  if (b.type === 'h' && b.level === 2) { sections.push({ raw: b.text, title: stripMd(b.text), blocks: [] }); continue; }
  (sections.length ? sections[sections.length - 1].blocks : pre).push(b);
}
const introHtml = pre.filter(b => b.type === 'quote').map(b => renderBlocks(b.blocks)).join('');

// pitch segments for the rehearsal timer (section 3 table: Time | Speaker | Section | Rubric)
// the pitch timeline is the first table whose rows start with a time range like "0:00–1:00";
// the script section is the first section with speaker sub-headings after it
const timeRow = /(\d+):(\d{2})\s*[\u2013\u2014-]\s*(\d+):(\d{2})/;
const tableSec = sections.findIndex(s => s.blocks.some(b => b.type === 'table' && tableRows(b).body.some(r => timeRow.test(r[0] || ''))));
const sec3 = sections.findIndex((s, i) => i >= tableSec && s.blocks.some(b => b.type === 'h' && b.level === 3 && personFor(stripMd(b.text).split(':')[0])));
const segments = [];
if (tableSec >= 0) {
  const tb = sections[tableSec].blocks.find(b => b.type === 'table');
  if (tb) for (const r of tableRows(tb).body) {
    const m = r[0] && r[0].match(/(\d+):(\d{2})\s*[\u2013\u2014-]\s*(\d+):(\d{2})/);
    if (!m) continue;
    const speaker = stripMd(r[1] || '');
    const p = personFor(speaker);
    segments.push({ start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4], who: p ? p.name : speaker, name: stripMd(r[2] || '') });
  }
}
const TOTAL = segments.length ? segments[segments.length - 1].end : 300;

let mainHtml = '';
sections.forEach((sec, idx) => {
  const script = idx === sec3;
  mainHtml += `<section id="sec-${idx + 1}">\n<h2>${inline(sec.raw)}</h2>\n`;
  let cur = null;
  const seen = new Set();
  const flush = () => {
    if (!cur) return;
    const name = stripMd(cur.h.text);
    const p = script ? personFor(name.split(':')[0]) : null;
    const anchor = p && !seen.has(p.id) ? ` id="part-${p.id}"` : '';
    if (p) seen.add(p.id);
    mainHtml += `<div class="sub${p ? ' speaker' : ''}" data-people="${peopleIn(name)}"${p ? ` style="--c:${p.color}"` : ''}${anchor}>`
      + `<h3>${p ? `<span class="tag">${esc(p.name)}</span> ` : ''}${inline(cur.h.text)}</h3>\n${renderBlocks(cur.blocks, { script })}</div>\n`;
    cur = null;
  };
  for (const b of sec.blocks) {
    if (b.type === 'h' && b.level === 3) { flush(); cur = { h: b, blocks: [] }; }
    else if (cur) cur.blocks.push(b);
    else mainHtml += renderBlocks([b], { script });
  }
  flush();
  mainHtml += '</section>\n';
});

const tocHtml = sections.map((s, i) => `<li><a href="#sec-${i + 1}">${esc(s.title.replace(/\s*\(.*\)\s*$/, ''))}</a></li>`).join('');
const partsHtml = `<button type="button" data-part="everyone">Everyone</button>`
  + PEOPLE.map(p => `<button type="button" data-part="${p.id}" style="--c:${p.color}">${p.name}</button>`).join('');

// ---------- page ----------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--ink:#1f2328;--mute:#656d76;--line:#d8dee4;--soft:#f6f8fa;--accent:#0969da;--me:#0969da}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:4rem}
body{margin:0;color:var(--ink);background:#fff;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}
.bar{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line)}
.bar-in{max-width:760px;margin:0 auto;padding:.5rem 1rem;display:flex;gap:.4rem;align-items:center;overflow-x:auto}
.bar .lbl{color:var(--mute);font-size:.85rem;margin-right:.2rem;white-space:nowrap}
.bar button{font:inherit;font-size:.88rem;padding:.3rem .7rem;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer;white-space:nowrap;color:var(--ink)}
.bar button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.bar button[data-part]:not([data-part=everyone]){border-bottom:2px solid var(--c)}
.bar #timerBtn{margin-left:auto;font-variant-numeric:tabular-nums}
main{max-width:760px;margin:0 auto;padding:1.5rem 1rem 5rem}
h1{font-size:1.75rem;line-height:1.25;margin:.5rem 0 .75rem}
.intro{color:var(--mute);margin:0 0 1rem}
.intro p{margin:0}
.toc{margin:0 0 1rem;padding:.75rem 1rem;list-style:none;background:var(--soft);border-radius:6px}
.toc li{margin:.15rem 0}
section{border-top:1px solid var(--line);padding-top:.5rem;margin-top:2rem}
h2{font-size:1.35rem;margin:.75rem 0}
h3{font-size:1.05rem;margin:1.5rem 0 .5rem}
p,ul,ol{margin:.6rem 0}
ul,ol{padding-left:1.4rem}
li{margin:.25rem 0}
blockquote{margin:.8rem 0;padding:.2rem 1rem;border-left:3px solid var(--line);color:var(--ink)}
blockquote.say{border-left-color:var(--c,var(--line));background:var(--soft);border-radius:0 6px 6px 0;padding:.4rem 1rem}
em.dir{color:var(--mute)}
.tag{display:inline-block;font-size:.75rem;font-weight:600;color:#fff;background:var(--c);padding:.05rem .45rem;border-radius:4px;vertical-align:2px}
.sub{transition:opacity .15s}
body.filtering .sub.speaker:not(.hit){opacity:.35}
.tw{overflow-x:auto;margin:.8rem 0}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{border:1px solid var(--line);padding:.45rem .6rem;text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:600}
td.t{white-space:nowrap}
tr.hit td{background:color-mix(in srgb,var(--me) 10%,#fff)}
li.never del{color:#cf222e}
li.task{list-style:none;margin-left:-1.4rem}
li.task label{cursor:pointer}
li.task input:checked+span{color:var(--mute);text-decoration:line-through}
#timer{position:fixed;right:1rem;bottom:1rem;z-index:20;width:min(300px,calc(100vw - 2rem));background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:.9rem 1rem;display:none}
#timer.open{display:block}
#timer .time{font-size:2.4rem;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1}
#timer.warn .time{color:#bf8700}#timer.over .time{color:#cf222e}
#timer .now{margin-top:.3rem;font-weight:600}
#timer .next{color:var(--mute);font-size:.88rem}
#timer .btns{display:flex;gap:.4rem;margin-top:.7rem}
#timer .btns button{flex:1;font:inherit;font-size:.9rem;padding:.4rem;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer}
#timer .btns button.go{background:var(--ink);color:#fff;border-color:var(--ink)}
@media(max-width:600px){
  h1{font-size:1.45rem}
  table{min-width:520px}
}
@media print{.bar,#timer{display:none}body.filtering .sub.speaker{opacity:1}}
</style>
</head>
<body>
<div class="bar"><div class="bar-in" id="parts">
<span class="lbl">My part:</span>${partsHtml}
<button type="button" id="timerBtn">Timer</button>
</div></div>
<main>
<h1>${esc(title)}</h1>
<div class="intro">${introHtml}</div>
<ul class="toc">${tocHtml}</ul>
${mainHtml}
</main>
<div id="timer" role="dialog" aria-label="Rehearsal timer">
<div class="time" id="tTime"></div>
<div class="now" id="tNow"></div>
<div class="next" id="tNext"></div>
<div class="btns"><button type="button" class="go" id="tGo">Start</button><button type="button" id="tReset">Reset</button></div>
</div>
<script>
var SEGMENTS = ${JSON.stringify(segments)};
var COLORS = ${JSON.stringify(Object.fromEntries(PEOPLE.map(p => [p.id, p.color])))};
var TOTAL = ${TOTAL};
function fmt(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }

function setPart(id, jump){
  if(!COLORS[id]) id = 'everyone';
  store('myPart', id);
  document.body.classList.toggle('filtering', id !== 'everyone');
  document.documentElement.style.setProperty('--me', COLORS[id] || '#0969da');
  document.querySelectorAll('#parts [data-part]').forEach(function(b){ b.classList.toggle('on', b.dataset.part === id); });
  document.querySelectorAll('.sub, tbody tr').forEach(function(el){
    el.classList.toggle('hit', id !== 'everyone' && (' ' + (el.dataset.people || '') + ' ').indexOf(' ' + id + ' ') !== -1);
  });
  if(jump && id !== 'everyone'){ var t = document.getElementById('part-' + id); if(t) t.scrollIntoView({behavior:'smooth'}); }
}
document.getElementById('parts').addEventListener('click', function(e){
  var b = e.target.closest('[data-part]'); if(b) setPart(b.dataset.part, true);
});
setPart(new URLSearchParams(location.search).get('part') || store('myPart') || 'everyone', false);

document.querySelectorAll('li.task input').forEach(function(cb){
  if(store('cb-' + cb.id) === '1') cb.checked = true;
  cb.addEventListener('change', function(){ store('cb-' + cb.id, cb.checked ? '1' : '0'); });
});

var left = TOTAL, t = null, box = document.getElementById('timer'), btn = document.getElementById('timerBtn');
function segAt(el){ for(var i=0;i<SEGMENTS.length;i++){ if(el >= SEGMENTS[i].start && el < SEGMENTS[i].end) return i; } return SEGMENTS.length - 1; }
function draw(){
  var el = TOTAL - left, done = left === 0;
  document.getElementById('tTime').textContent = fmt(left);
  btn.textContent = 'Timer ' + fmt(left);
  document.getElementById('tGo').textContent = t ? 'Pause' : 'Start';
  var now = document.getElementById('tNow'), next = document.getElementById('tNext');
  if(done){ now.textContent = 'Time is up.'; next.textContent = ''; }
  else if(SEGMENTS.length){
    var i = segAt(el), s = SEGMENTS[i];
    now.textContent = s.who + ': ' + s.name;
    next.textContent = i + 1 < SEGMENTS.length ? 'Next: ' + SEGMENTS[i+1].who : 'Closing line';
    box.classList.toggle('warn', s.end - el <= 15);
  }
  box.classList.toggle('over', done);
}
document.getElementById('tGo').addEventListener('click', function(){
  if(t){ clearInterval(t); t = null; draw(); return; }
  if(left <= 0) return;
  t = setInterval(function(){ if(left > 0) left--; if(left <= 0){ clearInterval(t); t = null; } draw(); }, 1000);
  draw();
});
document.getElementById('tReset').addEventListener('click', function(){ if(t){ clearInterval(t); t = null; } left = TOTAL; box.classList.remove('warn'); draw(); });
btn.addEventListener('click', function(){ box.classList.toggle('open'); });
draw();
</script>
</body>
</html>
`;

writeFileSync(outPath, html, 'utf8');
console.log('Wrote ' + outPath + ' (' + sections.length + ' sections, ' + segments.length + ' timer segments)');
