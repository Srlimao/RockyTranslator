const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from the current directory (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

const languagesDir = path.join(__dirname, 'languages');
const sourcePath = path.join(languagesDir, 'source', 'translation.json');
const configPath = path.join(__dirname, 'config.json');

// Ensure directories exist
if (!fs.existsSync(languagesDir)) {
  fs.mkdirSync(languagesDir);
}
if (!fs.existsSync(path.join(languagesDir, 'source'))) {
  fs.mkdirSync(path.join(languagesDir, 'source'));
}
if (!fs.existsSync(sourcePath)) {
  fs.writeFileSync(sourcePath, JSON.stringify({ "Example": "Source Text" }, null, 2));
}

// Logging Helper
function logAction(action, username, langCode, key, extraInfo = '') {
  const timestamp = new Date().toISOString();
  const safeUsername = username || 'Unknown User';
  const logLine = `[${timestamp}] [${langCode}] ${safeUsername}: ${action} | Key: ${key} ${extraInfo}\n`;
  const logPath = path.join(__dirname, 'action_log.txt');
  fs.appendFileSync(logPath, logLine);
}

// Socket.io State
const activeEdits = {}; // { "langCode": { "key": { username, socketId } } }

io.on('connection', (socket) => {
  let currentLang = null;
  let username = null;
  let lockedKeys = []; // Array of keys this socket currently locks

  socket.on('join', (data) => {
    // data: { langCode, username }
    if (currentLang) {
      socket.leave(currentLang);
      // unlock any keys this user was holding
      lockedKeys.forEach(key => {
        if (activeEdits[currentLang] && activeEdits[currentLang][key]?.socketId === socket.id) {
          delete activeEdits[currentLang][key];
          io.to(currentLang).emit('key-unlocked', { key });
        }
      });
      lockedKeys = [];
    }

    currentLang = data.langCode;
    username = data.username;
    socket.join(currentLang);

    if (!activeEdits[currentLang]) {
      activeEdits[currentLang] = {};
    }

    // Send the current locked keys for this language to the new user
    socket.emit('active-locks', activeEdits[currentLang]);
  });

  socket.on('lock-key', (data) => {
    // data: { key }
    if (!currentLang || !username) return;
    
    const key = data.key;
    
    if (!activeEdits[currentLang][key]) {
      activeEdits[currentLang][key] = { username, socketId: socket.id };
      lockedKeys.push(key);
      logAction('LOCKED', username, currentLang, key);
      // Broadcast to everyone else
      socket.to(currentLang).emit('key-locked', { key, username });
    }
  });

  socket.on('unlock-key', (data) => {
    // data: { key }
    if (!currentLang) return;
    const key = data.key;
    if (activeEdits[currentLang][key]?.socketId === socket.id) {
      delete activeEdits[currentLang][key];
      lockedKeys = lockedKeys.filter(k => k !== key);
      logAction('UNLOCKED', username, currentLang, key);
      io.to(currentLang).emit('key-unlocked', { key });
    }
  });

  socket.on('disconnect', () => {
    if (currentLang && username) {
      lockedKeys.forEach(key => {
        if (activeEdits[currentLang] && activeEdits[currentLang][key]?.socketId === socket.id) {
          delete activeEdits[currentLang][key];
          io.to(currentLang).emit('key-unlocked', { key });
        }
      });
    }
  });
});

// API Endpoints

// loadConfig
app.get('/api/config', (req, res) => {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ error: error.message });
  }
});

// saveConfig
app.post('/api/config', (req, res) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// getLanguages
app.get('/api/languages', (req, res) => {
  try {
    const folders = fs.readdirSync(languagesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'source')
      .map(dirent => dirent.name);
    res.json(folders);
  } catch (error) {
    console.error('Error getting languages:', error);
    res.status(500).json({ error: error.message });
  }
});

// createLanguage
app.post('/api/languages', (req, res) => {
  try {
    const { langCode, copySource } = req.body;
    const langPath = path.join(languagesDir, langCode);
    
    if (!fs.existsSync(langPath)) {
      fs.mkdirSync(langPath);
    }

    const newTransPath = path.join(langPath, 'translation.json');
    const newProgressPath = path.join(langPath, 'progress.json');

    if (copySource) {
      fs.copyFileSync(sourcePath, newTransPath);
    } else {
      fs.writeFileSync(newTransPath, JSON.stringify({}, null, 2));
    }
    fs.writeFileSync(newProgressPath, JSON.stringify({}, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating language:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// updateSource
app.post('/api/source', (req, res) => {
  try {
    const newSourceData = req.body;
    
    // Backup existing
    if (fs.existsSync(sourcePath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(languagesDir, 'source', `translation_backup_${timestamp}.json`);
      fs.copyFileSync(sourcePath, backupPath);
    }

    // Save new source
    fs.writeFileSync(sourcePath, JSON.stringify(newSourceData, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// loadTranslation
app.get('/api/translation/:langCode', (req, res) => {
  try {
    const langCode = req.params.langCode;
    const langPath = path.join(languagesDir, langCode);
    
    const transPath = path.join(langPath, 'translation.json');
    const progressPath = path.join(langPath, 'progress.json');

    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    let translationData = {};
    let progressData = {};

    if (fs.existsSync(transPath)) {
      translationData = JSON.parse(fs.readFileSync(transPath, 'utf8'));
    }
    if (fs.existsSync(progressPath)) {
      progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    }

    res.json({
      source: sourceData,
      translation: translationData,
      progress: progressData
    });
  } catch (error) {
    console.error('Error loading translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// saveTranslation
app.post('/api/translation/:langCode', (req, res) => {
  try {
    const langCode = req.params.langCode;
    const { translationData, progressData } = req.body;
    
    const langPath = path.join(languagesDir, langCode);
    
    if (!fs.existsSync(langPath)) {
      fs.mkdirSync(langPath);
    }

    const transPath = path.join(langPath, 'translation.json');
    const progressPath = path.join(langPath, 'progress.json');

    fs.writeFileSync(transPath, JSON.stringify(translationData, null, 2));
    fs.writeFileSync(progressPath, JSON.stringify(progressData, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving translation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// updateKey
app.post('/api/translation/:langCode/update-key', (req, res) => {
  try {
    const langCode = req.params.langCode;
    const { key, translation, progress, username } = req.body;
    
    const langPath = path.join(languagesDir, langCode);
    if (!fs.existsSync(langPath)) {
      fs.mkdirSync(langPath);
    }

    const transPath = path.join(langPath, 'translation.json');
    const progressPath = path.join(langPath, 'progress.json');

    let translationData = {};
    let progressData = {};

    if (fs.existsSync(transPath)) {
      translationData = JSON.parse(fs.readFileSync(transPath, 'utf8'));
    }
    if (fs.existsSync(progressPath)) {
      progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    }

    // Update specific key
    const keys = key.split('.');
    let current = translationData;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) current[k] = {};
      current = current[k];
    }
    current[keys[keys.length - 1]] = translation;
    
    progressData[key] = progress;

    fs.writeFileSync(transPath, JSON.stringify(translationData, null, 2));
    fs.writeFileSync(progressPath, JSON.stringify(progressData, null, 2));

    let actionStr = 'SAVED TRANSLATION';
    if (progress.validated) actionStr += ' & VALIDATED';
    logAction(actionStr, username, langCode, key, `-> "${translation.substring(0, 30)}${translation.length > 30 ? '...' : ''}"`);

    // Broadcast the update via socket to all clients in the language room
    io.to(langCode).emit('key-updated', {
      key: key,
      translation: translation,
      progress: progress
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Rocky Translator server listening at http://localhost:${port}`);
});
