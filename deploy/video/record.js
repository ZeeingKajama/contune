#!/usr/bin/env node
// 부스 소개 영상 촬영. 써밋 시연판(.run/summit-demo, deploy/summit_demo.sh가 만든다)을 director.html 무대에 띄우고
// shots.js 순서대로 장면을 차려 화면을 녹화한다(Chrome DevTools 화면 전송, JPEG 프레임 + 시각).
// 장면을 차리는 동안은 버리고 shot마다 [a, b] 구간만 남긴다(segments.json). 이어 붙이기는 compose.py.
//   사용: node deploy/video/record.js [출력 폴더(기본 .run/video)]
// 필요: Playwright + Chromium, 한글 글꼴(Pretendard 권장. 없으면 시스템 글꼴).
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RUN = path.join(ROOT, '.run');
const OUT = path.resolve(process.argv[2] || path.join(RUN, 'video'));
const FR = path.join(OUT, 'frames');
const SHOTS = require('./shots.js');
const W = 1600, H = 900;          // 무대 좌표(director.html이 1.2배로 그려 1920×1080)
const VW = 1920, VH = 1080;
const FLOW_ASK = '매일 18시에 batch-01에서 정산 리포트를 만들고 끝나면 dw-01에 적재';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// /director.html은 이 폴더에서, 나머지는 .run/에서
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = u === '/director.html' ? path.join(__dirname, 'director.html') : path.join(RUN, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(RUN) && file !== path.join(__dirname, 'director.html')) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { log('[404]', u); res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const now = () => Date.now() / 1000;
const sleepUntil = (t) => sleep((t - now()) * 1000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  if (!fs.existsSync(path.join(RUN, 'summit-demo', 'index.html'))) {
    console.error('.run/summit-demo가 없습니다. 먼저 deploy/summit_demo.sh를 돌리세요.');
    process.exit(1);
  }
  fs.rmSync(FR, { recursive: true, force: true });
  fs.mkdirSync(FR, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log('[console]', m.text().slice(0, 200)); });
  await page.goto(`${base}/director.html?app=/summit-demo/index.html`);
  let frame = null;
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/summit-demo/')); if (!frame) await sleep(100); }
  if (!frame) throw new Error('앱 iframe이 뜨지 않음');
  await frame.waitForFunction(() => window.__eumStage && window.__eumStage.state().ready, null, { timeout: 30000 });
  // 발표자용 큐 카드와 위 막대 칩은 숨긴다(주황 테두리는 둔다: 가리키는 곳)
  await frame.addStyleTag({ content: '.sg, .sg-chip { display:none !important }' });
  const STOPS = await frame.evaluate(() => window.__eumStage.stops.map((s) => s.id));

  // ---- 녹화 ----
  const frames = [];
  let n = 0;
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (e) => {
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
    const f = String(++n).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(FR, f), Buffer.from(e.data, 'base64'));
    frames.push({ f, t: (e.metadata && e.metadata.timestamp) || now() });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  const segs = [];
  const seg = (a, b, name) => { segs.push({ a, b, name }); log(`  ✓ ${name} ${(b - a).toFixed(2)}s`); };
  const V = (fn, arg) => page.evaluate(fn, arg);
  const stageState = () => frame.evaluate(() => window.__eumStage.state());
  const waitAt = (id, ms = 30000) => frame.waitForFunction((id) => { const s = window.__eumStage.state(); return !s.busy && s.id === id; }, id, { timeout: ms });

  // 요소의 네모(iframe 좌표). spec: { stop } | { sel, text }
  const rectOf = (spec) => frame.evaluate((spec) => {
    let e = null;
    if (spec.stop) {
      const s = window.__eumStage.stops.find((x) => x.id === spec.stop);
      const t = s && s.target;
      e = typeof t === 'function' ? t(document) : t ? document.querySelector(t) : null;
    } else if (spec.sel) {
      e = [...document.querySelectorAll(spec.sel)].find((x) => !spec.text || x.textContent.trim() === spec.text) || null;
    }
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  }, spec);
  const clickIn = (spec) => frame.evaluate((spec) => {
    let e;
    if (spec.stop) { const s = window.__eumStage.stops.find((x) => x.id === spec.stop); e = typeof s.target === 'function' ? s.target(document) : document.querySelector(s.target); }
    else e = [...document.querySelectorAll(spec.sel)].find((x) => !spec.text || x.textContent.trim() === spec.text);
    if (e) e.click(); // isTrusted가 아니라 엔진의 '직접 누름'으로 잡히지 않는다
    return !!e;
  }, spec);

  // 커서를 r의 가운데로 옮겨 누르는 모습(누르기는 따로)
  async function pointAt(r) {
    if (!r) return false;
    const [x, y] = await V(([x, y]) => V_.toStage(x, y), [r[0] + r[2] / 2, r[1] + r[3] / 2]);
    const sx = Math.min(W - 60, Math.max(60, x + 190)), sy = Math.min(H - 60, Math.max(60, y + 150));
    await V(([x, y]) => V_.cursor(x, y, 0), [sx, sy]);
    await sleep(80);
    await V(([x, y]) => V_.cursor(x, y, 650), [x - 4, y - 3]);
    await sleep(720);
    await V(() => V_.click());
    await sleep(160);
    return true;
  }

  const CUSTOM = {
    // AI 플로우 초안: 창을 열고 한 글자씩 친 뒤 초안 만들기. 엔진의 press(한 번에 채움) 대신 직접 한다.
    async aiflow(sh, a) {
      await sleepUntil(a + 0.8);
      await pointAt(await rectOf({ stop: 'aiflow' }));
      await clickIn({ stop: 'aiflow' });
      await frame.waitForSelector('textarea.ed-nl', { timeout: 5000 });
      await sleep(250);
      await V(() => V_.cursorOff());
      const mr = await rectOf({ sel: '.ed-modal' });
      if (mr) await V(([r]) => V_.look(r, 800, { max: 1.7 }), [mr]);
      await sleep(650);
      await frame.evaluate(async (txt) => {
        const t = document.querySelector('textarea.ed-nl');
        for (let i = 1; i <= txt.length && t.isConnected; i++) {
          t.value = txt.slice(0, i);
          t.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 42));
        }
        t.blur();
      }, FLOW_ASK);
      await sleep(600);
      await pointAt(await rectOf({ sel: '.ed-modal .btns button.ed-save' }));
      await clickIn({ sel: '.ed-modal .btns button.ed-save' });
      const tc = now();
      await sleep(300);
      await V(() => { V_.cursorOff(); V_.look(null, 700); });
      await frame.waitForFunction(() => { const s = window.__eumStage.stops.find((x) => x.id === 'aiflowed'); return !!s.target(document); }, null, { timeout: 20000 });
      return Math.min(now(), tc + 1.6);
    },
  };

  let arrived = false; // 앞 shot의 click으로 이미 이 장면에 와 있다
  for (const sh of SHOTS) {
    if (sh.card) {
      log(`카드 ${sh.card}`);
      await V((id) => { V_.cap('', ''); V_.punch(null); V_.cursorOff(); V_.look(null, 0); V_.card(id); }, sh.card);
      await sleep(60);
      const a = now();
      await sleep(sh.dur * 1000);
      seg(a, now(), sh.card);
      arrived = false;
      continue;
    }
    log(`장면 ${sh.stop}`);
    if (arrived) await waitAt(sh.stop);
    else {
      await frame.evaluate((id) => window.__eumStage.goto(id), sh.stop);
      await waitAt(sh.stop);
    }
    arrived = false;
    const s0 = await stageState();
    if (s0.error) log(`  ! 장면을 차리지 못함: ${s0.error}`);
    await sleep(sh.settle != null ? sh.settle : 450);

    const rect = sh.look === 'target' ? await rectOf({ stop: sh.stop }) : sh.look || null;
    if (sh.look === 'target' && !rect) log('  ! 확대할 요소가 없음');
    await V(([k, t, r, o]) => { V_.card(null); V_.punch(null); V_.cursorOff(); V_.look(null, 0); V_.cap(k, t, r, o); }, [sh.k, sh.t, rect, { max: sh.max }]);
    await sleep(120);
    const a = now();
    if (rect) { await sleep(200); await V(([r, o]) => V_.look(r, 1100, o), [rect, { max: sh.max }]); }

    if (sh.custom) { seg(a, await CUSTOM[sh.custom](sh, a), sh.stop); continue; }

    if (sh.punch) { await sleepUntil(a + sh.punch.at); await V((p) => V_.punch(p), sh.punch); }

    if (sh.click) {
      await sleepUntil(a + sh.dur - 1.15);
      const spec = sh.click === true ? { stop: sh.stop } : sh.click;
      await pointAt(await rectOf(spec));
      const tc = now();
      const nextId = STOPS[STOPS.indexOf(sh.stop) + 1];
      if (sh.click === true) {
        await frame.evaluate(() => { window.__eumStage.next(); }); // 엔진이 press를 하고 다음 장면을 차린다
        await sleep(320);
        await V(() => { V_.cursorOff(); V_.look(null, 700); });
        await waitAt(nextId);
        arrived = true;
      } else {
        await clickIn(spec);
        await sleep(320);
        await V(() => V_.cursorOff());
      }
      seg(a, Math.min(now(), tc + 1.6), sh.stop);
      continue;
    }
    await sleepUntil(a + sh.dur);
    seg(a, now(), sh.stop);
  }

  await sleep(300);
  await cdp.send('Page.stopScreencast');
  await sleep(300);
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames));
  fs.writeFileSync(path.join(OUT, 'segments.json'), JSON.stringify(segs, null, 1));
  const total = segs.reduce((x, s) => x + (s.b - s.a), 0);
  log(`프레임 ${frames.length}개, 구간 ${segs.length}개, 합 ${total.toFixed(1)}s`);
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
