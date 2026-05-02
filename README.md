# Rocky Translator App

A robust, Electron-based desktop application designed specifically for translating JSON localization files for the game "Rocky Idle". The app features seamless integration with local AI models (via LM Studio or compatible OpenAI endpoints) to rapidly automate translations while preserving crucial game syntax.

## Features

- 🖥️ **Modern Desktop UI**: A sleek, dark-mode glassmorphism interface.
- 🤖 **Local AI Integration**: Connect to self-hosted models (like LM Studio) to translate strings automatically.
- 🔄 **Auto Translate All**: Background processing loop that translates all untranslated keys while you continue validating.
- 📖 **Glossary / Word Bank**: Enforce common translations or mark specific game terms as "Do Not Translate".
- 📊 **Progress Tracking**: Track what is translated vs validated via visual progress bars and filterable lists.
- 🧠 **Model Thinking Toggle**: Dedicated support for reasoning/thinking models (e.g. DeepSeek R1) with a toggle to strictly disable reasoning output when necessary.

## Getting Started

### Prerequisites
You will need [Node.js](https://nodejs.org/) installed on your machine.
If you plan to use the AI translation features, you will also need a local AI server running, such as [LM Studio](https://lmstudio.ai/).

### Installation

1. Open your terminal or command prompt in the project directory.
2. Install the required dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

## User Guide

### 1. Setting up AI Translation (LM Studio)
Before you can use the AI translation, you must configure the endpoint:
1. Click the **⚙️ AI Settings** button in the top right corner.
2. **API Endpoint URL**: Enter your local server address (default for LM Studio is usually `http://localhost:1234/v1`).
3. **Model Name**: (Optional) Enter the model identifier if your endpoint requires it.
4. **Enable model thinking**: Check this box ONLY if you are using an advanced reasoning model (like DeepSeek R1) and explicitly *want* the AI to process reasoning. If unchecked, the app will strictly instruct the AI not to output reasoning tags, and will strip them if it disobeys.

### 2. Managing Languages
- The app automatically reads the `source/translation.json` folder as the baseline English text.
- To work on an existing translation, select the language (e.g., `ptBR`) from the dropdown in the sidebar.
- To create a new translation, click the **`+`** button next to the dropdown and enter the language code (e.g., `esES`, `deDE`). This creates a new folder with an empty translation and progress tracker.

### 3. Manual Translation & Validation
1. Click on any key in the left sidebar to load its content.
2. Type your translation in the text area, or click **✨ Translate with AI**.
3. Once satisfied, check the **Translated** box. If you have fully proofread the translation, check the **Validated** box.
4. Click **Save Changes** (or use the **✅ Validate & Next** button to instantly validate, save, and jump to the next unvalidated key).

### 4. Background Auto-Translation
To rapidly translate an entire file:
1. Click **🤖 Auto Translate All** in the header.
2. The AI will begin translating every untranslated key in the background.
3. You can continue clicking around, editing, and validating other keys while the background process runs.
4. The sidebar will dynamically update with yellow "Translated" dots as the AI completes each key.
5. Click **⏹️ Stop Auto Translate** at any time to pause the loop.

### 5. Glossary (Word Bank)
To prevent the AI from translating character names, locations, or to enforce a specific translation:
1. Click the **📖 Glossary** button in the header.
2. **Do Not Translate**: Enter a word in the first box (e.g., `Slayer`) and leave the translation box empty. The AI will keep this word in English.
3. **Common Translation**: Enter an English word in the first box (e.g., `Skill`) and the desired translation in the second box (e.g., `Habilidade`). The AI will be forced to use this specific translation.

## Directory Structure
- `/source/translation.json` - The master English JSON file.
- `/[langCode]/translation.json` - The translated JSON file.
- `/[langCode]/progress.json` - Tracks the translated and validated status of every individual key.
- `config.json` - Stores your local AI settings and glossary (Git ignored).
