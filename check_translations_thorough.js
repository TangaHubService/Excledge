
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'inventory-system-fn/src/locales');
const enPath = path.join(localesDir, 'en/translation.json');
if (!fs.existsSync(enPath)) {
    console.error("English translation file not found at", enPath);
    process.exit(1);
}
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const languages = ['rw', 'fr', 'sw'];

function getKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            keys = keys.concat(getKeys(obj[key], prefix + key + '.'));
        } else {
            keys.push(prefix + key);
        }
    }
    return keys;
}

const enKeys = getKeys(en);

languages.forEach(lang => {
    const langPath = path.join(localesDir, `${lang}/translation.json`);
    if (!fs.existsSync(langPath)) {
        console.log(`--- Language ${lang} file not found ---`);
        return;
    }
    const data = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    const keys = getKeys(data);

    const missing = enKeys.filter(k => !keys.includes(k));

    if (missing.length > 0) {
        console.log(`--- Missing keys for ${lang} (${missing.length}) ---`);
        missing.forEach(k => console.log(k));
    } else {
        console.log(`--- No missing keys for ${lang} ---`);
    }
});
