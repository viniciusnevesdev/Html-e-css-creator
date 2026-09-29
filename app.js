(() => {
  const STORAGE_KEY = 'mobile-ui-builder-project-v1';
  const VIEWPORT_KEY = 'mobile-ui-builder-viewport-v1';
  const ZOOM_KEY = 'mobile-ui-builder-zoom-v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let selected = null;
  let exportMode = 'html';
  let saveTimer = null;
  let previewing = false;
  let viewportWidth = Number(localStorage.getItem(VIEWPORT_KEY)) === 430 ? 430 : 390;
  let canvasZoom = Math.max(20, Math.min(200, Number(localStorage.getItem(ZOOM_KEY)) || 100));

  const editor = grapesjs.init({
    container: '#gjs',
    height: '740px',
    width: 'auto',
    fromElement: false,
    storageManager: false,
    panels: { defaults: [] },
    noticeOnUnload: false,
    selectorManager: { componentFirst: true },
    canvas: { styles: [], scripts: [] }
  });

  const initialHtml = `
    <main class="page-root">
      <section class="ui-container" data-ui="container-v">
        <div class="ui-text" data-ui="text">Hoje</div>
        <div class="ui-card" data-ui="container-v">
          <div class="ui-text" data-ui="text">Toque em mim</div>
          <div class="ui-text muted" data-ui="text">Depois abra Estilo.</div>
        </div>
      </section>
    </main>`;

  const initialCss = `
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
    body{min-height:100vh}
    .page-root{min-height:100vh;background:#000;padding:24px 16px;overflow-x:hidden}
    .ui-container{display:flex;flex-direction:column;gap:12px;width:100%}
    .ui-card{display:flex;flex-direction:column;gap:8px;width:100%;min-height:140px;padding:18px;background:#1c1c1e;border:1px solid #3a3a3c;border-radius:22px}
    .ui-text{font-size:28px;line-height:1.15}.ui-text.muted{font-size:15px;color:#8e8e93}
    .ui-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 16px;border-radius:14px;background:#0a84ff;color:#fff;width:fit-content}
    .ui-image{display:flex;align-items:center;justify-content:center;min-height:160px;border-radius:16px;background:#2c2c2e;color:#8e8e93;width:100%}
    .ui-spacer{min-height:32px;flex:1 1 auto;border:1px dashed rgba(142,142,147,.35)}
    .ui-divider{height:1px;background:#38383a;width:100%}
    .ui-overlay{display:grid;width:100%;min-height:160px}.ui-overlay>*{grid-area:1/1}
  `;

  function flattenLegacy390Media(css) {
    if (!css || !/max-width\s*:\s*390px/i.test(css)) return css;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    let output = '';
    try {
      [...style.sheet.cssRules].forEach(rule => {
        if (rule.type === CSSRule.MEDIA_RULE && /max-width\s*:\s*390px/i.test(rule.conditionText || '')) {
          output += [...rule.cssRules].map(inner => inner.cssText).join('\n') + '\n';
        } else {
          output += rule.cssText + '\n';
        }
      });
    } catch (error) {
      console.warn('Não foi possível migrar estilos antigos de 390 px', error);
      return css;
    } finally {
      style.remove();
    }
    return output.trim();
  }

  function migrateUiAttributes() {
    const walk = cmp => {
      cmp.components?.().each(child => {
        const attrs = child.getAttributes?.() || {};
        if (!attrs['data-ui']) {
          const classes = (child.getClasses?.() || []).join(' ');
          if (/\bui-text\b/.test(classes)) child.addAttributes({'data-ui':'text'});
          else if (/\bui-button\b/.test(classes)) child.addAttributes({'data-ui':'button'});
          else if (/\bui-image\b/.test(classes)) child.addAttributes({'data-ui':'image'});
          else if (/\bui-spacer\b/.test(classes)) child.addAttributes({'data-ui':'spacer'});
          else if (/\bui-divider\b/.test(classes)) child.addAttributes({'data-ui':'divider'});
        }
        walk(child);
      });
    };
    editor.Pages.getAll().forEach(page => {
      const root = page.getMainComponent?.();
      if (root) walk(root);
    });
  }

  function normalizeLoadedProject() {
    const css = editor.getCss();
    const migrated = flattenLegacy390Media(css);
    if (migrated && migrated !== css) editor.setStyle(migrated);
    migrateUiAttributes();
  }

  function loadProject() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        editor.loadProjectData(parsed.project || parsed);
        const pages = editor.Pages.getAll();
        const requestedId = parsed.activePageId;
        const requested = requestedId ? pages.find(page => page.get('id') === requestedId) : null;
        editor.Pages.select(requested || editor.Pages.getSelected() || pages[0]);
        normalizeLoadedProject();
        return;
      } catch (e) { console.warn('Falha ao restaurar projeto', e); }
    }
    const pages = editor.Pages;
    const first = pages.getSelected() || pages.getAll()[0];
    editor.Pages.select(first);
    const cmp = first.getMainComponent();
    cmp.components(initialHtml);
    editor.setStyle(initialCss);
  }

  function persist(showFeedback = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      project: editor.getProjectData(),
      activePageId: editor.Pages.getSelected()?.get('id') || null
    }));
    if (showFeedback) {
      const btn = $('#saveBtn');
      const prev = btn.textContent;
      btn.textContent = 'Salvo ✓';
      setTimeout(() => btn.textContent = prev, 900);
    }
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(false), 500);
  }

  loadProject();

  const addTemplates = {
    'container-v': `<div class="ui-container" data-ui="container-v" style="display:flex;flex-direction:column;gap:12px;width:100%;min-height:100px;padding:12px;border:1px dashed #3a3a3c;border-radius:16px"></div>`,
    'container-h': `<div class="ui-container" data-ui="container-h" style="display:flex;flex-direction:row;gap:12px;width:100%;min-height:80px;padding:12px;border:1px dashed #3a3a3c;border-radius:16px"></div>`,
    'overlay': `<div class="ui-overlay" data-ui="overlay" style="display:grid;width:100%;min-height:160px"><div class="ui-card" style="grid-area:1/1;background:#222;border-radius:20px"></div><div class="ui-text" data-ui="text" style="grid-area:1/1;align-self:center;justify-self:center">Sobreposição</div></div>`,
    'text': `<div class="ui-text" data-ui="text" style="font-size:20px">Texto</div>`,
    'button': `<div class="ui-button" data-ui="button">Botão</div>`,
    'image': `<div class="ui-image" data-ui="image">Imagem</div>`,
    'spacer': `<div class="ui-spacer" data-ui="spacer"></div>`,
    'divider': `<div class="ui-divider" data-ui="divider"></div>`
  };

  function defaultPageContainer() {
    const page = editor.Pages.getSelected();
    const root = page?.getMainComponent?.();
    if (!root) return editor.getWrapper();

    const candidates = root.find?.('[data-ui="container-v"], [data-ui="container-h"]') || [];
    return candidates[0] || root.components?.().at?.(0)?.components?.().at?.(0) || root;
  }

  function targetContainer() {
    if (!selected) return defaultPageContainer();

    const ui = selected.getAttributes?.()?.['data-ui'];
    if (['container-v','container-h','overlay'].includes(ui)) return selected;

    const tag = String(selected.get?.('tagName') || '').toLowerCase();
    const type = String(selected.get?.('type') || '').toLowerCase();
    if (tag === 'main' || tag === 'body' || type === 'wrapper') {
      const nested = selected.find?.('[data-ui="container-v"], [data-ui="container-h"]') || [];
      return nested[0] || (tag === 'main' ? selected : defaultPageContainer());
    }

    const parent = selected.parent?.();
    if (!parent) return defaultPageContainer();
    const parentTag = String(parent.get?.('tagName') || '').toLowerCase();
    const parentType = String(parent.get?.('type') || '').toLowerCase();
    if (parentTag === 'body' || parentType === 'wrapper') return defaultPageContainer();
    return parent;
  }

  function flash(message) {
    let el = document.getElementById('appFlash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appFlash';
      Object.assign(el.style, {
        position:'fixed', left:'50%', bottom:'calc(var(--sheet-h) + 12px)',
        transform:'translateX(-50%)', zIndex:'90', background:'rgba(44,44,46,.96)',
        color:'#fff', padding:'9px 13px', borderRadius:'999px', fontSize:'12px',
        boxShadow:'0 8px 24px rgba(0,0,0,.35)', pointerEvents:'none',
        opacity:'0', transition:'opacity .16s ease'
      });
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { el.style.opacity = '0'; }, 900);
  }

  function addComponent(type) {
    const parent = targetContainer();
    const added = parent.components().add(addTemplates[type]);
    const cmp = Array.isArray(added) ? added[0] : added;
    editor.select(cmp);
    switchTab('style');
    renderLayers();
    schedulePersist();
    flash('Elemento adicionado');
  }

  $$('.component-card').forEach(btn => btn.addEventListener('click', () => addComponent(btn.dataset.add)));

  function switchTab(name) {
    $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    $$('.panel').forEach(x => x.classList.toggle('active', x.dataset.panel === name));
    if (name === 'layers') renderLayers();
    if (name === 'pages') renderPages();
  }
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  function labelFor(cmp) {
    const attrs = cmp.getAttributes ? cmp.getAttributes() : {};
    const type = attrs?.['data-ui'];
    const map = {
      'container-v':'Container vertical','container-h':'Container horizontal','overlay':'Sobreposição',
      'text':'Texto','button':'Botão','image':'Imagem','spacer':'Spacer','divider':'Divisor'
    };
    if (map[type]) {
      if (type === 'text' || type === 'button') {
        const txt = (cmp.get('content') || cmp.view?.el?.textContent || '').trim();
        return txt ? `${map[type]} · ${txt.slice(0,18)}` : map[type];
      }
      return map[type];
    }
    const tag = cmp.get('tagName') || cmp.get('type') || 'Elemento';
    return tag === 'body' ? 'Página' : tag;
  }

  function iconFor(cmp) {
    const t = cmp.getAttributes?.()?.['data-ui'];
    return ({'container-v':'↕','container-h':'↔','overlay':'▣','text':'Aa','button':'▭','image':'▧','spacer':'↕','divider':'—'})[t] || '□';
  }

  function renderLayers() {
    const tree = $('#layersTree');
    tree.innerHTML = '';
    const root = editor.Pages.getSelected()?.getMainComponent();
    if (!root) return;

    const walk = (cmp, depth) => {
      cmp.components().each(child => {
        const attrs = child.getAttributes?.() || {};
        const type = String(child.get?.('type') || '').toLowerCase();
        const show = Boolean(attrs['data-ui']);

        if (show) {
          const row = document.createElement('button');
          row.className = 'layer-row' + (selected === child ? ' selected' : '');
          row.style.paddingLeft = `${10 + depth * 16}px`;
          row.innerHTML = `<span class="layer-icon">${iconFor(child)}</span><span class="layer-name"></span>`;
          row.querySelector('.layer-name').textContent = labelFor(child);
          row.addEventListener('click', () => { editor.select(child); switchTab('style'); });
          tree.appendChild(row);
        }

        if (type !== 'textnode' && child.components?.().length) {
          walk(child, show ? depth + 1 : depth);
        }
      });
    };

    walk(root, 0);
    if (!tree.children.length) tree.innerHTML = '<div class="empty-state">Esta página está vazia.</div>';
  }

  function safeStyle(cmp, key, fallback='') {
    const style = cmp.getStyle ? cmp.getStyle() : {};
    const v = style[key];
    if (v !== undefined && v !== '') return String(v);
    const el = cmp.view?.el;
    if (el && getComputedStyle(el)[key]) return getComputedStyle(el)[key];
    return fallback;
  }

  function numeric(v, fallback=0) {
    const m = String(v ?? '').match(/-?[\d.]+/);
    return m ? Number(m[0]) : fallback;
  }

  function setStylePatch(patch) {
    if (!selected) return;
    selected.addStyle(patch);
    schedulePersist();
  }

  function refreshInspector() {
    const empty = $('#inspectorEmpty');
    const inspector = $('#inspector');
    if (!selected) {
      empty.classList.remove('hidden'); inspector.classList.add('hidden');
      $('#selectedLabel').textContent = 'Nada selecionado';
      return;
    }
    empty.classList.add('hidden'); inspector.classList.remove('hidden');
    $('#selectedLabel').textContent = labelFor(selected);
    const attrs = selected.getAttributes?.() || {};
    const ui = attrs['data-ui'];
    const isText = ui === 'text' || ui === 'button';
    $('#textFieldWrap').classList.toggle('hidden', !isText);
    if (isText) $('#textValue').value = selected.get('content') || selected.view?.el?.textContent || '';

    const width = safeStyle(selected,'width','auto');
    let mode = 'fixed';
    if (width === '100%' || width === '100vw') mode='full';
    else if (width === 'fit-content' || width === 'auto') mode='fit';
    setSegment($('#widthMode'), mode);
    $('#widthValueWrap').classList.toggle('hidden', mode !== 'fixed');
    $('#widthValue').value = numeric(width, 300);
    $('#heightValue').value = safeStyle(selected,'height','auto').replace('px','');
    $('#gapValue').value = numeric(safeStyle(selected,'gap','0'),0);
    $('#paddingValue').value = numeric(safeStyle(selected,'padding','0'),0);
    $('#marginValue').value = numeric(safeStyle(selected,'margin','0'),0);
    const display = safeStyle(selected,'display','block');
    const position = safeStyle(selected,'position','static');
    let dir = safeStyle(selected,'flex-direction','column');
    if (display === 'grid' && (ui === 'overlay' || position === 'relative')) dir='overlay';
    $('#directionValue').value = ['column','row','overlay'].includes(dir) ? dir : 'column';
    $('#alignValue').value = safeStyle(selected,'align-items','stretch') || 'stretch';
    $('#justifyValue').value = safeStyle(selected,'justify-content','flex-start') || 'flex-start';

    $('#backgroundValue').value = rgbToHex(safeStyle(selected,'background-color','#000000'));
    $('#colorValue').value = rgbToHex(safeStyle(selected,'color','#ffffff'));
    $('#borderWidthValue').value = numeric(safeStyle(selected,'border-width','0'),0);
    $('#borderColorValue').value = rgbToHex(safeStyle(selected,'border-color','#8e8e93'));
    $('#radiusValue').value = numeric(safeStyle(selected,'border-radius','0'),0);
    $('#opacityValue').value = Math.round(Number(safeStyle(selected,'opacity','1'))*100);
    $('#overflowValue').value = safeStyle(selected,'overflow','visible') || 'visible';
  }

  function rgbToHex(value) {
    if (!value) return '#000000';
    if (value.startsWith('#')) {
      if (value.length === 4) return '#' + [...value.slice(1)].map(c=>c+c).join('');
      return value.slice(0,7);
    }
    const m = value.match(/[\d.]+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0,3).map(n => Math.max(0,Math.min(255,Math.round(Number(n)))).toString(16).padStart(2,'0')).join('');
  }

  function setSegment(group, value) {
    group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === value));
  }

  $('#widthMode').addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]'); if (!btn || !selected) return;
    const val = btn.dataset.value;
    setSegment($('#widthMode'), val);
    $('#widthValueWrap').classList.toggle('hidden', val !== 'fixed');
    if (val === 'full') setStylePatch({width:'100%'});
    if (val === 'fit') setStylePatch({width:'fit-content'});
    if (val === 'fixed') setStylePatch({width:`${Number($('#widthValue').value)||300}px`});
  });

  $('#textValue').addEventListener('input', e => { if(selected){ selected.components(e.target.value); schedulePersist(); renderLayers(); }});
  $('#widthValue').addEventListener('input', e => setStylePatch({width:`${Number(e.target.value)||0}px`}));
  $('#heightValue').addEventListener('change', e => { const v=e.target.value.trim(); setStylePatch({height: (!v || v==='auto')?'auto':/^\d+(\.\d+)?$/.test(v)?`${v}px`:v}); });
  $('#gapValue').addEventListener('input', e => setStylePatch({gap:`${Number(e.target.value)||0}px`}));
  $('#paddingValue').addEventListener('input', e => setStylePatch({padding:`${Number(e.target.value)||0}px`}));
  $('#marginValue').addEventListener('input', e => setStylePatch({margin:`${Number(e.target.value)||0}px`}));
  $('#directionValue').addEventListener('change', e => {
    const v=e.target.value;
    if(v==='overlay') setStylePatch({display:'grid','flex-direction':'','position':'relative'});
    else setStylePatch({display:'flex','flex-direction':v,position:''});
  });
  $('#alignValue').addEventListener('change', e => setStylePatch({'align-items':e.target.value}));
  $('#justifyValue').addEventListener('change', e => setStylePatch({'justify-content':e.target.value}));
  $('#backgroundValue').addEventListener('input', e => setStylePatch({'background-color':e.target.value}));
  $('#colorValue').addEventListener('input', e => setStylePatch({color:e.target.value}));
  $('#borderWidthValue').addEventListener('input', e => setStylePatch({'border-width':`${Number(e.target.value)||0}px`,'border-style':'solid'}));
  $('#borderColorValue').addEventListener('input', e => setStylePatch({'border-color':e.target.value,'border-style':'solid'}));
  $('#radiusValue').addEventListener('input', e => setStylePatch({'border-radius':`${Number(e.target.value)||0}px`}));
  $('#opacityValue').addEventListener('input', e => setStylePatch({opacity:String(Math.max(0,Math.min(100,Number(e.target.value)||0))/100)}));
  $('#overflowValue').addEventListener('change', e => setStylePatch({overflow:e.target.value}));

  function componentIndex(cmp) {
    const p=cmp.parent(); if(!p) return -1; return p.components().indexOf(cmp);
  }
  function moveSelected(delta) {
    if(!selected || !selected.parent()) return;
    const parent=selected.parent(); const collection=parent.components(); const idx=collection.indexOf(selected); const ni=Math.max(0,Math.min(collection.length-1,idx+delta));
    if(ni===idx) return;
    collection.remove(selected,{temporary:true}); collection.add(selected,{at:ni}); editor.select(selected); schedulePersist(); renderLayers();
  }
  $('#moveUpBtn').addEventListener('click',()=>moveSelected(-1));
  $('#moveDownBtn').addEventListener('click',()=>moveSelected(1));
  $('#duplicateBtn').addEventListener('click',()=>{
    if(!selected||!selected.parent()) return;
    const parent=selected.parent(); const clone=selected.clone(); parent.components().add(clone,{at:componentIndex(selected)+1}); editor.select(clone); schedulePersist(); renderLayers();
  });
  $('#deleteBtn').addEventListener('click',()=>{ if(selected){ const doomed=selected; selected=null; doomed.remove(); schedulePersist(); refreshInspector(); renderLayers(); }});

  editor.on('component:selected', cmp => { selected=cmp; refreshInspector(); renderLayers(); });
  editor.on('component:deselected', () => { selected=null; refreshInspector(); renderLayers(); });
  editor.on('update', schedulePersist);

  $('#undoBtn').addEventListener('click',()=>editor.UndoManager.undo());
  $('#redoBtn').addEventListener('click',()=>editor.UndoManager.redo());
  $('#refreshLayers').addEventListener('click',renderLayers);

  function clampZoom(value) {
    return Math.max(20, Math.min(200, Math.round(Number(value) || 100)));
  }

  function updateZoomUi() {
    const value = $('#zoomValue');
    if (value) value.textContent = `${Math.round(canvasZoom)}%`;
  }

  function setCanvasZoom(value, save = true) {
    canvasZoom = clampZoom(value);
    editor.Canvas.setZoom(canvasZoom);
    updateZoomUi();
    if (save) localStorage.setItem(ZOOM_KEY, String(canvasZoom));
  }

  function touchDistance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  function bindCanvasPinch(frameWindow) {
    if (!frameWindow || frameWindow.__uiBuilderPinchBound) return;
    frameWindow.__uiBuilderPinchBound = true;

    const doc = frameWindow.document;
    let pinching = false;
    let startDistance = 0;
    let startZoom = canvasZoom;

    const begin = event => {
      if (!event.touches || event.touches.length < 2) return;
      pinching = true;
      startDistance = touchDistance(event.touches[0], event.touches[1]);
      startZoom = editor.Canvas.getZoom() || canvasZoom;
      event.preventDefault();
    };

    const move = event => {
      if (!pinching || !event.touches || event.touches.length < 2) return;
      event.preventDefault();
      const distance = touchDistance(event.touches[0], event.touches[1]);
      if (!startDistance) return;
      setCanvasZoom(startZoom * (distance / startDistance), false);
    };

    const end = event => {
      if (!pinching) return;
      if (event.touches && event.touches.length >= 2) return;
      pinching = false;
      setCanvasZoom(canvasZoom, true);
    };

    doc.addEventListener('touchstart', begin, { passive: false });
    doc.addEventListener('touchmove', move, { passive: false });
    doc.addEventListener('touchend', end, { passive: false });
    doc.addEventListener('touchcancel', end, { passive: false });

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      doc.addEventListener(name, event => event.preventDefault(), { passive: false });
    });
  }

  function lockInterfaceZoom() {
    const blockGesture = event => event.preventDefault();
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      document.addEventListener(name, blockGesture, { passive: false });
    });

    document.addEventListener('touchmove', event => {
      if (event.touches && event.touches.length > 1) event.preventDefault();
    }, { passive: false });
  }

  $('#zoomOutBtn')?.addEventListener('click', () => setCanvasZoom(canvasZoom - 10));
  $('#zoomInBtn')?.addEventListener('click', () => setCanvasZoom(canvasZoom + 10));
  $('#zoomValue')?.addEventListener('click', () => setCanvasZoom(100));

  editor.on('canvas:zoom', () => {
    const current = editor.Canvas.getZoom();
    if (Number.isFinite(current)) {
      canvasZoom = clampZoom(current);
      updateZoomUi();
    }
  });

  editor.on('canvas:frame:load', ({ window }) => {
    bindCanvasPinch(window);
    setCanvasZoom(canvasZoom, false);
  });

  lockInterfaceZoom();

  function syncCanvasSize() {
    const canvasHost = $('#gjs');
    if (!canvasHost) return;

    if (previewing) {
      const topbarHeight = $('.topbar')?.getBoundingClientRect().height || 58;
      const available = Math.max(320, window.innerHeight - topbarHeight - 68);
      canvasHost.style.height = `${available}px`;
    } else {
      canvasHost.style.height = '740px';
    }

    requestAnimationFrame(() => {
      editor.refresh();
      requestAnimationFrame(() => editor.refresh());
    });
  }

  function setViewport(width, save = true) {
    viewportWidth = Number(width) === 430 ? 430 : 390;
    const stage = $('.device-stage');
    if (stage) stage.style.width = `${viewportWidth}px`;
    const label = $('#deviceLabel');
    if (label) label.textContent = `${viewportWidth} px`;
    $$('.device-switch button').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.viewport) === viewportWidth);
    });
    if (save) localStorage.setItem(VIEWPORT_KEY, String(viewportWidth));
    requestAnimationFrame(() => editor.refresh());
  }

  $$('.device-switch button').forEach(btn => {
    btn.addEventListener('click', () => setViewport(Number(btn.dataset.viewport)));
  });

  $('#previewBtn').addEventListener('click',()=>{
    previewing=!previewing;
    document.body.classList.toggle('previewing',previewing);
    $('#previewBtn').textContent=previewing?'✕':'◉';
    try { previewing ? editor.runCommand('preview') : editor.stopCommand('preview'); } catch(e){}
    syncCanvasSize();
  });

  window.addEventListener('resize', syncCanvasSize);

  function pageDisplayName(page) {
    if (!page) return 'Página';
    const pages = editor.Pages.getAll();
    const index = Math.max(0, pages.indexOf(page));
    return page.get('name') || `Página ${index + 1}`;
  }

  function renderPages() {
    const list=$('#pagesList'); list.innerHTML='';
    const pages=editor.Pages.getAll(); const current=editor.Pages.getSelected();
    pages.forEach((page,i)=>{
      const row=document.createElement('div'); row.className='page-row'+(page===current?' selected':'');
      const name=page.get('name')||`Página ${i+1}`;
      row.innerHTML=`<span class="layer-icon">▤</span><span class="layer-name"></span><button aria-label="Renomear">✎</button><button aria-label="Excluir">×</button>`;
      row.querySelector('.layer-name').textContent=name;
      row.querySelector('.layer-name').addEventListener('click',()=>{editor.Pages.select(page); updatePageTitle(); renderPages();});
      const buttons=row.querySelectorAll('button');
      buttons[0].addEventListener('click',()=>{const n=prompt('Nome da página',name); if(n){page.set('name',n.trim()); updatePageTitle(); renderPages(); persist();}});
      buttons[1].addEventListener('click',()=>{
        const all = editor.Pages.getAll();
        if(all.length<=1){alert('O projeto precisa ter pelo menos uma página.');return;}
        if(!confirm(`Excluir “${name}”?`)) return;

        const index = all.indexOf(page);
        const wasActive = page === editor.Pages.getSelected();
        const fallback = all[index - 1] || all[index + 1];

        if (wasActive && fallback) editor.Pages.select(fallback);
        editor.Pages.remove(page);
        if (wasActive && fallback) editor.Pages.select(fallback);

        selected = null;
        updatePageTitle();
        refreshInspector();
        renderLayers();
        renderPages();
        persist();
      });
      list.appendChild(row);
    });
  }
  function updatePageTitle(){ $('#pageTitleBtn').textContent=pageDisplayName(editor.Pages.getSelected()); }
  $('#addPageBtn').addEventListener('click',()=>{
    const count=editor.Pages.getAll().length+1;
    const page=editor.Pages.add({id:`page-${Date.now()}`,name:`Página ${count}`,component:`<main class="page-root"><section class="ui-container" data-ui="container-v"></section></main>`});
    editor.Pages.select(page); updatePageTitle(); renderPages(); persist();
  });
  $('#pageTitleBtn').addEventListener('click',()=>switchTab('pages'));
  editor.on('page:select',()=>{ selected=null; updatePageTitle(); refreshInspector(); renderLayers(); });

  $('#saveBtn').addEventListener('click',()=>persist(true));
  $('#resetBtn').addEventListener('click',()=>{ if(confirm('Apagar o projeto salvo e recomeçar?')){localStorage.removeItem(STORAGE_KEY);location.reload();} });

  function exportCss(){ return editor.getCss(); }

  function exportHtmlDocument() {
    const raw = editor.getHtml();
    const match = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = match ? match[1] : raw;
    const css = exportCss();
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
${css}
  </style>
</head>
<body>
${body}
</body>
</html>`;
  }

  function currentExport(){ return exportMode==='html'?exportHtmlDocument():exportCss(); }
  function refreshExport(){ $('#exportCode').value=currentExport(); }
  $('#exportBtn').addEventListener('click',()=>{ $('#exportModal').classList.remove('hidden'); refreshExport(); });
  $('#closeExport').addEventListener('click',()=>$('#exportModal').classList.add('hidden'));
  $$('.export-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
    exportMode=btn.dataset.exportTab; $$('.export-tabs button').forEach(b=>b.classList.toggle('active',b===btn)); refreshExport();
  }));
  $('#copyExport').addEventListener('click',async()=>{
    const text=currentExport();
    try{await navigator.clipboard.writeText(text); $('#copyExport').textContent='Copiado ✓'; setTimeout(()=>$('#copyExport').textContent='Copiar',900);}catch{ $('#exportCode').select(); document.execCommand('copy'); }
  });
  $('#downloadExport').addEventListener('click',()=>{
    const ext=exportMode==='html'?'html':'css'; const blob=new Blob([currentExport()],{type:exportMode==='html'?'text/html':'text/css'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`pagina.${ext}`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });

  setViewport(viewportWidth, false);
  renderLayers(); renderPages(); updatePageTitle(); refreshInspector();
  syncCanvasSize();

  editor.on('load', () => {
    setViewport(viewportWidth, false);
    updatePageTitle();
    renderPages();
    renderLayers();
    syncCanvasSize();
    updateZoomUi();
    setCanvasZoom(canvasZoom, false);
    bindCanvasPinch(editor.Canvas.getWindow?.());
  });

  requestAnimationFrame(() => {
    updatePageTitle();
    syncCanvasSize();
    updateZoomUi();
    setCanvasZoom(canvasZoom, false);
    bindCanvasPinch(editor.Canvas.getWindow?.());
  });

  flash('Editor pronto');

  if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
})();
