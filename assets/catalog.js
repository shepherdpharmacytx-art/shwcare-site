
/* SHWCARE Catalog Renderer (static site) */
async function loadCatalog() {
  const res = await fetch('data/products.json', {cache: 'no-store'});
  if (!res.ok) throw new Error('Failed to load catalog');
  return await res.json();
}


// Program slugs used for deep links (e.g., from homepage)
const PROGRAM_SLUG_MAP = {
  "weight-loss": "Weight Loss & Metabolic Optimization",
  "hair": "Hair Loss & Scalp Health",
  "derm": "Dermatology & Aesthetics",
  "womens": "Women’s Hormone Balance",
  "mens": "Men’s Health & Performance",
  "longevity": "Longevity & Cellular Health",
  "recovery": "Regenerative & Injury Recovery",
  "neuro": "Neuro, Mood & Sleep Optimization",
  "gh": "Growth Hormone Optimization",
  "peptides": "__PEPTIDES__",
  "wellness": "__WELLNESS__"
};

function getProgramFilterFromUrl() {
  const p = new URLSearchParams(location.search).get("program");
  if (!p) return null;
  const key = decodeURIComponent(p).trim().toLowerCase();
  // allow passing either slug or full label
  if (PROGRAM_SLUG_MAP[key]) return PROGRAM_SLUG_MAP[key];
  // try match by label
  return decodeURIComponent(p).trim();
}

function filterItemsByProgramParam(items) {
  const pf = getProgramFilterFromUrl();
  if (!pf) return {items, label:null};
  if (pf === "__PEPTIDES__") {
    const peptidePrograms = new Set([
      "Regenerative & Injury Recovery",
      "Longevity & Cellular Health",
      "Neuro, Mood & Sleep Optimization",
      "Growth Hormone Optimization"
    ]);
    const filtered = (items||[]).filter(it => _isPeptideLike(it) || peptidePrograms.has(it.program));
    return {items: filtered, label: "Peptide Programs"};
  }
  if (pf === "__WELLNESS__") {
    const wellnessPrograms = new Set([
      "Men’s Health & Performance",
      "Women’s Hormone Balance",
      "Longevity & Cellular Health"
    ]);
    const filtered = (items||[]).filter(it => wellnessPrograms.has(it.program) || ["NAD+","Glutathione"].includes((it.rxName||it.name||"").replace(/\s*—.*$/,'').trim()));
    return {items: filtered, label: "Wellness & Vitality"};
  }
  const filtered = (items||[]).filter(it => (it.program||"").trim() === pf);
  return {items: filtered, label: pf};
}


// Group staged meds (GLP-1s etc.) so you get ONE widget per compound with stage buttons.
function groupItems(items) {
  const groups = new Map();
  for (const it of items) {
    const isStaged = typeof it.stage === 'number' && it.stage > 0;
    const baseKey = isStaged
      ? (it.rxName || it.name).replace(/\s*\(stage\s*\d+\)\s*$/i, '').trim()
      : (it.rxName || it.name).trim();

    const key = `${it.program}||${baseKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        program: it.program,
        baseName: baseKey,
        dosageForm: new Set(),
        rxType: it.rxType,
        image: it.image,
        staged: isStaged,
        stages: []
      });
    }
    const g = groups.get(key);
    (it.dosageForm || []).forEach(d => g.dosageForm.add(d));
    if (isStaged) g.stages.push(it);
    else g.stages.push(it); // non-staged is a single "stage"
  }

  // sort stages
  for (const g of groups.values()) {
    g.stages.sort((a,b) => (a.stage||0) - (b.stage||0));
    g.dosageForm = Array.from(g.dosageForm);
  }

  return Array.from(groups.values());
}

function money(n) {
  if (typeof n !== 'number') return '';
  return n.toLocaleString(undefined, {style:'currency', currency:'USD'});
}

function el(tag, attrs={}, children=[]) {
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2), v);
    else node.setAttribute(k, v);
  }
  for (const ch of children) node.append(ch);
  return node;
}

function renderCard(group, opts={showProgram:false}) {
  const selected = group.stages[0];

  const headerLeft = el('div', {class:'card-head-left'}, [
    el('div', {class:'card-title'}, [document.createTextNode(group.baseName)]),
    el('div', {class:'card-meta'}, [
      document.createTextNode(
        `${(opts.showProgram ? group.program + ' • ' : '')}${group.dosageForm.join(' / ')}`
      )
    ])
  ]);

  const img = el('img', {
    class: 'card-img',
    src: group.image || 'assets/products/generic.svg',
    alt: group.baseName,
    loading: 'lazy'
  });

  const stageBar = el('div', {class:'stage-bar', role:'tablist', 'aria-label':'Stages'});
  const priceBlock = el('div', {class:'price-block'});
  const note = el('div', {class:'card-note'}, [
    document.createTextNode('Dose and final therapy selection are determined by a licensed clinician after review. Payment does not guarantee a prescription.')
  ]);

  function updateFor(item) {
    // Stage pills
    [...stageBar.querySelectorAll('button')].forEach(b => b.classList.remove('active'));
    const btn = stageBar.querySelector(`button[data-id="${item.id}"]`);
    if (btn) btn.classList.add('active');

    // Prices
    priceBlock.innerHTML = '';
    const pkgs = item.packages || [];
    const p30 = pkgs.find(p => p.days === 30);
    const p90 = pkgs.find(p => p.days === 90);

    const row = el('div', {class:'price-row'}, [
      el('a', {class:'btn primary', href:`start.html?sku=${encodeURIComponent(item.id)}&term=30`}, [
        document.createTextNode(`30‑Day Package — ${money(p30?.msrp) || 'See at checkout'}`)
      ]),
      el('a', {class:'btn', href:`start.html?sku=${encodeURIComponent(item.id)}&term=90`}, [
        document.createTextNode(`90‑Day Package — ${money(p90?.msrp) || 'See at checkout'}`)
      ]),
    ]);
    priceBlock.append(row);
  }

  // Build stage pills if staged (or keep hidden for non-staged)
  if (group.stages.length > 1) {
    group.stages.forEach((s, idx) => {
      stageBar.append(el('button', {
        class: 'stage-pill' + (idx === 0 ? ' active' : ''),
        type: 'button',
        'data-id': s.id,
        role:'tab',
        onclick: () => updateFor(s)
      }, [document.createTextNode(`Stage ${s.stage}`)]));
    });
  } else {
    stageBar.classList.add('hidden');
  }

  updateFor(selected);

  return el('div', {class:'catalog-card'}, [
    img,
    el('div', {class:'card-body'}, [
      headerLeft,
      stageBar,
      priceBlock,
      note
    ])
  ]);
}


// --- Therapies icon-grid renderer ---
function _isGLP1(item){
  const n = (item.name||'').toLowerCase();
  return n.includes('semaglutide') || n.includes('tirzepatide') || n.includes('retatrutide');
}
function _isPeptideLike(item){
  const cat=(item.category||'').toLowerCase();
  const n=(item.name||'').toLowerCase();
  return cat.includes('peptide') || cat.includes('performance') || cat.includes('longevity') ||
    n.includes('bpc') || n.includes('tb-') || n.includes('thymosin') || n.includes('ipamorelin') ||
    n.includes('cjc') || n.includes('tesamorelin') || n.includes('sermorelin') || n.includes('mots') ||
    n.includes('aod') || n.includes('selank') || n.includes('semax') || n.includes('dsip') ||
    n.includes('kisspeptin') || n.includes('epithalon') || n.includes('glutathione') || n.includes('nad');
}
function renderTherapyIcons(container, items){
  const sorted = (items||[]).slice().sort((a,b)=>{
    const a1 = _isGLP1(a) ? 0 : (_isPeptideLike(a) ? 1 : 2);
    const b1 = _isGLP1(b) ? 0 : (_isPeptideLike(b) ? 1 : 2);
    if (a1!==b1) return a1-b1;
    return (a.name||'').localeCompare(b.name||'');
  });
  container.innerHTML = `
    <div class="therapy-grid" role="list">
      ${sorted.map(it => `
        <div class="therapy-tile" role="listitem" title="${it.name}">
          <div class="therapy-icon">
            <img src="${it.image}" alt="${it.name}">
          </div>
          <div class="therapy-name">${it.name}</div>
          <div class="therapy-meta">${it.form || ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCatalog({items, mountId, showProgram=false, enableSearch=true, programSections=true, layout="cards"} = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  // If URL includes ?program=..., isolate therapies to that program (used by homepage deep-links)
  const filteredInfo = filterItemsByProgramParam(items);
  items = filteredInfo.items;

  if ((layout || "").toLowerCase() === "icons") {
    // Icons view is a zoomed-out therapies list (GLP-1s first, then peptides/experimental)
    // If program filter is present, only render those therapies.
    if (filteredInfo.label) {
      mount.innerHTML = `
        <div class="catalog-subhead">
          <a class="smalllink" href="products.html">← All Therapies</a>
          <h2>${filteredInfo.label}</h2>
          <p class="muted">Showing therapies in this track.</p>
        </div>
        <div id="therapyIconMount"></div>
      `;
      const inner = mount.querySelector("#therapyIconMount");
      renderTherapyIcons(inner, items);
      return;
    }
    renderTherapyIcons(mount, items);
    return;
  }
const groups = groupItems(items);

  const programs = [...new Set(groups.map(g => g.program))].sort((a,b)=>{
    const order = [
      "Weight Loss & Metabolic Optimization",
      "Regenerative & Injury Recovery",
      "Longevity & Cellular Health",
      "Neuro / Mood / Sleep",
      "Growth Hormone Optimization",
      "Men’s Health & Performance",
      "Women’s Hormone Balance",
      "Dermatology & Aesthetics",
      "Hair Loss & Scalp Health"
    ];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const state = {q:'', program:'All'};
  const urlProg = getProgramFilterFromUrl();
  const lockProgram = !!urlProg;
  if (lockProgram && urlProg && !urlProg.startsWith('__')) state.program = urlProg;
  if (lockProgram && urlProg === '__PEPTIDES__') state.program = 'All';
  if (lockProgram && urlProg === '__WELLNESS__') state.program = 'All';

  const search = el('input', {class:'catalog-search', placeholder:'Search therapies, compounds, peptides…', type:'search'});
  const filter = el('select', {class:'catalog-filter'});
  filter.append(el('option', {value:'All'}, [document.createTextNode('All Categories')]));
  programs.forEach(p => filter.append(el('option', {value:p}, [document.createTextNode(p)])));

  function apply() {
    const q = state.q.trim().toLowerCase();
    const prog = lockProgram ? 'All' : state.program;
    const filtered = groups.filter(g => {
      const matchesProg = prog === 'All' || g.program === prog;
      if (!matchesProg) return false;
      if (!q) return true;
      const hay = (g.baseName + ' ' + g.program + ' ' + g.dosageForm.join(' ')).toLowerCase();
      return hay.includes(q);
    });

    mount.innerHTML = '';
    if (lockProgram && filteredInfo.label) {
      mount.append(el('div', {class:'catalog-subhead'}, [
        el('a', {class:'smalllink', href:'programs.html'}, [document.createTextNode('← Programs')]),
        el('h2', {}, [document.createTextNode(filteredInfo.label)]),
        el('p', {class:'muted'}, [document.createTextNode('Showing therapies in this track.')])
      ]));
      mount.append(el('div', {class:'catalog-grid'}, filtered.map(g => renderCard(g, {showProgram:false}))));
      return;
    }
    if (programSections) {
      const byProg = new Map();
      filtered.forEach(g => {
        if (!byProg.has(g.program)) byProg.set(g.program, []);
        byProg.get(g.program).push(g);
      });
      for (const [p, arr] of [...byProg.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
        mount.append(el('div', {class:'catalog-section'}, [
          el('h2', {class:'section-title'}, [document.createTextNode(p)]),
          el('div', {class:'catalog-grid'}, arr.map(g => renderCard(g, {showProgram})))
        ]));
      }
    } else {
      mount.append(el('div', {class:'catalog-grid'}, filtered.map(g => renderCard(g, {showProgram}))));
    }
  }

  if (enableSearch) {
    const controls = el('div', {class:'catalog-controls'}, [search, ...(lockProgram ? [] : [filter])]);
    mount.parentElement.insertBefore(controls, mount);
    search.addEventListener('input', (e)=>{ state.q = e.target.value; apply(); });
    filter.addEventListener('change', (e)=>{ state.program = e.target.value; apply(); });
  }

  apply();
}

window.SHWCatalog = { loadCatalog, renderCatalog };
