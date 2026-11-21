const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('egglab', {
  state: () => ipcRenderer.invoke('app:state'),
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),

  startJob: (payload) => ipcRenderer.invoke('job:start', payload),
  cancelJob: (id) => ipcRenderer.invoke('job:cancel', id),
  waitJob: (id) => ipcRenderer.invoke('job:wait', id),
  jobs: () => ipcRenderer.invoke('jobs:list'),

  models: () => ipcRenderer.invoke('models:list'),
  opencodeModels: (force) => ipcRenderer.invoke('opencode:models', { force }),
  downloadModels: (ids, variant) => ipcRenderer.invoke('models:download', { ids, variant }),
  cancelDownload: (id) => ipcRenderer.invoke('models:cancel', id),
  retryDownload: (id) => ipcRenderer.invoke('models:retry', id),
  useModel: (id, file) => ipcRenderer.invoke('models:use', { id, file }),
  setModelsFolder: (folder) => ipcRenderer.invoke('models:setFolder', folder),
  setModelFile: (role, path) => ipcRenderer.invoke('models:setPath', { role, path }),
  opencodeReport: (force) => ipcRenderer.invoke('opencode:report', { force }),
  setOpenCode: (path) => ipcRenderer.invoke('opencode:setPath', path),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickOpenCode: () => ipcRenderer.invoke('dialog:pickOpenCode'),

  setupStatus: () => ipcRenderer.invoke('setup:status'),
  setupAction: (action, payload) => ipcRenderer.invoke('setup:action', { action, payload }),
  pickApp: () => ipcRenderer.invoke('dialog:pickApp'),
  pickModel: () => ipcRenderer.invoke('dialog:pickModel'),

  updateStatus: () => ipcRenderer.invoke('update:status'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),

  chatSend: (text, files, refMap) => ipcRenderer.invoke('chat:send', { text, files, refMap }),
  chatStop: () => ipcRenderer.invoke('chat:stop'),
  chatClear: () => ipcRenderer.invoke('chat:clear'),
  chatHistory: () => ipcRenderer.invoke('chat:history'),
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionNew: () => ipcRenderer.invoke('sessions:newThread'),
  sessionRename: (key, title) => ipcRenderer.invoke('sessions:rename', { key, title }),
  sessionDelete: (key) => ipcRenderer.invoke('sessions:delete', key),
  sessionSwitch: (key, title) => ipcRenderer.invoke('sessions:switch', { key, title }),
  sessionUseDocument: (docKey, title) => ipcRenderer.invoke('sessions:useDocument', { docKey, title }),
  sessionMove: (key, docKey, title) => ipcRenderer.invoke('sessions:move', { key, docKey, title }),
  sessionOpenDoc: (docKey) => ipcRenderer.invoke('sessions:openDoc', { docKey }),
  chatCreateCanvas: (key) => ipcRenderer.invoke('chat:createCanvas', { key }),
  uiError: (message) => ipcRenderer.invoke('ui:error', { message }),
  assetsList: () => ipcRenderer.invoke('assets:list'),
  assetPlace: (id) => ipcRenderer.invoke('assets:place', { id }),

  pcStatus: () => ipcRenderer.invoke('pc:status'),
  pcLaunch: () => ipcRenderer.invoke('pc:launch'),
  pcLayers: () => ipcRenderer.invoke('pc:layers'),
  pcPreview: () => ipcRenderer.invoke('pc:preview'),
  pcPlace: (file, options) => ipcRenderer.invoke('pc:place', { path: file, options }),
  pcNewDoc: (opts) => ipcRenderer.invoke('pc:newDoc', opts),
  pcExportLayers: (opts) => ipcRenderer.invoke('pc:exportLayers', opts),
  pcExportActive: () => ipcRenderer.invoke('pc:exportActive'),
  pcExportLayer: (name, options) => ipcRenderer.invoke('pc:exportLayer', { name, ...(options || {}) }),
  pcExportMentions: (names) => ipcRenderer.invoke('pc:exportMentions', { names }),
  pcEditActive: (payload) => ipcRenderer.invoke('pc:editActive', payload),
  pcCommand: (id, params) => ipcRenderer.invoke('pc:command', { id, params }),

  pcProject: () => ipcRenderer.invoke('pc:project'),
  pcSave: (opts) => ipcRenderer.invoke('pc:save', opts || {}),
  pcOpenProject: (opts) => ipcRenderer.invoke('pc:openProject', opts || {}),
  pcCloseDoc: (opts) => ipcRenderer.invoke('pc:closeDoc', opts || {}),
  pcRecentProjects: (limit) => ipcRenderer.invoke('pc:recentProjects', limit),
  pcProjectPath: (name, ext) => ipcRenderer.invoke('pc:projectPath', { name, ext }),

  pickImages: () => ipcRenderer.invoke('dialog:pickImages'),
  openPath: (file) => ipcRenderer.invoke('fs:open', file),
  revealPath: (file) => ipcRenderer.invoke('fs:reveal', file),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),

  winMin: () => ipcRenderer.invoke('window:min'),
  winClose: () => ipcRenderer.invoke('window:close'),
  winPin: (value) => ipcRenderer.invoke('window:pin', value),
  winDock: (value) => ipcRenderer.invoke('window:dock', value),
  winSetWidth: (width) => ipcRenderer.invoke('window:setWidth', width),

  eggState: () => ipcRenderer.invoke('egg:state'),
  eggExpand: () => ipcRenderer.invoke('egg:expand'),
  eggCollapse: () => ipcRenderer.invoke('egg:collapse'),
  eggBounds: () => ipcRenderer.invoke('egg:bounds'),
  eggMove: (x, y) => ipcRenderer.invoke('egg:move', { x, y }),
  eggDragEnd: () => ipcRenderer.invoke('egg:drag-end'),
  onShell: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('egglab:shell', listener);
    return () => ipcRenderer.removeListener('egglab:shell', listener);
  },

  fileUrl: (file) => `egl://local/${encodeURIComponent(String(file).replace(/\\/g, '/'))}`,
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('egglab:event', listener);
    return () => ipcRenderer.removeListener('egglab:event', listener);
  },
});
