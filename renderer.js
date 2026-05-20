// Helper to flatten nested JSON objects into a single level object with dot-notation keys
function flattenObject(ob) {
  var toReturn = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    if ((typeof ob[i]) == 'object' && ob[i] !== null) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

// Helper to unflatten dot-notation keys back into a nested object
function unflattenObject(ob) {
  var result = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    var keys = i.split('.');
    var current = result;
    for (var j = 0; j < keys.length - 1; j++) {
      var key = keys[j];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = ob[i];
  }
  return result;
}

// State
let appState = {
  languages: [],
  currentLanguage: null,
  sourceFlat: {},
  translationFlat: {},
  progressData: {}, // { "key": { translated: bool, validated: bool } }
  currentKey: null,
  username: null,
  socket: null,
  activeLocks: {},
  config: {
    apiUrl: 'http://localhost:1234/v1',
    modelName: 'local-model',
    enableThinking: false,
    glossary: {},      // { [langCode]: Array }
    lastModified: {}   // { [langCode]: ISO string }
  }
};

// DOM Elements
const sidebar = document.querySelector('.sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const languageSelect = document.getElementById('language-select');
const btnNewLang = document.getElementById('btn-new-lang');
const searchInput = document.getElementById('search-input');
const filterUntranslated = document.getElementById('filter-untranslated');
const filterUnvalidated = document.getElementById('filter-unvalidated');
const keyList = document.getElementById('key-list');

const editorArea = document.getElementById('editor-area');
const currentKeyDisplay = document.getElementById('current-key-display');
const sourceText = document.getElementById('source-text');
const translationText = document.getElementById('translation-text');
const cbTranslated = document.getElementById('cb-translated');
const cbValidated = document.getElementById('cb-validated');
const btnSave = document.getElementById('btn-save');
const btnValidateNext = document.getElementById('btn-validate-next');
const btnAutoTranslate = document.getElementById('btn-auto-translate');
const btnAiTranslate = document.getElementById('btn-ai-translate');
const aiLoading = document.getElementById('ai-loading');
const btnUpdateSource = document.getElementById('btn-update-source');
const fileUpdateSource = document.getElementById('file-update-source');
const btnDownloadTranslation = document.getElementById('btn-download-translation');

const progressBarTranslated = document.getElementById('progress-bar-translated');
const progressBarValidated = document.getElementById('progress-bar-validated');
const statsTranslated = document.getElementById('stats-translated');
const statsValidated = document.getElementById('stats-validated');

const settingsModal = document.getElementById('settings-modal');
const newLangModal = document.getElementById('new-lang-modal');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const inputAiUrl = document.getElementById('ai-url');
const inputAiModel = document.getElementById('ai-model');
const inputAiThinking = document.getElementById('ai-thinking');

const btnCloseNewLang = document.getElementById('btn-close-new-lang');
const btnCreateLang = document.getElementById('btn-create-lang');
const inputNewLangCode = document.getElementById('new-lang-code');
const inputCopySource = document.getElementById('copy-source-cb');

const btnUploadTranslation = document.getElementById('btn-upload-translation');
const fileUploadTranslation = document.getElementById('file-upload-translation');

const btnGlossary = document.getElementById('btn-glossary');
const glossaryModal = document.getElementById('glossary-modal');
const inputGlossaryTerm = document.getElementById('glossary-term');
const inputGlossaryTranslation = document.getElementById('glossary-translation');
const btnAddGlossary = document.getElementById('btn-add-glossary');
const glossaryList = document.getElementById('glossary-list');
const btnCloseGlossary = document.getElementById('btn-close-glossary');

const btnDashboard = document.getElementById('btn-dashboard');
const dashboardEl = document.getElementById('dashboard');
const dashboardCards = document.getElementById('dashboard-cards');

function formatDate(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function showDashboard() {
  // Clear language selection
  appState.currentLanguage = null;
  appState.sourceFlat = {};
  appState.translationFlat = {};
  appState.progressData = {};
  appState.currentKey = null;
  languageSelect.value = '';
  localStorage.removeItem('rt-language');
  langLastModified.style.display = 'none';
  keyList.innerHTML = '';
  editorArea.style.display = 'none';
  currentKeyDisplay.textContent = 'Select a key to translate';
  progressBarTranslated.style.width = '0%';
  progressBarValidated.style.width = '0%';
  statsTranslated.textContent = '0%';
  statsValidated.textContent = '0%';
  btnUploadTranslation.style.display = 'none';

  dashboardEl.style.display = 'block';
  // Re-trigger animation
  dashboardEl.style.animation = 'none';
  dashboardEl.offsetHeight;
  dashboardEl.style.animation = '';

  await renderDashboard();
}

function hideDashboard() {
  dashboardEl.style.display = 'none';
}

async function renderDashboard() {
  dashboardCards.innerHTML = '<p style="color:var(--text-secondary);padding:10px 0">Loading…</p>';
  try {
    const data = await (await fetch('/api/dashboard')).json();
    dashboardCards.innerHTML = '';

    if (!data.length) {
      dashboardCards.innerHTML = '<div class="dash-empty">No languages yet. Click <strong>+</strong> in the sidebar to create one.</div>';
      return;
    }

    data.forEach(item => {
      const tPerc = item.total > 0 ? Math.round((item.translated / item.total) * 100) : 0;
      const vPerc = item.total > 0 ? Math.round((item.validated / item.total) * 100) : 0;
      const dateStr = formatDate(item.lastModified);
      const initials = item.lang.slice(0, 2).toUpperCase();

      const card = document.createElement('div');
      card.className = 'dash-card';
      card.innerHTML = `
        <div class="dash-card-header">
          <div class="dash-lang-flag">${initials}</div>
          <div class="dash-lang-info">
            <div class="dash-lang-code">${item.lang}</div>
            <div class="dash-lang-date ${dateStr ? '' : 'never'}">
              ${dateStr ? '🕐 ' + dateStr : 'Never edited'}
            </div>
          </div>
        </div>
        <div class="dash-progress-group">
          <div class="dash-progress-row">
            <div class="dash-progress-label">
              <span>Translated</span>
              <span>${item.translated} / ${item.total} &nbsp;(${tPerc}%)</span>
            </div>
            <div class="dash-bar-track">
              <div class="dash-bar-fill translated" style="width:${tPerc}%"></div>
            </div>
          </div>
          <div class="dash-progress-row">
            <div class="dash-progress-label">
              <span>Validated</span>
              <span>${item.validated} / ${item.total} &nbsp;(${vPerc}%)</span>
            </div>
            <div class="dash-bar-track">
              <div class="dash-bar-fill validated" style="width:${vPerc}%"></div>
            </div>
          </div>
        </div>
      `;
      card.addEventListener('click', () => {
        languageSelect.value = item.lang;
        localStorage.setItem('rt-language', item.lang);
        loadLanguage(item.lang);
      });
      dashboardCards.appendChild(card);
    });
  } catch (e) {
    dashboardCards.innerHTML = '<div class="dash-empty">Failed to load dashboard data.</div>';
    console.error('Dashboard error:', e);
  }
}

const langLastModified = document.getElementById('lang-last-modified');
const langLastModifiedText = document.getElementById('lang-last-modified-text');

function updateLastModifiedDisplay(langCode) {
  const ts = appState.config.lastModified && appState.config.lastModified[langCode];
  if (ts) {
    const d = new Date(ts);
    const formatted = d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    langLastModifiedText.textContent = `Last edit: ${formatted}`;
    langLastModified.style.display = 'flex';
    // Re-trigger animation
    langLastModified.style.animation = 'none';
    langLastModified.offsetHeight; // reflow
    langLastModified.style.animation = '';
  } else {
    langLastModified.style.display = 'none';
  }
}

const usernameDisplay = document.getElementById('username-display');
const headerUsername = document.getElementById('header-username');
const usernameModal = document.getElementById('username-modal');
const inputUsername = document.getElementById('input-username');
const btnSaveUsername = document.getElementById('btn-save-username');
const lockedBanner = document.getElementById('locked-banner');
const lockedByUser = document.getElementById('locked-by-user');

function loadUsername() {
  const saved = localStorage.getItem('rt-username');
  if (saved) {
    appState.username = saved;
    headerUsername.textContent = saved;
  } else {
    usernameModal.classList.add('show');
  }
}

function saveUsername() {
  const val = inputUsername.value.trim();
  if (val) {
    appState.username = val;
    localStorage.setItem('rt-username', val);
    headerUsername.textContent = val;
    usernameModal.classList.remove('show');
    
    // Rejoin socket if already connected
    if (appState.socket && appState.currentLanguage) {
      appState.socket.emit('join', { langCode: appState.currentLanguage, username: appState.username });
    }
  }
}

async function restoreUIState() {
  // Restore filter checkboxes
  const savedUntranslated = localStorage.getItem('rt-filter-untranslated');
  const savedUnvalidated = localStorage.getItem('rt-filter-unvalidated');
  if (savedUntranslated !== null) filterUntranslated.checked = savedUntranslated === 'true';
  if (savedUnvalidated !== null) filterUnvalidated.checked = savedUnvalidated === 'true';

  // Restore and auto-load the saved language, or show dashboard
  const savedLang = localStorage.getItem('rt-language');
  if (savedLang && appState.languages.includes(savedLang)) {
    languageSelect.value = savedLang;
    await loadLanguage(savedLang);
  } else {
    await showDashboard();
  }
}

// Initialize
async function init() {
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('show');
    });
  }

  await loadConfig();
  await refreshLanguages();

  loadUsername();
  restoreUIState();

  usernameDisplay.addEventListener('click', () => {
    inputUsername.value = appState.username || '';
    usernameModal.classList.add('show');
  });

  btnSaveUsername.addEventListener('click', saveUsername);
  inputUsername.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveUsername();
  });

  // Init socket
  if (typeof io !== 'undefined') {
    appState.socket = io();

    appState.socket.on('active-locks', (locks) => {
      appState.activeLocks = {};
      for (const key in locks) {
        appState.activeLocks[key] = locks[key].username;
      }
      renderKeyList();
      checkCurrentKeyLock();
    });

    appState.socket.on('key-locked', (data) => {
      appState.activeLocks[data.key] = data.username;
      updateKeyLockUI(data.key);
      if (appState.currentKey === data.key) checkCurrentKeyLock();
    });

    appState.socket.on('key-unlocked', (data) => {
      delete appState.activeLocks[data.key];
      updateKeyLockUI(data.key);
      if (appState.currentKey === data.key) checkCurrentKeyLock();
    });

    appState.socket.on('lang-modified', (data) => {
      if (!appState.config.lastModified) appState.config.lastModified = {};
      appState.config.lastModified[data.langCode] = data.timestamp;
      if (appState.currentLanguage === data.langCode) {
        updateLastModifiedDisplay(data.langCode);
      }
    });

    appState.socket.on('key-updated', (data) => {
      appState.translationFlat[data.key] = data.translation;
      appState.progressData[data.key] = data.progress;
      updateProgress();
      updateKeyStatusUI(data.key);

      // Update editor if currently viewing
      if (appState.currentKey === data.key && appState.activeLocks[data.key] !== appState.username) {
        translationText.value = data.translation;
        cbTranslated.checked = data.progress.translated;
        cbValidated.checked = data.progress.validated;
      }
    });
  }

  languageSelect.addEventListener('change', (e) => {
    localStorage.setItem('rt-language', e.target.value);
    loadLanguage(e.target.value);
  });
  searchInput.addEventListener('input', renderKeyList);
  filterUntranslated.addEventListener('change', () => {
    localStorage.setItem('rt-filter-untranslated', filterUntranslated.checked);
    renderKeyList();
  });
  filterUnvalidated.addEventListener('change', () => {
    localStorage.setItem('rt-filter-unvalidated', filterUnvalidated.checked);
    renderKeyList();
  });

  btnSave.addEventListener('click', saveCurrentKey);
  btnValidateNext.addEventListener('click', validateSaveAndNext);
  btnAutoTranslate.addEventListener('click', autoTranslateAll);
  btnAiTranslate.addEventListener('click', translateWithAi);

  if (btnUpdateSource && fileUpdateSource) {
    btnUpdateSource.addEventListener('click', () => {
      fileUpdateSource.click();
    });

    if (btnDownloadTranslation) {
      btnDownloadTranslation.addEventListener('click', downloadCurrentTranslation);
    }

    fileUpdateSource.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const newSourceData = JSON.parse(event.target.result);
          
          btnUpdateSource.textContent = 'Updating...';
          btnUpdateSource.disabled = true;

          const response = await fetch('/api/source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSourceData)
          });
          
          const result = await response.json();
          if (result.success) {
            alert('Source updated and backed up successfully!');
            // Reload current language if one is selected
            if (appState.currentLanguage) {
              await loadLanguage(appState.currentLanguage);
            }
          } else {
            alert('Failed to update source: ' + result.error);
          }
        } catch (err) {
          alert('Invalid JSON file.');
          console.error(err);
        } finally {
          btnUpdateSource.textContent = '🔄 Update Source';
          btnUpdateSource.disabled = false;
          fileUpdateSource.value = ''; // Reset file input
        }
      };
      reader.readAsText(file);
    });
  }

  // Modals
  btnSettings.addEventListener('click', () => {
    inputAiUrl.value = appState.config.apiUrl || 'http://localhost:1234/v1';
    inputAiModel.value = appState.config.modelName || 'local-model';
    inputAiThinking.checked = appState.config.enableThinking === true;
    settingsModal.classList.add('show');
  });
  btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('show'));
  btnSaveSettings.addEventListener('click', saveConfig);

  btnNewLang.addEventListener('click', () => newLangModal.classList.add('show'));
  btnCloseNewLang.addEventListener('click', () => newLangModal.classList.remove('show'));
  btnCreateLang.addEventListener('click', createNewLanguage);

  btnDashboard.addEventListener('click', showDashboard);

  if (btnUploadTranslation && fileUploadTranslation) {
    btnUploadTranslation.addEventListener('click', () => {
      fileUploadTranslation.click();
    });

    fileUploadTranslation.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !appState.currentLanguage) return;

      const confirmUpload = confirm('This will completely replace the current language translations with the uploaded file. A backup will be saved on the server. Do you want to continue?');
      if (!confirmUpload) {
        fileUploadTranslation.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const newTranslationData = JSON.parse(event.target.result);
          
          btnUploadTranslation.disabled = true;
          
          const newTranslationFlat = flattenObject(newTranslationData);
          const newProgressData = {};
          
          // Re-calculate progress data
          for (const key of Object.keys(appState.sourceFlat)) {
            if (newTranslationFlat[key]) {
              const oldProg = appState.progressData[key];
              if (oldProg) {
                newProgressData[key] = oldProg;
              } else {
                newProgressData[key] = { translated: true, validated: false };
              }
            } else {
              newProgressData[key] = { translated: false, validated: false };
            }
          }

          const response = await fetch(`/api/translation/${appState.currentLanguage}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translationData: newTranslationData, progressData: newProgressData })
          });
          
          const result = await response.json();
          if (result.success) {
            alert('Translation replaced successfully!');
            await loadLanguage(appState.currentLanguage);
          } else {
            alert('Failed to update translation: ' + result.error);
          }
        } catch (err) {
          alert('Invalid JSON file.');
          console.error(err);
        } finally {
          btnUploadTranslation.disabled = false;
          fileUploadTranslation.value = ''; // Reset file input
        }
      };
      reader.readAsText(file);
    });
  }

  // Glossary Modal
  btnGlossary.addEventListener('click', () => {
    if (!appState.config.glossary) appState.config.glossary = {};
    renderGlossary();
    glossaryModal.classList.add('show');
  });
  btnCloseGlossary.addEventListener('click', () => glossaryModal.classList.remove('show'));
  btnAddGlossary.addEventListener('click', addGlossaryWord);
  inputGlossaryTerm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGlossaryWord();
  });
  inputGlossaryTranslation.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGlossaryWord();
  });
}

// Returns the glossary array for the currently active language
function currentGlossary() {
  const lang = appState.currentLanguage;
  if (!lang) return [];
  if (!appState.config.glossary[lang]) appState.config.glossary[lang] = [];
  return appState.config.glossary[lang];
}

async function loadConfig() {
  // Load AI settings (per-user) from localStorage
  const localData = localStorage.getItem('rt-config');
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      // Only apply non-glossary settings from local storage
      const { glossary: _ignored, ...localSettings } = parsed;
      appState.config = { ...appState.config, ...localSettings };
    } catch (e) {
      console.error('Failed to parse config from local storage');
    }
  }

  // Load shared config (glossary + lastModified) from server
  try {
    const response = await fetch('/api/config');
    const serverData = await response.json();
    if (serverData && serverData.glossary && typeof serverData.glossary === 'object' && !Array.isArray(serverData.glossary)) {
      appState.config.glossary = serverData.glossary;
    }
    if (serverData && serverData.lastModified && typeof serverData.lastModified === 'object') {
      appState.config.lastModified = serverData.lastModified;
    }
  } catch (e) {
    console.error('Failed to load config from server:', e);
  }
}

async function saveConfig() {
  appState.config.apiUrl = inputAiUrl.value;
  appState.config.modelName = inputAiModel.value;
  appState.config.enableThinking = inputAiThinking.checked;
  // Save only AI settings (not glossary) to localStorage
  const { glossary: _ignored, ...aiSettings } = appState.config;
  localStorage.setItem('rt-config', JSON.stringify(aiSettings));
  settingsModal.classList.remove('show');
}

function renderGlossary() {
  const lang = appState.currentLanguage;
  glossaryList.innerHTML = '';

  if (!lang) {
    glossaryList.innerHTML = '<li style="color:var(--text-muted);padding:0.5rem">Select a language first to manage its glossary.</li>';
    return;
  }

  const glossary = currentGlossary();
  glossary.forEach((item, index) => {
    const term = typeof item === 'string' ? item : item.term;
    const translation = typeof item === 'string' ? '' : item.translation;
    const displayStr = translation ? `${term} &rarr; ${translation}` : `${term} (Do not translate)`;

    const li = document.createElement('li');
    li.className = 'glossary-item';
    li.innerHTML = `
      <span class="word">${displayStr}</span>
      <button class="btn-remove-word" data-index="${index}">&times;</button>
    `;
    li.querySelector('.btn-remove-word').addEventListener('click', () => removeGlossaryWord(index));
    glossaryList.appendChild(li);
  });
}

async function addGlossaryWord() {
  if (!appState.currentLanguage) return;
  const term = inputGlossaryTerm.value.trim();
  const translation = inputGlossaryTranslation.value.trim();
  if (term) {
    const glossary = currentGlossary();
    const existsIndex = glossary.findIndex(i => (typeof i === 'string' ? i : i.term) === term);

    if (existsIndex >= 0) {
      glossary[existsIndex] = { term, translation };
    } else {
      glossary.push({ term, translation });
    }

    inputGlossaryTerm.value = '';
    inputGlossaryTranslation.value = '';
    renderGlossary();
    await saveGlossaryToServer();
  }
}

async function removeGlossaryWord(index) {
  if (!appState.currentLanguage) return;
  currentGlossary().splice(index, 1);
  renderGlossary();
  await saveGlossaryToServer();
}

async function saveGlossaryToServer() {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glossary: appState.config.glossary })
    });
  } catch (e) {
    console.error('Failed to save glossary to server:', e);
  }
}

async function refreshLanguages() {
  const response = await fetch('/api/languages');
  appState.languages = await response.json();

  languageSelect.innerHTML = '<option value="" disabled selected>Select Language</option>';
  appState.languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    languageSelect.appendChild(opt);
  });

  if (appState.currentLanguage && appState.languages.includes(appState.currentLanguage)) {
    languageSelect.value = appState.currentLanguage;
  }
}

async function createNewLanguage() {
  const code = inputNewLangCode.value.trim();
  if (!code) return;

  const copySource = inputCopySource.checked;
  const response = await fetch('/api/languages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ langCode: code, copySource })
  });
  const result = await response.json();
  if (result.success) {
    newLangModal.classList.remove('show');
    inputNewLangCode.value = '';
    await refreshLanguages();
    languageSelect.value = code;
    await loadLanguage(code);
  } else {
    alert('Failed to create language: ' + result.error);
  }
}

async function loadLanguage(langCode) {
  appState.currentLanguage = langCode;
  hideDashboard();

  const response = await fetch(`/api/translation/${langCode}`);
  const data = await response.json();
  appState.sourceFlat = flattenObject(data.source);
  appState.translationFlat = flattenObject(data.translation);
  appState.progressData = data.progress || {};

  if (appState.socket && appState.username) {
    appState.socket.emit('join', { langCode: langCode, username: appState.username });
  }

  appState.currentKey = null;
  editorArea.style.display = 'none';
  currentKeyDisplay.textContent = 'Select a key to translate';
  btnUploadTranslation.style.display = 'flex';

  renderKeyList();
  updateProgress();
  updateLastModifiedDisplay(langCode);
}

// Build a nested tree from flat dot-notation keys
function buildTree(keys) {
  const tree = {};
  for (const key of keys) {
    const parts = key.split('.');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { __children: {} };
      node = node[parts[i]].__children;
    }
    const leaf = parts[parts.length - 1];
    node[leaf] = { __isLeaf: true, __fullKey: key };
  }
  return tree;
}

// Recursively count total/translated/validated leaf keys under a tree node
function getFolderStats(treeNode) {
  let total = 0, translated = 0, validated = 0;
  for (const nodeName of Object.keys(treeNode)) {
    const node = treeNode[nodeName];
    if (node.__isLeaf) {
      total++;
      if (appState.progressData[node.__fullKey]?.translated) translated++;
      if (appState.progressData[node.__fullKey]?.validated) validated++;
    } else {
      const sub = getFolderStats(node.__children);
      total += sub.total;
      translated += sub.translated;
      validated += sub.validated;
    }
  }
  return { total, translated, validated };
}

// Recursively render tree nodes into a <ul>
function renderTreeNodes(treeNode, parentUl, searchTerm, showUntranslated, showUnvalidated, forceOpen) {
  let hasVisibleChildren = false;

  for (const nodeName of Object.keys(treeNode)) {
    const node = treeNode[nodeName];

    if (node.__isLeaf) {
      const key = node.__fullKey;
      const isTranslated = appState.progressData[key]?.translated || false;
      const isValidated = appState.progressData[key]?.validated || false;

      // Apply filters
      if (searchTerm && !key.toLowerCase().includes(searchTerm) && !String(appState.sourceFlat[key]).toLowerCase().includes(searchTerm)) continue;
      if (showUntranslated && isTranslated) continue;
      if (showUnvalidated && isValidated) continue;

      const lockedBy = appState.activeLocks[key];
      const isLocked = lockedBy && lockedBy !== appState.username;

      const li = document.createElement('li');
      li.className = 'key-item';
      li.dataset.key = key;
      if (key === appState.currentKey) li.classList.add('active');

      li.innerHTML = `
        <span class="key-name">${nodeName}</span>
        <div class="key-status">
          ${isLocked ? `<span class="lock-indicator" title="Locked by ${lockedBy}">🔒</span>` : ''}
          <div class="status-dot ${isTranslated ? 'translated' : ''}" title="Translated"></div>
          <div class="status-dot ${isValidated ? 'validated' : ''}" title="Validated"></div>
        </div>
      `;
      li.addEventListener('click', () => selectKey(key, li));
      parentUl.appendChild(li);
      hasVisibleChildren = true;

    } else {
      // It's a folder node
      const children = node.__children;

      // Calculate folder progress stats
      const stats = getFolderStats(children);
      const tPerc = stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0;
      const vPerc = stats.total > 0 ? Math.round((stats.validated / stats.total) * 100) : 0;
      const tClass = tPerc === 100 ? 'folder-perc--done' : tPerc > 0 ? 'folder-perc--partial' : 'folder-perc--none';
      const vClass = vPerc === 100 ? 'folder-perc--done' : vPerc > 0 ? 'folder-perc--partial' : 'folder-perc--none';

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.className = 'tree-folder';
      summary.innerHTML = `
        <span class="folder-icon">📁</span>
        <span class="folder-name">${nodeName}</span>
        <span class="folder-stats">
          <span class="folder-perc ${tClass}" title="Translated">${tPerc}%</span>
          <span class="folder-perc ${vClass}" title="Validated">${vPerc}% ✓</span>
        </span>
      `;
      details.appendChild(summary);

      const childUl = document.createElement('ul');
      childUl.className = 'tree-children';
      details.appendChild(childUl);

      const childVisible = renderTreeNodes(children, childUl, searchTerm, showUntranslated, showUnvalidated, forceOpen);

      if (!childVisible) continue; // prune empty branches when filtering

      // Auto-expand if searching/filtering, or if a child is active
      if (forceOpen || childUl.querySelector('.key-item.active')) {
        details.open = true;
      }

      parentUl.appendChild(details);
      hasVisibleChildren = true;
    }
  }

  return hasVisibleChildren;
}

function renderKeyList() {
  if (!appState.currentLanguage) return;

  const searchTerm = searchInput.value.toLowerCase();
  const showUntranslated = filterUntranslated.checked;
  const showUnvalidated = filterUnvalidated.checked;
  const isFiltering = searchTerm || showUntranslated || showUnvalidated;

  keyList.innerHTML = '';

  const keys = Object.keys(appState.sourceFlat);
  const tree = buildTree(keys);

  renderTreeNodes(tree, keyList, searchTerm, showUntranslated, showUnvalidated, !!isFiltering);
}

function selectKey(key, liElement) {
  if (appState.currentKey && appState.socket) {
    appState.socket.emit('unlock-key', { key: appState.currentKey });
  }

  appState.currentKey = key;

  // Update UI active state
  document.querySelectorAll('.key-item').forEach(el => el.classList.remove('active'));
  if (liElement) liElement.classList.add('active');

  editorArea.style.display = 'flex';
  currentKeyDisplay.textContent = key;

  sourceText.value = appState.sourceFlat[key] || '';
  translationText.value = appState.translationFlat[key] || '';

  const progress = appState.progressData[key] || { translated: false, validated: false };
  cbTranslated.checked = progress.translated;
  cbValidated.checked = progress.validated;

  if (appState.socket && appState.username) {
    appState.socket.emit('lock-key', { key: key });
  }

  checkCurrentKeyLock();
}

function checkCurrentKeyLock() {
  if (!appState.currentKey) return;

  const lockedBy = appState.activeLocks[appState.currentKey];
  const isLocked = lockedBy && lockedBy !== appState.username;

  if (isLocked) {
    lockedBanner.style.display = 'flex';
    lockedByUser.textContent = lockedBy;
    translationText.disabled = true;
    cbTranslated.disabled = true;
    cbValidated.disabled = true;
    btnSave.disabled = true;
    btnValidateNext.disabled = true;
    btnAiTranslate.disabled = true;
  } else {
    lockedBanner.style.display = 'none';
    translationText.disabled = false;
    cbTranslated.disabled = false;
    cbValidated.disabled = false;
    btnSave.disabled = false;
    btnValidateNext.disabled = false;
    btnAiTranslate.disabled = false;
  }
}

function updateKeyLockUI(key) {
  const li = keyList.querySelector(`.key-item[data-key="${CSS.escape(key)}"]`);
  if (!li) return;

  const lockedBy = appState.activeLocks[key];
  const isLocked = lockedBy && lockedBy !== appState.username;

  let lockIndicator = li.querySelector('.lock-indicator');
  if (isLocked) {
    if (!lockIndicator) {
      lockIndicator = document.createElement('span');
      lockIndicator.className = 'lock-indicator';
      li.querySelector('.key-status').prepend(lockIndicator);
    }
    lockIndicator.textContent = '🔒';
    lockIndicator.title = `Locked by ${lockedBy}`;
  } else if (lockIndicator) {
    lockIndicator.remove();
  }
}

function updateKeyStatusUI(key) {
  const li = keyList.querySelector(`.key-item[data-key="${CSS.escape(key)}"]`);
  if (!li) return;

  const isTranslated = appState.progressData[key]?.translated;
  const isValidated = appState.progressData[key]?.validated;
  const dots = li.querySelectorAll('.status-dot');
  if (dots.length >= 2) {
    dots[0].className = `status-dot ${isTranslated ? 'translated' : ''}`;
    dots[1].className = `status-dot ${isValidated ? 'validated' : ''}`;
  }

  updateFolderStats(key);
}

// Walk up the tree from a key's <li> and refresh each ancestor folder's percentage badges
function updateFolderStats(key) {
  const li = keyList.querySelector(`.key-item[data-key="${CSS.escape(key)}"]`);
  if (!li) return;

  let el = li.parentElement;
  while (el && el !== keyList) {
    if (el.tagName === 'DETAILS') {
      // Collect all leaf keys under this <details> by reading child .key-item elements
      const leafItems = el.querySelectorAll('.key-item');
      let total = 0, translated = 0, validated = 0;
      leafItems.forEach(item => {
        const k = item.dataset.key;
        if (!k) return;
        total++;
        if (appState.progressData[k]?.translated) translated++;
        if (appState.progressData[k]?.validated) validated++;
      });

      if (total > 0) {
        const tPerc = Math.round((translated / total) * 100);
        const vPerc = Math.round((validated / total) * 100);
        const tClass = tPerc === 100 ? 'folder-perc--done' : tPerc > 0 ? 'folder-perc--partial' : 'folder-perc--none';
        const vClass = vPerc === 100 ? 'folder-perc--done' : vPerc > 0 ? 'folder-perc--partial' : 'folder-perc--none';

        const percSpans = el.querySelector('summary .folder-stats')?.querySelectorAll('.folder-perc');
        if (percSpans && percSpans.length >= 2) {
          percSpans[0].textContent = `${tPerc}%`;
          percSpans[0].className = `folder-perc ${tClass}`;
          percSpans[1].textContent = `${vPerc}% ✓`;
          percSpans[1].className = `folder-perc ${vClass}`;
        }
      }
    }
    el = el.parentElement;
  }
}

async function saveCurrentKey() {
  if (!appState.currentKey || !appState.currentLanguage) return;

  const key = appState.currentKey;

  // Update local state
  appState.translationFlat[key] = translationText.value;

  if (!appState.progressData[key]) {
    appState.progressData[key] = { translated: false, validated: false };
  }

  appState.progressData[key].translated = cbTranslated.checked;
  appState.progressData[key].validated = cbValidated.checked;

  // Save to disk
  btnSave.textContent = 'Saving...';
  btnSave.disabled = true;

  const response = await fetch(`/api/translation/${appState.currentLanguage}/update-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: key,
      translation: translationText.value,
      progress: appState.progressData[key],
      username: appState.username
    })
  });
  const result = await response.json();

  btnSave.textContent = 'Save Changes';
  btnSave.disabled = false;

  if (!result.success) {
    alert('Failed to save: ' + result.error);
  } else {
    // Update UI without full re-render if possible
    updateProgress();
    updateKeyStatusUI(key);
  }
}

function updateProgress() {
  const keys = Object.keys(appState.sourceFlat);
  const total = keys.length;

  if (total === 0) return;

  let translatedCount = 0;
  let validatedCount = 0;

  keys.forEach(key => {
    if (appState.progressData[key]?.translated) translatedCount++;
    if (appState.progressData[key]?.validated) validatedCount++;
  });

  const translatedPerc = Math.round((translatedCount / total) * 100);
  const validatedPerc = Math.round((validatedCount / total) * 100);

  progressBarTranslated.style.width = `${translatedPerc}%`;
  progressBarValidated.style.width = `${validatedPerc}%`;

  statsTranslated.textContent = `${translatedPerc}%`;
  statsValidated.textContent = `${validatedPerc}%`;
}

async function translateWithAi() {
  if (!appState.currentKey) return;

  const sourceStr = sourceText.value;
  const lang = appState.currentLanguage;

  btnAiTranslate.disabled = true;
  aiLoading.style.display = 'inline';

  try {
    let systemPrompt = `You are a professional translator for a game. Translate the following English text to ${lang}. The text is for the UI element of a game, for context the original english text JSON path is: "${appState.currentKey}". Keep the exact same formatting, tone, and any special placeholders like {{variable}}. Only output the translation, without any explanations or quotation marks.`;

    const glossary = currentGlossary();
    if (glossary.length > 0) {
      const doNotTranslate = glossary
        .filter(i => typeof i === 'string' || !i.translation)
        .map(i => typeof i === 'string' ? i : i.term);

      const commonTranslations = glossary
        .filter(i => typeof i === 'object' && i.translation);

      if (doNotTranslate.length > 0) {
        systemPrompt += `\n\nIMPORTANT: Do not translate the following game-specific words, keep them exactly as they are in English: ${doNotTranslate.join(', ')}.`;
      }

      if (commonTranslations.length > 0) {
        const mappings = commonTranslations.map(i => `'${i.term}' must be translated as '${i.translation}'`).join(', ');
        systemPrompt += `\n\nIMPORTANT: Use the following specific translations for these game terms: ${mappings}.`;
      }
    }

    const requestBody = {
      model: appState.config.modelName || "local-model",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: sourceStr }
      ],
      temperature: 0.3
    };

    // Pass thinking flag if the API expects it.
    if (appState.config.enableThinking !== undefined) {
      requestBody.thinking = appState.config.enableThinking;
      requestBody.reasoning_effort = appState.config.enableThinking ? "high" : "none";
    }

    // Also inject instruction against thinking if disabled
    if (!appState.config.enableThinking) {
      requestBody.messages[0].content += " DO NOT output any <think> reasoning steps.";
    }

    const response = await fetch(`${appState.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    let translatedText = result.choices[0].message.content;

    // If thinking is disabled but model still outputs <think> tags, strip them.
    if (!appState.config.enableThinking && translatedText.includes('<think>')) {
      translatedText = translatedText.replace(/<think>[\s\S]*?<\/think>/g, '');
    }

    translatedText = translatedText.trim();

    translationText.value = translatedText;

    // Auto-check translated box
    cbTranslated.checked = true;

  } catch (error) {
    console.error('AI Translation error:', error);
    // Don't alert if we're auto-translating, maybe just log and skip to next
    if (!isAutoTranslating) {
      alert('Failed to connect to AI: ' + error.message);
    }
  } finally {
    btnAiTranslate.disabled = false;
    aiLoading.style.display = 'none';
  }
}

let isAutoTranslating = false;

async function translateKeyBackground(key) {
  const sourceStr = appState.sourceFlat[key];
  const lang = appState.currentLanguage;

  try {
    let systemPrompt = `You are a professional translator for a game. Translate the following English text to ${lang}. The text is for the UI element with the key path: "${key}". Keep the exact same meaning, formatting, tone, and any special placeholders like {{variable}}. Only output the translation, without any explanations or quotation marks.`;

    const glossary = currentGlossary();
    if (glossary.length > 0) {
      const doNotTranslate = glossary
        .filter(i => typeof i === 'string' || !i.translation)
        .map(i => typeof i === 'string' ? i : i.term);

      const commonTranslations = glossary
        .filter(i => typeof i === 'object' && i.translation);

      if (doNotTranslate.length > 0) {
        systemPrompt += `\n\nIMPORTANT: Do not translate the following game-specific words, keep them exactly as they are in English: ${doNotTranslate.join(', ')}.`;
      }

      if (commonTranslations.length > 0) {
        const mappings = commonTranslations.map(i => `'${i.term}' must be translated as '${i.translation}'`).join(', ');
        systemPrompt += `\n\nIMPORTANT: Use the following specific translations for these game terms: ${mappings}.`;
      }
    }

    const requestBody = {
      model: appState.config.modelName || "local-model",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: sourceStr }
      ],
      temperature: 0.3
    };

    if (appState.config.enableThinking !== undefined) {
      requestBody.thinking = appState.config.enableThinking;
      requestBody.reasoning_effort = appState.config.enableThinking ? "high" : "none";
    }

    if (!appState.config.enableThinking) {
      requestBody.messages[0].content += " DO NOT output any <think> reasoning steps.";
    }

    const response = await fetch(`${appState.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    let translatedText = result.choices[0].message.content;

    if (!appState.config.enableThinking && translatedText.includes('<think>')) {
      translatedText = translatedText.replace(/<think>[\s\S]*?<\/think>/g, '');
    }
    translatedText = translatedText.trim();

    // Update State
    appState.translationFlat[key] = translatedText;
    if (!appState.progressData[key]) {
      appState.progressData[key] = { translated: false, validated: false };
    }
    appState.progressData[key].translated = true;

    // Save to Disk
    await fetch(`/api/translation/${appState.currentLanguage}/update-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        translation: translatedText,
        progress: appState.progressData[key],
        username: appState.username
      })
    });

    // Update UI if this is the currently selected key
    if (appState.currentKey === key) {
      translationText.value = translatedText;
      cbTranslated.checked = true;
    }

    // Re-render UI markers
    updateProgress();
    updateKeyStatusUI(key);

  } catch (error) {
    console.error(`AI Background Translation error for ${key}:`, error);
  }
}

async function autoTranslateAll() {
  if (isAutoTranslating) {
    isAutoTranslating = false;
    btnAutoTranslate.textContent = '🤖 Auto Translate All';
    return;
  }

  if (!appState.currentLanguage) {
    alert("Please select a language first.");
    return;
  }

  isAutoTranslating = true;
  btnAutoTranslate.textContent = '⏹️ Stop Auto Translate';
  btnAutoTranslate.style.background = 'var(--accent-warning)';

  const keys = Object.keys(appState.sourceFlat);

  for (const key of keys) {
    if (!isAutoTranslating) break;

    const isTranslated = appState.progressData[key]?.translated;
    if (!isTranslated) {
      btnAutoTranslate.textContent = '⏹️ Translating: ' + key.split('.').pop().substring(0, 10) + '...';

      await translateKeyBackground(key);

      // Small delay to be gentle on the AI server
      await new Promise(r => setTimeout(r, 500));
    }
  }

  isAutoTranslating = false;
  btnAutoTranslate.textContent = '🤖 Auto Translate All';
  btnAutoTranslate.style.background = 'linear-gradient(135deg, #8b5cf6, #3b82f6)';
}

async function validateSaveAndNext() {
  if (!appState.currentKey) return;

  // Set as validated
  cbValidated.checked = true;
  cbTranslated.checked = true;

  // Save current
  await saveCurrentKey();

  // Find next unvalidated key
  const keys = Object.keys(appState.sourceFlat);
  const currentIndex = keys.indexOf(appState.currentKey);

  let nextKey = null;
  for (let i = currentIndex + 1; i < keys.length; i++) {
    const k = keys[i];
    if (!appState.progressData[k]?.validated) {
      nextKey = k;
      break;
    }
  }

  // Also loop from beginning if not found after current
  if (!nextKey) {
    for (let i = 0; i < currentIndex; i++) {
      const k = keys[i];
      if (!appState.progressData[k]?.validated) {
        nextKey = k;
        break;
      }
    }
  }

  if (nextKey) {
    // Select the key (updates appState.currentKey)
    selectKey(nextKey, null);

    // After selectKey, find the li by data-key and open its parent folders
    const li = keyList.querySelector(`.key-item[data-key="${CSS.escape(nextKey)}"]`);
    if (li) {
      // Ensure all ancestor <details> are open
      let parent = li.parentElement;
      while (parent && parent !== keyList) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentElement;
      }
      // Mark active
      document.querySelectorAll('.key-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    alert("All keys validated! Great job!");
  }
}

function downloadCurrentTranslation() {
  if (!appState.currentLanguage) {
    alert("Please select a language first.");
    return;
  }

  const fullTranslation = unflattenObject(appState.translationFlat);
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullTranslation, null, 2));
  
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `translation_${appState.currentLanguage}.json`);
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

// Start
init();
