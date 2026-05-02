const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLanguages: () => ipcRenderer.invoke('get-languages'),
  createLanguage: (langCode) => ipcRenderer.invoke('create-language', langCode),
  loadTranslation: (langCode) => ipcRenderer.invoke('load-translation', langCode),
  saveTranslation: (langCode, translationData, progressData) => ipcRenderer.invoke('save-translation', langCode, translationData, progressData),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config)
});
