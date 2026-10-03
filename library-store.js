/* Local-only persistence boundary for Library → Project → Component.
   A future sync provider can implement the same methods without changing UI code. */
(() => {
  const LIBRARY_KEY = 'ui-builder-library-v1';
  const PROJECT_KEY = id => `ui-builder-project-v1:${id}`;
  const LEGACY_KEY = 'mobile-ui-builder-project-v1';
  const RECOVERY_KEY = 'ui-builder-library-recovery-v1';
  const now = () => new Date().toISOString();
  const cleanId = value => String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  const clone = value => JSON.parse(JSON.stringify(value));

  class LocalLibraryStore {
    constructor() { this.listeners = new Set(); }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    changed(reason) { this.listeners.forEach(listener => { try { listener(reason); } catch (_) {} }); }
    readLibrary() {
      try {
        const value = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '');
        if (value?.version === 1 && Array.isArray(value.projects)) return value;
      } catch (_) {}
      return { version: 1, projects: [] };
    }

    writeLibrary(library) { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); }
    listProjects() { return this.readLibrary().projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
    getProject(id) {
      try { return JSON.parse(localStorage.getItem(PROJECT_KEY(id)) || ''); } catch (_) { return null; }
    }
    saveProject(project) {
      const library = this.readLibrary();
      const stamp = now();
      project = { ...project, version: 1, updatedAt: stamp, components: Array.isArray(project.components) ? project.components : [] };
      localStorage.setItem(PROJECT_KEY(project.id), JSON.stringify(project));
      const summary = { id: project.id, name: project.name, createdAt: project.createdAt || stamp, updatedAt: stamp };
      const index = library.projects.findIndex(item => item.id === project.id);
      if (index === -1) library.projects.push(summary); else library.projects[index] = summary;
      this.writeLibrary(library);
      this.changed('project-saved');
      return clone(project);
    }
    createProject({ id, name }) {
      id = cleanId(id || name);
      if (!id) throw new Error('Informe um ID para o projeto.');
      if (this.getProject(id)) throw new Error('Já existe um projeto com esse ID.');
      const stamp = now();
      return this.saveProject({ id, name: String(name || id).trim(), createdAt: stamp, components: [] });
    }
    renameProject(id, name) {
      const project = this.getProject(id); if (!project) throw new Error('Projeto não encontrado.');
      project.name = String(name || '').trim() || project.name;
      return this.saveProject(project);
    }
    deleteProject(id) {
      const library = this.readLibrary();
      localStorage.removeItem(PROJECT_KEY(id));
      library.projects = library.projects.filter(item => item.id !== id);
      this.writeLibrary(library);
      this.changed('project-deleted');
    }
    listComponents(projectId) { return this.getProject(projectId)?.components || []; }
    getComponent(projectId, componentId) {
      return this.getProject(projectId)?.components.find(item => item.id === componentId) || null;
    }
    saveComponent(projectId, component) {
      const project = this.getProject(projectId); if (!project) throw new Error('Projeto não encontrado.');
      const stamp = now();
      component = { formatVersion: 1, ...component, id: cleanId(component.id), projectId, updatedAt: stamp };
      if (!component.id) throw new Error('Informe um ID para o componente.');
      const index = project.components.findIndex(item => item.id === component.id);
      if (index === -1) component.createdAt ||= stamp;
      else component.createdAt ||= project.components[index].createdAt;
      if (index === -1) project.components.push(component); else project.components[index] = component;
      this.saveProject(project);
      return clone(component);
    }
    deleteComponent(projectId, componentId) {
      const project = this.getProject(projectId); if (!project) return;
      project.components = project.components.filter(item => item.id !== componentId);
      this.saveProject(project);
    }
    hasProject(id) { return Boolean(this.getProject(id)); }
    migrateLegacy(defaultDocument) {
      const library = this.readLibrary();
      if (library.projects.length) return false;
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || ''); } catch (_) {}
      const project = this.createProject({ id: 'projeto-atual', name: 'Projeto atual' });
      this.saveComponent(project.id, {
        id: 'editor-atual', name: 'Editor atual',
        document: legacy || defaultDocument,
        importedHeadExtras: legacy?.importedHeadExtras || '',
        elementMeta: []
      });
      return true;
    }
    exportProject(projectId) {
      const project = this.getProject(projectId); if (!project) throw new Error('Projeto não encontrado.');
      return { format: 'ui-builder-project', formatVersion: 1, project: clone(project) };
    }
    importProject(payload, strategy = 'copy') {
      if (payload?.format !== 'ui-builder-project' || payload.formatVersion !== 1 || !payload.project) throw new Error('Arquivo de projeto inválido.');
      const incoming = clone(payload.project);
      const exists = this.hasProject(incoming.id);
      if (exists && strategy === 'cancel') return null;
      if (exists) {
        const base = incoming.id;
        let n = 2; while (this.hasProject(`${base}-${n}`)) n++;
        incoming.id = `${base}-${n}`; incoming.name = `${incoming.name} (cópia)`;
        incoming.components.forEach(component => { component.projectId = incoming.id; });
      }
      const stamp = now(); incoming.createdAt ||= stamp;
      return this.saveProject(incoming);
    }
    createLibrarySnapshot() {
      const library = this.readLibrary();
      const projects = library.projects.map(summary => this.getProject(summary.id)).filter(Boolean).map(clone);
      const componentCount = projects.reduce((count, project) => count + (project.components?.length || 0), 0);
      return {
        format: 'ui-builder-library-backup', formatVersion: 1, createdAt: now(),
        library: { version: 1, projects },
        metadata: { projectCount: projects.length, componentCount }
      };
    }
    validateLibrarySnapshot(snapshot) {
      if (snapshot?.format !== 'ui-builder-library-backup' || snapshot.formatVersion !== 1) throw new Error('Backup da Biblioteca inválido.');
      if (!Array.isArray(snapshot.library?.projects)) throw new Error('Projetos ausentes no backup.');
      const ids = new Set();
      snapshot.library.projects.forEach(project => {
        if (!project?.id || !Array.isArray(project.components) || ids.has(project.id)) throw new Error('Estrutura de projetos inválida.');
        ids.add(project.id);
      });
      return true;
    }
    getRecoverySnapshot() {
      try { return JSON.parse(localStorage.getItem(RECOVERY_KEY) || ''); } catch (_) { return null; }
    }
    restoreLibrarySnapshot(snapshot) {
      this.validateLibrarySnapshot(snapshot);
      const current = this.createLibrarySnapshot();
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(current));
      const previous = this.readLibrary();
      previous.projects.forEach(project => localStorage.removeItem(PROJECT_KEY(project.id)));
      const nextIndex = { version: 1, projects: [] };
      snapshot.library.projects.forEach(rawProject => {
        const project = clone(rawProject);
        localStorage.setItem(PROJECT_KEY(project.id), JSON.stringify(project));
        nextIndex.projects.push({ id: project.id, name: project.name, createdAt: project.createdAt || snapshot.createdAt, updatedAt: project.updatedAt || snapshot.createdAt });
      });
      this.writeLibrary(nextIndex);
      this.changed('library-restored');
      return { recovery: current, restored: this.createLibrarySnapshot() };
    }
  }

  window.UiLibraryStore = { LocalLibraryStore, cleanId, clone };
})();
