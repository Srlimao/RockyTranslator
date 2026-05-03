const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

ipcMain.handle('get-languages', async () => {
  try {
    const langDir = path.join(__dirname, 'languages');
    // Ensure dir exists to prevent crash on first run
    try { await fs.access(langDir); } catch { await fs.mkdir(langDir); }
    
    const files = await fs.readdir(langDir, { withFileTypes: true });
    // Any directory that is not source
    const ignoreDirs = ['source'];
    const languages = files
      .filter(dirent => dirent.isDirectory() && !ignoreDirs.includes(dirent.name))
      .map(dirent => dirent.name);
    return languages;
  } catch (error) {
    console.error('Failed to get languages:', error);
    return [];
  }
});

ipcMain.handle('create-language', async (event, langCode, copySource) => {
  try {
    const langDir = path.join(__dirname, 'languages', langCode);
    await fs.mkdir(langDir, { recursive: true });
    
    if (copySource) {
      const sourcePath = path.join(__dirname, 'languages', 'source', 'translation.json');
      try {
        await fs.copyFile(sourcePath, path.join(langDir, 'translation.json'));
      } catch (e) {
        await fs.writeFile(path.join(langDir, 'translation.json'), '{}', 'utf8');
      }
    } else {
      await fs.writeFile(path.join(langDir, 'translation.json'), '{}', 'utf8');
    }
    
    await fs.writeFile(path.join(langDir, 'progress.json'), '{}', 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Failed to create language:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-translation', async (event, langCode) => {
  try {
    const sourcePath = path.join(__dirname, 'languages', 'source', 'translation.json');
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const sourceData = JSON.parse(sourceContent);

    const langPath = path.join(__dirname, 'languages', langCode, 'translation.json');
    let langData = {};
    try {
      const langContent = await fs.readFile(langPath, 'utf8');
      langData = JSON.parse(langContent);
    } catch (e) {
      console.log(`No existing translation for ${langCode}, using empty object.`);
    }

    const progressPath = path.join(__dirname, 'languages', langCode, 'progress.json');
    let progressData = {};
    try {
      const progressContent = await fs.readFile(progressPath, 'utf8');
      progressData = JSON.parse(progressContent);
    } catch (e) {
      console.log(`No existing progress for ${langCode}, using empty object.`);
    }

    return { source: sourceData, translation: langData, progress: progressData };
  } catch (error) {
    console.error('Failed to load translation:', error);
    throw error;
  }
});

ipcMain.handle('save-translation', async (event, langCode, translationData, progressData) => {
  try {
    const langDir = path.join(__dirname, 'languages', langCode);
    await fs.mkdir(langDir, { recursive: true }); // Ensure dir exists
    
    await fs.writeFile(
      path.join(langDir, 'translation.json'), 
      JSON.stringify(translationData, null, 2), 
      'utf8'
    );
    
    await fs.writeFile(
      path.join(langDir, 'progress.json'), 
      JSON.stringify(progressData, null, 2), 
      'utf8'
    );
    
    return { success: true };
  } catch (error) {
    console.error('Failed to save translation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-config', async () => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    return { apiUrl: 'http://localhost:1234/v1', modelName: 'local-model' };
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save config:', error);
    return { success: false, error: error.message };
  }
});
