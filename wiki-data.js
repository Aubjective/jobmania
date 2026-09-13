// Shared loader for wiki-only localisation data.
(async function () {
    'use strict';

    window.JOBMANIA_DEFER_INIT = true;

    const localeLanguageMap = {
        en: 'English',
        'zh-CN': 'Chinese',
        'zh-TW': 'Chinese (Traditional)'
    };

    const locale = window.JOBMANIA_LOCALE || 'en';
    const language = localeLanguageMap[locale] || 'English';

    function pick(row, fallback = '') {
        if (!row) return fallback;
        return row[language] || row.English || fallback;
    }

    async function loadJson(path, fallback) {
        try {
            const res = await fetch(path);
            if (!res.ok) return fallback;
            return await res.json();
        } catch (e) {
            console.error(`Failed to load ${path}`, e);
            return fallback;
        }
    }

    const [dictionaryRows, introduction] = await Promise.all([
        loadJson('data/wiki_dictionary.json', []),
        loadJson('data/wiki_introduction.json', {})
    ]);

    const dictionary = new Map();
    for (const row of dictionaryRows) if (row?.Key) dictionary.set(row.Key, row);

    function t(key, fallback = key) {
        return pick(dictionary.get(key), fallback);
    }

    window.JOBMANIA_DICTIONARY = dictionary;
    window.JOBMANIA_T = t;

    window.JOBMANIA_UI = {
        home: t('Home'), characters: t('Characters'), jobs: t('Jobs'), abilities: t('Abilities'), passives: t('Passives'), materials: t('Materials'), relicSystem: t('Relic System'),
        search: t('Search...'), entries: t('entries'), loading: t('Loading data...'), error: t('Error'), refresh: t('Please refresh the page.'), back: t('Back'),
        basicInfo: t('Basic Info'), moreInfo: t('More Info'), usedBy: t('Used By'), description: t('Description'), condition: t('Condition'),
        combineList: t('Combine List'), job: t('Job'), craftedJob: t('Crafted Job'), craftingPath: t('Crafting Path'), craftsInto: t('Crafts Into'),
        enemySkillPools: t('Enemy Skill Pools'), randomPassives: t('Random Passives'), randomAbilities: t('Random Abilities'), thresholdAbilities: t('Threshold Abilities'), specialCaseAbilities: t('Special Case Abilities'),
        enemyActFirst: t('Enemy act first'), below50: t('Below 50%'), below30: t('Below 30%'), switchSkill: t('Switch Skill'), deckAbility: t('Deck Ability'),
        passive: t('Passive'), ability: t('Ability'), character: t('Character'), relic: t('Relic')
    };

    window.JOBMANIA_STAT_LABELS = { HP: t('HP'), Str: t('Str'), Agi: t('Agi'), Int: t('Int') };

    // Keep entity-key labels category-aware in script.js/wiki-localisation.js.
    window.JOBMANIA_FIELD_LABELS = {
        Rarity: t('Rarity'), Difficulty: t('Difficulty'), Race: t('Race'), Gender: t('Gender'),
        'Acquire Type': t('Acquire Type'), 'Acquire Method': t('Acquire Method'),
        'Ability Tier': t('Ability Tier'), 'Skill Rank': t('Skill Rank')
    };

    window.JOBMANIA_VALUE_LABELS = {
        Race: { Humanoid: t('Humanoid'), Creature: t('Creature'), Spirit: t('Spirit'), Matter: t('Matter') },
        Gender: { Male: t('Male'), Female: t('Female'), Other: t('Other') },
        'Acquire Type': { Gacha: t('Gacha'), EventGacha: t('EventGacha'), SpecialGacha: t('SpecialGacha'), Unobtainable: t('Unobtainable'), Normal: t('Normal'), Special: t('Special') },
        'Acquire Method': { Normal: t('Normal'), Special: t('Special') },
        SpecialType: {
            Strength: t('Strength'), Agility: t('Agility'), Intelligence: t('Intelligence'), MaxHP: t('MaxHP'),
            Fire: t('Fire'), Water: t('Water'), Thunder: t('Thunder'), Earth: t('Earth'), Wind: t('Wind'), Light: t('Light'), Dark: t('Dark')
        }
    };

    function buildHomeHtml() {
        if (!introduction || !Object.keys(introduction).length) return null;
        const intro = Array.isArray(introduction.intro) ? introduction.intro : [];
        const features = Array.isArray(introduction.features) ? introduction.features : [];
        const title = pick(introduction.title, 'Jobmania - Eternal Dungeon');
        const aboutTitle = pick(introduction.aboutTitle, 'About this game');
        const featuresTitle = pick(introduction.featuresTitle, 'FEATURES');
        const discordLabel = pick(introduction.discordLabel, 'Join our Discord:');
        const discordUrl = introduction.discordUrl || 'https://discord.gg/6U5FNFVrwb';
        const featureHtml = features.map(item => `<li>${pick(item)}</li>`).join('');
        return `<h1>🔥 ${title}</h1><div class="home-card"><h2>${aboutTitle}</h2><p><strong>${pick(intro[0])}</strong></p><p>${pick(intro[1])}<br><strong>${pick(intro[2])}</strong></p><h3>${featuresTitle}</h3><ul>${featureHtml}</ul><p><strong>${discordLabel}</strong> <a href="${discordUrl}" target="_blank">${discordUrl}</a></p></div>`;
    }

    window.JOBMANIA_HOME_HTML = buildHomeHtml();

    document.querySelectorAll('[data-wiki-key]').forEach(el => {
        const key = el.dataset.wikiKey;
        const prefix = el.dataset.wikiPrefix || '';
        el.textContent = `${prefix}${t(key, el.textContent)}`;
    });

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.body.appendChild(s);
        });
    }

    await loadScript('script.js');
    await loadScript('wiki-localisation.js');
    await loadScript('job-media.js');
    await loadScript('skill-description-wiki.js');
    await loadScript('hash-routing.js');

    if (typeof init === 'function') init();
})();
