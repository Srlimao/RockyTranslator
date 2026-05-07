const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
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

app.listen(port, '0.0.0.0', () => {
  console.log(`Rocky Translator server listening at http://localhost:${port}`);
});
