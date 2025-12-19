
/* SHWCARE Catalog Renderer (static site) */
async function loadCatalog() {
  const res = await fetch('data/products.json', {cache: 'no-store'});
  if (!res.ok) throw new Error('Failed to load catalog');
  return await res.json();
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

function renderCatalog({items, mountId, showProgram=false, enableSearch=true, programSections=true}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const groups = groupItems(items);

  const programs = [...new Set(groups.map(g => g.program))].sort((a,b)=>a.localeCompare(b));
  const state = {q:'', program:'All'};

  const search = el('input', {class:'catalog-search', placeholder:'Search therapies, compounds, peptides…', type:'search'});
  const filter = el('select', {class:'catalog-filter'});
  filter.append(el('option', {value:'All'}, [document.createTextNode('All Categories')]));
  programs.forEach(p => filter.append(el('option', {value:p}, [document.createTextNode(p)])));

  function apply() {
    const q = state.q.trim().toLowerCase();
    const prog = state.program;
    const filtered = groups.filter(g => {
      const matchesProg = prog === 'All' || g.program === prog;
      if (!matchesProg) return false;
      if (!q) return true;
      const hay = (g.baseName + ' ' + g.program + ' ' + g.dosageForm.join(' ')).toLowerCase();
      return hay.includes(q);
    });

    mount.innerHTML = '';
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
    const controls = el('div', {class:'catalog-controls'}, [search, filter]);
    mount.parentElement.insertBefore(controls, mount);
    search.addEventListener('input', (e)=>{ state.q = e.target.value; apply(); });
    filter.addEventListener('change', (e)=>{ state.program = e.target.value; apply(); });
  }

  apply();
}

window.SHWCatalog = { loadCatalog, renderCatalog };
