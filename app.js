(() => {
  const STORAGE_KEY = 'mobile-ui-builder-project-v1';
  const VIEWPORT_KEY = 'mobile-ui-builder-viewport-v1';
  const ZOOM_KEY = 'mobile-ui-builder-zoom-v1';
  const CURRENT_BUILD = String(window.__APP_BUILD__ || '');
  let latestAvailableBuild = null;
  let lastUpdateCheck = 0;
  const $ = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  let selected = null;
  let exportMode = 'html';
  let saveTimer = null;
  let previewing = false;
  let interactionMode = 'edit';
  let appearanceClipboard = null;
  const spacingLinked = { padding: true, margin: true };
  let sheetCollapsed = false;
  let importMode = 'html';
  let importedHeadExtras = '';
  const LocalBackupClient = class {
    constructor(store) {
      this.store = store;
      this.listeners = new Set();
      this.settings = this.read();
      store.subscribe(() => this.markDirty());
    }
    read() {
      try {
        return { version: 1, dirty: false, lastBackupAt: '', lastBackupName: '', ...JSON.parse(localStorage.getItem('ui-builder-local-backup-v1') || '{}') };
      } catch (_) {
        return { version: 1, dirty: false, lastBackupAt: '', lastBackupName: '' };
      }
    }
    write(next) {
      this.settings = { ...this.settings, ...next };
      localStorage.setItem('ui-builder-local-backup-v1', JSON.stringify(this.settings));
      this.emit();
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit() { this.listeners.forEach(listener => { try { listener(this.status()); } catch (_) {} }); }
    status() { return JSON.parse(JSON.stringify(this.settings)); }
    markDirty() { this.write({ dirty: true }); }
    makeSnapshot() { return this.store.createLibrarySnapshot(); }
    backupNow() {
      const snapshot = this.makeSnapshot();
      const stamp = snapshot.createdAt.replace(/[:.]/g, '-');
      const filename = `ui-builder-library-backup-${stamp}.json`;
      downloadText(filename, JSON.stringify(snapshot, null, 2));
      this.write({ dirty: false, lastBackupAt: snapshot.createdAt, lastBackupName: filename });
      return { snapshot, filename };
    }
    restoreFromSnapshot(snapshot) {
      const result = this.store.restoreLibrarySnapshot(snapshot);
      this.write({ dirty: false, lastBackupAt: snapshot.createdAt || '', lastBackupName: '' });
      return result;
    }
  };
  const libraryStore = new window.UiLibraryStore.LocalLibraryStore();
  const localBackup = new LocalBackupClient(libraryStore);
  let currentProjectId = null;
  let currentComponentId = null;
  let libraryView = 'projects';
  let openedLibraryProjectId = null;
  let entityAction = null;
  const collapsedLayers = new Set();
  let viewportWidth = Number(localStorage.getItem(VIEWPORT_KEY)) === 430 ? 430 : 390;
  let canvasZoom = Math.max(20, Math.min(200, Number(localStorage.getItem(ZOOM_KEY)) || 100));

  function isStampedBuild(value) {
    return Boolean(value && value !== '__BUILD_ID__' && !value.includes('__BUILD_ID__'));
  }

  function showUpdateBanner(build) {
    latestAvailableBuild = build;
    $('#updateBanner')?.classList.remove('hidden');
  }

  async function checkForAppUpdate(force = false) {
    if (!isStampedBuild(CURRENT_BUILD)) return;

    const now = Date.now();
    if (!force && now - lastUpdateCheck < 30000) return;
    lastUpdateCheck = now;

    try {
      const response = await fetch(`./version.json?check=${now}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return;

      const data = await response.json();
      const remoteBuild = String(data?.build || '');
      if (isStampedBuild(remoteBuild) && remoteBuild !== CURRENT_BUILD) {
        showUpdateBanner(remoteBuild);
      }
    } catch (error) {
      console.debug('Não foi possível verificar atualização agora.', error);
    }
  }

  async function applyAvailableUpdate() {
    const button = $('#applyUpdateBtn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Atualizando…';
    }

    try { persist(false); } catch (error) {}

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration =>
          registration.update().catch(() => undefined)
        ));
      }
    } catch (error) {
      console.debug('Falha ao atualizar Service Worker.', error);
    }

    const url = new URL(window.location.href);
    const buildToken = latestAvailableBuild || String(Date.now());
    url.searchParams.set('update', buildToken.slice(0, 12));
    window.location.replace(url.toString());
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none'
      });
      registration.update().catch(() => undefined);
    } catch (error) {
      console.debug('Service Worker indisponível.', error);
    }
  }

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

  function loadProject(savedDocument = null) {
    const raw = savedDocument ? JSON.stringify(savedDocument) : localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        editor.loadProjectData(parsed.project || parsed);
        importedHeadExtras = typeof parsed.importedHeadExtras === 'string' ? parsed.importedHeadExtras : '';
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
    const document = {
      project: editor.getProjectData(),
      activePageId: editor.Pages.getSelected()?.get('id') || null,
      importedHeadExtras
    };
    if (currentProjectId && currentComponentId) {
      const existing = libraryStore.getComponent(currentProjectId, currentComponentId) || {};
      libraryStore.saveComponent(currentProjectId, { ...existing, id: currentComponentId, document, ...componentPackageData(existing.name || currentComponentId) });
    } else {
      // Kept for compatibility until the first library migration has completed.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    }
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

  function componentRoot() {
    const page = editor.Pages.getSelected();
    const root = page?.getMainComponent?.();
    return root?.components?.().at?.(0) || null;
  }

  function identityRows() {
    const output = [];
    const walk = cmp => cmp?.components?.().each(child => {
      const attrs = child.getAttributes?.() || {};
      if (attrs['data-element'] || attrs['data-component']) output.push({
        id: attrs['data-element'] || attrs['data-component'], name: attrs['data-name'] || labelFor(child),
        kind: attrs['data-component'] ? 'component' : 'element', dataUi: attrs['data-ui'] || ''
      });
      walk(child);
    });
    const root = editor.Pages.getSelected()?.getMainComponent?.();
    walk(root);
    return output;
  }

  function componentPackageData(name) {
    const root = componentRoot();
    const componentId = root?.getAttributes?.()?.['data-component'] || currentComponentId || '';
    return {
      componentManifest: { formatVersion: 1, id: componentId, name: name || componentId, elements: identityRows() },
      componentHtml: editor.getHtml(),
      componentCss: editor.getCss()
    };
  }

  function loadComponentRecord(projectId, componentId) {
    const component = libraryStore.getComponent(projectId, componentId);
    if (!component) throw new Error('Componente não encontrado.');
    currentProjectId = projectId; currentComponentId = componentId;
    loadProject(component.document || {});
    // Packages from other tools may contain only the documented HTML/CSS files.
    // Rebuild them into an editable GrapesJS document on first open.
    if (!component.document?.pages?.length && (component.componentHtml || component.componentCss)) {
      const page = editor.Pages.getSelected() || editor.Pages.getAll()[0];
      page.getMainComponent().components(component.componentHtml || `<main data-component="${component.id}"></main>`);
      editor.setStyle(component.componentCss || '');
    }
    importedHeadExtras = component.importedHeadExtras || component.document?.importedHeadExtras || '';
    const root = componentRoot();
    if (root && !root.getAttributes?.()?.['data-component']) root.addAttributes({'data-component': component.id});
    $('#app').classList.remove('hidden');
    $('#libraryScreen').classList.add('hidden');
    updatePageTitle(); refreshInspector(); renderLayers();
  }

  function makeBlankComponent(projectId, id, name) {
    const record = libraryStore.saveComponent(projectId, { id, name, document: {}, importedHeadExtras: '', elementMeta: [] });
    currentProjectId = projectId; currentComponentId = record.id;
    loadProject({});
    const page = editor.Pages.getSelected() || editor.Pages.getAll()[0];
    const root = page.getMainComponent();
    root.components(`<main class="page-root" data-component="${record.id}"><section class="ui-container" data-ui="container-v" style="display:flex;flex-direction:column;gap:12px;width:100%;min-height:100px;padding:12px"><div class="ui-text" data-ui="text" data-element="content">Novo componente</div></section></main>`);
    persist(false);
    $('#app').classList.remove('hidden'); $('#libraryScreen').classList.add('hidden');
    updatePageTitle(); refreshInspector(); renderLayers();
  }

  function formatDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value)); } catch (_) { return ''; }
  }
  function escapeHtml(value) { const node = document.createElement('span'); node.textContent = String(value || ''); return node.innerHTML; }
  function downloadText(filename, content, type = 'application/json') {
    const blob = new Blob([content], { type }); const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function componentEnvelope(component) {
    return { format:'ui-builder-component', formatVersion:1, files:{
      'component.json': component.componentManifest || { formatVersion:1, id:component.id, name:component.name, elements:[] },
      'component.html': component.componentHtml || '', 'component.css': component.componentCss || ''
    }, component:{ ...component, document: component.document || {} } };
  }
  function showEntityModal(options, onConfirm) {
    entityAction = onConfirm;
    $('#entityModalTitle').textContent = options.title; $('#entityModalHelp').textContent = options.help || '';
    $('#entityNameInput').value = options.name || ''; $('#entityIdInput').value = options.id || '';
    $('#entityIdWrap').classList.toggle('hidden', Boolean(options.hideId));
    $('#entityModal').classList.remove('hidden'); setTimeout(() => $('#entityNameInput').focus(), 50);
  }
  function closeEntityModal() { $('#entityModal').classList.add('hidden'); entityAction = null; }
  $('#closeEntityModal').addEventListener('click', closeEntityModal);
  $('#confirmEntityBtn').addEventListener('click', () => {
    if (!entityAction) return;
    const action = entityAction;
    const data = { name: $('#entityNameInput').value.trim(), id: $('#entityIdInput').value.trim() };
    try { action(data); closeEntityModal(); }
    catch (error) {
      console.error('Não foi possível salvar na biblioteca.', error);
      $('#entityModalHelp').textContent = error.message || 'Não foi possível salvar.';
    }
  });

  function backupStatusText(status = localBackup.status()) {
    if (status.dirty) return 'Alterações ainda não exportadas';
    return status.lastBackupAt ? `Último backup ${formatDate(status.lastBackupAt)}` : 'Nenhum backup local criado';
  }
  function renderBackupStatus(status) { $('#backupStatus').textContent = backupStatusText(status); }
  function openBackupModal() {
    const status = localBackup.status();
    $('#backupDetail').textContent = status.lastBackupName
      ? `Último arquivo: ${status.lastBackupName}`
      : 'Exporte uma cópia completa da Biblioteca e guarde no app Arquivos ou iCloud Drive.';
    $('#backupModal').classList.remove('hidden');
  }
  $('#openBackupBtn').addEventListener('click', openBackupModal);
  $('#closeBackupModal').addEventListener('click', () => $('#backupModal').classList.add('hidden'));
  $('#backupNowBtn').addEventListener('click', () => {
    try {
      const { filename } = localBackup.backupNow();
      $('#backupDetail').textContent = `Backup criado: ${filename}`;
      flash('Backup local criado. Salve o arquivo em um local seguro.');
    } catch (error) {
      $('#backupDetail').textContent = error.message || 'Não foi possível criar o backup.';
    }
  });
  $('#restoreBackupFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const snapshot = JSON.parse(await file.text());
      libraryStore.validateLibrarySnapshot(snapshot);
      if (!confirm('Restaurar este backup substituirá a Biblioteca local atual. Uma cópia de segurança do estado atual será preservada neste dispositivo. Continuar?')) return;
      localBackup.restoreFromSnapshot(snapshot);
      $('#backupModal').classList.add('hidden');
      renderLibrary();
      flash('Biblioteca restaurada. O estado anterior ficou preservado localmente para recuperação.');
    } catch (error) {
      $('#backupDetail').textContent = error.message || 'Arquivo de backup inválido.';
    }
  });
  localBackup.subscribe(renderBackupStatus);
  renderBackupStatus();

  function libraryRow({ title, id, meta, onOpen, onRename, onDuplicate, onExport, onDelete }) {
    const row = document.createElement('article'); row.className = 'library-row';
    const main = document.createElement('button'); main.className = 'library-row-main'; main.innerHTML = `<div class="library-row-title">${escapeHtml(title)}</div>${id ? `<div class="library-row-id">${escapeHtml(id)}</div>` : ''}${meta ? `<div class="library-row-meta">${escapeHtml(meta)}</div>` : ''}`; main.addEventListener('click', onOpen); row.appendChild(main);
    const actions = document.createElement('div'); actions.className = 'library-row-actions';
    [[onRename,'✎','Renomear'],[onDuplicate,'⧉','Duplicar'],[onExport,'⇩','Exportar'],[onDelete,'×','Excluir']].forEach(([handler,label,aria]) => { if (!handler) return; const button=document.createElement('button'); button.type='button';button.textContent=label;button.setAttribute('aria-label',aria);button.addEventListener('click',handler);actions.appendChild(button); });
    row.appendChild(actions); return row;
  }
  function renderLibrary() {
    const content = $('#libraryContent'); content.innerHTML = '';
    const projectMode = libraryView === 'projects';
    $('#libraryTitle').textContent = projectMode ? 'Biblioteca' : (libraryStore.getProject(openedLibraryProjectId)?.name || 'Projeto');
    $('#librarySubtitle').textContent = projectMode ? 'Meus projetos' : 'Componentes';
    $('#libraryBackBtn').classList.toggle('hidden', projectMode);
    $('#libraryPrimaryBtn').textContent = projectMode ? 'Novo projeto' : 'Novo componente';
    $('#importProjectBtn').textContent = projectMode ? 'Importar projeto' : 'Importar componente';
    const items = projectMode ? libraryStore.listProjects() : libraryStore.listComponents(openedLibraryProjectId);
    if (!items.length) { const empty=document.createElement('p');empty.className='library-empty';empty.textContent=projectMode ? 'Crie um projeto para organizar componentes relacionados.' : 'Crie ou importe o primeiro componente deste projeto.';content.appendChild(empty); }
    items.forEach(item => {
      if (projectMode) content.appendChild(libraryRow({ title:item.name, id:item.id, meta:`Atualizado ${formatDate(item.updatedAt)}`,
        onOpen:()=>{libraryView='components';openedLibraryProjectId=item.id;renderLibrary();},
        onRename:()=>showEntityModal({title:'Renomear projeto',name:item.name,hideId:true}, ({name})=>{libraryStore.renameProject(item.id,name);renderLibrary();}),
        onExport:()=>downloadText(`${item.id}.uiproject`, JSON.stringify(libraryStore.exportProject(item.id),null,2)),
        onDelete:()=>{if(confirm(`Excluir o projeto “${item.name}” e seus componentes?`)){libraryStore.deleteProject(item.id);renderLibrary();}}
      }));
      else content.appendChild(libraryRow({ title:item.name, id:item.id, meta:`Atualizado ${formatDate(item.updatedAt)}`,
        onOpen:()=>loadComponentRecord(openedLibraryProjectId,item.id),
        onRename:()=>showEntityModal({title:'Renomear componente',name:item.name,hideId:true}, ({name})=>{libraryStore.saveComponent(openedLibraryProjectId,{...item,name});renderLibrary();}),
        onDuplicate:()=>{let id=`${item.id}-copia`,n=2;while(libraryStore.getComponent(openedLibraryProjectId,id))id=`${item.id}-copia-${n++}`;libraryStore.saveComponent(openedLibraryProjectId,{...item,id,name:`${item.name} (cópia)`});renderLibrary();},
        onExport:()=>downloadText(`${item.id}.uicomp`,JSON.stringify(componentEnvelope(item),null,2)),
        onDelete:()=>{if(confirm(`Excluir o componente “${item.name}”?`)){libraryStore.deleteComponent(openedLibraryProjectId,item.id);renderLibrary();}}
      }));
    });
  }
  function showLibrary() { if (currentProjectId && currentComponentId) persist(false); $('#app').classList.add('hidden'); $('#libraryScreen').classList.remove('hidden'); libraryView='projects'; openedLibraryProjectId=null; renderLibrary(); }
  $('#libraryBtn').addEventListener('click', showLibrary);
  $('#libraryBackBtn').addEventListener('click',()=>{libraryView='projects';openedLibraryProjectId=null;renderLibrary();});
  $('#libraryPrimaryBtn').addEventListener('click',()=>{
    if (libraryView==='projects') showEntityModal({title:'Novo projeto',help:'Agrupe aqui componentes relacionados.',name:'',id:''}, ({name,id})=>{const project=libraryStore.createProject({name,id});libraryView='components';openedLibraryProjectId=project.id;renderLibrary();});
    else showEntityModal({title:'Novo componente',help:'O ID técnico permanece estável; o nome pode mudar depois.',name:'',id:''}, ({name,id})=>makeBlankComponent(openedLibraryProjectId,id,name));
  });
  $('#importProjectBtn').addEventListener('click',()=> (libraryView==='projects' ? $('#importProjectFile') : $('#importComponentFile')).click());
  $('#importProjectFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());const existing=libraryStore.hasProject(payload?.project?.id);if(existing&&!confirm('Já existe um projeto com este ID. Importar como cópia?'))return;libraryStore.importProject(payload,existing?'copy':'replace');renderLibrary();}catch(error){alert(error.message||'Arquivo de projeto inválido.');}finally{event.target.value='';}});
  $('#importComponentFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file||!openedLibraryProjectId)return;try{const payload=JSON.parse(await file.text());if(payload?.format!=='ui-builder-component')throw new Error('Arquivo de componente inválido.');const item=payload.component||{};const manifest=payload.files?.['component.json']||item.componentManifest||{};let id=manifest.id||item.id;if(libraryStore.getComponent(openedLibraryProjectId,id)){if(!confirm('Já existe um componente com este ID. Importar como cópia?'))return;let n=2,base=id;while(libraryStore.getComponent(openedLibraryProjectId,`${base}-${n}`))n++;id=`${base}-${n}`;}libraryStore.saveComponent(openedLibraryProjectId,{...item,id,name:manifest.name||item.name||id,componentManifest:{...manifest,id},componentHtml:payload.files?.['component.html']||item.componentHtml||'',componentCss:payload.files?.['component.css']||item.componentCss||''});renderLibrary();}catch(error){alert(error.message||'Arquivo de componente inválido.');}finally{event.target.value='';}});

  function newInstanceId(componentId) { return `${componentId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }
  function insertComponentInstance(component) {
    const parent = targetContainer();
    const html = component.componentHtml || '<div></div>';
    const added = parent.components().add(html);
    const instance = Array.isArray(added) ? added[0] : added;
    if (!instance) throw new Error('Não foi possível inserir o componente.');
    instance.addAttributes({'data-component': component.id, 'data-instance': newInstanceId(component.id)});
    if (component.componentCss) editor.addStyle(component.componentCss);
    editor.select(instance); switchTab('style'); schedulePersist(); renderLayers();
  }
  function openComponentPicker() {
    const list = $('#componentPickerList'); list.innerHTML = '';
    const entries = currentProjectId ? libraryStore.listComponents(currentProjectId).filter(item => item.id !== currentComponentId) : [];
    if (!entries.length) { list.innerHTML = '<p class="library-empty">Crie outro componente neste projeto para inseri-lo como instância.</p>'; }
    entries.forEach(item => list.appendChild(libraryRow({ title:item.name, id:item.id, meta:'Definição reutilizável', onOpen:()=>{ $('#componentPickerModal').classList.add('hidden'); insertComponentInstance(item); } })));
    $('#componentPickerModal').classList.remove('hidden');
  }
  $('#insertProjectComponent').addEventListener('click', openComponentPicker);
  $('#closeComponentPicker').addEventListener('click',()=>$('#componentPickerModal').classList.add('hidden'));

  loadProject();
  libraryStore.migrateLegacy({ project: editor.getProjectData(), activePageId: editor.Pages.getSelected()?.get('id') || null, importedHeadExtras });
  showLibrary();

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
        position:'fixed', left:'50%', bottom:'calc(var(--current-sheet-h, var(--sheet-h)) + 12px)',
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

  all('.component-card').forEach(btn => btn.addEventListener('click', () => addComponent(btn.dataset.add)));

  function setSheetCollapsed(collapsed) {
    sheetCollapsed = Boolean(collapsed);
    document.body.classList.toggle('sheet-collapsed', sheetCollapsed);
    $('#sheet')?.classList.toggle('is-collapsed', sheetCollapsed);
    requestAnimationFrame(() => {
      syncCanvasSize();
      editor.refresh();
    });
  }

  function closeSheet() {
    setSheetCollapsed(true);
  }

  function openSheet() {
    setSheetCollapsed(false);
  }

  function switchTab(name, toggleIfAlreadyOpen = false) {
    const currentTab = $('.tab.active')?.dataset.tab;

    if (toggleIfAlreadyOpen && currentTab === name && !sheetCollapsed) {
      closeSheet();
      return;
    }

    openSheet();
    all('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    all('.panel').forEach(x => x.classList.toggle('active', x.dataset.panel === name));
    if (name === 'layers') renderLayers();
    if (name === 'pages') renderPages();
  }

  all('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab, true)));
  all('.panel-close').forEach(btn => btn.addEventListener('click', closeSheet));

  $('.workspace')?.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.device-toolbar')) return;
    if (!target.closest('#gjs')) closeSheet();
  });

  function labelFor(cmp) {
    const attrs = cmp.getAttributes ? cmp.getAttributes() : {};
    const type = attrs?.['data-ui'];
    const map = {
      'container-v':'Stack vertical','container-h':'Stack horizontal','overlay':'Sobreposição',
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

  const VERTICAL_DIRECTION_ICON = "<svg class=\"vertical-direction-icon\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" viewBox=\"0 0 12.7031 19.5859\" width=\"24\" height=\"24\" aria-hidden=\"true\">\n <g>\n  <rect height=\"19.5859\" opacity=\"0\" width=\"12.7031\" x=\"0\" y=\"0\"/>\n  <path d=\"M6.14844 0C5.9375 0 5.74219 0.0859375 5.57812 0.257812L0.234375 5.67188C0.0859375 5.82031 0 6.03906 0 6.22656C0 6.67969 0.3125 6.98438 0.75 6.98438C0.96875 6.98438 1.14062 6.90625 1.27344 6.77344L3.74219 4.25781L6.14844 1.51562L8.55469 4.25781L11.0156 6.77344C11.1484 6.90625 11.3281 6.98438 11.5469 6.98438C11.9844 6.98438 12.2969 6.67969 12.2969 6.22656C12.2969 6.03906 12.2031 5.82031 12.0625 5.67188L6.71094 0.257812C6.55469 0.0859375 6.35938 0 6.14844 0ZM6.14844 18.8906C6.51562 18.8906 6.80469 18.5938 6.8125 18.2266L6.90625 14.9688L6.90625 4.60938L6.8125 1.35938C6.80469 0.992188 6.51562 0.6875 6.14844 0.6875C5.78125 0.6875 5.48438 0.992188 5.47656 1.35938L5.39062 4.60938L5.39062 14.9688L5.47656 18.2266C5.48438 18.5938 5.78125 18.8906 6.14844 18.8906ZM6.14844 19.5781C6.35938 19.5781 6.55469 19.5 6.71094 19.3281L12.0625 13.9062C12.2031 13.7656 12.2969 13.5469 12.2969 13.3594C12.2969 12.9062 11.9844 12.6016 11.5469 12.6016C11.3281 12.6016 11.1484 12.6719 11.0156 12.8125L8.55469 15.3281L6.14844 18.0703L3.74219 15.3281L1.27344 12.8125C1.14062 12.6719 0.96875 12.6016 0.75 12.6016C0.3125 12.6016 0 12.9062 0 13.3594C0 13.5469 0.0859375 13.7656 0.234375 13.9062L5.57812 19.3281C5.74219 19.5 5.9375 19.5781 6.14844 19.5781Z\" fill=\"currentColor\" fill-opacity=\"0.85\"/>\n </g>\n</svg>";
  const HORIZONTAL_DIRECTION_ICON = VERTICAL_DIRECTION_ICON.replace('vertical-direction-icon', 'horizontal-direction-icon');

  function iconFor(cmp) {
    const t = cmp.getAttributes?.()?.['data-ui'];
    return ({
      'container-v':VERTICAL_DIRECTION_ICON,
      'container-h':HORIZONTAL_DIRECTION_ICON,
      'overlay':'▣',
      'text':'Aa',
      'button':'▭',
      'image':'▧',
      'spacer':VERTICAL_DIRECTION_ICON,
      'divider':'—'
    })[t] || '□';
  }

  function layerKey(cmp) {
    return cmp?.cid || cmp?.getId?.() || String(cmp);
  }

  function layerKind(cmp) {
    const type = cmp.getAttributes?.()?.['data-ui'];
    return ({
      'container-v':'V Stack',
      'container-h':'H Stack',
      'overlay':'Overlay'
    })[type] || '';
  }

  function shouldShowLayer(cmp) {
    const type = String(cmp.get?.('type') || '').toLowerCase();
    if (type === 'textnode' || type === 'wrapper') return false;

    const attrs = cmp.getAttributes?.() || {};
    if (attrs['data-ui']) return true;

    const classes = cmp.getClasses?.() || [];
    if (classes.includes('page-root')) return false;

    const tag = String(cmp.get?.('tagName') || '').toLowerCase();
    return Boolean(tag && !['html','body'].includes(tag));
  }

  function hasVisibleLayerDescendants(cmp) {
    let found = false;
    cmp.components?.().each(child => {
      if (found) return;
      if (shouldShowLayer(child)) {
        found = true;
        return;
      }
      if (hasVisibleLayerDescendants(child)) found = true;
    });
    return found;
  }

  function renderLayers() {
    const tree = $('#layersTree');
    tree.innerHTML = '';
    const root = editor.Pages.getSelected()?.getMainComponent();
    if (!root) return;

    const renderChildren = (parentCmp, host) => {
      parentCmp.components?.().each(child => {
        const attrs = child.getAttributes?.() || {};
        const type = String(child.get?.('type') || '').toLowerCase();
        if (type === 'textnode') return;

        const show = shouldShowLayer(child);

        if (!show) {
          renderChildren(child, host);
          return;
        }

        const key = layerKey(child);
        const isSelected = selected === child;
        const isStack = ['container-v','container-h','overlay'].includes(attrs['data-ui']);
        const hasChildren = hasVisibleLayerDescendants(child);
        const collapsed = hasChildren && collapsedLayers.has(key);

        const node = document.createElement('div');
        node.className =
          'layer-node' +
          (isSelected ? ' is-selected' : '') +
          (isSelected && isStack ? ' selected-stack' : '') +
          (collapsed ? ' is-collapsed' : '');

        const row = document.createElement('div');
        row.className = 'layer-row' + (isSelected ? ' selected' : '');

        if (hasChildren) {
          const disclosure = document.createElement('button');
          disclosure.type = 'button';
          disclosure.className = 'layer-disclosure';
          disclosure.setAttribute('aria-label', collapsed ? 'Expandir camada' : 'Recolher camada');
          disclosure.setAttribute('aria-expanded', String(!collapsed));
          disclosure.textContent = '›';
          disclosure.addEventListener('click', event => {
            event.stopPropagation();
            if (collapsedLayers.has(key)) collapsedLayers.delete(key);
            else collapsedLayers.add(key);
            renderLayers();
          });
          row.appendChild(disclosure);
        } else {
          const spacer = document.createElement('span');
          spacer.className = 'layer-disclosure-spacer';
          row.appendChild(spacer);
        }

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'layer-select';
        selectButton.innerHTML =
          `<span class="layer-icon">${iconFor(child)}</span>` +
          '<span class="layer-name"></span>' +
          '<span class="layer-kind"></span>';
        selectButton.querySelector('.layer-name').textContent = attrs['data-name'] || labelFor(child);

        const kind = attrs['data-element'] || attrs['data-component'] || layerKind(child) || attrs['data-ui'] || '';
        const kindEl = selectButton.querySelector('.layer-kind');
        kindEl.textContent = kind;
        kindEl.classList.toggle('hidden', !kind);

        selectButton.addEventListener('click', () => {
          editor.select(child);
          renderLayers();
        });

        row.appendChild(selectButton);
        node.appendChild(row);

        if (hasChildren && !collapsed) {
          const children = document.createElement('div');
          children.className = 'layer-children';
          renderChildren(child, children);
          node.appendChild(children);
        }

        host.appendChild(node);
      });
    };

    renderChildren(root, tree);

    if (!tree.children.length) {
      tree.innerHTML = '<div class="empty-state">Esta página está vazia.</div>';
      return;
    }

    requestAnimationFrame(() => {
      tree.querySelector('.layer-row.selected')?.scrollIntoView?.({block:'nearest'});
    });
  }

  function safeStyle(cmp, key, fallback='') {
    const style = cmp.getStyle ? cmp.getStyle() : {};
    const v = style[key];
    if (v !== undefined && v !== '') return String(v);
    const el = cmp.view?.el;
    const computed = el?.ownerDocument.defaultView.getComputedStyle(el);
    if (computed && computed[key]) return computed[key];
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

  function clearSelection() {
    editor.select(null);
    selected = null;
    refreshInspector();
    renderLayers();
  }

  // Use a completed tap, not touchstart: pan and pinch must keep the selection.
  function bindBlankSelection(target, frameWindow = null) {
    if (!target || target.__blankSelectionBound) return;
    target.__blankSelectionBound = true;
    const pointers = new Set();
    let tap = null;
    const isBlank = element => {
      if (!element?.closest) return false;
      if (frameWindow) {
        return element === frameWindow.document.body ||
          element === frameWindow.document.documentElement ||
          element.classList.contains('page-root');
      }
      if (element.closest('.device-toolbar, button, input, select, textarea')) return false;
      return element.matches('.workspace, .device-stage, #gjs, .gjs-cv-canvas, .gjs-cv-canvas__frames');
    };
    target.addEventListener('pointerdown', event => {
      pointers.add(event.pointerId);
      if (pointers.size !== 1 || event.button !== 0) { tap = null; return; }
      tap = isBlank(event.target) ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    }, true);
    target.addEventListener('pointermove', event => {
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 4) tap = null;
    }, true);
    target.addEventListener('pointerup', event => {
      const clear = tap?.id === event.pointerId && isBlank(event.target);
      pointers.delete(event.pointerId);
      tap = null;
      // GrapesJS can select the wrapper in the same event; clear after its handlers.
      if (clear && !previewing) setTimeout(clearSelection, 0);
    }, true);
    target.addEventListener('pointercancel', event => {
      pointers.delete(event.pointerId);
      tap = null;
    }, true);
    target.addEventListener('click', event => {
      if (event.detail === 0 && isBlank(event.target) && !previewing) clearSelection();
    });
  }

  let precisionStep = 1;
  const precisionFields = {
    widthValue: ['width', 0], heightValue: ['height', 0], gapValue: ['gap', 0],
    xValue: ['left', -Infinity], yValue: ['top', -Infinity],
    paddingTopValue: ['padding-top', 0], paddingRightValue: ['padding-right', 0], paddingBottomValue: ['padding-bottom', 0], paddingLeftValue: ['padding-left', 0],
    marginTopValue: ['margin-top', -Infinity], marginRightValue: ['margin-right', -Infinity], marginBottomValue: ['margin-bottom', -Infinity], marginLeftValue: ['margin-left', -Infinity],
    fontSizeValue: ['font-size', 0], lineHeightValue: ['line-height', 0], letterSpacingValue: ['letter-spacing', -Infinity],
    borderWidthValue: ['border-width', 0], radiusValue: ['border-radius', 0]
  };

  function stepPrecisionField(id, direction) {
    if (!selected) return;
    const [property, minimum] = precisionFields[id];
    const el = selected.view?.el;
    const computed = el?.ownerDocument.defaultView.getComputedStyle(el);
    let value = computed?.getPropertyValue(property) || safeStyle(selected, property, '0px');
    const offset = property === 'left' || property === 'top';
    if (offset && (value === 'auto' || computed?.position === 'static')) value = '0px';
    if (!/^-?\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) {
      flash('Digite um valor em px antes de ajustar');
      return;
    }
    const next = Math.max(minimum, Math.round((parseFloat(value) + direction * precisionStep) * 1000) / 1000);
    const patch = { [property]: `${next}px` };
    if (offset && safeStyle(selected, 'position', 'static') === 'static') patch.position = 'relative';
    if (property === 'border-width') patch['border-style'] = 'solid';
    setStylePatch(patch);
    refreshInspector();
  }

  Object.keys(precisionFields).forEach(id => {
    const input = $('#' + id);
    const oldField = input.parentElement;
    // Buttons inside a label can focus its input and open the iPhone keyboard.
    const field = document.createElement('div');
    [...oldField.attributes].forEach(attribute => field.setAttribute(attribute.name, attribute.value));
    while (oldField.firstChild) field.appendChild(oldField.firstChild);
    oldField.replaceWith(field);
    const title = field.querySelector('span').textContent;
    input.setAttribute('aria-label', title + ' em pixels');
    const controls = document.createElement('div');
    controls.className = 'precision-control';
    input.before(controls);
    [-1, 1].forEach(direction => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = direction < 0 ? '−' : '+';
      button.setAttribute('aria-label', (direction < 0 ? 'Diminuir ' : 'Aumentar ') + title);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => stepPrecisionField(id, direction));
      if (direction < 0) controls.appendChild(button);
      else { controls.appendChild(input); controls.appendChild(button); }
    });
  });
  $('#precisionStep').addEventListener('click', event => {
    const button = event.target.closest('button[data-step]');
    if (!button) return;
    precisionStep = Number(button.dataset.step);
    all('#precisionStep button').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  });

  function refreshInspector() {
    const empty = $('#inspectorEmpty');
    const inspector = $('#inspector');
    if (!selected) {
      empty.classList.remove('hidden'); inspector.classList.add('hidden');
      $('#selectedLabel').textContent = 'Nada selecionado';
      return;
    }
    empty.classList.add('hidden'); inspector.classList.remove('hidden');
    $('#selectedLabel').textContent = selected.getAttributes?.()?.['data-name'] || labelFor(selected);
    const attrs = selected.getAttributes?.() || {};
    const componentId = attrs['data-component'] || currentComponentId || '';
    const elementId = attrs['data-element'] || '';
    $('#friendlyNameValue').value = attrs['data-name'] || '';
    $('#elementIdValue').value = elementId;
    $('#identityInfo').textContent = `${attrs['data-component'] ? 'Componente' : elementId ? 'Elemento' : 'Elemento semântico pendente'} · data-ui: ${attrs['data-ui'] || '—'} · ${componentId ? `${componentId}${elementId ? ` > ${elementId}` : ''}` : 'sem componente'}`;
    const ui = attrs['data-ui'];
    const tag = String(selected.get?.('tagName') || '').toLowerCase();
    const isText = ui === 'text' || ui === 'button' || ['p','span','a','button','label','li','h1','h2','h3','h4','h5','h6'].includes(tag);
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
    const freePosition = ['absolute','fixed'].includes(safeStyle(selected,'position','static'));
    $('#xValue').closest('.field').classList.toggle('hidden', !freePosition); $('#yValue').closest('.field').classList.toggle('hidden', !freePosition);
    $('#gapValue').value = numeric(safeStyle(selected,'gap','0'),0);
    ['Top','Right','Bottom','Left'].forEach(side => { const s=side.toLowerCase(); $('#padding'+side+'Value').value=numeric(safeStyle(selected,'padding-'+s,'0'),0); $('#margin'+side+'Value').value=numeric(safeStyle(selected,'margin-'+s,'0'),0); });
    const display = safeStyle(selected,'display','block');
    const position = safeStyle(selected,'position','static');
    let dir = safeStyle(selected,'flex-direction','column');
    if (display === 'grid' && (ui === 'overlay' || position === 'relative')) dir='overlay';
    $('#directionValue').value = ['column','row','overlay'].includes(dir) ? dir : 'column';
    $('#alignValue').value = safeStyle(selected,'align-items','stretch') || 'stretch';
    $('#justifyValue').value = safeStyle(selected,'justify-content','flex-start') || 'flex-start';

    $('#typographyTitle').classList.toggle('hidden', !isText); $('#typographyControls').classList.toggle('hidden', !isText);
    if(isText){ $('#fontSizeValue').value=numeric(safeStyle(selected,'font-size','16'),16); $('#lineHeightValue').value=numeric(safeStyle(selected,'line-height','20'),20); $('#letterSpacingValue').value=numeric(safeStyle(selected,'letter-spacing','0'),0); const w=String(Math.round(numeric(safeStyle(selected,'font-weight','400'),400)/100)*100); $('#fontWeightValue').value=['400','500','600','700','800'].includes(w)?w:'400'; $('#textAlignValue').value=safeStyle(selected,'text-align','left')||'left'; }
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
  $('#friendlyNameValue').addEventListener('change', event => {
    if (!selected) return;
    const value = event.target.value.trim();
    if (value) selected.addAttributes({'data-name': value}); else selected.removeAttributes('data-name');
    schedulePersist(); refreshInspector(); renderLayers();
  });
  $('#elementIdValue').addEventListener('change', event => {
    if (!selected) return;
    const value = window.UiLibraryStore.cleanId(event.target.value);
    if (value) selected.addAttributes({'data-element': value}); else selected.removeAttributes('data-element');
    schedulePersist(); refreshInspector(); renderLayers();
  });
  function copyText(text, success) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => flash(success)).catch(() => { flash('Não foi possível copiar'); });
  }
  $('#copyIdBtn').addEventListener('click', () => copyText(selected?.getAttributes?.()?.['data-element'] || selected?.getAttributes?.()?.['data-component'] || '', 'ID copiado'));
  $('#copyReferenceBtn').addEventListener('click', () => {
    const attrs = selected?.getAttributes?.() || {}; copyText(`${attrs['data-component'] || currentComponentId || ''}${attrs['data-element'] ? ` > ${attrs['data-element']}` : ''}`, 'Referência copiada');
  });
  $('#createComponentBtn').addEventListener('click', () => {
    if (!selected || !currentProjectId) { flash('Abra um projeto primeiro'); return; }
    const source = selected;
    showEntityModal({ title:'Criar componente', help:'Será criada uma definição independente a partir da seleção.', name: source.getAttributes?.()?.['data-name'] || labelFor(source), id:'' }, ({name,id}) => {
      if (libraryStore.getComponent(currentProjectId, window.UiLibraryStore.cleanId(id || name))) throw new Error('Já existe um componente com esse ID.');
      const componentId = window.UiLibraryStore.cleanId(id || name);
      // data-ui continues to describe the generic element type; this is its semantic component identity.
      source.addAttributes({'data-component': componentId});
      const sourceHtml = source.toHTML?.() || '';
      const document = { project: editor.getProjectData(), activePageId: editor.Pages.getSelected()?.get('id') || null, importedHeadExtras };
      const saved = libraryStore.saveComponent(currentProjectId, { id:componentId, name, document, importedHeadExtras });
      saved.componentHtml = sourceHtml; saved.componentCss = editor.getCss(); saved.componentManifest = {formatVersion:1,id:componentId,name,elements:identityRows()};
      libraryStore.saveComponent(currentProjectId, saved); schedulePersist(); renderLayers(); flash('Componente criado');
    });
  });
  ['xValue', 'yValue'].forEach(id => $('#' + id).addEventListener('input', event => {
    if (!selected || !event.target.value.trim() || !Number.isFinite(Number(event.target.value))) return;
    const patch = { [precisionFields[id][0]]: `${Number(event.target.value)}px` };
    if (!['absolute','fixed'].includes(safeStyle(selected, 'position', 'static'))) return;
    setStylePatch(patch);
  }));
  $('#widthValue').addEventListener('input', e => setStylePatch({width:`${Number(e.target.value)||0}px`}));
  $('#heightValue').addEventListener('change', e => { const v=e.target.value.trim(); setStylePatch({height: (!v || v==='auto')?'auto':/^\d+(\.\d+)?$/.test(v)?`${v}px`:v}); });
  $('#gapValue').addEventListener('input', e => setStylePatch({gap:`${Number(e.target.value)||0}px`}));
  function applySpacing(kind,side,raw){ if(!selected||raw===''||!Number.isFinite(Number(raw)))return; const patch={}; (spacingLinked[kind]?['top','right','bottom','left']:[side]).forEach(s=>patch[kind+'-'+s]=Number(raw)+'px'); setStylePatch(patch); if(spacingLinked[kind])refreshInspector(); }
  [['padding','Top'],['padding','Right'],['padding','Bottom'],['padding','Left'],['margin','Top'],['margin','Right'],['margin','Bottom'],['margin','Left']].forEach(([kind,side])=>$('#'+kind+side+'Value').addEventListener('input',e=>applySpacing(kind,side.toLowerCase(),e.target.value)));
  all('.spacing-link').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.spacing;spacingLinked[kind]=!spacingLinked[kind];button.classList.toggle('active',spacingLinked[kind]);button.textContent=spacingLinked[kind]?'Vinculado':'Independente';}));
  $('#fontSizeValue').addEventListener('input',e=>setStylePatch({'font-size':(Number(e.target.value)||0)+'px'})); $('#lineHeightValue').addEventListener('input',e=>setStylePatch({'line-height':(Number(e.target.value)||0)+'px'})); $('#letterSpacingValue').addEventListener('input',e=>setStylePatch({'letter-spacing':(Number(e.target.value)||0)+'px'})); $('#fontWeightValue').addEventListener('change',e=>setStylePatch({'font-weight':e.target.value})); $('#textAlignValue').addEventListener('change',e=>setStylePatch({'text-align':e.target.value}));
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

  const APPEARANCE_PROPERTIES=['width','height','gap','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','font-size','font-weight','line-height','letter-spacing','text-align','color','background-color','border-width','border-style','border-color','border-radius','opacity','overflow','align-items','justify-content'];
  $('#copyAppearanceBtn').addEventListener('click',()=>{if(!selected)return;const style=selected.getStyle?.()||{};appearanceClipboard={};APPEARANCE_PROPERTIES.forEach(k=>{if(style[k]!==undefined&&style[k]!=='')appearanceClipboard[k]=style[k];});$('#pasteAppearanceBtn').disabled=false;flash('Aparência copiada');});
  $('#pasteAppearanceBtn').addEventListener('click',()=>{if(!selected||!appearanceClipboard)return;selected.addStyle({...appearanceClipboard});schedulePersist();refreshInspector();flash('Aparência colada');});
  function setInteractionMode(mode){interactionMode=mode==='navigate'?'navigate':'edit';all('#interactionMode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===interactionMode));$('#gjs').classList.toggle('navigate-mode',interactionMode==='navigate');if(interactionMode==='navigate')clearSelection();}
  $('#interactionMode').addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(b)setInteractionMode(b.dataset.mode);});

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

  editor.on('component:selected', cmp => { if(interactionMode==='navigate'){editor.select(null);return;} selected=cmp; refreshInspector(); renderLayers(); });
  editor.on('component:deselected', () => { selected=null; refreshInspector(); renderLayers(); });
  editor.on('update', schedulePersist);

  $('#undoBtn').addEventListener('click',()=>{ editor.UndoManager.undo(); refreshInspector(); renderLayers(); });
  $('#redoBtn').addEventListener('click',()=>{ editor.UndoManager.redo(); refreshInspector(); renderLayers(); });
  $('#refreshLayers').addEventListener('click',renderLayers);

  function clampZoom(value) {
    return Math.max(20, Math.min(200, Number(value) || 100));
  }

  function updateZoomUi() {
    const value = $('#zoomValue');
    if (value) value.textContent = `${Math.round(canvasZoom)}%`;
  }

  function setCanvasZoom(value, save = true) {
    canvasZoom = clampZoom(value);
    editor.Canvas.setZoom(canvasZoom);
    updateZoomUi();
    requestAnimationFrame(syncCanvasSize);
    if (save) localStorage.setItem(ZOOM_KEY, String(canvasZoom));
  }

  function outerTouchPoint(touch, sourceWindow) {
    if (!sourceWindow || sourceWindow === window) {
      return { x: touch.clientX, y: touch.clientY };
    }

    const frame = editor.Canvas.getFrameEl?.();
    const rect = frame?.getBoundingClientRect?.();
    if (!rect) return { x: touch.clientX, y: touch.clientY };

    const width = Math.max(1, sourceWindow.innerWidth || rect.width);
    const height = Math.max(1, sourceWindow.innerHeight || rect.height);
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;

    return {
      x: rect.left + touch.clientX * scaleX,
      y: rect.top + touch.clientY * scaleY
    };
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function canvasLocalPoint(point) {
    const host = $('#gjs');
    const rect = host?.getBoundingClientRect?.();
    if (!rect) return { x: point.x, y: point.y };
    return {
      x: point.x - rect.left - rect.width / 2,
      y: point.y - rect.top - rect.height / 2
    };
  }

  function bindGestureTarget(target, sourceWindow) {
    if (!target || target.__uiBuilderGestureBound) return;
    target.__uiBuilderGestureBound = true;

    let mode = null;
    let moved = false;
    let startPoint = null;
    let lastPoint = null;
    let lastCenter = null;
    let lastDistance = 0;

    const begin = event => {
      if (!event.touches?.length) return;

      if (sourceWindow === window) {
        const target = event.target;
        if (target instanceof Element && target.closest('.device-toolbar, button, input, select, textarea')) {
          return;
        }
      }

      moved = false;

      if (event.touches.length >= 2) {
        const a = outerTouchPoint(event.touches[0], sourceWindow);
        const b = outerTouchPoint(event.touches[1], sourceWindow);
        mode = 'pinch';
        lastCenter = midpoint(a, b);
        lastDistance = pointDistance(a, b);
        event.preventDefault();
        return;
      }

      const point = outerTouchPoint(event.touches[0], sourceWindow);
      if(interactionMode!=='navigate'){mode=null;startPoint=null;lastPoint=null;return;}
      mode = 'pan'; startPoint = point; lastPoint = point;
    };

    const move = event => {
      if (!event.touches?.length) return;

      if (event.touches.length >= 2) {
        const a = outerTouchPoint(event.touches[0], sourceWindow);
        const b = outerTouchPoint(event.touches[1], sourceWindow);
        const center = midpoint(a, b);
        const distance = pointDistance(a, b);

        if (mode !== 'pinch' || !lastCenter || !lastDistance) {
          mode = 'pinch';
          lastCenter = center;
          lastDistance = distance;
          event.preventDefault();
          return;
        }

        event.preventDefault();
        moved = true;

        const oldZoom = editor.Canvas.getZoom() || canvasZoom || 100;
        const newZoom = clampZoom(oldZoom * (distance / Math.max(1, lastDistance)));
        const zoomDelta = newZoom / oldZoom;
        const coords = editor.Canvas.getCoords();
        const oldAnchor = canvasLocalPoint(lastCenter);
        const newAnchor = canvasLocalPoint(center);

        editor.Canvas.setZoom(newZoom);
        canvasZoom = newZoom;
        updateZoomUi();

        editor.Canvas.setCoords(
          newAnchor.x - (oldAnchor.x - coords.x) * zoomDelta,
          newAnchor.y - (oldAnchor.y - coords.y) * zoomDelta
        );

        lastCenter = center;
        lastDistance = distance;
        return;
      }

      if (mode !== 'pan' || !lastPoint) return;

      const point = outerTouchPoint(event.touches[0], sourceWindow);
      if (!moved && startPoint && pointDistance(point, startPoint) < 4) {
        lastPoint = point;
        return;
      }

      event.preventDefault();
      moved = true;

      const dx = point.x - lastPoint.x;
      const dy = point.y - lastPoint.y;
      const coords = editor.Canvas.getCoords();
      editor.Canvas.setCoords(coords.x + dx, coords.y + dy);
      lastPoint = point;
    };

    const end = event => {
      if (event.touches?.length >= 2) return;

      if (event.touches?.length === 1) {
        const point = outerTouchPoint(event.touches[0], sourceWindow);
        mode = 'pan';
        startPoint = point;
        lastPoint = point;
        lastCenter = null;
        lastDistance = 0;
        return;
      }

      if (moved) event.preventDefault();
      mode = null;
      startPoint = null;
      lastPoint = null;
      lastCenter = null;
      lastDistance = 0;
      localStorage.setItem(ZOOM_KEY, String(canvasZoom));
    };

    target.addEventListener('touchstart', begin, { passive: false });
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end, { passive: false });
    target.addEventListener('touchcancel', end, { passive: false });

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      target.addEventListener(name, event => event.preventDefault(), { passive: false });
    });
  }

  function bindCanvasGestures(frameWindow) {
    const workspace = $('.workspace');
    bindGestureTarget(workspace, window);
    bindBlankSelection(workspace);

    if (!frameWindow || frameWindow.__uiBuilderGestureBound) return;
    frameWindow.__uiBuilderGestureBound = true;

    const doc = frameWindow.document;
    bindBlankSelection(doc, frameWindow);
    if (doc.documentElement) {
      doc.documentElement.style.touchAction = 'none';
      doc.documentElement.style.overscrollBehavior = 'none';
    }
    if (doc.body) {
      doc.body.style.touchAction = 'none';
      doc.body.style.overscrollBehavior = 'none';
    }

    bindGestureTarget(doc, frameWindow);

    if (!doc.__uiBuilderBlankCloseBound) {
      doc.__uiBuilderBlankCloseBound = true;
      doc.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof frameWindow.Element)) return;
        if (target.closest('[data-ui]')) return;
        closeSheet();
      });
    }
  }

  function lockInterfaceZoom() {
    const blockGesture = event => event.preventDefault();

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      document.addEventListener(name, blockGesture, { passive: false });
    });

    const blockMultiTouch = event => {
      if (event.touches && event.touches.length > 1) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchstart', blockMultiTouch, { passive: false });
    document.addEventListener('touchmove', blockMultiTouch, { passive: false });

    document.documentElement.style.touchAction = 'pan-x pan-y';
    document.body.style.touchAction = 'pan-x pan-y';
  }

  $('#zoomOutBtn')?.addEventListener('click', () => setCanvasZoom(canvasZoom - 10));
  $('#zoomInBtn')?.addEventListener('click', () => setCanvasZoom(canvasZoom + 10));
  $('#zoomValue')?.addEventListener('click', () => setCanvasZoom(100));

  editor.on('canvas:zoom', () => {
    const current = editor.Canvas.getZoom();
    if (Number.isFinite(current)) {
      canvasZoom = clampZoom(current);
      updateZoomUi();
      requestAnimationFrame(syncCanvasSize);
    }
  });

  editor.on('canvas:frame:load', ({ window }) => {
    bindCanvasGestures(window);
    syncImportedHeadToCanvas();
    setCanvasZoom(canvasZoom, false);
  });

  lockInterfaceZoom();

  function syncCanvasSize() {
    const canvasHost = $('#gjs');
    const workspace = $('.workspace');
    if (!canvasHost || !workspace) return;

    const available = Math.max(320, workspace.clientHeight || window.innerHeight);
    canvasHost.style.height = `${available}px`;

    const frame = editor.Canvas.getFrame?.();
    if (frame) {
      const zoomFactor = Math.max(0.2, (editor.Canvas.getZoom?.() || canvasZoom || 100) / 100);
      const frameHeight = Math.ceil(available / zoomFactor);
      frame.set({ height: `${frameHeight}px` });
    }

    requestAnimationFrame(() => {
      editor.refresh();
      requestAnimationFrame(() => editor.refresh());
    });
  }

  function setViewport(width, save = true) {
    viewportWidth = Number(width) === 430 ? 430 : 390;

    const workspace = $('.workspace');
    const frame = editor.Canvas.getFrame?.();
    if (frame) {
      const canvasWidth = workspace?.clientWidth || window.innerWidth;
      frame.set({
        width: `${viewportWidth}px`,
        x: Math.max(0, Math.round((canvasWidth - viewportWidth) / 2))
      });
    }

    const label = $('#deviceLabel');
    if (label) label.textContent = `${viewportWidth} px`;
    all('.device-switch button').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.viewport) === viewportWidth);
    });
    if (save) localStorage.setItem(VIEWPORT_KEY, String(viewportWidth));
    requestAnimationFrame(() => editor.refresh());
  }

  all('.device-switch button').forEach(btn => {
    btn.addEventListener('click', () => setViewport(Number(btn.dataset.viewport)));
  });

  $('#previewBtn').addEventListener('click',()=>{
    previewing=!previewing;
    document.body.classList.toggle('previewing',previewing);
    $('#previewBtn').classList.toggle('active', previewing);
    $('#previewBtn').setAttribute('aria-pressed', String(previewing));
    $('#previewBtn').setAttribute('aria-label', previewing ? 'Sair da pré-visualização' : 'Pré-visualizar');
    try { previewing ? editor.runCommand('preview') : editor.stopCommand('preview'); } catch(e){}
    syncCanvasSize();
  });

  window.addEventListener('resize', syncCanvasSize);

  $('.workspace')?.addEventListener('transitionend', event => {
    if (event.propertyName === 'bottom') syncCanvasSize();
  });

  $('#applyUpdateBtn')?.addEventListener('click', applyAvailableUpdate);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForAppUpdate();
  });
  window.addEventListener('focus', () => checkForAppUpdate());

  registerServiceWorker();
  checkForAppUpdate(true);

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

  function setImportMode(mode) {
    importMode = mode === 'css' ? 'css' : 'html';
    all('.import-tabs button').forEach(button => {
      button.classList.toggle('active', button.dataset.importTab === importMode);
    });

    const code = $('#importCode');
    const help = $('#importHelp');
    if (code) {
      code.placeholder = importMode === 'html'
        ? 'Cole seu código HTML aqui…'
        : 'Cole seu código CSS aqui…';
    }
    if (help) {
      help.textContent = importMode === 'html'
        ? 'Cole um HTML completo ou um trecho. O conteúdo da página atual será substituído.'
        : 'Cole CSS para substituir os estilos atuais da página.';
    }
  }

  function parseHtmlImport(source) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const styleNodes = [...doc.querySelectorAll('style')];
    const styles = styleNodes
      .map(style => style.textContent || '')
      .filter(Boolean)
      .join('\n\n');

    styleNodes.forEach(node => node.remove());

    return {
      body: doc.body?.innerHTML || source,
      css: styles,
      headExtras: doc.head?.innerHTML?.trim() || ''
    };
  }

  function syncImportedHeadToCanvas() {
    const canvasDoc = editor.Canvas.getDocument?.();
    if (!canvasDoc?.head) return;

    canvasDoc.head.querySelectorAll('[data-imported-head]').forEach(node => node.remove());
    if (!importedHeadExtras) return;

    const parsed = new DOMParser().parseFromString(
      `<!doctype html><html><head>${importedHeadExtras}</head><body></body></html>`,
      'text/html'
    );

    parsed.head.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const clone = canvasDoc.createElement('link');
      [...link.attributes].forEach(attr => clone.setAttribute(attr.name, attr.value));
      clone.setAttribute('data-imported-head', 'true');
      canvasDoc.head.appendChild(clone);
    });
  }

  function applyHtmlImport(source) {
    const parsed = parseHtmlImport(source);
    const page = editor.Pages.getSelected();
    const root = page?.getMainComponent?.();
    if (!root) throw new Error('Página atual indisponível.');

    root.components(parsed.body);
    editor.setStyle(parsed.css || '');
    importedHeadExtras = parsed.headExtras;
    selected = null;
    migrateUiAttributes();
    syncImportedHeadToCanvas();
    refreshInspector();
    renderLayers();
    renderPages();
    persist(false);
    requestAnimationFrame(() => {
      editor.refresh();
      syncCanvasSize();
    });
  }

  function applyCssImport(source) {
    editor.setStyle(source);
    selected = null;
    refreshInspector();
    renderLayers();
    persist(false);
    requestAnimationFrame(() => editor.refresh());
  }

  function closeImportModal() {
    $('#importModal')?.classList.add('hidden');
  }

  function openImportModal() {
    setImportMode('html');
    $('#importCode').value = '';
    $('#importFile').value = '';
    $('#importModal')?.classList.remove('hidden');
    setTimeout(() => $('#importCode')?.focus(), 50);
  }

  function exportCss(){ return editor.getCss(); }

  function exportHtmlDocument() {
    const raw = editor.getHtml();
    const match = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = match ? match[1] : raw;
    const css = exportCss();
    const extraHead = importedHeadExtras ? `\n  ${importedHeadExtras}\n` : '\n';
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${extraHead}  <style>
${css}
  </style>
</head>
<body>
${body}
</body>
</html>`;
  }

  $('#importBtn')?.addEventListener('click', openImportModal);
  $('#closeImport')?.addEventListener('click', closeImportModal);

  all('.import-tabs button').forEach(button => {
    button.addEventListener('click', () => setImportMode(button.dataset.importTab));
  });

  $('#importFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.css') || file.type === 'text/css') setImportMode('css');
    else setImportMode('html');

    $('#importCode').value = await file.text();
  });

  $('#applyImport')?.addEventListener('click', () => {
    const source = $('#importCode')?.value || '';
    if (!source.trim()) {
      flash('Cole ou escolha um arquivo primeiro');
      return;
    }

    try {
      if (importMode === 'css') applyCssImport(source);
      else applyHtmlImport(source);
      closeImportModal();
      flash(importMode === 'css' ? 'CSS importado' : 'HTML importado');
    } catch (error) {
      console.error(error);
      flash('Não foi possível importar esse código');
    }
  });

  function currentExport(){ return exportMode==='html'?exportHtmlDocument():exportCss(); }
  function refreshExport(){ $('#exportCode').value=currentExport(); }
  $('#exportBtn').addEventListener('click',()=>{ $('#exportModal').classList.remove('hidden'); refreshExport(); });
  $('#closeExport').addEventListener('click',()=>$('#exportModal').classList.add('hidden'));
  all('.export-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
    exportMode=btn.dataset.exportTab; all('.export-tabs button').forEach(b=>b.classList.toggle('active',b===btn)); refreshExport();
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
    bindCanvasGestures(editor.Canvas.getWindow?.());
  });

  requestAnimationFrame(() => {
    updatePageTitle();
    syncCanvasSize();
    updateZoomUi();
    setCanvasZoom(canvasZoom, false);
    bindCanvasGestures(editor.Canvas.getWindow?.());
  });

  flash('Editor pronto');

})();
