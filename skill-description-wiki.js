// Jobmania Wiki - Ability / Passive Description Renderer
// English descriptions resolve live from SkillUnit source JSON through
// skillunit.js + mechanics.js. Existing localisation JSON remains the
// fallback/source for translated pages.
(function () {
    'use strict';

    let abilityDescriptionMap = null;
    let passiveDescriptionMap = null;
    let abilityDescriptionPromise = null;
    let passiveDescriptionPromise = null;

    let abilitySkillUnitMap = null;
    let passiveSkillUnitMap = null;
    let abilitySkillUnitPromise = null;
    let passiveSkillUnitPromise = null;

    let abilityApplyTagMap = null;
    let passiveApplyTagMap = null;
    let applyTagsPromise = null;
    let runtimePromise = null;

    function loadScriptOnce(src, globalName) {
        if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
        const existing = Array.from(document.scripts).find(script => {
            const value = script.getAttribute('src') || '';
            return value === src || value.endsWith('/' + src);
        });
        if (existing) {
            if (!globalName || window[globalName]) return Promise.resolve(window[globalName]);
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(window[globalName]), { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(globalName ? window[globalName] : true);
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensureRuntime() {
        if (runtimePromise) return runtimePromise;
        runtimePromise = (async function () {
            await loadScriptOnce('skillunit.js', 'JobmaniaSkillUnit');
            await loadScriptOnce('mechanics.js', 'JobmaniaMechanics');
            if (window.JobmaniaMechanics?.load) {
                await window.JobmaniaMechanics.load('data/mechanics.json');
            }
            await loadScriptOnce('delivery-patterns.js', 'JobmaniaDeliveryPatterns');
            if (window.JobmaniaDeliveryPatterns?.load) {
                await window.JobmaniaDeliveryPatterns.load('data/delivery_patterns.json');
            }
            return window.JobmaniaSkillUnit;
        })().catch(error => {
            console.error('Failed to load SkillUnit mechanics runtime:', error);
            runtimePromise = null;
            return null;
        });
        return runtimePromise;
    }

    async function ensureApplyTags() {
        if (abilityApplyTagMap && passiveApplyTagMap) {
            return { abilities: abilityApplyTagMap, passives: passiveApplyTagMap };
        }
        if (applyTagsPromise) return applyTagsPromise;

        applyTagsPromise = (async function () {
            const indexRes = await fetch('data/apply_tags.json');
            if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status}`);
            const index = await indexRes.json();

            const abilityChunks = Array.isArray(index.abilityChunks) ? index.abilityChunks : [];
            const abilityObjects = await Promise.all(abilityChunks.map(async src => {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`HTTP ${res.status} loading ${src}`);
                return res.json();
            }));

            let passiveObject = {};
            if (index.passiveFile) {
                const res = await fetch(index.passiveFile);
                if (!res.ok) throw new Error(`HTTP ${res.status} loading ${index.passiveFile}`);
                passiveObject = await res.json();
            }

            const mergedAbilities = Object.assign({}, ...abilityObjects);
            abilityApplyTagMap = new Map(Object.entries(mergedAbilities));
            passiveApplyTagMap = new Map(Object.entries(passiveObject || {}));
            return { abilities: abilityApplyTagMap, passives: passiveApplyTagMap };
        })().catch(error => {
            console.error('Failed to load Apply tags:', error);
            abilityApplyTagMap = new Map();
            passiveApplyTagMap = new Map();
            return { abilities: abilityApplyTagMap, passives: passiveApplyTagMap };
        });

        return applyTagsPromise;
    }

    async function ensureSkillUnitSource(cat) {
        if (cat === 'abilities') {
            if (abilitySkillUnitMap) return abilitySkillUnitMap;
            if (abilitySkillUnitPromise) return abilitySkillUnitPromise;
            abilitySkillUnitPromise = fetchJobmaniaJson('data/abilities_description.json')
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(rows => {
                    abilitySkillUnitMap = new Map((Array.isArray(rows) ? rows : []).map(item => [item.AbilityKey, item]));
                    return abilitySkillUnitMap;
                })
                .catch(error => {
                    console.error('Failed to load Ability SkillUnits:', error);
                    abilitySkillUnitMap = new Map();
                    return abilitySkillUnitMap;
                });
            return abilitySkillUnitPromise;
        }

        if (cat === 'passives') {
            if (passiveSkillUnitMap) return passiveSkillUnitMap;
            if (passiveSkillUnitPromise) return passiveSkillUnitPromise;
            passiveSkillUnitPromise = fetchJobmaniaJson('data/passives_description.json')
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(rows => {
                    passiveSkillUnitMap = new Map((Array.isArray(rows) ? rows : []).map(item => [item.PassiveKey, item]));
                    return passiveSkillUnitMap;
                })
                .catch(error => {
                    console.error('Failed to load Passive SkillUnits:', error);
                    passiveSkillUnitMap = new Map();
                    return passiveSkillUnitMap;
                });
            return passiveSkillUnitPromise;
        }

        return new Map();
    }

    async function ensureAbilityDescriptions() {
        if (abilityDescriptionMap) return abilityDescriptionMap;
        if (abilityDescriptionPromise) return abilityDescriptionPromise;
        abilityDescriptionPromise = (async function () {
            try {
                const res = await fetchJobmaniaJson('data/abilities_description_localisation.json');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rows = await res.json();
                abilityDescriptionMap = new Map((Array.isArray(rows) ? rows : []).map(item => [item.AbilityKey, item]));
                return abilityDescriptionMap;
            } catch (error) {
                console.error('Failed to load Ability descriptions:', error);
                abilityDescriptionMap = new Map();
                return abilityDescriptionMap;
            }
        })();
        return abilityDescriptionPromise;
    }

    async function ensurePassiveDescriptions() {
        if (passiveDescriptionMap) return passiveDescriptionMap;
        if (passiveDescriptionPromise) return passiveDescriptionPromise;
        passiveDescriptionPromise = (async function () {
            try {
                const res = await fetchJobmaniaJson('data/passives_description_localisation.json');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rows = await res.json();
                passiveDescriptionMap = new Map((Array.isArray(rows) ? rows : []).map(item => [item.PassiveKey, item]));
                return passiveDescriptionMap;
            } catch (error) {
                console.error('Failed to load Passive descriptions:', error);
                passiveDescriptionMap = new Map();
                return passiveDescriptionMap;
            }
        })();
        return passiveDescriptionPromise;
    }

    function getDescriptionEntry(cat, key) {
        if (cat === 'abilities') return abilityDescriptionMap?.get(key) || null;
        if (cat === 'passives') return passiveDescriptionMap?.get(key) || null;
        return null;
    }

    function cleanDescriptionLine(line) {
        return String(line)
            .replace(/<sprite\s+name=["']?[^>"']+["']?\s*>/gi, '')
            .replace(/\\<sprite\s+name=["']?[^>"']+["']?\s*>/gi, '')
            .replace(/\bStr\b/g, 'Strength')
            .replace(/\bAgi\b/g, 'Agility')
            .replace(/\bInt\b/g, 'Intelligence')
            .replace(/\s+/g, ' ')
            .replace(/\s+([。！？,.!?])/g, '$1')
            .trim();
    }

    function cleanLines(lines) {
        if (!Array.isArray(lines)) return [];
        const cleaned = [];
        for (const line of lines) {
            if (typeof line !== 'string' || !line.trim()) continue;
            const text = cleanDescriptionLine(line);
            if (text) cleaned.push(text);
        }
        return cleaned;
    }

    function getLocalisedDescriptionLines(entry) {
        if (!entry) return [];
        const language = typeof currentLang !== 'undefined' ? currentLang : 'English';
        const selected = entry[language];
        const english = entry.English;
        const lines = Array.isArray(selected) && selected.length ? selected : english;
        return cleanLines(lines);
    }

    function getMechanicsLocale() {
        const raw = window.JOBMANIA_LOCALE || (typeof currentLang !== 'undefined' ? currentLang : 'en') || 'en';
        return window.JobmaniaMechanics?.normalizeLocale
            ? window.JobmaniaMechanics.normalizeLocale(raw)
            : String(raw).toLowerCase();
    }

    async function getApplyTagLine(cat, key) {
        await ensureApplyTags();
        const rawTags = cat === 'passives'
            ? (passiveApplyTagMap?.get(key) || [])
            : (abilityApplyTagMap?.get(key) || []);
        if (!rawTags.length) return '';

        const formatted = window.JobmaniaMechanics?.formatApplyTags
            ? window.JobmaniaMechanics.formatApplyTags(rawTags)
            : rawTags.map(tag => `(${tag})`);
        return formatted.join(' ');
    }

    async function getLiveEnglishLines(cat, key) {
        const engine = await ensureRuntime();
        if (!engine?.resolveEntry) return [];

        const sourceMap = await ensureSkillUnitSource(cat);
        const entry = sourceMap.get(key);
        const lines = [];

        if (entry) {
            const result = engine.resolveEntry(entry, { kind: cat === 'passives' ? 'passive' : 'ability' });
            lines.push(...cleanLines(result?.descriptions || []));
        }

        const tagLine = await getApplyTagLine(cat, key);
        if (tagLine) lines.push(tagLine);
        return lines;
    }

    async function getDescriptionLines(cat, key) {
        const locale = String(window.JOBMANIA_LOCALE || 'en').toLowerCase();
        if (locale === 'en') {
            const live = await getLiveEnglishLines(cat, key);
            if (live.length) return live;
        }
        return getLocalisedDescriptionLines(getDescriptionEntry(cat, key));
    }

    function ensureMechanicStyles() {
        if (document.getElementById('jobmania-mechanic-link-styles')) return;
        const style = document.createElement('style');
        style.id = 'jobmania-mechanic-link-styles';
        style.textContent = `
            .skill-mechanic-link {
                appearance: none;
                border: 0;
                background: none;
                color: inherit;
                font: inherit;
                padding: 0;
                margin: 0;
                text-decoration: underline;
                text-decoration-style: dotted;
                text-underline-offset: 0.16em;
                cursor: pointer;
            }
            .skill-mechanic-link:hover,
            .skill-mechanic-link:focus-visible {
                text-decoration-style: solid;
            }
            .skill-mechanic-link:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
                border-radius: 2px;
            }
            .skill-mechanic-panel {
                display: none;
                margin-top: 0.75rem;
                padding-top: 0.75rem;
                border-top: 1px solid rgba(127, 127, 127, 0.3);
            }
            .skill-mechanic-panel.is-open {
                display: block;
            }
            .skill-mechanic-panel-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 0.75rem;
                margin-bottom: 0.4rem;
            }
            .skill-mechanic-panel-title {
                margin: 0;
                font-size: 1rem;
                font-weight: 700;
                line-height: 1.35;
            }
            .skill-mechanic-panel-close {
                appearance: none;
                border: 0;
                background: transparent;
                color: inherit;
                font: inherit;
                line-height: 1;
                padding: 0.2rem 0.35rem;
                cursor: pointer;
                border-radius: 4px;
            }
            .skill-mechanic-panel-close:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
            }
            .skill-mechanic-panel-body {
                margin: 0;
                line-height: 1.55;
            }
        `;
        document.head.appendChild(style);
    }

    function buildMechanicCandidates(locale) {
        const mechanics = window.JobmaniaMechanics;
        if (!mechanics?.data?.elementMechanics?.elements) return [];

        const candidates = [];
        for (const elementId of Object.keys(mechanics.data.elementMechanics.elements)) {
            const elementMechanic = mechanics.getElementMechanic?.(elementId, 'element', locale);
            const finaleMechanic = mechanics.getElementMechanic?.(elementId, 'finale', locale);
            const vulnerableMechanic = mechanics.getElementMechanic?.(elementId, 'vulnerable', locale);
            const abilityMechanic = mechanics.getElementMechanic?.(elementId, 'ability', locale);
            const status = mechanics.getElementStatus?.(elementId);

            const singular = mechanics.getElementLinkLabel?.(elementId, 'elementSingular', locale);
            const plural = mechanics.getElementLinkLabel?.(elementId, 'elementPlural', locale);
            const tag = mechanics.getElementLinkLabel?.(elementId, 'abilityTag', locale);

            if (elementMechanic?.name) candidates.push({ text: elementMechanic.name, key: elementMechanic.key, kind: 'element', elementId, priority: 40 });
            if (vulnerableMechanic?.name) candidates.push({ text: vulnerableMechanic.name, key: vulnerableMechanic.key, kind: 'vulnerable', elementId, priority: 50 });
            if (finaleMechanic?.name) candidates.push({ text: finaleMechanic.name, key: finaleMechanic.key, kind: 'finale', elementId, priority: 50 });
            if (singular) candidates.push({ text: singular, key: elementMechanic?.key, kind: 'element', elementId, priority: 30 });
            if (plural) candidates.push({ text: plural, key: elementMechanic?.key, kind: 'element', elementId, priority: 30 });
            if (tag) candidates.push({ text: tag, key: abilityMechanic?.key, kind: 'ability', elementId, priority: 60 });

            if (status) {
                const statusText = mechanics.getStatusLabel?.(status.id, locale) || status.sourceName;
                if (statusText) candidates.push({ text: statusText, key: `status.${status.id}`, kind: 'status', statusId: status.id, elementId, priority: 35 });
            }
        }

        for (const [name, definition] of Object.entries(mechanics.data.effectDefinitions || {})) {
            if (!definition?.clickable) continue;
            const text = definition.termKey
                ? mechanics.localizeTerm?.(definition.termKey, locale, mechanics.getMechanicName?.(name, locale) || name)
                : (mechanics.getMechanicName?.(name, locale) || name);
            if (text) {
                const key = `mechanic.${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`;
                candidates.push({ text, key, kind: 'reusable', mechanicName: name, priority: 45 });
                if (definition.applyTag || definition.family === 'Apply Tag') {
                    candidates.push({ text: `(${text})`, key, kind: 'reusable', mechanicName: name, priority: 80 });
                }
            }
        }

        const seen = new Set();
        return candidates
            .filter(item => item.text && item.key)
            .sort((a, b) => b.text.length - a.text.length || b.priority - a.priority)
            .filter(item => {
                const signature = `${item.text}\u0000${item.key}`;
                if (seen.has(signature)) return false;
                seen.add(signature);
                return true;
            });
    }

    function findMechanicReferences(text, locale) {
        const candidates = buildMechanicCandidates(locale);
        if (!candidates.length) return [];
        const lower = String(text).toLocaleLowerCase();
        const matches = [];

        for (const candidate of candidates) {
            const needle = candidate.text.toLocaleLowerCase();
            if (!needle) continue;
            let start = 0;
            while (start < lower.length) {
                const index = lower.indexOf(needle, start);
                if (index < 0) break;
                matches.push({ start: index, end: index + needle.length, candidate });
                start = index + needle.length;
            }
        }

        matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || b.candidate.priority - a.candidate.priority);
        const accepted = [];
        let cursor = -1;
        for (const match of matches) {
            if (match.start < cursor) continue;
            accepted.push(match);
            cursor = match.end;
        }
        return accepted;
    }

    function getMechanicDetail(reference, locale) {
        const mechanics = window.JobmaniaMechanics;
        if (!mechanics) return null;

        if (reference.kind === 'status') {
            const status = mechanics.getElementStatus?.(reference.statusId);
            const title = mechanics.getStatusLabel?.(reference.statusId, locale) || status?.sourceName || reference.statusId;
            const description = status?.mechanicConfirmed
                ? mechanics.describeReusableMechanic?.(status.sourceName || reference.statusId, locale)
                : null;
            return {
                key: reference.key,
                title,
                description: description || mechanics.localizeTerm?.('ui.mechanicDetailsPending', locale, 'Mechanic details pending confirmation.')
            };
        }

        if (reference.kind === 'reusable') {
            const definition = mechanics.getEffectDefinition?.(reference.mechanicName);
            const title = definition?.termKey
                ? mechanics.localizeTerm?.(definition.termKey, locale, mechanics.getMechanicName?.(reference.mechanicName, locale) || reference.mechanicName)
                : (mechanics.getMechanicName?.(reference.mechanicName, locale) || reference.mechanicName);
            const description = mechanics.describeReusableMechanic?.(reference.mechanicName, locale);
            return {
                key: reference.key,
                title,
                description: description || mechanics.localizeTerm?.('ui.mechanicDetailsPending', locale, 'Mechanic details pending confirmation.')
            };
        }

        const mechanic = mechanics.getElementMechanic?.(reference.elementId, reference.kind, locale);
        if (!mechanic) return null;
        return {
            key: reference.key,
            title: mechanic.name,
            description: mechanics.describeElementMechanic?.(reference.elementId, reference.kind, locale) || ''
        };
    }

    function createMechanicButton(text, reference, locale, panel, titleNode, bodyNode) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'skill-mechanic-link';
        button.textContent = text;
        button.dataset.mechanicKey = reference.key;
        button.setAttribute('aria-expanded', 'false');

        button.addEventListener('click', () => {
            const detail = getMechanicDetail(reference, locale);
            if (!detail) return;

            const activeKey = panel.dataset.mechanicKey || '';
            const isSameOpen = panel.classList.contains('is-open') && activeKey === detail.key;

            panel.closest('.skill-description-section')?.querySelectorAll('.skill-mechanic-link[aria-expanded="true"]')
                .forEach(link => link.setAttribute('aria-expanded', 'false'));

            if (isSameOpen) {
                panel.classList.remove('is-open');
                panel.dataset.mechanicKey = '';
                return;
            }

            titleNode.textContent = detail.title;
            bodyNode.textContent = detail.description;
            panel.dataset.mechanicKey = detail.key;
            panel.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
        });

        return button;
    }

    function renderMechanicAwareLine(paragraph, line, locale, panel, titleNode, bodyNode) {
        const matches = findMechanicReferences(line, locale);
        if (!matches.length) {
            paragraph.textContent = line;
            return;
        }

        let cursor = 0;
        for (const match of matches) {
            if (match.start > cursor) paragraph.appendChild(document.createTextNode(line.slice(cursor, match.start)));
            const visibleText = line.slice(match.start, match.end);
            paragraph.appendChild(createMechanicButton(visibleText, match.candidate, locale, panel, titleNode, bodyNode));
            cursor = match.end;
        }
        if (cursor < line.length) paragraph.appendChild(document.createTextNode(line.slice(cursor)));
    }

    async function appendDescription(cat, key) {
        if (cat !== 'abilities' && cat !== 'passives') return;
        const stack = document.querySelector('#content .detail-stack');
        if (!stack) return;
        await ensureRuntime();
        const lines = await getDescriptionLines(cat, key);
        if (!lines.length) return;

        ensureMechanicStyles();
        const locale = getMechanicsLocale();

        const section = document.createElement('div');
        section.className = 'card detail-section skill-description-section';
        const heading = document.createElement('h2');
        heading.textContent = window.JOBMANIA_UI?.description || 'Description';
        section.appendChild(heading);

        const list = document.createElement('div');
        list.className = 'skill-description-list';

        const panel = document.createElement('div');
        panel.className = 'skill-mechanic-panel';
        panel.setAttribute('aria-live', 'polite');

        const panelHeader = document.createElement('div');
        panelHeader.className = 'skill-mechanic-panel-header';
        const panelTitle = document.createElement('h3');
        panelTitle.className = 'skill-mechanic-panel-title';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'skill-mechanic-panel-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.addEventListener('click', () => {
            panel.classList.remove('is-open');
            panel.dataset.mechanicKey = '';
            section.querySelectorAll('.skill-mechanic-link[aria-expanded="true"]')
                .forEach(link => link.setAttribute('aria-expanded', 'false'));
        });
        panelHeader.append(panelTitle, closeButton);

        const panelBody = document.createElement('p');
        panelBody.className = 'skill-mechanic-panel-body';
        panel.append(panelHeader, panelBody);

        lines.forEach(line => {
            const paragraph = document.createElement('p');
            paragraph.className = 'skill-description-line';
            renderMechanicAwareLine(paragraph, line, locale, panel, panelTitle, panelBody);
            list.appendChild(paragraph);
        });

        section.appendChild(list);
        section.appendChild(panel);
        stack.appendChild(section);
    }

    const originalLoadDetail = window.loadDetail;
    if (typeof originalLoadDetail === 'function') {
        window.loadDetail = async function (cat, key) {
            const result = await originalLoadDetail.apply(this, arguments);
            const normalizedCat = String(cat).toLowerCase();
            if (normalizedCat === 'abilities') {
                await ensureAbilityDescriptions();
                await appendDescription(normalizedCat, key);
            } else if (normalizedCat === 'passives') {
                await ensurePassiveDescriptions();
                await appendDescription(normalizedCat, key);
            }
            return result;
        };
    }
})();
