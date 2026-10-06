const db = {};
const localisation = {};
const localisationIndex = {};

const pageLocale = window.JOBMANIA_LOCALE || 'en';
const localeLanguageMap = {
    en: 'English',
    'zh-CN': 'Chinese',
    'zh-TW': 'Chinese (Traditional)'
};
let currentLang = localeLanguageMap[pageLocale] || 'English';

const files = ['abilities', 'jobs', 'monsters', 'passives', 'materials', 'relic', 'jobcraft'];
const localisationFiles = {
    abilities: 'abilities_localisation',
    jobs: 'jobs_localisation',
    monsters: 'monsters_localisation',
    passives: 'passives_localisation',
    materials: 'materials_localisation',
    relic: 'relic_localisation',
    chaptersSeries: 'chapters_series_localisation'
};
const entityKeyFields = {
    abilities: 'AbilityKey',
    jobs: 'JobKey',
    monsters: 'MonsterKey',
    passives: 'PassiveKey',
    materials: 'MaterialKey',
    relic: 'RelicKey',
    chaptersSeries: 'Key'
};

let detailHistory = [];
let currentDetail = null;
const monsterStructuredFields = new Set(['Random Passives', 'Random Abilities', 'Threshold Abilities', 'Special Case Abilities']);

function ui(key, fallback = '') { return window.JOBMANIA_UI?.[key] ?? fallback; }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;'); }
function hasStructuredValue(value) { if (Array.isArray(value)) return value.length > 0; if (value && typeof value === 'object') return Object.values(value).some(hasStructuredValue); return value !== null && value !== undefined && value !== ''; }

function entityKey(cat, item) {
    if (!item) return '';
    const field = entityKeyFields[cat];
    return field ? item[field] : Object.values(item)[0];
}

function buildLocalisationIndex(cat) {
    const field = entityKeyFields[cat];
    const map = new Map();
    for (const row of localisation[cat] || []) if (row?.[field]) map.set(row[field], row);
    localisationIndex[cat] = map;
}

function getLocalizedName(cat, key) {
    if (!key) return '';
    const row = localisationIndex[cat]?.get(key);
    return row ? (row[currentLang] || row.English || key) : key;
}

function detailLink(cat, key) {
    if (!key) return '';
    return `<span class="link" data-cat="${escapeHtml(cat)}" data-key="${escapeHtml(key)}" onclick="event.stopPropagation(); loadDetail(this.dataset.cat, this.dataset.key)">${escapeHtml(getLocalizedName(cat, key))}</span>`;
}

function infoRow(label, valueHtml, extraClass = '') {
    if (!valueHtml && valueHtml !== 0) return '';
    return `<div class="info-row ${extraClass}"><div class="info-label">${escapeHtml(label)}:</div><div class="info-value">${valueHtml}</div></div>`;
}

function renderLinkedList(values, cat) {
    if (!Array.isArray(values) || values.length === 0) return '';
    return values.map(value => detailLink(cat, value)).join('<span class="skill-separator"> · </span>');
}

function renderTieredAbilities(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    return Object.entries(value).filter(([, list]) => Array.isArray(list) && list.length).map(([label, list]) => infoRow(label, renderLinkedList(list, 'abilities'), 'skill-row')).join('');
}

function renderSpecialCaseAbilities(value) {
    if (!Array.isArray(value) || value.length === 0) return '';
    return value.filter(item => item && Array.isArray(item.abilities) && item.abilities.length).map(item => infoRow(item.condition || ui('condition', 'Condition'), renderLinkedList(item.abilities, 'abilities'), 'skill-row')).join('');
}

function renderAbilityIcon(iconKey, altText, sizeClass) {
    if (!iconKey) return '';
    return `<div class="card-media ${sizeClass}"><img src="iconimage/${encodeURIComponent(iconKey)}.png" alt="${escapeHtml(altText)}"></div>`;
}

function renderMaterialImage(materialKey, sizeClass) {
    if (!materialKey) return '';
    return `<div class="card-media ${sizeClass}"><img src="materialsprite/${encodeURIComponent(materialKey)}.png" alt="${escapeHtml(getLocalizedName('materials', materialKey))}" onerror="this.style.display='none'"></div>`;
}

function normalizeMaterialCombineList(material) {
    if (!material) return material;
    const raw = material['Combine List'];
    if (Array.isArray(raw)) return material;
    material['Combine List'] = raw ? String(raw).split('|').filter(Boolean).map(entry => {
        const i = entry.indexOf('-');
        if (i < 0) return null;
        return { Job: entry.slice(0, i).trim(), Result: entry.slice(i + 1).trim() };
    }).filter(item => item?.Job && item?.Result) : [];
    return material;
}

function normalizeMaterialData() { if (Array.isArray(db.materials)) db.materials = db.materials.map(normalizeMaterialCombineList); }
function renderMaterialCombineList(value) { return Array.isArray(value) ? value.map(item => `<div class="material-combine-row">${detailLink('jobs', item.Job)}<span class="material-combine-arrow">→</span>${detailLink('jobs', item.Result)}</div>`).join('') : ''; }

function craftEntityLink(cat, key) {
    if (!key) return '';
    const exists = (db[cat] || []).some(item => entityKey(cat, item) === key);
    return exists ? detailLink(cat, key) : `<span>${escapeHtml(getLocalizedName(cat, key))}</span>`;
}

function findCraftingPath(jobKey, visited = new Set()) {
    if (jobKey === 'Jobless') return [];
    if (visited.has(jobKey)) return null;
    const next = new Set(visited); next.add(jobKey);
    for (const recipe of (db.jobcraft || []).filter(r => r.ToJobKey === jobKey)) {
        const parent = findCraftingPath(recipe.FromJobKey, next);
        if (parent !== null) return [...parent, recipe];
    }
    return null;
}

function renderCraftRecipe(recipe) { return `<div class="craft-row">${craftEntityLink('jobs', recipe.FromJobKey)}<span class="craft-plus">+</span>${craftEntityLink('materials', recipe.MaterialKey)}<span class="craft-arrow">→</span>${craftEntityLink('jobs', recipe.ToJobKey)}</div>`; }
function renderCraftingPath(jobKey) { const path = findCraftingPath(jobKey); return Array.isArray(path) && path.length ? `<div class="craft-list">${path.map(renderCraftRecipe).join('')}</div>` : ''; }
function renderCraftsInto(jobKey) { const rows = (db.jobcraft || []).filter(r => r.FromJobKey === jobKey); return rows.length ? `<div class="craft-list">${rows.map(renderCraftRecipe).join('')}</div>` : ''; }

function splitKnownNames(raw, cat) {
    if (!raw) return [];
    const source = String(raw).replace(/--+/g, '-');
    const keyField = cat === 'passives' ? 'PassiveKey' : 'AbilityKey';
    const names = (db[cat] || []).map(item => item[keyField] || entityKey(cat, item)).filter(Boolean).sort((a, b) => b.length - a.length);
    const memo = new Map();
    function parseAt(index) {
        if (index === source.length) return [];
        if (memo.has(index)) return memo.get(index);
        for (const name of names) {
            if (source.slice(index, index + name.length).toLowerCase() !== String(name).toLowerCase()) continue;
            const next = index + name.length;
            if (next === source.length) return [name];
            if (source[next] === '-') {
                const tail = parseAt(next + 1);
                if (tail) return [name, ...tail];
            }
        }
        memo.set(index, null); return null;
    }
    return parseAt(0) || source.split('-').filter(Boolean);
}

function normalizeMonsterSkillPools(monster) {
    if ('Passives' in monster && !('Random Passives' in monster)) { monster['Random Passives'] = splitKnownNames(monster.Passives, 'passives'); delete monster.Passives; }
    if (typeof monster['Random Abilities'] === 'string') {
        const p = monster['Random Abilities'].split('|');
        monster['Random Abilities'] = Object.fromEntries(['100%', '99% to 50%', '49% to 30%', '29% to 1%'].map((label, i) => [label, splitKnownNames(p[i] || '', 'abilities')]));
    }
    if (typeof monster['Threshold Abilities'] === 'string') {
        const p = monster['Threshold Abilities'].split('|');
        monster['Threshold Abilities'] = Object.fromEntries([ui('enemyActFirst', 'Enemy act first'), ui('below50', 'Below 50%'), ui('below30', 'Below 30%')].map((label, i) => [label, splitKnownNames(p[i] || '', 'abilities')]));
    }
    if (typeof monster['Special Case Abilities'] === 'string') {
        monster['Special Case Abilities'] = monster['Special Case Abilities'] ? monster['Special Case Abilities'].split('|').filter(Boolean).map(entry => {
            const i = entry.indexOf(':');
            return { condition: i >= 0 ? entry.slice(0, i).trim() : '', abilities: splitKnownNames(i >= 0 ? entry.slice(i + 1) : entry, 'abilities') };
        }) : [];
    }
    return monster;
}
function normalizeMonsterData() { if (Array.isArray(db.monsters)) db.monsters = db.monsters.map(normalizeMonsterSkillPools); }

function renderMonsterSkillPools(data) {
    const groups = [];
    if (hasStructuredValue(data['Random Passives'])) groups.push(`<div class="skill-group">${infoRow(ui('randomPassives', 'Random Passives'), renderLinkedList(data['Random Passives'], 'passives'), 'skill-row')}</div>`);
    if (hasStructuredValue(data['Random Abilities'])) { const rows = renderTieredAbilities(data['Random Abilities']); if (rows) groups.push(`<div class="skill-group"><h3>${escapeHtml(ui('randomAbilities', 'Random Abilities'))}</h3>${rows}</div>`); }
    if (hasStructuredValue(data['Threshold Abilities'])) { const rows = renderTieredAbilities(data['Threshold Abilities']); if (rows) groups.push(`<div class="skill-group"><h3>${escapeHtml(ui('thresholdAbilities', 'Threshold Abilities'))}</h3>${rows}</div>`); }
    if (hasStructuredValue(data['Special Case Abilities'])) { const rows = renderSpecialCaseAbilities(data['Special Case Abilities']); if (rows) groups.push(`<div class="skill-group"><h3>${escapeHtml(ui('specialCaseAbilities', 'Special Case Abilities'))}</h3>${rows}</div>`); }
    return groups.join('');
}

function getRankEmoji(cat, key, value) {
    if (!value) return '';
    const val = String(value).toLowerCase().trim();
    if (cat === 'jobs' && key === 'Rarity') return ({1:' ⭐',2:' ⭐⭐',3:' ⭐⭐⭐',4:' ⭐⭐⭐⭐',5:' ⭐⭐⭐⭐⭐'})[val] || '';
    if (cat === 'monsters' && key === 'Difficulty') { if (val.includes('beginner')) return ' ⭐'; if (val.includes('easy')) return ' ⭐⭐'; if (val.includes('medium')) return ' ⭐⭐⭐'; if (val.includes('hard')) return ' ⭐⭐⭐⭐'; if (val.includes('boss')) return ' ⭐⭐⭐⭐⭐'; }
    if (cat === 'abilities' && key === 'Ability Tier') return ({low:' ⭐',medium:' ⭐⭐',high:' ⭐⭐⭐',master:' ⭐⭐⭐⭐',curse:' ⭐'})[val] || '';
    if (cat === 'passives' && key === 'Skill Rank') return ({low:' ⭐',medium:' ⭐⭐',high:' ⭐⭐⭐',master:' ⭐⭐⭐⭐'})[val] || '';
    return '';
}

function getDisplayKey(cat, originalKey) {
    if (!originalKey) return '';
    if (window.JOBMANIA_FIELD_LABELS?.[originalKey]) return window.JOBMANIA_FIELD_LABELS[originalKey];
    if (cat === 'jobs') {
        if (originalKey === 'AbilityKey') return ui('switchSkill', 'Switch Skill');
        if (originalKey.includes('AbilityKey')) return `${ui('deckAbility', 'Deck Ability')} ${originalKey.replace('AbilityKey', '').trim()}`.trim();
    }
    if (cat === 'monsters') {
        if (originalKey.includes('PassiveKey')) { const m = originalKey.match(/\d+/); return `${ui('passive', 'Passive')}${m ? parseInt(m[0]) : 1}`; }
        if (originalKey.includes('AbilityKey')) { const m = originalKey.match(/\d+/); return `${ui('ability', 'Ability')}${m ? parseInt(m[0]) : 1}`; }
        if (originalKey === 'MonsterKey') return ui('character', 'Character');
    }
    let key = originalKey.replace(/Key(_\d+)?$/, '').trim();
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

function referencedCategory(cat, key) {
    if (/AbilityKey/.test(key)) return 'abilities';
    if (/PassiveKey/.test(key)) return 'passives';
    if (/MonsterKey/.test(key)) return 'monsters';
    if (/JobKey|FromJobKey|ToJobKey/.test(key)) return 'jobs';
    if (/MaterialKey/.test(key)) return 'materials';
    if (/RelicKey/.test(key)) return 'relic';
    if (entityKeyFields[cat] === key) return cat;
    return null;
}

function renderFieldValue(cat, key, value, clickable = false) {
    const emoji = getRankEmoji(cat, key, value);
    if (emoji) return escapeHtml(emoji.trim());
    const refCat = referencedCategory(cat, key);
    if (refCat && typeof value === 'string') return clickable ? detailLink(refCat, value) : escapeHtml(getLocalizedName(refCat, value));
    return escapeHtml(value);
}

async function init() {
    const main = document.getElementById('content');
    main.innerHTML = `<h1>🔥 Jobmania Wiki</h1><p>🔄 ${escapeHtml(ui('loading', 'Loading data...'))}</p>`;
    try {
        const entityDataPromise = Promise.all(files.map(async f => {
            const res = await fetch(`data/${f}.json`);
            if (res.ok) db[f] = await res.json();
        }));
        const localisationPromise = Promise.all(Object.entries(localisationFiles).map(async ([cat, file]) => {
            const res = await fetch(`data/${file}.json`);
            if (res.ok) localisation[cat] = await res.json();
            buildLocalisationIndex(cat);
        }));
        await Promise.all([
            entityDataPromise,
            localisationPromise,
            window.JOBMANIA_PRELOAD_PROMISE || Promise.resolve()
        ]);
        normalizeMonsterData(); normalizeMaterialData(); loadView('Home');
    } catch (e) { console.error(e); main.innerHTML = `<h1>⚠️ ${escapeHtml(ui('error', 'Error'))}</h1><p>${escapeHtml(ui('refresh', 'Please refresh the page.'))}</p>`; }
}

function viewLabel(view) {
    return ({ Home: ui('home','Home'), Monsters: ui('characters','Characters'), Jobs: ui('jobs','Jobs'), Abilities: ui('abilities','Abilities'), Passives: ui('passives','Passives'), Materials: ui('materials','Materials'), Relic: ui('relicSystem','Relic System') })[view] || view;
}

function loadView(view) {
    detailHistory = []; currentDetail = null; window.lastView = view;
    const main = document.getElementById('content');
    const searchHtml = view !== 'Home' ? `<input type="text" id="searchInput" placeholder="${escapeHtml(ui('search','Search...'))}">` : '';
    if (view === 'Home') { main.innerHTML = window.JOBMANIA_HOME_HTML || `<h1>🔥 Jobmania - Eternal Dungeon</h1><div class="home-card"><h2>About this game</h2><p><strong>Pick a Hero and a job then embark on an eternal journey of dungeon descending.</strong></p><p>Acquire random abilities and jobs through the journey and build your own unique play style.<br><strong>How far can you go?</strong></p><h3>FEATURES</h3><ul><li>Rogue lite, procedural enemies and events generation.</li><li>Dungeon crawler, descend into the dungeon as much as you can.</li><li>Strategic deck building, build your own unique deck by adding abilities into your deck via chests and defeating enemies.</li><li>RPG Turn-based combat system, complex but easy to play. Defeat tons of different enemies, challenging but addictive.</li><li>Equip 3 jobs at once, swap, and use their abilities strategically for powerful synergy.</li><li>Combine jobs and materials to craft new unique jobs.</li><li>Get new heroes from Gacha, enemies defeated from the last run will appear in a special Gacha pool!</li><li>Collect special relics to enhance your build further.</li><li>A lot of Memes, Anime and Movies references in the game!</li><li>Free with ads and in-app purchases, remove all ads with one purchase.</li><li>Portrait screen only, you can play this game with one hand.</li></ul><p><strong>Join our Discord:</strong> <a href="https://discord.gg/6U5FNFVrwb" target="_blank">https://discord.gg/6U5FNFVrwb</a></p></div>`; return; }
    const cat = view.toLowerCase(), items = db[cat] || [];
    main.innerHTML = `<div class="header-card"><h1>${escapeHtml(viewLabel(view))}</h1><p><strong>${items.length} ${escapeHtml(ui('entries','entries'))}</strong></p>${searchHtml}</div><div class="grid" id="grid-container"></div>`;
    const container = document.getElementById('grid-container'), fragment = document.createDocumentFragment();
    items.forEach(item => {
        const key = entityKey(cat, item), display = getLocalizedName(cat, key);
        let html = `<div class="card list-card" data-key="${escapeHtml(key)}" onclick="loadDetail('${cat}', this.dataset.key)">`;
        if (cat === 'monsters') html += `<div class="card-media card-media-compact"><img src="charactersprite/${encodeURIComponent(key)}.png" alt="${escapeHtml(display)}"></div>`;
        if (cat === 'abilities') html += renderAbilityIcon(item.IconImage, display, 'card-media-compact');
        if (cat === 'materials') html += renderMaterialImage(key, 'card-media-compact');
        html += '<div class="info-list">';
        const hiddenListFields = new Set(window.JOBMANIA_HIDDEN_FIELDS?.[cat] || []);
        for (const [k,v] of Object.entries(item)) { if (!v || v === '') continue; if (hiddenListFields.has(k)) continue; if (cat === 'monsters' && monsterStructuredFields.has(k)) continue; if (cat === 'abilities' && k === 'IconImage') continue; if (cat === 'materials' && k === 'Combine List') continue; html += infoRow(getDisplayKey(cat,k), renderFieldValue(cat,k,v,false)); }
        html += '</div></div>';
        const wrap = document.createElement('div'); wrap.innerHTML = html; fragment.appendChild(wrap.firstElementChild);
    });
    container.appendChild(fragment); attachSearch();
}

function attachSearch() {
    const input = document.getElementById('searchInput'); if (!input) return;
    input.addEventListener('input', () => { const term = input.value.toLowerCase().trim(); document.querySelectorAll('.list-card').forEach(card => { card.style.display = card.textContent.toLowerCase().includes(term) || (card.dataset.key || '').toLowerCase().includes(term) ? '' : 'none'; }); });
}

async function loadDetail(cat, key, fromHistory = false) {
    const data = db[cat]?.find(item => entityKey(cat,item) === key); if (!data) return;
    if (!fromHistory && currentDetail) detailHistory.push(currentDetail); currentDetail = {cat,key};
    const title = getLocalizedName(cat,key);
    let media = '';
    if (cat === 'monsters') media = `<div class="card-media card-media-detail"><img src="charactersprite/${encodeURIComponent(key)}.png" alt="${escapeHtml(title)}"></div>`;
    if (cat === 'abilities') media = renderAbilityIcon(data.IconImage,title,'card-media-detail');
    if (cat === 'materials') media = renderMaterialImage(key,'card-media-detail');
    let html = `<button onclick="goBackToPreviousDetail()" class="back-btn">← ${escapeHtml(ui('back','Back'))}</button><div class="detail-stack"><div class="card detail-title-card">${media}<h3>${escapeHtml(title)}</h3></div>`;
    let basic = `<div class="card detail-section"><h2>${escapeHtml(ui('basicInfo','Basic Info'))}</h2><div class="info-list">`, extra = `<div class="card detail-section"><h2>${escapeHtml(ui('moreInfo','More Info'))}</h2><div class="info-list">`, hasExtra = false;
    const relicBasicFields = new Set(['RelicKey', 'Rarity', 'Lv10 HP', 'Lv10 Str', 'Lv10 Agi', 'Lv10 Int']);
    Object.entries(data).forEach(([k,v],idx) => { if (cat === 'monsters' && monsterStructuredFields.has(k)) return; if (cat === 'abilities' && k === 'IconImage') return; if (cat === 'materials' && (k === 'MaterialKey' || k === 'Combine List')) return; if (!v || v === '') return; const row = infoRow(getDisplayKey(cat,k),renderFieldValue(cat,k,v,true)); const isBasic = cat === 'relic' ? relicBasicFields.has(k) : idx < 6; if (isBasic) basic += row; else { extra += row; hasExtra = true; } });
    basic += '</div></div>'; extra += '</div></div>'; html += basic; if (hasExtra) html += extra;
    if (cat === 'materials' && hasStructuredValue(data['Combine List'])) { const rows = renderMaterialCombineList(data['Combine List']); if (rows) html += `<div class="card detail-section"><h2>${escapeHtml(ui('combineList','Combine List'))}</h2><div class="material-combine-guide"><strong>${escapeHtml(title)} + ${escapeHtml(ui('job','Job'))} → ${escapeHtml(ui('craftedJob','Crafted Job'))}</strong></div><div class="material-combine-list">${rows}</div></div>`; }
    if (cat === 'monsters') { const pools = renderMonsterSkillPools(data); if (pools) html += `<div class="card detail-section skill-pools"><h2>${escapeHtml(ui('enemySkillPools','Enemy Skill Pools'))}</h2>${pools}</div>`; }
    if (cat !== 'relic' && cat !== 'materials') {
        const usedBy = [];
        ['monsters','jobs'].forEach(sourceCat => (db[sourceCat] || []).forEach(item => { const name = entityKey(sourceCat,item); if (Object.values(item).includes(key) && name !== key) usedBy.push({cat:sourceCat,name}); }));
        if (usedBy.length) { html += `<div class="card detail-section"><h2>${escapeHtml(ui('usedBy','Used By'))}</h2><div class="used-by-list">`; usedBy.forEach(u => { html += `<div class="used-by-item link" data-cat="${escapeHtml(u.cat)}" data-key="${escapeHtml(u.name)}" onclick="loadDetail(this.dataset.cat, this.dataset.key)">${u.cat === 'monsters' ? '👹' : '⚔️'} ${escapeHtml(getLocalizedName(u.cat,u.name))}</div>`; }); html += '</div></div>'; }
    }
    if (cat === 'jobs') { const path = renderCraftingPath(key); if (path) html += `<div class="card detail-section"><h2>${escapeHtml(ui('craftingPath','Crafting Path'))}</h2>${path}</div>`; const into = renderCraftsInto(key); if (into) html += `<div class="card detail-section"><h2>${escapeHtml(ui('craftsInto','Crafts Into'))}</h2>${into}</div>`; }
    html += '</div>'; document.getElementById('content').innerHTML = html; window.scrollTo(0,0);
}

function goBackToPreviousDetail() { const prev = detailHistory.pop(); if (prev) { loadDetail(prev.cat,prev.key,true); return; } if (currentDetail) loadView(currentDetail.cat.charAt(0).toUpperCase() + currentDetail.cat.slice(1)); }
function toggleMenu() { document.querySelector('nav').classList.toggle('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('menu-item') && window.innerWidth <= 768) document.querySelector('nav').classList.remove('open'); });
function createFireParticle(x,y) { const trail = document.getElementById('fire-trail') || createTrailContainer(); const p = document.createElement('div'); p.className='fire-particle'; p.style.left=`${x}px`; p.style.top=`${y}px`; p.style.background=`hsl(${Math.random()*30+15}, 100%, 60%)`; trail.appendChild(p); setTimeout(()=>p.remove(),1000); }
function createTrailContainer() { const c=document.createElement('div'); c.id='fire-trail'; document.body.appendChild(c); return c; }
function createFireBurst(x,y) { const b=document.createElement('div'); b.className='fire-burst'; b.style.left=`${x}px`; b.style.top=`${y}px`; document.body.appendChild(b); setTimeout(()=>b.remove(),600); }
document.addEventListener('mousemove',e=>{ if (Math.random()>0.35) createFireParticle(e.clientX,e.clientY); });
document.addEventListener('click',e=>{ createFireBurst(e.clientX,e.clientY); setTimeout(()=>createFireBurst(e.clientX+12,e.clientY+8),60); setTimeout(()=>createFireBurst(e.clientX-10,e.clientY-10),120); });

if (!window.JOBMANIA_DEFER_INIT) init();

// Ability AP-cost support (consolidated from ability-cost.js).
/**
 * Jobmania Ability Cost Engine
 * Loads supplemental base AP costs without modifying data/abilities.json.
 * Display wording/localisation is handled by wiki-localisation.js.
 */
(function (root) {
  'use strict';

  let data = null;
  let costMap = new Map();
  let loadPromise = null;

  function checkAnchors(source, abilities) {
    const alignment = source?.alignment || {};
    if (!Array.isArray(abilities) || !Array.isArray(source?.costs)) return false;

    for (const anchor of alignment.anchors || []) {
      const index = Number(anchor?.index);
      if (!Number.isInteger(index) || index < 0 || index >= abilities.length) return false;
      if (abilities[index]?.AbilityKey !== anchor.key) return false;
    }
    return true;
  }

  async function load(costUrl, abilitiesUrl) {
    if (data) return data;
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all([
      fetch(costUrl || 'data/ability_costs.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load ability costs: HTTP ${r.status}`);
        return r.json();
      }),
      fetch(abilitiesUrl || 'data/abilities.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load ability keys: HTTP ${r.status}`);
        return r.json();
      })
    ]).then(([source, abilities]) => {
      if (!Array.isArray(source?.costs) || !Array.isArray(abilities)) {
        throw new Error('Invalid Ability cost data.');
      }

      // Keep anchors as a warning only. The source sheet may gain or lose blank
      // trailing rows, and that must never disable AP display for every Ability.
      if (!checkAnchors(source, abilities)) {
        console.warn('Ability cost alignment anchors do not fully match data/abilities.json; mapping available indexed costs anyway.');
      }

      data = source;
      costMap = new Map();
      abilities.forEach((ability, index) => {
        const key = ability?.AbilityKey;
        if (!key) return;
        const rawCost = source.costs[index];
        if (rawCost == null || rawCost === '') {
          costMap.set(key, null);
          return;
        }
        const cost = Number(rawCost);
        costMap.set(key, Number.isFinite(cost) ? cost : null);
      });
      return data;
    }).catch(error => {
      console.error(error);
      loadPromise = null;
      costMap = new Map();
      return null;
    });

    return loadPromise;
  }

  function getCost(abilityKey) {
    if (!costMap.has(abilityKey)) return null;
    const value = costMap.get(abilityKey);
    return Number.isFinite(value) ? value : null;
  }

  function getInfo(abilityKey) {
    const cost = getCost(abilityKey);
    if (cost == null) return null;
    return { abilityKey, baseCost: cost };
  }

  root.JobmaniaAbilityCost = {
    load,
    getCost,
    getInfo,
    get data() { return data; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);


// Wiki localisation and Relic rendering (consolidated from wiki-localisation.js).
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
        const engine = window.JobmaniaAbilityCost;
        abilityCostPromise = engine?.load
            ? engine.load('data/ability_costs.json', 'data/abilities.json').then(() => engine)
            : Promise.resolve(null);
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


// Job media rendering (consolidated from job-media.js).
(() => {
    function jobImage(jobName, detail = false) {
        const wrap = document.createElement('div');
        wrap.className = `card-media ${detail ? 'card-media-detail' : 'card-media-compact'} job-media`;
        const img = document.createElement('img');
        img.src = `jobsprite/${encodeURIComponent(jobName)}.png`;
        img.alt = jobName;
        img.loading = 'lazy';
        img.onerror = () => wrap.remove();
        wrap.appendChild(img);
        return wrap;
    }

    function decorateJobList() {
        document.querySelectorAll('.list-card[data-key]').forEach(card => {
            if (card.querySelector('.job-media')) return;
            card.prepend(jobImage(card.dataset.key, false));
        });
    }

    function decorateJobDetail(jobName) {
        const titleCard = document.querySelector('.detail-title-card');
        if (!titleCard || titleCard.querySelector('.job-media')) return;
        titleCard.prepend(jobImage(jobName, true));
    }

    const originalLoadView = window.loadView;
    window.loadView = function(view) {
        const result = originalLoadView.apply(this, arguments);
        if (String(view).toLowerCase() === 'jobs') decorateJobList();
        return result;
    };

    const originalLoadDetail = window.loadDetail;
    window.loadDetail = async function(cat, key) {
        const result = await originalLoadDetail.apply(this, arguments);
        if (String(cat).toLowerCase() === 'jobs') decorateJobDetail(key);
        return result;
    };
})();
