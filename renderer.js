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
  config: {
    apiUrl: 'http://localhost:1234/v1',
    modelName: 'local-model',
    enableThinking: false,
    glossary: []
  }
};

// DOM Elements
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

const btnGlossary = document.getElementById('btn-glossary');
const glossaryModal = document.getElementById('glossary-modal');
const inputGlossaryTerm = document.getElementById('glossary-term');
const inputGlossaryTranslation = document.getElementById('glossary-translation');
const btnAddGlossary = document.getElementById('btn-add-glossary');
const glossaryList = document.getElementById('glossary-list');
const btnCloseGlossary = document.getElementById('btn-close-glossary');

// Initialize
async function init() {
  await loadConfig();
  await refreshLanguages();

  languageSelect.addEventListener('change', (e) => loadLanguage(e.target.value));
  searchInput.addEventListener('input', renderKeyList);
  filterUntranslated.addEventListener('change', renderKeyList);
  filterUnvalidated.addEventListener('change', renderKeyList);

  btnSave.addEventListener('click', saveCurrentKey);
  btnValidateNext.addEventListener('click', validateSaveAndNext);
  btnAutoTranslate.addEventListener('click', autoTranslateAll);
  btnAiTranslate.addEventListener('click', translateWithAi);

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

  // Glossary Modal
  btnGlossary.addEventListener('click', () => {
    if (!appState.config.glossary) appState.config.glossary = [];
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

async function loadConfig() {
  const data = await window.api.loadConfig();
  if (data) {
    appState.config = { ...appState.config, ...data };
  }
}

async function saveConfig() {
  appState.config.apiUrl = inputAiUrl.value;
  appState.config.modelName = inputAiModel.value;
  appState.config.enableThinking = inputAiThinking.checked;
  // Glossary is saved independently or together
  await window.api.saveConfig(appState.config);
  settingsModal.classList.remove('show');
}

function renderGlossary() {
  glossaryList.innerHTML = '';
  appState.config.glossary.forEach((item, index) => {
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
  const term = inputGlossaryTerm.value.trim();
  const translation = inputGlossaryTranslation.value.trim();
  if (term) {
    const existsIndex = appState.config.glossary.findIndex(i => (typeof i === 'string' ? i : i.term) === term);

    if (existsIndex >= 0) {
      appState.config.glossary[existsIndex] = { term, translation };
    } else {
      appState.config.glossary.push({ term, translation });
    }

    inputGlossaryTerm.value = '';
    inputGlossaryTranslation.value = '';
    renderGlossary();
    await window.api.saveConfig(appState.config);
  }
}

async function removeGlossaryWord(index) {
  appState.config.glossary.splice(index, 1);
  renderGlossary();
  await window.api.saveConfig(appState.config);
}

async function refreshLanguages() {
  appState.languages = await window.api.getLanguages();

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

  const result = await window.api.createLanguage(code);
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

  const data = await window.api.loadTranslation(langCode);
  appState.sourceFlat = flattenObject(data.source);
  appState.translationFlat = flattenObject(data.translation);
  appState.progressData = data.progress || {};

  appState.currentKey = null;
  editorArea.style.display = 'none';
  currentKeyDisplay.textContent = 'Select a key to translate';

  renderKeyList();
  updateProgress();
}

function renderKeyList() {
  if (!appState.currentLanguage) return;

  const searchTerm = searchInput.value.toLowerCase();
  const showUntranslated = filterUntranslated.checked;
  const showUnvalidated = filterUnvalidated.checked;

  keyList.innerHTML = '';

  const keys = Object.keys(appState.sourceFlat);

  const fragment = document.createDocumentFragment();

  for (const key of keys) {
    const isTranslated = appState.progressData[key]?.translated || false;
    const isValidated = appState.progressData[key]?.validated || false;

    // Filters
    if (searchTerm && !key.toLowerCase().includes(searchTerm) && !String(appState.sourceFlat[key]).toLowerCase().includes(searchTerm)) continue;
    if (showUntranslated && isTranslated) continue;
    if (showUnvalidated && isValidated) continue;

    const li = document.createElement('li');
    li.className = 'key-item';
    if (key === appState.currentKey) li.classList.add('active');

    li.innerHTML = `
      <span class="key-name">${key}</span>
      <div class="key-status">
        <div class="status-dot ${isTranslated ? 'translated' : ''}" title="Translated"></div>
        <div class="status-dot ${isValidated ? 'validated' : ''}" title="Validated"></div>
      </div>
    `;

    li.addEventListener('click', () => selectKey(key, li));
    fragment.appendChild(li);
  }

  keyList.appendChild(fragment);
}

function selectKey(key, liElement) {
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
}

function updateKeyStatusUI(key) {
  const liElements = document.querySelectorAll('.key-item');
  for (const li of liElements) {
    const keyNameSpan = li.querySelector('.key-name');
    if (keyNameSpan && keyNameSpan.textContent === key) {
      const isTranslated = appState.progressData[key]?.translated;
      const isValidated = appState.progressData[key]?.validated;
      const dots = li.querySelectorAll('.status-dot');
      if (dots.length >= 2) {
        dots[0].className = `status-dot ${isTranslated ? 'translated' : ''}`;
        dots[1].className = `status-dot ${isValidated ? 'validated' : ''}`;
      }
      break;
    }
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

  // Prepare full objects for saving
  const fullTranslation = unflattenObject(appState.translationFlat);

  // Save to disk
  btnSave.textContent = 'Saving...';
  btnSave.disabled = true;

  const result = await window.api.saveTranslation(
    appState.currentLanguage,
    fullTranslation,
    appState.progressData
  );

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

    if (appState.config.glossary && appState.config.glossary.length > 0) {
      const doNotTranslate = appState.config.glossary
        .filter(i => typeof i === 'string' || !i.translation)
        .map(i => typeof i === 'string' ? i : i.term);

      const commonTranslations = appState.config.glossary
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

    if (appState.config.glossary && appState.config.glossary.length > 0) {
      const doNotTranslate = appState.config.glossary
        .filter(i => typeof i === 'string' || !i.translation)
        .map(i => typeof i === 'string' ? i : i.term);

      const commonTranslations = appState.config.glossary
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
    const fullTranslation = unflattenObject(appState.translationFlat);
    await window.api.saveTranslation(appState.currentLanguage, fullTranslation, appState.progressData);

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
    const liElements = Array.from(document.querySelectorAll('.key-item'));
    const li = liElements.find(el => el.querySelector('.key-name').textContent === nextKey);
    selectKey(nextKey, li);
    if (li) {
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    alert("All keys validated! Great job!");
  }
}

// Start
init();
