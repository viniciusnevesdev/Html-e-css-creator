const fs = require('fs');
const vm = require('vm');

const data = new Map();
global.localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key)
};
global.window = global;
vm.runInThisContext(fs.readFileSync('library-store.js', 'utf8'));

const store = new UiLibraryStore.LocalLibraryStore();
const project = store.createProject({ id: 'crono', name: 'Crono' });
const component = store.saveComponent(project.id, {
  id: 'event-card', name: 'Cartão de evento',
  document: { project: { pages: [] }, activePageId: 'page-1' },
  componentManifest: { formatVersion: 1, id: 'event-card', name: 'Cartão de evento', elements: [{ id: 'event-title' }] },
  componentHtml: '<article data-component="event-card"><h2 data-element="event-title">Evento</h2></article>',
  componentCss: '.event-card{display:block}'
});

if (store.getComponent(project.id, component.id).componentManifest.elements[0].id !== 'event-title') throw new Error('Semantic IDs were not persisted');
const packageData = store.exportProject(project.id);
const copied = store.importProject(packageData, 'copy');
if (copied.id === project.id || !store.getComponent(copied.id, 'event-card')) throw new Error('Project copy did not preserve components');
store.renameProject(project.id, 'Crono principal');
if (store.getProject(project.id).name !== 'Crono principal') throw new Error('Project rename failed');
store.deleteComponent(project.id, component.id);
if (store.getComponent(project.id, component.id)) throw new Error('Component delete failed');
store.saveComponent(project.id, { id: 'day-header', name: 'Cabeçalho', document: { project: { pages: [] } }, componentHtml: '<header data-component="day-header"></header>', componentCss: '' });
const snapshot = store.createLibrarySnapshot();
if (snapshot.metadata.projectCount !== 2 || snapshot.metadata.componentCount !== 2) throw new Error('Library snapshot counts are incorrect');
store.createProject({ id: 'temporary', name: 'Temporário' });
const restored = store.restoreLibrarySnapshot(snapshot);
if (store.getProject('temporary') || !store.getComponent(project.id, 'day-header')) throw new Error('Library restore failed');
if (!restored.recovery.library.projects.some(item => item.id === 'temporary')) throw new Error('Restore did not create a local recovery copy');

console.log('library-store: projects, semantic IDs, import collision, snapshot, restore and recovery passed');
