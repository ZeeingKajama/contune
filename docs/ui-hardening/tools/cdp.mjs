// check.sh가 부른다. 작업 JSON: [{hash, name?, w?, h?, theme?, search?, wait?, follow?, eval?, wait2?, shot?}]
//  follow: 화면이 뜬 뒤 #page 안에서 이 선택자에 맞는 첫 링크의 주소로 옮긴다(예: "a[href^='#run/']")
//  eval:   화면에서 돌릴 식(약속이면 기다린다). 결과를 한 줄로 찍는다
//  shot:   false면 스크린샷을 안 찍는다
// 콘솔 오류·예외가 하나라도 있으면 종료 코드 1.
import fs from 'node:fs';
const { PORT, CPORT, OUT } = process.env;
const W = Number(process.env.W || 1440), H = Number(process.env.H || 1500), THEME = process.env.THEME || 'light';
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = `http://localhost:${PORT}/index.html`;
let list = [];
for (let i = 0; i < 20 && !list.length; i++) {
  try { list = (await (await fetch(`http://127.0.0.1:${CPORT}/json/list`)).json()).filter((t) => t.type === 'page'); } catch (e) { /* 아직 안 뜸 */ }
  if (!list.length) await new Promise((r) => setTimeout(r, 300));
}
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 240));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 240));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? null; };
await send('Page.enable'); await send('Runtime.enable');
let bad = 0;
for (const j of jobs) {
  const w = j.w || W, h = j.h || H, theme = j.theme || THEME;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: base + (j.search ?? process.env.SEARCH ?? '') + '#' + j.hash });
  await sleep(j.wait || 1800);
  if (j.follow) {
    await ev(`(()=>{const a=document.querySelector(${JSON.stringify('#page ' + j.follow)});if(a)location.hash=a.getAttribute('href')})()`);
    await sleep(j.wait || 1800);
  }
  let out = '';
  if (j.eval) { out = JSON.stringify(await ev(j.eval)).slice(0, 1500); await sleep(j.wait2 || 600); }
  const name = (j.name || j.hash.replace(/[^\w가-힣]+/g, '_')) + `-${w}-${theme}.png`;
  if (j.shot !== false) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(r.result.data, 'base64')); }
  const lg = logs.splice(0).filter((l) => !/favicon/.test(l));
  if (lg.length) bad++;
  console.log(lg.length ? 'BAD' : 'OK ', name, out, lg.join(' | '));
}
ws.close();
process.exit(bad ? 1 : 0);
