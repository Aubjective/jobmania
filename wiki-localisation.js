// Shared wiki-only localisation helpers.
// Game entity names/descriptions continue to come from *_localisation.json files.
(function () {
    'use strict';

    const originalGetDisplayKey = window.getDisplayKey;
    const originalRenderFieldValue = window.renderFieldValue;
    const originalLoadDetail = window.loadDetail;

    // Relic passive wiki layer. Raw IDs and compatibility fields stay internal.
    window.JOBMANIA_HIDDEN_FIELDS = window.JOBMANIA_HIDDEN_FIELDS || {};
    window.JOBMANIA_HIDDEN_FIELDS.relic = ['RelicId', 'InnatePassiveId'];

    let relicPassiveDataPromise = null;
    function ensureRelicPassiveData() {
        if (relicPassiveDataPromise) return relicPassiveDataPromise;
        relicPassiveDataPromise = Promise.all([
            fetch('data/relic_passives.json').then(r => r.ok ? r.json() : []),
            fetch('data/relic_passive_localisation.json').then(r => r.ok ? r.json() : [])
        ]).then(([passives, terms]) => ({ passives, terms }));
        return relicPassiveDataPromise;
    }

    function relicPassiveTerm(rows, key) {
        if (!key) return '';
        const row = rows.find(item => item.Key === key);
        const lang = ({ en: 'English', 'zh-CN': 'Chinese', 'zh-TW': 'Chinese (Traditional)' })[window.JOBMANIA_LOCALE || 'en'] || 'English';
        return row?.[lang] || row?.English || key;
    }

    function formatRelicPassive(passive, terms) {
        if (!passive) return '';
        const parts = [relicPassiveTerm(terms, passive.SkillType), relicPassiveTerm(terms, passive.EffectType)];
        if (Number(passive.Multiplier) !== 0) parts.push(String(passive.Multiplier));
        return parts.filter(Boolean).join(' · ');
    }

    async function insertRelicPassives(relicKey) {
        const relic = typeof db !== 'undefined' ? db.relic?.find(item => item.RelicKey === relicKey) : null;
        if (!relic) return;
        const stack = document.querySelector('#content .detail-stack');
        if (!stack || stack.querySelector('.relic-passives-section')) return;

        const { passives, terms } = await ensureRelicPassiveData();
        const rarity = String(relic.Rarity || '');
        const specialType = String(relic.SpecialType || '');
        const compatible = passives.filter(p =>
            Array.isArray(p.Rarities) && p.Rarities.includes(rarity) &&
            (specialType ? (!p.Type || p.Type === specialType) : !p.Type)
        );
        const innate = passives.find(p => Number(p.RelicPassiveId) === Number(relic.InnatePassiveId));
        const t = window.JOBMANIA_T || ((key) => key);
        const passiveText = p => escapeHtml(formatRelicPassive(p, terms));
        const poolRows = compatible.length
            ? compatible.map(p => '<li>' + passiveText(p) + '</li>').join('')
            : '<li>—</li>';

        const section = document.createElement('div');
        section.className = 'card detail-section relic-passives-section';
        section.innerHTML =
            '<h2>' + escapeHtml(t('Relic Passives', 'Relic Passives')) + '</h2>' +
            '<div class="relic-passive-group relic-passive-pool">' +
                '<h3>' + escapeHtml(t('Compatible Passive Pool', 'Compatible Passive Pool')) + '</h3>' +
                '<details>' +
                    '<summary>' + compatible.length + ' ' + escapeHtml(t('possible passives', 'possible passives')) + '</summary>' +
                    '<ul class="relic-passive-list">' + poolRows + '</ul>' +
                '</details>' +
            '</div>';
        const moreInfo = Array.from(stack.querySelectorAll('.detail-section')).find(card =>
            card.querySelector('h2')?.textContent?.trim() === (window.JOBMANIA_UI?.moreInfo || 'More Info')
        );
        const moreInfoList = moreInfo?.querySelector('.info-list');
        if (moreInfoList) {
            const innateValue = innate ? passiveText(innate) : escapeHtml(t('None', 'None'));
            moreInfoList.insertAdjacentHTML('beforeend', infoRow(t('Innate Passive', 'Innate Passive'), innateValue));
        }

        stack.appendChild(section);
    }

    const relicReferenceFields = {
        'Craft Material x1': 'materials',
        'Craft Ability x5': 'abilities'
    };

    // Official Localization / Words key: CostXAP
    const costXAPTemplates = {
        en: 'Cost {0} AP',
        'zh-CN': '消耗{0}AP',
        'zh-TW': '消耗{0}AP'
    };

    let abilityCostPromise = null;
    let currentAbilityCostKey = null;

    function loadScriptOnce(src, globalName) {
        if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
        const existing = Array.from(document.scripts).find(script => {
            const value = script.getAttribute('src') || '';
            return value === src || value.endsWith('/' + src);
        });
        if (existing) {
            if (!globalName || window[globalName]) return Promise.resolve(window[globalName]);
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
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

    async function ensureAbilityCost() {
        if (abilityCostPromise) return abilityCostPromise;
        abilityCostPromise = loadScriptOnce('ability-cost.js', 'JobmaniaAbilityCost')
            .then(engine => engine?.load ? engine.load('data/ability_costs.json', 'data/abilities.json').then(() => engine) : engine)
            .catch(error => {
                console.error('Failed to load Ability AP costs:', error);
                abilityCostPromise = null;
                return null;
            });
        return abilityCostPromise;
    }

    // Delivery wording is a reusable SkillUnit description layer. It stays plain
    // text in the wiki; only underlying combat mechanics are clickable. Preload
    // skillunit.js here so delivery rules are installed deterministically before
    // the description renderer asks the SkillUnit engine for output.
    Promise.all([
        loadScriptOnce('delivery-patterns.js', 'JobmaniaDeliveryPatterns'),
        loadScriptOnce('skillunit.js', 'JobmaniaSkillUnit')
    ]).then(async ([delivery, skillunit]) => {
        if (delivery?.load) await delivery.load('data/delivery_patterns.json');
        delivery?.install?.(skillunit);
    }).catch(error => console.error('Failed to load delivery patterns:', error));

    function fieldLabel(cat, key) {
        if (cat === 'abilities' && key === 'AbilityKey') return window.JOBMANIA_UI?.ability || 'Ability';
        if (cat === 'passives' && key === 'PassiveKey') return window.JOBMANIA_UI?.passive || 'Passive';
        if (cat === 'relic' && key === 'RelicKey') return window.JOBMANIA_UI?.relic || 'Relic';
        if (cat === 'relic') {
            const t = window.JOBMANIA_T || ((value, fallback) => fallback || value);
            if (key === 'SpecialType') return t('Special Type', 'Special Type');
            if (key === 'Craft Material x1') return t('Craft Material', 'Craft Material');
            if (key === 'Craft Ability x5') return t('Craft Ability', 'Craft Ability');
            if (key === 'Series') return t('Series', 'Series');
            if (key === 'SpecificChapter') return t('Chapter', 'Chapter');
        }

        const statMatch = String(key).match(/^(Lv\d+)\s+(HP|Str|Agi|Int)$/);
        if (statMatch && window.JOBMANIA_STAT_LABELS?.[statMatch[2]]) {
            return `${statMatch[1]} ${window.JOBMANIA_STAT_LABELS[statMatch[2]]}`;
        }

        return window.JOBMANIA_FIELD_LABELS?.[key] || null;
    }

    function translateValue(field, value) {
        const fieldMap = window.JOBMANIA_VALUE_LABELS?.[field];
        if (!fieldMap) return value;
        const raw = String(value);
        return fieldMap[raw] ?? fieldMap[raw.toLowerCase()] ?? value;
    }

    function renderRelicReference(cat, key, value, clickable) {
        if (cat !== 'relic' || typeof value !== 'string' || !value) return null;
        const refCat = relicReferenceFields[key];
        if (!refCat) {
            if (key !== 'Series' && key !== 'SpecificChapter') return null;
            const localized = typeof window.getLocalizedName === 'function'
                ? window.getLocalizedName('chaptersSeries', value)
                : value;
            return typeof window.escapeHtml === 'function' ? window.escapeHtml(localized) : String(localized);
        }

        if (clickable && typeof window.detailLink === 'function') {
            return window.detailLink(refCat, value);
        }

        const localized = typeof window.getLocalizedName === 'function'
            ? window.getLocalizedName(refCat, value)
            : value;

        return typeof window.escapeHtml === 'function'
            ? window.escapeHtml(localized)
            : String(localized);
    }

    if (typeof originalGetDisplayKey === 'function') {
        window.getDisplayKey = function (cat, key) {
            return fieldLabel(cat, key) || originalGetDisplayKey.apply(this, arguments);
        };
    }

    if (typeof originalRenderFieldValue === 'function') {
        window.renderFieldValue = function (cat, key, value, clickable) {
            if (cat === 'abilities' && key === 'Ability Tier' && String(value).toLowerCase().trim() === 'curse') {
                return '☆';
            }

            const relicReference = renderRelicReference(cat, key, value, clickable);
            if (relicReference !== null) return relicReference;

            const rendered = originalRenderFieldValue.apply(this, arguments);
            const emoji = typeof window.getRankEmoji === 'function' ? window.getRankEmoji(cat, key, value) : '';
            if (emoji) return rendered;

            const translated = translateValue(key, value);
            if (translated === value) return rendered;

            return typeof window.escapeHtml === 'function'
                ? window.escapeHtml(translated)
                : String(translated);
        };
    }

    function removeHiddenRows(cat) {
        const hidden = new Set(window.JOBMANIA_HIDDEN_FIELDS?.[cat] || []);
        if (!hidden.size) return;

        document.querySelectorAll('#content .info-row').forEach(row => {
            const label = row.querySelector('.info-label')?.textContent?.replace(/:\s*$/, '').trim();
            if (label && hidden.has(label)) row.remove();
        });
    }

    function normalizeCostLocale(locale) {
        const raw = String(locale || 'en').trim().toLowerCase();
        if (raw === 'zh-cn' || raw === 'zh_hans' || raw === 'zh-hans' || raw === 'simplified chinese') return 'zh-CN';
        if (raw === 'zh-tw' || raw === 'zh_hant' || raw === 'zh-hant' || raw === 'traditional chinese') return 'zh-TW';
        return 'en';
    }

    function formatAbilityCost(cost) {
        const locale = normalizeCostLocale(window.JOBMANIA_LOCALE || 'en');
        const template = costXAPTemplates[locale] || costXAPTemplates.en;
        return template.replace('{0}', String(cost));
    }

    async function insertAbilityCost(abilityKey) {
        if (!abilityKey) return;
        const engine = await ensureAbilityCost();
        const info = engine?.getInfo?.(abilityKey);
        if (!info) return;

        const descriptionList = document.querySelector('#content .skill-description-section .skill-description-list');
        if (!descriptionList || descriptionList.querySelector('.ability-ap-cost-row')) return;

        const line = document.createElement('p');
        line.className = 'skill-description-line ability-ap-cost-row';
        line.textContent = formatAbilityCost(info.baseCost);
        descriptionList.appendChild(line);
    }

    // Expose one shared hook so other wiki renderers can request AP insertion
    // without owning AP data or localisation.
    window.JobmaniaInsertAbilityCost = insertAbilityCost;

    // Primary path: decorate the shared detail loader.
    if (typeof originalLoadDetail === 'function') {
        window.loadDetail = async function (cat, key) {
            const result = await originalLoadDetail.apply(this, arguments);
            const normalizedCat = String(cat).toLowerCase();
            removeHiddenRows(normalizedCat);
            if (normalizedCat === 'abilities') {
                currentAbilityCostKey = key;
                await insertAbilityCost(key);
            } else {
                currentAbilityCostKey = null;
            }
            if (normalizedCat === 'relic') await insertRelicPassives(key);
            return result;
        };
    }

    // Capture inline/core Ability navigation so AP rendering does not depend on
    // whether the page calls the lexical loadDetail binding or window.loadDetail.
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('[data-key]') : null;
        if (!target) return;

        const explicitCat = String(target.dataset.cat || '').toLowerCase();
        const listAbility = target.classList.contains('list-card') && String(window.lastView || '').toLowerCase() === 'abilities';
        if (explicitCat !== 'abilities' && !listAbility) return;

        const abilityKey = target.dataset.key;
        if (!abilityKey) return;
        currentAbilityCostKey = abilityKey;
    }, true);

    // Description is appended asynchronously by skill-description-wiki.js.
    // Observe the content container and insert AP as soon as that section exists.
    const content = document.getElementById('content');
    if (content && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            if (!currentAbilityCostKey) return;
            if (!content.querySelector('.skill-description-section .skill-description-list')) return;
            insertAbilityCost(currentAbilityCostKey)
                .catch(error => console.error('Failed to insert Ability AP cost:', error));
        });
        observer.observe(content, { childList: true, subtree: true });
    }
})();
