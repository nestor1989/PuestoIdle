/* Puesto Idle — juego (WebView de Android o navegador).
   En Android, MainActivity inyecta window.PuestoNative (ver GameBridge.kt).
   En un navegador sin puente, los anuncios y la compra se simulan para poder probar. */
(function(){
'use strict';

/* ================= Puente nativo ================= */
const N = window.PuestoNative || null;
const nat = (fn, ...a) => { try { return N && typeof N[fn] === 'function' ? N[fn](...a) : undefined; } catch(e){ return undefined; } };
const DEBUG = N ? !!nat('isDebug') : true;

/* ================= Idioma ================= */
const I18N = window.PUESTO_I18N;
const rawLang = String((N && nat('locale')) || navigator.language || 'en').toLowerCase();
const LANG = ['es', 'pt', 'fr', 'de', 'it'].find(l => rawLang.startsWith(l)) || 'en';
const TX = I18N[LANG];
document.documentElement.lang = LANG;
function t(key, vars){
  let s = TX[key]; if (s == null) s = I18N.en[key]; if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
  return s;
}
const nameOf = id => TX.names[id][0];
const lnameOf = id => TX.names[id][1];

/* ================= Economía ================= */
const KEY = 'puestoIdle.v1';
const TAP_S = 0.12, OFFLINE_CAP = 8 * 3600, STAR_K = 35000, STAR_BONUS = 0.10;
const BOOST_ADD = 240, BOOST_MAX = 3600;
const INTER_MIN_SESSIONS = 4, INTER_GAP_MS = 30 * 60 * 1000;
const MILESTONES = [10, 25, 50, 100, 150, 200];
const STATIONS = [
  { id:'churros',   helper:'Rosa',  color:'#F4A62A', cost0:4,      growth:1.12, rev:1,     time:1,  mgr:30 },
  { id:'empanadas', helper:'Beto',  color:'#E0703A', cost0:80,     growth:1.14, rev:20,    time:4,  mgr:1000 },
  { id:'tacos',     helper:'Lupe',  color:'#2BB39A', cost0:4000,   growth:1.15, rev:500,   time:10, mgr:40000 },
  { id:'arepas',    helper:'Mateo', color:'#E8467C', cost0:150000, growth:1.15, rev:15000, time:20, mgr:1.5e6, needsPrestige:1 },
];
const UPGRADES = [
  { id:'u1', target:'churros', mult:3, cost:300 }, { id:'u2', target:'empanadas', mult:3, cost:8000 },
  { id:'u3', target:'tacos', mult:3, cost:250000 }, { id:'u4', target:'all', mult:2, cost:2e6 },
  { id:'u5', target:'churros', mult:3, cost:20e6 }, { id:'u8', target:'arepas', mult:3, cost:50e6, needsPrestige:1 },
  { id:'u6', target:'empanadas', mult:3, cost:80e6 }, { id:'u7', target:'tacos', mult:3, cost:400e6 },
  { id:'u9', target:'all', mult:3, cost:3e9 }, { id:'u10', target:'arepas', mult:3, cost:20e9, needsPrestige:1 },
  { id:'u11', target:'all', mult:5, cost:500e9 },
];
const BARRIOS = [
  { name:'La Esquina',   sky:['#1F3552','#D9826A'], bldg:'#18283A', walk:'#5F5650', awning:'#E8467C' },
  { name:'La Plaza',     sky:['#1C4646','#E8B35E'], bldg:'#163434', walk:'#5C5A4E', awning:'#F4A62A' },
  { name:'El Mercado',   sky:['#352755','#E77A8F'], bldg:'#271D3E', walk:'#5A5058', awning:'#2BB39A' },
  { name:'La Feria',     sky:['#15304D','#6FC3B2'], bldg:'#12263E', walk:'#525A5A', awning:'#E0703A' },
  { name:'La Costanera', sky:['#193A5C','#F2C46D'], bldg:'#142E48', walk:'#5A5A52', awning:'#5B7CFA' },
  { name:'El Centro',    sky:['#281F3E','#F08A5D'], bldg:'#1D1730', walk:'#55505A', awning:'#9B5DE5' },
];
const S = {}; STATIONS.forEach((s, i) => { S[s.id] = s; s.i = i; });
const barrioOf = k => { const b = BARRIOS[k % BARRIOS.length]; const lap = Math.floor(k / BARRIOS.length); return { ...b, name: lap ? `${b.name} ${lap + 1}` : b.name }; };

/* ================= Estado ================= */
function fresh(){
  const z = v => Object.fromEntries(STATIONS.map(s => [s.id, v]));
  return {
    v:1, money:0, runEarned:0, lifeEarned:0, stars:0, prestiges:0, barrio:0,
    levels:{ ...z(0), churros:1 }, mgr:z(false), prog:z(0), running:z(false),
    upgrades:{}, buyMode:1, boostLeft:0, debugSpeed:1, savedAt:Date.now(), lastInter:0, simNoAds:false,
    settings:{ haptics:true, notif:false, notifAsked:false },
    flags:{ tapped:false, bought:false },
    m:{ firstTap:null, firstBuy:null, firstMgr:null, open_empanadas:null, open_tacos:null, open_arepas:null, firstUpgrade:null, firstPrestige:null, firstPrestigeStars:null, sessions:0, play:0, taps:0, ads:0, inters:0 },
  };
}
function merge(base, d){
  if (!d || typeof d !== 'object') return base;
  const out = { ...base };
  for (const k in d){
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && d[k] && typeof d[k] === 'object') out[k] = merge(base[k], d[k]);
    else out[k] = d[k];
  }
  return out;
}
function loadSave(){
  const tryParse = raw => { try { return raw ? merge(fresh(), JSON.parse(raw)) : null; } catch(e){ return null; } };
  let s = tryParse(nat('load'));
  if (!s){ try { s = tryParse(localStorage.getItem(KEY)); } catch(e){} }
  return s;
}
const hasHelpers = () => STATIONS.some(s => g.mgr[s.id]);
function save(){
  g.savedAt = Date.now();
  const json = JSON.stringify(g);
  try { localStorage.setItem(KEY, json); } catch(e){}
  nat('save', json, hasHelpers() && g.settings.notif);
}

let g = fresh();

const lvl = id => g.levels[id] || 0;
const available = st => !st.needsPrestige || g.prestiges >= st.needsPrestige;
const msCount = L => MILESTONES.reduce((k, m) => k + (L >= m ? 1 : 0), 0);
const nextMs = L => MILESTONES.find(m => m > L);
const cookTime = st => st.time / Math.pow(2, msCount(lvl(st.id)));
const starMult = () => 1 + STAR_BONUS * g.stars;
const starMultWith = s => 1 + STAR_BONUS * s;
const boostMult = () => g.boostLeft > 0 ? 2 : 1;
function upMult(st){ let m = 1; for (const u of UPGRADES) if (g.upgrades[u.id] && (u.target === st.id || u.target === 'all')) m *= u.mult; return m; }
const perUnit = st => st.rev * upMult(st) * starMult() * boostMult();
const batchValue = st => perUnit(st) * lvl(st.id);
function stationRate(st, boost = true){ const L = lvl(st.id); if (!L) return 0; return st.rev * L * upMult(st) * starMult() * (boost ? boostMult() : 1) / cookTime(st); }
function idleRate(boost = true){ let r = 0; for (const st of STATIONS) if (g.mgr[st.id]) r += stationRate(st, boost); return r; }
const starsTotalFor = e => Math.floor(Math.sqrt(e / STAR_K));
const pendingStars = () => Math.max(0, starsTotalFor(g.lifeEarned) - g.stars);
function nextStarIn(){ const n = starsTotalFor(g.lifeEarned) + 1; return n * n * STAR_K - g.lifeEarned; }
const prestigeRecommended = () => { const p = pendingStars(); return p >= 1 && p >= 10 + g.stars; };
function nextCost(st, L){ return st.cost0 * Math.pow(st.growth, L); }
function bulkCost(st, L, n){ const r = st.growth; return st.cost0 * Math.pow(r, L) * (Math.pow(r, n) - 1) / (r - 1); }
function maxAffordable(st, L, money){ const r = st.growth, a = nextCost(st, L); if (money < a) return 0; return Math.floor(Math.log(money * (r - 1) / a + 1) / Math.log(r)); }
function buyN(st){ const L = lvl(st.id); if (!L) return 1; if (g.buyMode === 'max') return Math.max(1, maxAffordable(st, L, g.money)); return g.buyMode; }
const noAds = () => N ? !!nat('noAdsOwned') : !!g.simNoAds;

/* ================= Formato ================= */
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const dec = s => TX.dec === ',' ? s.replace('.', ',') : s;
function fmt(n){
  if (!isFinite(n)) return '∞'; if (n < 0) n = 0;
  if (n < 1000){ if (n < 10 && Math.abs(n - Math.round(n)) > 0.05) return dec(n.toFixed(1)); return String(Math.floor(n)); }
  let i = 0; while (n >= 1000 && i < SUF.length - 1){ n /= 1000; i++; }
  let t = n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return dec(t) + ' ' + SUF[i];
}
const $m = n => '$' + fmt(n);
const $c = n => '$' + fmt(n < 1000 ? Math.ceil(n - 1e-9) : n);
const $w = n => '$' + fmt(n < 1000 ? Math.floor(n + 1e-9) : n);
function fmtT(x){ if (x >= 10) return Math.round(x) + ' s'; if (x >= 1) return dec(x.toFixed(1)) + ' s'; return dec(x.toFixed(2)) + ' s'; }
function clock(sec){ sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
function dur(sec){ sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); if (h) return `${h} h ${m} min`; if (m) return `${m} min`; return `${sec} s`; }

/* ================= Háptica ================= */
let lastTick = 0;
function haptic(kind){
  if (!g.settings.haptics) return;
  if (kind === 'tick'){ const now = performance.now(); if (now - lastTick < 45) return; lastTick = now; }
  nat('haptic', kind);
}

/* ================= Acciones ================= */
let visibleT0 = document.visibilityState === 'visible' ? performance.now() : null;
const vis = Object.fromEntries(STATIONS.map(s => [s.id, { acc:0, cd:0 }]));
function metric(name){ if (g.m[name] == null) g.m[name] = Math.round(g.m.play); }
function credit(v){ g.money += v; g.runEarned += v; g.lifeEarned += v; }
function earn(v, st){ credit(v); vis[st.id].acc += v; }

function tapStation(id){
  const st = S[id]; if (!lvl(id)) return;
  g.m.taps++;
  if (!g.flags.tapped){ g.flags.tapped = true; g.m.firstTap = visibleT0 == null ? 0 : Math.round((performance.now() - visibleT0) / 100) / 10; }
  if (!g.mgr[id] && !g.running[id]){ g.running[id] = true; g.prog[id] = 0; }
  else g.prog[id] += TAP_S / cookTime(st);
  const c = cards[id]; if (c){ c.icon.classList.remove('pop'); void c.icon.offsetWidth; c.icon.classList.add('pop'); }
  haptic('tick');
  scene.tapFx(id);
  refreshSoon();
}
function buyLevels(st, btn){
  if (!available(st)) return;
  const L = lvl(st.id), n = buyN(st), c = bulkCost(st, L, n);
  if (g.money + 1e-6 < c){ nope(btn, c); return; }
  g.money = Math.max(0, g.money - c);
  g.levels[st.id] = L + n;
  haptic('confirm');
  if (L === 0){ metric('open_' + st.id); toast(t('t_open', { lname:lnameOf(st.id) })); scene.burst(st.id, t('t_new')); }
  else { g.flags.bought = true; metric('firstBuy'); }
  if (msCount(L + n) > msCount(L)){ scene.burst(st.id, t('t_speed')); toast(t('t_ms', { name:nameOf(st.id), m:nextMsReached(L, L + n) })); haptic('heavy'); }
  refreshSoon();
}
function nextMsReached(a, b){ let r = b; for (const m of MILESTONES) if (m > a && m <= b) r = m; return r; }
function hire(st, btn){
  if (g.mgr[st.id] || !lvl(st.id)) return;
  if (g.money + 1e-6 < st.mgr){ nope(btn, st.mgr); return; }
  g.money -= st.mgr; g.mgr[st.id] = true; g.running[st.id] = true;
  metric('firstMgr');
  toast(t('t_hired', { helper:st.helper, lname:lnameOf(st.id) }));
  scene.burst(st.id, (LANG === 'es' ? '¡' : '') + st.helper + '!');
  haptic('heavy');
  save(); refreshSoon();
}
function effText(u){ return u.target === 'all' ? t('upEffectAll', { m:u.mult }) : t('upEffect', { name:nameOf(u.target), m:u.mult }); }
function buyUpgrade(u, btn){
  if (g.upgrades[u.id]) return;
  if (u.needsPrestige && g.prestiges < u.needsPrestige) return;
  if (g.money + 1e-6 < u.cost){ nope(btn, u.cost); return; }
  g.money -= u.cost; g.upgrades[u.id] = true; metric('firstUpgrade');
  toast(t('t_upg', { u:TX.upg[u.id], eff:effText(u) }));
  if (u.target === 'all') STATIONS.forEach(s => lvl(s.id) && scene.burst(s.id, '×' + u.mult)); else scene.burst(u.target, '×' + u.mult);
  haptic('confirm');
  buildUpgrades(); refreshSoon();
}
function doPrestige(){
  const p = pendingStars(); if (p < 1) return;
  const first = g.prestiges === 0;
  const from = barrioOf(g.barrio).name;
  g.stars += p; g.prestiges++; g.barrio++;
  if (g.m.firstPrestige == null){ metric('firstPrestige'); g.m.firstPrestigeStars = p; }
  const f = fresh();
  g.money = 0; g.runEarned = 0; g.levels = f.levels; g.mgr = f.mgr; g.prog = f.prog; g.running = f.running; g.upgrades = {};
  haptic('heavy');
  save(); scene.reset(); buildUpgrades(); setTab('cocina'); refreshSoon();
  const celebrate = () => {
    const to = barrioOf(g.barrio).name;
    openModal(`<h2>${t('pr_title', { b:to })}</h2>
      <p>${t('pr_text', { from, s:g.stars, p:Math.round(STAR_BONUS * g.stars * 100) })}</p>
      ${first ? `<p>${t('pr_first')}</p>` : ''}
      <button class="btn buy big" type="button" data-close>${t('pr_btn')}</button>`);
  };
  // Intersticial: solo acá (fin de un barrio), nunca en las primeras sesiones ni más de 1 cada 30 min.
  if (!noAds() && g.m.sessions >= INTER_MIN_SESSIONS && Date.now() - (g.lastInter || 0) >= INTER_GAP_MS){
    g.lastInter = Date.now(); save();
    showInterstitial(celebrate);
  } else celebrate();
}
function nope(btn, cost){
  if (btn){ btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
  toast(t('t_short', { v:$c(cost - g.money) }));
}

/* ================= Anuncios ================= */
let adBusy = false;
const pendingRewards = {};
function simulatedAd(tag, secs, onDone){
  if (adBusy) return; adBusy = true;
  const el = $('#ad'), cnt = $('#adCount'); let n = secs;
  $('#adTag').textContent = tag; $('#adText').textContent = 'Simulado: en el teléfono va un anuncio de AdMob.';
  cnt.textContent = n; el.hidden = false;
  const iv = setInterval(() => { n--; cnt.textContent = Math.max(n, 0); if (n <= 0){ clearInterval(iv); el.hidden = true; adBusy = false; onDone(); } }, 1000);
}
function rewarded(placement, onGranted){
  if (noAds()){ onGranted(); refreshSoon(); return; }
  if (N){ pendingRewards[placement] = onGranted; nat('showRewarded', placement); return; }
  simulatedAd('VIDEO RECOMPENSADO SIMULADO', 3, () => { g.m.ads++; onGranted(); refreshSoon(); });
}
function showInterstitial(then){
  g.m.inters++;
  if (N){ pendingInter = then; nat('showInterstitial'); return; }
  simulatedAd('INTERSTICIAL SIMULADO', 2, then);
}
let pendingInter = null;
function boostTap(){
  if (g.boostLeft >= BOOST_MAX - BOOST_ADD){ toast(t('t_boostMax')); return; }
  rewarded('boost', () => { g.boostLeft = Math.min(BOOST_MAX, g.boostLeft + BOOST_ADD); toast(t('t_boost')); haptic('heavy'); });
}

/* ================= Offline ================= */
let hiddenAt = null;
function handleAway(sec, withModal){
  if (!(sec > 0)) return;
  const capped = Math.min(sec, OFFLINE_CAP);
  const earned = idleRate(false) * capped;
  g.boostLeft = Math.max(0, g.boostLeft - sec);
  if (earned <= 0) return;
  if (!withModal || sec < 60 || (!$('#modal').hidden && $('#modal')._sticky)){ credit(earned); return; }
  const free = noAds();
  openModal(`<h2>${t('off_title')}</h2>
    <p>${t('off_text', { d:dur(sec) })}</p>
    <div class="amount">${$m(earned)}</div>
    ${capped < sec ? `<p class="small">${t('off_cap')}</p>` : ''}
    <div class="row"><button class="btn mgr big" type="button" id="offX2"><span>${t('off_x2')}</span><span style="font-weight:700;font-size:12px">${free ? t('off_free') : t('off_video')}</span></button><button class="btn buy big" type="button" id="off1">${t('off_take', { v:$m(earned) })}</button></div>`, sheet => {
    $('#off1', sheet).onclick = () => { credit(earned); closeModal(); toast('+' + $m(earned)); haptic('confirm'); save(); };
    $('#offX2', sheet).onclick = () => {
      closeModal();
      let granted = false;
      // Si el video no se completa o no hay video, igual cobra lo normal: nunca se pierde lo ganado.
      offlineFallback = () => { if (!granted){ granted = true; credit(earned); toast('+' + $m(earned)); save(); } };
      rewarded('offline', () => { granted = true; credit(earned * 2); toast('+' + $m(earned * 2)); haptic('heavy'); save(); });
    };
  }, true);
}
let offlineFallback = null;
function pauseGame(){ if (hiddenAt == null){ hiddenAt = Date.now(); save(); } }
function resumeGame(){
  if (visibleT0 == null) visibleT0 = performance.now();
  if (hiddenAt != null){ const sec = (Date.now() - hiddenAt) / 1000; hiddenAt = null; if (sec >= 300) g.m.sessions++; handleAway(sec, true); }
  last = performance.now();
}

/* ================= Interfaz ================= */
const $ = (s, r = document) => r.querySelector(s);
const cards = {};
let tab = 'cocina';
let toastT = null;
function toast(txt){ const el = $('#toast'); el.textContent = txt; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

function buildStations(){
  const wrap = $('#stations'); wrap.innerHTML = '';
  for (const st of STATIONS){
    const el = document.createElement('article');
    el.className = 'st'; el.style.setProperty('--c', st.color);
    el.innerHTML = `
      <button class="st-cook" type="button" aria-label="${t('cookAria', { lname:lnameOf(st.id) })}">
        <canvas class="st-icon" width="128" height="128"></canvas>
        <span class="st-info">
          <span class="st-head"><span class="st-name">${nameOf(st.id)}</span><span class="st-lvl"></span></span>
          <span class="bar"><i></i><span class="bar-t"><span class="st-val"></span><span class="st-time"></span></span></span>
          <span class="st-ms"></span>
        </span>
        <span class="hand" hidden>👆</span>
      </button>
      <div class="st-actions">
        <button class="btn buy" type="button"><span class="lbl"></span><b></b></button>
        <button class="btn mgr" type="button"><span class="lbl"></span><b></b></button>
      </div>`;
    const c = {
      el, cook:$('.st-cook', el), icon:$('.st-icon', el), lvl:$('.st-lvl', el), bar:$('.bar', el), barI:$('.bar i', el),
      val:$('.st-val', el), time:$('.st-time', el), ms:$('.st-ms', el), hand:$('.hand', el), actions:$('.st-actions', el),
      buy:$('.btn.buy', el), buyL:$('.btn.buy .lbl', el), buyC:$('.btn.buy b', el), mgr:$('.btn.mgr', el), mgrL:$('.btn.mgr .lbl', el), mgrC:$('.btn.mgr b', el),
    };
    c.ctx = c.icon.getContext('2d');
    c.cook.addEventListener('pointerdown', e => { if (e.button === 0 || e.pointerType !== 'mouse') tapStation(st.id); });
    c.cook.addEventListener('click', e => { if (e.detail === 0) tapStation(st.id); });
    c.buy.addEventListener('click', () => buyLevels(st, c.buy));
    c.mgr.addEventListener('click', () => hire(st, c.mgr));
    cards[st.id] = c; wrap.appendChild(el);
  }
}
function drawIcon(st){
  const c = cards[st.id].ctx; c.clearRect(0, 0, 128, 128);
  c.globalAlpha = lvl(st.id) ? 1 : 0.5; drawFood(c, st.id, 64, 64, 84); c.globalAlpha = 1;
  if (!available(st)){ c.fillStyle = 'rgba(15,26,33,.55)'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); drawLock(c, 64, 66, 40); }
}
function updateCards(){
  for (const st of STATIONS){
    const c = cards[st.id], L = lvl(st.id), avail = available(st);
    const state = !avail ? 'pl' : L === 0 ? 'closed' : 'open';
    if (c.state !== state){ c.state = state; c.el.classList.toggle('locked', state !== 'open'); drawIcon(st); }
    if (state === 'pl'){
      c.lvl.textContent = t('nextBarrio'); c.bar.hidden = true; c.actions.hidden = true;
      c.ms.textContent = t('plMs', { gear:TX.gear[st.id] }); continue;
    }
    c.actions.hidden = false; c.bar.hidden = state !== 'open';
    if (state === 'closed'){
      c.lvl.textContent = TX.gear[st.id];
      c.ms.textContent = t('closedMs', { v:$m(perUnit(st)), t:fmtT(st.time) });
      c.buyL.textContent = t('openBtn', { lname:lnameOf(st.id) }); c.buyC.textContent = $c(st.cost0);
      c.buy.classList.toggle('cant', g.money + 1e-6 < st.cost0);
      c.mgr.hidden = true; continue;
    }
    const n = buyN(st), cost = bulkCost(st, L, n);
    c.lvl.textContent = t('lvl', { n:L });
    c.val.textContent = $m(batchValue(st));
    c.time.textContent = fmtT(cookTime(st));
    const nm = nextMs(L);
    const chip = g.mgr[st.id] ? `<span class="chip">${t('chipCooks', { helper:st.helper })}</span>` : '';
    c.ms.innerHTML = chip + (nm ? `${t('msNext', { m:nm })} <span style="opacity:.7">(${L}/${nm})</span>` : t('msMax'));
    c.buyL.textContent = t('buyBtn', { n }); c.buyC.textContent = $c(cost);
    c.buy.classList.toggle('cant', g.money + 1e-6 < cost);
    if (g.mgr[st.id]) c.mgr.hidden = true;
    else { c.mgr.hidden = false; c.mgrL.textContent = t('hireBtn', { helper:st.helper }); c.mgrC.textContent = $c(st.mgr); c.mgr.classList.toggle('cant', g.money + 1e-6 < st.mgr); }
  }
}
function updateBars(){
  for (const st of STATIONS){
    const c = cards[st.id]; if (c.state !== 'open') continue;
    const fast = g.mgr[st.id] && cookTime(st) < 0.12;
    c.bar.classList.toggle('full', fast);
    if (!fast) c.barI.style.transform = `scaleX(${Math.min(1, g.prog[st.id])})`;
  }
}
function buildUpgrades(){
  const wrap = $('#panel-mejoras'); wrap.innerHTML = '';
  const list = UPGRADES.filter(u => !g.upgrades[u.id]).sort((a, b) => a.cost - b.cost).slice(0, 6);
  for (const u of list){
    const locked = u.needsPrestige && g.prestiges < u.needsPrestige;
    const el = document.createElement('article'); el.className = 'up' + (locked ? ' lock' : '');
    el.innerHTML = `<canvas width="96" height="96"></canvas><div><div class="up-name">${TX.upg[u.id]}</div><div class="up-eff">${effText(u)}</div></div>
      <button class="btn buy" type="button">${locked ? `<span>${t('upLocked')}</span>` : `<b>${$c(u.cost)}</b>`}</button>`;
    drawFood($('canvas', el).getContext('2d'), u.target, 48, 48, 64);
    const btn = $('button', el); btn._u = u;
    if (locked) btn.classList.add('cant'); else btn.addEventListener('click', () => buyUpgrade(u, btn));
    wrap.appendChild(el);
  }
  const done = UPGRADES.filter(u => g.upgrades[u.id]).length;
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = list.length ? (done ? t('upCount', { n:done }) : t('upIntro')) : t('upDone');
  wrap.appendChild(note);
}
function updateUpgrades(){
  for (const btn of document.querySelectorAll('#panel-mejoras .btn')){
    const u = btn._u; if (!u || (u.needsPrestige && g.prestiges < u.needsPrestige)) continue;
    btn.classList.toggle('cant', g.money + 1e-6 < u.cost);
  }
}
function updateBarrio(){
  const b = barrioOf(g.barrio), nb = barrioOf(g.barrio + 1), p = pendingStars();
  $('#bName').textContent = b.name;
  $('#bStats').innerHTML = t('bStats', { s:g.stars, p:Math.round(STAR_BONUS * g.stars * 100) });
  $('#bPending').textContent = `+${p} ★`;
  const reco = $('#bReco'); reco.hidden = !prestigeRecommended();
  if (!reco.hidden) reco.textContent = t('bReco', { s:g.stars + p, x:dec((starMultWith(g.stars + p) / starMult()).toFixed(1)) });
  $('#bExplain').innerHTML = t('bExplain', { b:nb.name }) + (g.prestiges === 0 ? t('bExplainFirst') : '');
  $('#bNext').textContent = t('bNext', { v:$c(nextStarIn()) });
  const go = $('#bGo');
  go.textContent = p >= 1 ? t('bGo', { b:nb.name, p }) : t('bGoNone');
  go.classList.toggle('cant', p < 1);
}
function updateHud(){
  $('#money').textContent = $w(g.money);
  const r = idleRate();
  const dbg = g.debugSpeed > 1 ? `<span class="dbg">×${g.debugSpeed} prueba</span>` : '';
  const stars = g.stars ? ` · <span class="st-count">${g.stars} ★</span>` : '';
  $('#rate').innerHTML = (r > 0 ? t('perSec', { v:$m(r * g.debugSpeed) }) : g.flags.tapped ? t('hireToSell') : t('tapToSell')) + stars + dbg;
  const bb = $('#boost');
  bb.hidden = g.m.firstMgr == null;
  bb.classList.toggle('on', g.boostLeft > 0);
  bb.classList.toggle('free', noAds());
  $('#boostTxt').innerHTML = g.boostLeft > 0 ? `${t('boost1')}<br>${clock(g.boostLeft)}` : `${t('boost1')}<br>${t('boost2')}`;
  bb.setAttribute('aria-label', g.boostLeft > 0 ? t('boostOnAria', { t:clock(g.boostLeft) }) : t('boostAria'));
  const unlockedUI = g.m.firstMgr != null;
  $('#tabs').hidden = !unlockedUI; $('#buybar').hidden = !unlockedUI;
  const anyUp = UPGRADES.some(u => !g.upgrades[u.id] && !(u.needsPrestige && g.prestiges < u.needsPrestige) && g.money >= u.cost);
  $('[data-tab="mejoras"] .dot').hidden = !anyUp || tab === 'mejoras';
  $('[data-tab="barrio"] .dot').hidden = !prestigeRecommended() || tab === 'barrio';
}

/* ---- Pistas contextuales ---- */
let hintTarget = null, tipI = 0, tipT = 0;
function computeHint(){
  const ch = S.churros;
  if (!g.flags.tapped) return { t:t('h_tap'), target:'cook:churros' };
  if (!g.flags.bought){
    if (g.money >= nextCost(ch, lvl('churros'))) return { t:t('h_buyFirst'), target:'buy:churros' };
    return { t:t('h_keep'), target:'cook:churros' };
  }
  if (!g.mgr.churros){
    if (g.money >= ch.mgr) return { t:t('h_hireRosa'), target:'mgr:churros' };
    return { t:t('h_saveRosa', { v:$c(ch.mgr) }), target:'cook:churros' };
  }
  for (const st of STATIONS){
    if (!available(st) || lvl(st.id) > 0) continue;
    if (g.money >= st.cost0) return { t:t('h_open', { lname:lnameOf(st.id) }), target:'buy:' + st.id };
    break;
  }
  for (const st of STATIONS){
    if (lvl(st.id) > 0 && !g.mgr[st.id] && g.money >= st.mgr) return { t:t('h_hire', { helper:st.helper, lname:lnameOf(st.id) }), target:'mgr:' + st.id };
  }
  for (const st of STATIONS){
    if (lvl(st.id) > 0 && !g.mgr[st.id] && !g.running[st.id]) return { t:t('h_cookOr', { lname:lnameOf(st.id), v:$c(st.mgr), helper:st.helper }), target:'cook:' + st.id };
  }
  if (tab !== 'mejoras' && UPGRADES.some(u => !g.upgrades[u.id] && !(u.needsPrestige && g.prestiges < u.needsPrestige) && g.money >= u.cost))
    return { t:t('h_upg'), target:'tab:mejoras' };
  if (tab !== 'barrio' && prestigeRecommended()) return { t:t('h_barrio'), target:'tab:barrio' };
  if (g.m.firstPrestige == null && pendingStars() >= 1 && g.m.play > 240 && tab !== 'barrio' && Math.floor(g.m.play / 20) % 3 === 0)
    return { t:t('h_stars', { n:pendingStars() }), target:null };
  return { t:TX.tips[tipI % TX.tips.length], target:null, tip:true };
}
function applyHint(){
  const h = computeHint();
  if (h.tip){ const now = performance.now(); if (now - tipT > 7000){ tipT = now; tipI++; } h.t = TX.tips[tipI % TX.tips.length]; }
  const ht = $('#hintText'); if (ht.textContent !== h.t) ht.textContent = h.t;
  if (hintTarget !== h.target){
    document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
    STATIONS.forEach(s => cards[s.id].hand.hidden = true);
    hintTarget = h.target;
    if (h.target){
      const [kind, id] = h.target.split(':');
      if (kind === 'cook' && tab === 'cocina') cards[id].hand.hidden = false;
      if (kind === 'buy') cards[id].buy.classList.add('pulse');
      if (kind === 'mgr') cards[id].mgr.classList.add('pulse');
      if (kind === 'tab') $(`[data-tab="${id}"]`).classList.add('pulse');
    }
  }
}
function setTab(x){
  tab = x;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === x ? 'true' : 'false'));
  for (const k of ['cocina', 'mejoras', 'barrio']) $('#panel-' + k).hidden = k !== x;
  $('#bConfirm').hidden = true; $('#bGo').hidden = false;
  if (x === 'mejoras') buildUpgrades();
  hintTarget = '__'; $('#panels').scrollTop = 0;
  refreshSoon();
}
let dirty = true;
function refreshSoon(){ dirty = true; }
function refreshUI(){
  updateHud(); updateCards();
  if (tab === 'mejoras') updateUpgrades();
  if (tab === 'barrio') updateBarrio();
  applyHint();
  maybeAskNotifications();
}

/* ---- Modal ---- */
function openModal(html, bind, sticky){
  const m = $('#modal'), sh = $('#sheet'); sh.innerHTML = html; m.hidden = false; m._sticky = !!sticky;
  sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  if (bind) bind(sh);
}
function closeModal(){ $('#modal').hidden = true; $('#sheet').innerHTML = ''; }

/* ---- Avisos de "puesto lleno" (pedido suave, nunca en la primera sesión) ---- */
let sessionPlay = 0;
function maybeAskNotifications(){
  if (g.settings.notifAsked || !hasHelpers() || g.m.sessions < 2 || sessionPlay < 20) return;
  if (!$('#modal').hidden || !$('#ad').hidden) return;
  g.settings.notifAsked = true; save();
  openModal(`<h2>${t('n_title')}</h2><p>${t('n_text')}</p>
    <div class="row"><button class="btn buy big" type="button" id="nYes">${t('n_yes')}</button><button class="btn ghost big" type="button" id="nNo">${t('n_no')}</button></div>`, sh => {
    $('#nYes', sh).onclick = () => { closeModal(); enableNotifications(); };
    $('#nNo', sh).onclick = closeModal;
  });
}
function enableNotifications(){
  g.settings.notif = true; save();
  if (N){ nat('requestNotifications'); } else toast(t('t_notifOn'));
}

/* ---- Menú ---- */
function summary(){
  const m = g.m, T = v => v == null ? '—' : clock(v);
  return [
    'Puesto Idle · playtest', `Idioma: ${LANG} · ${N ? 'Android' : 'navegador'}`,
    `Primer toque: ${m.firstTap == null ? '—' : String(m.firstTap).replace('.', ',') + ' s desde que abrió'}`,
    `Primera compra: ${T(m.firstBuy)} · primer ayudante: ${T(m.firstMgr)}`,
    `Empanadas: ${T(m.open_empanadas)} · tacos: ${T(m.open_tacos)} · arepas: ${T(m.open_arepas)}`,
    `Primera mejora: ${T(m.firstUpgrade)} · primera mudanza: ${T(m.firstPrestige)}${m.firstPrestigeStars ? ` (+${m.firstPrestigeStars} ★)` : ''}`,
    `Jugado: ${clock(m.play)} · sesiones: ${m.sessions} · toques: ${m.taps} · videos: ${m.ads} · intersticiales: ${m.inters}`,
    `Ahora: ${barrioOf(g.barrio).name} · ${g.stars} ★ · ${$m(idleRate())}/s`,
  ].join('\n');
}
function openMenu(){
  const owned = noAds();
  const price = N ? (nat('noAdsPrice') || '') : 'US$ 2,99';
  const privacy = N && nat('privacyOptionsRequired');
  const debugBlock = DEBUG ? `
    <div class="menu-sec"><h3>Datos del playtest</h3>
      <textarea id="sumTxt" readonly></textarea>
      <button class="btn ghost" type="button" id="copyBtn">Copiar resumen</button></div>
    <div class="menu-sec"><h3>Herramientas de prueba (solo debug)</h3>
      <div class="row"><button class="btn ghost" type="button" id="spdBtn"></button><button class="btn ghost" type="button" id="awayBtn">Simular 1 h afuera</button></div>
      <div class="row"><button class="btn ghost" type="button" id="interBtn">Forzar intersticial</button><button class="btn ghost" type="button" id="resetBtn">Borrar progreso</button></div>
      ${N ? '' : '<button class="btn ghost" type="button" id="simNoAdsBtn"></button>'}
      <div id="resetConfirm" hidden><p style="margin-bottom:8px">Se borra todo, incluidas las ★.</p>
        <div class="row"><button class="btn mgr" type="button" id="resetYes">Sí, borrar</button><button class="btn ghost" type="button" id="resetNo">Cancelar</button></div></div></div>` : '';
  openModal(`<h2>Puesto Idle</h2><p class="small">${t('m_sub')}</p>
    <div class="menu-sec">
      ${owned ? `<p><strong>${t('m_noAdsOwned')}</strong></p>` : `<button class="btn buy big" type="button" id="noAdsBtn"><span>${t('m_noAds')}</span>${price ? `<b>${price}</b>` : ''}</button><p class="small">${t('m_noAdsDesc')}</p>`}
      <div class="row"><button class="btn ghost" type="button" id="hapBtn"></button><button class="btn ghost" type="button" id="notBtn"></button></div>
      ${privacy ? `<button class="btn ghost" type="button" id="privBtn">${t('m_privacy')}</button>` : ''}
    </div>
    ${debugBlock}
    <button class="btn ghost big" type="button" data-close>${t('m_back')}</button>`, sh => {
    const setLbl = () => {
      $('#hapBtn', sh).textContent = t('m_haptics', { v:g.settings.haptics ? t('yes') : t('no') });
      $('#notBtn', sh).textContent = t('m_notif', { v:g.settings.notif ? t('yes') : t('no') });
    };
    setLbl();
    $('#hapBtn', sh).onclick = () => { g.settings.haptics = !g.settings.haptics; haptic('confirm'); setLbl(); save(); };
    $('#notBtn', sh).onclick = () => { g.settings.notifAsked = true; if (g.settings.notif){ g.settings.notif = false; save(); } else enableNotifications(); setLbl(); };
    const nb = $('#noAdsBtn', sh); if (nb) nb.onclick = () => { closeModal(); if (N) nat('buyNoAds'); else { g.simNoAds = true; save(); toast(t('t_noAdsThanks')); refreshSoon(); } };
    const pb = $('#privBtn', sh); if (pb) pb.onclick = () => { closeModal(); nat('showPrivacyOptions'); };
    if (!DEBUG) return;
    const ta = $('#sumTxt', sh); ta.value = summary();
    $('#copyBtn', sh).onclick = () => {
      const done = () => toast('Resumen copiado');
      const fallback = () => { ta.focus(); ta.select(); try { document.execCommand('copy') ? done() : toast('Selecciona el texto y cópialo'); } catch(e){ toast('Selecciona el texto y cópialo'); } };
      try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch(e){ fallback(); }
    };
    const spd = $('#spdBtn', sh); const setSpd = () => spd.textContent = g.debugSpeed > 1 ? 'Velocidad ×10: sí' : 'Velocidad ×10: no'; setSpd();
    spd.onclick = () => { g.debugSpeed = g.debugSpeed > 1 ? 1 : 10; setSpd(); refreshSoon(); };
    $('#awayBtn', sh).onclick = () => { closeModal(); if (idleRate(false) <= 0){ toast('Contrata un ayudante primero'); return; } handleAway(3600, true); };
    $('#interBtn', sh).onclick = () => { closeModal(); showInterstitial(() => toast('Intersticial cerrado')); };
    const sna = $('#simNoAdsBtn', sh); if (sna){ sna.textContent = g.simNoAds ? 'Simular "Sin anuncios": sí' : 'Simular "Sin anuncios": no'; sna.onclick = () => { g.simNoAds = !g.simNoAds; sna.textContent = g.simNoAds ? 'Simular "Sin anuncios": sí' : 'Simular "Sin anuncios": no'; save(); refreshSoon(); }; }
    $('#resetBtn', sh).onclick = () => { $('#resetConfirm', sh).hidden = false; };
    $('#resetNo', sh).onclick = () => { $('#resetConfirm', sh).hidden = true; };
    $('#resetYes', sh).onclick = () => { try { localStorage.removeItem(KEY); } catch(e){} g = fresh(); g.m.sessions = 1; visibleT0 = performance.now(); scene.reset(); closeModal(); setTab('cocina'); buildUpgrades(); save(); toast('Progreso borrado'); };
  });
}

/* ================= Dibujo: comida ================= */
function rr(c, x, y, w, h, r){ r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const lw = (s, k) => Math.max(1, s * k);
function drawFood(c, id, x, y, s){ (FOOD[id] || drawStar)(c, x, y, s); }
function drawChurros(c, x, y, s){
  c.save(); c.translate(x, y);
  const stick = (ang, dx) => {
    c.save(); c.translate(dx, s * 0.04); c.rotate(ang);
    rr(c, -s * 0.075, -s * 0.46, s * 0.15, s * 0.56, s * 0.07); c.fillStyle = '#D98E36'; c.fill(); c.lineWidth = lw(s, .025); c.strokeStyle = '#9E5A1C'; c.stroke();
    c.strokeStyle = '#B86F27'; c.lineWidth = lw(s, .018); c.beginPath(); c.moveTo(-s * .025, -s * .4); c.lineTo(-s * .025, s * .06); c.moveTo(s * .025, -s * .4); c.lineTo(s * .025, s * .06); c.stroke();
    c.fillStyle = '#FFF1D6'; for (const [a, b] of [[-.04, -.34], [.03, -.24], [-.02, -.14], [.04, -.04]]){ c.beginPath(); c.arc(a * s, b * s, Math.max(.8, s * .018), 0, 7); c.fill(); }
    c.restore();
  };
  stick(-.32, -s * .06); stick(.22, s * .07);
  c.beginPath(); c.moveTo(-s * .3, -s * .02); c.lineTo(s * .3, -s * .02); c.lineTo(s * .03, s * .46); c.lineTo(-s * .03, s * .46); c.closePath();
  c.fillStyle = '#F6ECDD'; c.fill(); c.lineWidth = lw(s, .02); c.strokeStyle = '#CDBBA2'; c.stroke();
  c.save(); c.clip(); c.fillStyle = '#E8467C'; c.fillRect(-s * .4, s * .08, s * .8, s * .08); c.fillRect(-s * .4, s * .24, s * .8, s * .05); c.restore();
  c.restore();
}
function drawEmpanada(c, x, y, s){
  c.save(); c.translate(x, y + s * .16);
  const rx = s * .46, ry = s * .42;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, Math.PI, 0); c.closePath();
  const gr = c.createLinearGradient(0, -ry, 0, 0); gr.addColorStop(0, '#EDB462'); gr.addColorStop(1, '#C9823A');
  c.fillStyle = gr; c.fill(); c.lineWidth = lw(s, .025); c.strokeStyle = '#8F5421'; c.stroke();
  const n = 11;
  for (let k = 0; k <= n; k++){
    const a = Math.PI + Math.PI * k / n, px = Math.cos(a) * rx * .93, py = Math.sin(a) * ry * .93;
    c.beginPath(); c.ellipse(px, py, s * .06, s * .042, a + Math.PI / 2, 0, 7); c.fillStyle = '#DFA252'; c.fill(); c.lineWidth = lw(s, .014); c.strokeStyle = '#9A5B24'; c.stroke();
  }
  c.fillStyle = 'rgba(255,240,210,.35)'; c.beginPath(); c.ellipse(-rx * .25, -ry * .45, s * .09, s * .035, -.4, 0, 7); c.fill();
  c.restore();
}
function drawTaco(c, x, y, s){
  c.save(); c.translate(x, y - s * .12);
  const rx = s * .46, ry = s * .44;
  for (const [bx, col] of [[-.34, '#5DBB63'], [-.2, '#8A4B2A'], [-.06, '#E2493B'], [.07, '#5DBB63'], [.21, '#8A4B2A'], [.34, '#E2493B']]){ c.beginPath(); c.arc(bx * s, -s * .02, s * .095, 0, 7); c.fillStyle = col; c.fill(); }
  c.fillStyle = '#F5F0DC'; for (const bx of [-.27, .0, .26]){ c.fillRect(bx * s, -s * .1, s * .05, s * .05); }
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI); c.closePath();
  c.fillStyle = '#F3C24F'; c.fill(); c.lineWidth = lw(s, .025); c.strokeStyle = '#C28A1F'; c.stroke();
  c.fillStyle = '#DDA43A'; for (const [a, b] of [[-.2, .14], [.15, .26], [.26, .08], [-.05, .32]]){ c.beginPath(); c.arc(a * s, b * s, s * .026, 0, 7); c.fill(); }
  c.restore();
}
function drawArepa(c, x, y, s){
  c.save(); c.translate(x, y);
  const rx = s * .44, ry = s * .21, th = s * .17;
  c.fillStyle = '#C99A52'; c.beginPath(); c.ellipse(0, th / 2, rx, ry, 0, 0, 7); c.fill(); c.fillRect(-rx, -th / 2, 2 * rx, th);
  c.fillStyle = '#F0D9A2'; c.beginPath(); c.ellipse(0, -th / 2, rx, ry, 0, 0, 7); c.fill(); c.lineWidth = lw(s, .02); c.strokeStyle = '#B07F3A'; c.stroke();
  c.fillStyle = '#C68A40'; for (const [a, b] of [[-.2, -.12], [.12, -.04], [.02, -.16], [.24, -.1], [-.08, -.02]]){ c.beginPath(); c.ellipse(a * s, b * s, s * .035, s * .018, 0, 0, 7); c.fill(); }
  c.restore();
}
function drawStar(c, x, y, s){
  c.save(); c.translate(x, y); c.beginPath();
  for (let k = 0; k < 10; k++){ const r = k % 2 ? s * .2 : s * .46, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath(); c.fillStyle = '#F4A62A'; c.fill(); c.lineWidth = lw(s, .03); c.strokeStyle = '#B06F0A'; c.stroke(); c.restore();
}
function drawLock(c, x, y, s){
  c.save(); c.translate(x, y); c.strokeStyle = '#FFF3DC'; c.lineWidth = s * .12; c.beginPath(); c.arc(0, -s * .12, s * .22, Math.PI, 0); c.stroke();
  c.fillStyle = '#FFF3DC'; rr(c, -s * .34, -s * .12, s * .68, s * .5, s * .08); c.fill(); c.restore();
}
const FOOD = { churros:drawChurros, empanadas:drawEmpanada, tacos:drawTaco, arepas:drawArepa, all:drawStar };
window.PuestoArt = { drawFood, rr };

/* ================= Escena ================= */
const scene = (() => {
  const cv = $('#scene'), c = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, L = null, city = [], custs = [], flights = [], floats = [], parts = [], spawnT = 0, tapFx = {};
  const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const UIF = '"Baloo 2", system-ui, sans-serif', DF = '"Chango", "Baloo 2", system-ui, sans-serif';
  const SKIN = ['#F1C7A5', '#D9A07A', '#B97A55', '#8D5A3B', '#6B4028'], SHIRT = ['#E8467C', '#2BB39A', '#F4A62A', '#5B7CFA', '#FFF3DC', '#9B5DE5', '#E0703A'], HAIR = ['#2B1B12', '#4A2E1C', '#151515', '#7A4A2A', '#C9A36B'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  function resize(){
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    DPR = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    L = { x0:W * .04, x1:W * .66, roofY:H * .17, awH:H * .1, counterTop:H * .6, groundY:H * .84 };
    L.scal = (L.x1 - L.x0 + W * .04) / 18; L.sw = (L.x1 - L.x0) / 4;
    L.s = Math.min(L.sw * .9, (L.counterTop - (L.roofY + L.awH + L.scal)) * 1.05);
    L.feetY = L.groundY + (H - L.groundY) * .55; L.custH = H * .3;
    const R = rng(7 + g.barrio * 13); city = []; let x = -10;
    while (x < W + 10){ const w = 34 + R() * 52, h = H * (.3 + R() * .38); const win = []; for (let wy = L.groundY - h + 10; wy < L.groundY - 16; wy += 15) for (let wx = x + 7; wx < x + w - 10; wx += 13) if (R() < .45) win.push([wx, wy, R()]); city.push({ x, w, h, win }); x += w + 2 + R() * 6; }
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);
  const slotX = i => L.x0 + L.sw * (i + .5);
  function newCust(){ const open = STATIONS.filter(s => lvl(s.id) > 0); return { x:W + 20, walk:0, moving:true, state:'arrive', shirt:pick(SHIRT), skin:pick(SKIN), hair:pick(HAIR), cap:Math.random() < .3 ? pick(SHIRT) : null, want:(pick(open) || S.churros).id, item:null, reserved:false }; }
  function desired(){ const r = idleRate(false); return Math.min(5, 1 + Math.floor(Math.log10(1 + r) / 1.1)); }
  function frontFree(){ return custs.find(cu => cu.state === 'wait' && !cu.reserved); }
  function emitSale(st, value){
    const fx = slotX(st.i), fy = L.counterTop - L.s * .5, fc = frontFree();
    if (fc){ fc.reserved = true; flights.push({ id:st.id, x0:fx, y0:fy, cu:fc, t:0, dur:.42, value }); }
    else floatText(fx, fy - L.s * .3, '+' + $m(value), '#FFE7A3', 14);
  }
  function floatText(x, y, txt, col, size){ floats.push({ x, y, txt, col, size, t:0, dur:1.1 }); if (floats.length > 24) floats.shift(); }
  function coins(x, y, n){ if (rm) return; for (let k = 0; k < n; k++) parts.push({ x, y, vx:(Math.random() - .5) * 90, vy:-60 - Math.random() * 80, t:0 }); if (parts.length > 80) parts.splice(0, parts.length - 80); }
  function update(dt){
    if (!L) return;
    for (const st of STATIONS){ const v = vis[st.id]; v.cd -= dt; if (v.acc > 0 && v.cd <= 0){ emitSale(st, v.acc); v.acc = 0; v.cd = .34; } }
    spawnT -= dt;
    if (custs.filter(cu => cu.state !== 'leave').length < desired() && spawnT <= 0){ custs.push(newCust()); spawnT = .8 + Math.random() * .9; }
    let k = 0; const sp = Math.max(60, W * .22);
    for (const cu of custs){
      if (cu.state !== 'leave'){ cu.tx = L.x1 + W * .055 + k * W * .064; k++; }
      const tx = cu.state === 'leave' ? -40 : cu.tx, dx = tx - cu.x;
      if (Math.abs(dx) > 1){ cu.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); cu.walk += dt * 11; cu.moving = true; }
      else { cu.moving = false; if (cu.state === 'arrive') cu.state = 'wait'; }
    }
    custs = custs.filter(cu => cu.x > -36);
    for (const f of flights){
      f.t += dt;
      if (f.t >= f.dur && !f.done){ f.done = true; const cu = f.cu; cu.item = f.id; cu.state = 'leave'; cu.reserved = false; floatText(cu.x, L.feetY - L.custH - 6, '+' + $m(f.value), '#FFE7A3', 15); coins(cu.x, L.feetY - L.custH * .6, 4); }
    }
    flights = flights.filter(f => !f.done);
    for (const f of floats) f.t += dt; floats = floats.filter(f => f.t < f.dur);
    for (const p of parts){ p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } parts = parts.filter(p => p.t < .8);
    for (const id in tapFx){ tapFx[id] -= dt; if (tapFx[id] <= 0) delete tapFx[id]; }
  }
  function freidora(x, b, s, on, tt){
    c.fillStyle = '#3C4348'; c.fillRect(x - s * .28, b - s * .12, s * .56, s * .12);
    const top = b - s * .6, bot = b - s * .13;
    c.beginPath(); c.moveTo(x - s * .42, top); c.lineTo(x + s * .42, top); c.lineTo(x + s * .34, bot); c.quadraticCurveTo(x, bot + s * .05, x - s * .34, bot); c.closePath(); c.fillStyle = '#30363A'; c.fill();
    c.strokeStyle = '#30363A'; c.lineWidth = s * .05; c.beginPath(); c.moveTo(x - s * .42, top + s * .08); c.lineTo(x - s * .54, top + s * .1); c.moveTo(x + s * .42, top + s * .08); c.lineTo(x + s * .54, top + s * .1); c.stroke();
    c.beginPath(); c.ellipse(x, top, s * .42, s * .1, 0, 0, 7); c.fillStyle = '#1E2225'; c.fill();
    c.beginPath(); c.ellipse(x, top + s * .01, s * .37, s * .075, 0, 0, 7); c.fillStyle = on ? '#F2BC45' : '#A7803A'; c.fill();
    if (on){
      c.fillStyle = 'rgba(255,246,214,.9)';
      for (let k = 0; k < 5; k++){ const ph = (tt * 2.3 + k * .37) % 1, bx = x + Math.sin(k * 2.1) * s * .25; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(bx, top + s * .01, s * (.02 + .035 * ph), 0, 7); c.fill(); }
      c.globalAlpha = 1;
      c.save(); c.translate(x - s * .06, top); c.rotate(-.4); rr(c, -s * .045, -s * .34, s * .09, s * .36, s * .04); c.fillStyle = '#D98E36'; c.fill(); c.restore();
      c.save(); c.translate(x + s * .1, top); c.rotate(.3); rr(c, -s * .045, -s * .28, s * .09, s * .3, s * .04); c.fillStyle = '#E09A42'; c.fill(); c.restore();
    }
  }
  function horno(x, b, s, on, tt){
    c.fillStyle = '#7E4128'; c.fillRect(x - s * .47, b - s * .1, s * .94, s * .1);
    c.fillStyle = '#8E4B2F'; c.fillRect(x + s * .15, b - s * .8, s * .1, s * .2);
    if (on && !rm) for (let k = 0; k < 3; k++){ const ph = (tt * .6 + k / 3) % 1; c.fillStyle = `rgba(230,230,230,${.45 * (1 - ph)})`; c.beginPath(); c.arc(x + s * .2 + ph * s * .1, b - s * .84 - ph * s * .3, s * (.04 + .05 * ph), 0, 7); c.fill(); }
    c.beginPath(); c.ellipse(x, b - s * .1, s * .45, s * .58, 0, Math.PI, 0); c.closePath();
    const gr = c.createLinearGradient(x - s * .45, 0, x + s * .45, 0); gr.addColorStop(0, '#B35A36'); gr.addColorStop(.5, '#D27A4A'); gr.addColorStop(1, '#A5502F'); c.fillStyle = gr; c.fill();
    c.strokeStyle = 'rgba(90,40,20,.3)'; c.lineWidth = lw(s, .015);
    for (const f of [.35, .65]){ c.beginPath(); c.ellipse(x, b - s * .1, s * .45 * Math.sqrt(1 - f * f), s * .58 * f, 0, Math.PI, 0); c.stroke(); }
    const mw = s * .34, mh = s * .3, my = b - s * .1;
    c.beginPath(); c.moveTo(x - mw / 2, my); c.lineTo(x - mw / 2, my - mh * .5); c.ellipse(x, my - mh * .5, mw / 2, mh * .5, 0, Math.PI, 0); c.lineTo(x + mw / 2, my); c.closePath();
    if (on){ const fl = .7 + .3 * Math.sin(tt * 9) * Math.sin(tt * 5.3); const gg = c.createRadialGradient(x, my - mh * .2, 1, x, my - mh * .2, mw * .7); gg.addColorStop(0, `rgba(255,220,130,${fl})`); gg.addColorStop(1, '#D24A14'); c.fillStyle = gg; }
    else c.fillStyle = '#2A140C';
    c.fill();
    if (on) drawEmpanada(c, x, my - mh * .22, s * .2);
  }
  function plancha(x, b, s, on, tt){
    c.fillStyle = '#4E555A'; rr(c, x - s * .4, b - s * .3, s * .8, s * .3, s * .04); c.fill();
    c.fillStyle = '#3B4146'; c.fillRect(x - s * .34, b - s * .22, s * .68, s * .035);
    c.fillStyle = '#C9CED1'; for (const k of [-.2, 0, .2]){ c.beginPath(); c.arc(x + k * s, b - s * .1, s * .035, 0, 7); c.fill(); }
    c.fillStyle = '#24292D'; rr(c, x - s * .48, b - s * .38, s * .96, s * .09, s * .03); c.fill();
    for (const k of [-.28, 0, .28]){ c.beginPath(); c.ellipse(x + k * s, b - s * .395, s * .13, s * .035, 0, 0, 7); c.fillStyle = on ? '#F3C24F' : '#C9A55A'; c.fill(); }
    if (on && !rm){
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = lw(s, .03); c.lineCap = 'round';
      for (const k of [-.25, .05, .3]){ const ph = (tt * .8 + k + 1) % 1; c.globalAlpha = 1 - ph; c.beginPath(); for (let j = 0; j <= 6; j++){ const yy = b - s * .45 - ph * s * .22 - j * s * .045, xx = x + k * s + Math.sin(j * 1.2 + tt * 4) * s * .03; j ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
      c.globalAlpha = 1;
    }
  }
  function budare(x, b, s, on, tt){
    c.fillStyle = '#454B50'; c.beginPath(); c.moveTo(x - s * .22, b); c.lineTo(x - s * .15, b - s * .22); c.lineTo(x + s * .15, b - s * .22); c.lineTo(x + s * .22, b); c.closePath(); c.fill();
    if (on) for (let k = -1; k <= 1; k++){ const h = s * (.07 + .03 * Math.sin(tt * 16 + k * 2)); c.fillStyle = '#FF9A3C'; c.beginPath(); c.moveTo(x + k * s * .1 - s * .04, b - s * .22); c.quadraticCurveTo(x + k * s * .1, b - s * .22 - h * 1.6, x + k * s * .1 + s * .04, b - s * .22); c.fill(); }
    c.fillStyle = '#1C2023'; c.beginPath(); c.ellipse(x, b - s * .3, s * .47, s * .1, 0, 0, 7); c.fill();
    c.fillStyle = '#2C3236'; c.beginPath(); c.ellipse(x, b - s * .32, s * .42, s * .075, 0, 0, 7); c.fill();
    for (const k of [-.19, .19]) drawArepa(c, x + k * s, b - s * .38, s * .34);
  }
  function tarp(x, b, s, st){
    const pl = !available(st), w = s * .82, h = s * .56;
    c.save(); c.setLineDash([4, 4]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,243,220,.4)'; rr(c, x - w / 2, b - h, w, h, s * .1); c.stroke(); c.restore();
    c.fillStyle = 'rgba(255,243,220,.06)'; rr(c, x - w / 2, b - h, w, h, s * .1); c.fill();
    const txt = pl ? '★' : $c(st.cost0), fs = Math.round(s * (pl ? .3 : .22));
    c.font = `800 ${fs}px ${UIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(txt).width + s * .16;
    c.fillStyle = pl ? 'rgba(255,243,220,.18)' : (g.money >= st.cost0 ? '#F4A62A' : 'rgba(255,243,220,.85)');
    rr(c, x - tw / 2, b - h / 2 - fs * .7, tw, fs * 1.4, fs * .35); c.fill();
    c.fillStyle = pl ? 'rgba(255,243,220,.85)' : '#3A2303'; c.fillText(txt, x, b - h / 2 + 1);
  }
  function helper(x, b, s, col, on, tt){
    const bob = on && !rm ? Math.sin(tt * 8 + x) * s * .025 : 0, h = s * 1.12;
    c.fillStyle = col; rr(c, x - s * .18, b - h * .62 + bob, s * .36, h * .62, s * .12); c.fill();
    c.fillStyle = 'rgba(255,243,220,.92)'; rr(c, x - s * .12, b - h * .48 + bob, s * .24, h * .48, s * .05); c.fill();
    c.fillStyle = '#C98E66'; c.beginPath(); c.arc(x, b - h * .74 + bob, s * .14, 0, 7); c.fill();
    c.fillStyle = '#FFFFFF'; rr(c, x - s * .15, b - h * .88 + bob, s * .3, s * .1, s * .03); c.fill(); c.beginPath(); c.arc(x, b - h * .9 + bob, s * .12, Math.PI, 0); c.fill();
  }
  const GEAR = { churros:freidora, empanadas:horno, tacos:plancha, arepas:budare };
  function cust(cu){
    const h = L.custH, x = cu.x, f = L.feetY, swg = cu.moving && !rm ? Math.sin(cu.walk) * h * .07 : 0;
    c.strokeStyle = '#26323A'; c.lineWidth = h * .075; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - h * .05, f - h * .3); c.lineTo(x - h * .05 + swg, f); c.moveTo(x + h * .05, f - h * .3); c.lineTo(x + h * .05 - swg, f); c.stroke();
    c.fillStyle = cu.shirt; rr(c, x - h * .16, f - h * .72, h * .32, h * .46, h * .12); c.fill();
    if (cu.item) drawFood(c, cu.item, x - h * .22, f - h * .5, h * .34);
    c.fillStyle = cu.skin; c.beginPath(); c.arc(x, f - h * .84, h * .135, 0, 7); c.fill();
    c.fillStyle = cu.hair; c.beginPath(); c.arc(x + h * .01, f - h * .87, h * .14, Math.PI * .95, Math.PI * 2.05); c.fill();
    if (cu.cap){ c.fillStyle = cu.cap; c.beginPath(); c.arc(x, f - h * .9, h * .14, Math.PI, 0); c.fill(); c.fillRect(x - h * .24, f - h * .91, h * .14, h * .035); }
    c.fillStyle = '#1A1A1A'; c.beginPath(); c.arc(x - h * .065, f - h * .835, Math.max(1, h * .018), 0, 7); c.fill();
  }
  function bubble(x, y, id){
    const s = L.custH * .42, w = s * 1.2, hh = s * 1.1;
    c.fillStyle = '#FFF8EC'; rr(c, x - w / 2, y - hh, w, hh, s * .28); c.fill();
    c.beginPath(); c.moveTo(x - s * .12, y - 1); c.lineTo(x + s * .02, y + s * .22); c.lineTo(x + s * .14, y - 1); c.fill();
    drawFood(c, id, x, y - hh / 2, s * .85);
  }
  function draw(tt){
    if (!L) return;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const pal = barrioOf(g.barrio);
    const sky = c.createLinearGradient(0, 0, 0, L.groundY); sky.addColorStop(0, pal.sky[0]); sky.addColorStop(1, pal.sky[1]);
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    for (const b of city){
      c.fillStyle = pal.bldg; c.fillRect(b.x, L.groundY - b.h, b.w, b.h);
      for (const [wx, wy, r] of b.win){ const lit = r < .7 || Math.sin(tt * .3 + r * 40) > .6; c.fillStyle = lit ? 'rgba(255,210,122,.55)' : 'rgba(255,255,255,.06)'; c.fillRect(wx, wy, 6, 8); }
    }
    const sag = H * .06, y0 = H * .035, by = x => y0 + sag * 4 * (x / W) * (1 - x / W);
    c.strokeStyle = 'rgba(255,243,220,.5)'; c.lineWidth = 1; c.beginPath(); for (let x = 0; x <= W; x += 8) x ? c.lineTo(x, by(x)) : c.moveTo(x, by(x)); c.stroke();
    const FL = ['#E8467C', '#F4A62A', '#2BB39A', '#FFF3DC', '#5B7CFA'];
    for (let x = 8, k = 0; x < W; x += 20, k++){ const yy = by(x), swy = rm ? 0 : Math.sin(tt * 2 + k) * 1.5; c.fillStyle = FL[k % FL.length]; c.beginPath(); c.moveTo(x - 6, yy); c.lineTo(x + 6, yy); c.lineTo(x + swy, yy + 11); c.closePath(); c.fill(); }
    c.fillStyle = pal.walk; c.fillRect(0, L.groundY, W, H - L.groundY);
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1; for (let x = 0; x < W; x += 28){ c.beginPath(); c.moveTo(x, L.groundY); c.lineTo(x - 8, H); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, H - 4, W, 4);
    const top = L.roofY + L.awH;
    c.fillStyle = '#3F2B26'; c.fillRect(L.x0, top, L.x1 - L.x0, L.counterTop - top);
    c.fillStyle = 'rgba(255,190,110,.08)'; c.fillRect(L.x0, top, L.x1 - L.x0, (L.counterTop - top) * .6);
    for (let k = 0; k < 6; k++){ const x = L.x0 + (L.x1 - L.x0) * (k + .5) / 6, yy = top + L.scal + 4 + Math.sin(k / 5 * Math.PI) * 5; c.fillStyle = 'rgba(255,214,130,.25)'; c.beginPath(); c.arc(x, yy, 6, 0, 7); c.fill(); c.fillStyle = '#FFD98A'; c.beginPath(); c.arc(x, yy, 2.4, 0, 7); c.fill(); }
    for (const st of STATIONS){
      const x = slotX(st.i), b = L.counterTop, s = L.s, on = !!(g.mgr[st.id] || g.running[st.id]);
      if (!lvl(st.id)){ tarp(x, b, s, st); continue; }
      if (g.mgr[st.id]) helper(x + s * .02, b, s, st.color, on, tt);
      const bump = tapFx[st.id] ? 1 + tapFx[st.id] * .5 : 1;
      c.save(); c.translate(x, b); c.scale(bump, 2 - bump); c.translate(-x, -b); GEAR[st.id](x, b, s, on, tt); c.restore();
    }
    if (hintTarget && hintTarget.startsWith('cook:')){
      const st = S[hintTarget.slice(5)], x = slotX(st.i), yy = L.counterTop - L.s * .38, pr = rm ? .5 : (Math.sin(tt * 5) + 1) / 2;
      c.strokeStyle = `rgba(244,166,42,${.55 + .45 * pr})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, yy, L.s * (.56 + .06 * pr), L.s * (.5 + .06 * pr), 0, 0, 7); c.stroke();
    }
    const cx0 = L.x0 - W * .012, cw = L.x1 - L.x0 + W * .024, ch = L.groundY - L.counterTop;
    c.fillStyle = '#9C5B34'; c.fillRect(cx0, L.counterTop, cw, ch);
    c.strokeStyle = 'rgba(60,30,15,.35)'; c.lineWidth = 1; for (let x = cx0 + 14; x < cx0 + cw; x += 16){ c.beginPath(); c.moveTo(x, L.counterTop + 6); c.lineTo(x, L.groundY); c.stroke(); }
    c.fillStyle = '#B8733F'; c.fillRect(cx0 - W * .01, L.counterTop - 3, cw + W * .02, 7);
    const sw = cw * .62, sh = ch * .7, sx = cx0 + (cw - sw) / 2, sy = L.counterTop + ch * .15;
    c.fillStyle = '#FFF3DC'; rr(c, sx, sy, sw, sh, 6); c.fill();
    c.strokeStyle = pal.awning; c.lineWidth = 2; rr(c, sx + 3, sy + 3, sw - 6, sh - 6, 4); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = pal.awning; c.font = `${Math.round(Math.min(sh * .46, sw * .14))}px ${DF}`; c.fillText('PUESTO', sx + sw / 2, sy + sh * .4);
    c.fillStyle = '#3A2303'; c.font = `800 ${Math.round(Math.min(sh * .27, 13))}px ${UIF}`; c.fillText(pal.name.toUpperCase(), sx + sw / 2, sy + sh * .76);
    c.fillStyle = '#5E331C'; c.fillRect(L.x0 - W * .018, L.roofY, W * .016, L.groundY - L.roofY); c.fillRect(L.x1 + W * .002, L.roofY, W * .016, L.groundY - L.roofY);
    const ax0 = L.x0 - W * .02, n = 9, aw = (L.x1 - L.x0 + W * .04) / n;
    for (let k = 0; k < n; k++){ c.fillStyle = k % 2 ? '#FFF3DC' : pal.awning; const x = ax0 + k * aw; c.fillRect(x, L.roofY, aw + .5, L.awH); c.beginPath(); c.arc(x + aw / 2, L.roofY + L.awH, aw / 2, 0, Math.PI); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(ax0, L.roofY, aw * n, L.awH * .2);
    for (const cu of custs) cust(cu);
    const fc = custs.find(cu => cu.state === 'wait');
    if (fc && !fc.reserved) bubble(fc.x - 2, L.feetY - L.custH - 6, g.flags.tapped ? fc.want : 'churros');
    for (const f of flights){
      const p = Math.min(1, f.t / f.dur), x1 = f.cu.x - L.custH * .2, y1 = L.feetY - L.custH * .5;
      drawFood(c, f.id, f.x0 + (x1 - f.x0) * p, f.y0 + (y1 - f.y0) * p - Math.sin(p * Math.PI) * H * .18, L.s * .42);
    }
    for (const p of parts){ c.globalAlpha = 1 - p.t / .8; c.fillStyle = '#FFD14A'; c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill(); c.strokeStyle = '#B07A10'; c.lineWidth = 1; c.stroke(); }
    c.globalAlpha = 1; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (const f of floats){ const p = f.t / f.dur, y = f.y - p * H * .12; c.globalAlpha = Math.min(1, (1 - p) * 1.8); c.font = `800 ${f.size}px ${UIF}`; c.lineWidth = 3.5; c.strokeStyle = 'rgba(10,16,20,.85)'; c.lineJoin = 'round'; c.strokeText(f.txt, f.x, y); c.fillStyle = f.col; c.fillText(f.txt, f.x, y); }
    c.globalAlpha = 1;
    if (g.boostLeft > 0){ const txt = t('boostBadge'); c.font = `800 13px ${UIF}`; const bw = c.measureText(txt).width + 20; c.textAlign = 'center'; c.fillStyle = '#2BB39A'; rr(c, W - bw - 8, 8, bw, 22, 11); c.fill(); c.fillStyle = '#06231D'; c.fillText(txt, W - 8 - bw / 2, 23.5); }
  }
  cv.addEventListener('pointerdown', e => {
    if (!L) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < L.x0 || x > L.x1 || y < L.roofY || y > L.groundY) return;
    const st = STATIONS[Math.min(3, Math.floor((x - L.x0) / L.sw))];
    if (lvl(st.id)) tapStation(st.id);
    else if (!available(st)) toast(t('t_scenePL', { name:nameOf(st.id) }));
    else toast(t('t_sceneOpen', { name:nameOf(st.id), v:$c(st.cost0) }));
  });
  return {
    update, draw, resize,
    tapFx(id){ tapFx[id] = .12; },
    burst(id, txt){ if (!L) return; const x = slotX(S[id].i); floatText(x, L.counterTop - L.s * .9, txt, '#FFFFFF', 16); coins(x, L.counterTop - L.s * .6, 8); },
    reset(){ custs = []; flights = []; floats = []; parts = []; for (const k in vis){ vis[k].acc = 0; vis[k].cd = 0; } resize(); },
  };
})();

/* ================= Bucle ================= */
let last = performance.now(), uiT = 0, saveT = 0;
function update(dt, rdt){
  g.m.play += rdt; sessionPlay += rdt;
  g.boostLeft = Math.max(0, g.boostLeft - rdt);
  for (const st of STATIONS){
    const id = st.id; if (!lvl(id) || !(g.mgr[id] || g.running[id])) continue;
    g.prog[id] += dt / cookTime(st);
    if (g.prog[id] >= 1){
      let n;
      if (g.mgr[id]){ n = Math.floor(g.prog[id]); g.prog[id] -= n; }
      else { n = 1; g.prog[id] = 0; g.running[id] = false; }
      earn(n * batchValue(st), st);
    }
  }
}
function frame(now){
  let rdt = (now - last) / 1000; last = now;
  if (rdt > 2){ handleAway(rdt, rdt >= 60); rdt = 0; }
  rdt = Math.max(0, Math.min(rdt, .1));
  update(rdt * g.debugSpeed, rdt);
  scene.update(rdt); scene.draw(now / 1000); updateBars();
  uiT += rdt; saveT += rdt;
  if (uiT > .1 || dirty){ uiT = 0; dirty = false; refreshUI(); }
  if (saveT > 4){ saveT = 0; save(); }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else resumeGame(); });
window.addEventListener('pagehide', save);
document.addEventListener('contextmenu', e => e.preventDefault());

/* ================= API para Android (llamada desde Kotlin) ================= */
window.PuestoGame = {
  onPause(){ pauseGame(); },
  onResume(){ resumeGame(); },
  onRewarded(placement, status){
    const cb = pendingRewards[placement]; delete pendingRewards[placement];
    if (status === 'earned' && cb){ g.m.ads++; cb(); }
    else if (status === 'unavailable') toast(t('t_noVideo'));
    if (placement === 'offline' && offlineFallback){ const f = offlineFallback; offlineFallback = null; f(); }
    refreshSoon();
  },
  onInterstitialDone(){ const f = pendingInter; pendingInter = null; if (f) f(); },
  onPurchase(ok){ if (ok){ toast(t('t_noAdsThanks')); haptic('heavy'); } else toast(t('t_purchaseFail')); refreshSoon(); },
  onNotifPermission(granted){ g.settings.notif = !!granted; save(); if (granted) toast(t('t_notifOn')); },
  onBack(){
    if (!$('#ad').hidden) return true;
    if (!$('#modal').hidden){ if (!$('#modal')._sticky) closeModal(); return true; }
    if (!$('#bConfirm').hidden){ $('#bConfirm').hidden = true; $('#bGo').hidden = false; return true; }
    if (tab !== 'cocina'){ setTab('cocina'); return true; }
    return false;
  },
  saveNow(){ save(); },
};

/* ================= Arranque ================= */
function applyStaticTexts(){
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#menuBtn').setAttribute('aria-label', t('menu'));
  $('#scene').setAttribute('aria-label', t('sceneAria'));
}
function start(){
  const saved = loadSave();
  if (saved) g = saved;
  g.m.sessions++;
  applyStaticTexts();
  buildStations(); buildUpgrades();
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    g.buyMode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode;
    document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    refreshSoon();
  }));
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === String(g.buyMode))));
  $('#boost').addEventListener('click', boostTap);
  $('#menuBtn').addEventListener('click', openMenu);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !$('#modal')._sticky) closeModal(); });
  $('#bGo').addEventListener('click', () => { if (pendingStars() < 1){ const b = $('#bGo'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); toast(t('bNeedFirst', { v:$c(nextStarIn()) })); return; } $('#bGo').hidden = true; $('#bConfirm').hidden = false; });
  $('#bNo').addEventListener('click', () => { $('#bConfirm').hidden = true; $('#bGo').hidden = false; });
  $('#bYes').addEventListener('click', () => { $('#bConfirm').hidden = true; $('#bGo').hidden = false; doPrestige(); });
  if (saved){ const away = (Date.now() - (saved.savedAt || Date.now())) / 1000; handleAway(away, true); }
  refreshUI();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => STATIONS.forEach(drawIcon)).catch(() => {});
  requestAnimationFrame(tt => { last = tt; requestAnimationFrame(frame); });
}
start();
})();
