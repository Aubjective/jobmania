// Hash-based routing for shareable wiki views and browser Back/Forward navigation.
(function () {
    'use strict';

    const rawLoadView = window.loadView;
    const rawLoadDetail = window.loadDetail;
    const validViews = new Map([
        ['home', 'Home'],
        ['monsters', 'Monsters'],
        ['jobs', 'Jobs'],
        ['abilities', 'Abilities'],
        ['passives', 'Passives'],
        ['materials', 'Materials'],
        ['relic', 'Relic']
    ]);
    const validCategories = new Set(['monsters', 'jobs', 'abilities', 'passives', 'materials', 'relic']);

    let applyingRoute = false;
    let bootstrapped = false;
    let lastHandledHref = '';

    function viewHash(view) {
        return `#/${String(view || 'Home').toLowerCase()}`;
    }

    function detailHash(cat, key) {
        return `#/${cat}/${encodeURIComponent(key)}`;
    }

    function parseHash() {
        const raw = (window.location.hash || '').replace(/^#\/?/, '');
        if (!raw) return { type: 'view', view: 'Home' };
        const parts = raw.split('/');
        const first = String(parts[0] || '').toLowerCase();
        if (!validViews.has(first)) return null;
        if (parts.length === 1) return { type: 'view', view: validViews.get(first) };
        if (!validCategories.has(first)) return null;
        const key = decodeURIComponent(parts.slice(1).join('/'));
        return key ? { type: 'detail', cat: first, key } : { type: 'view', view: validViews.get(first) };
    }

    function renderRoute(route) {
        if (!route) return false;
        applyingRoute = true;
        try {
            if (route.type === 'detail') rawLoadDetail(route.cat, route.key);
            else rawLoadView(route.view);
        } finally {
            applyingRoute = false;
        }
        lastHandledHref = window.location.href;
        return true;
    }

    function navigate(hash, replace = false) {
        if (window.location.hash === hash) {
            renderRoute(parseHash());
            return;
        }

        const currentDepth = Number(history.state?.jobmaniaDepth || 0);
        const state = {
            ...(history.state || {}),
            jobmaniaRoute: true,
            jobmaniaDepth: replace ? currentDepth : currentDepth + 1
        };

        if (replace) history.replaceState(state, '', hash);
        else history.pushState(state, '', hash);
        renderRoute(parseHash());
    }

    function applyCurrentHash() {
        const route = parseHash();
        if (!route || !window.location.hash) {
            history.replaceState({ ...(history.state || {}), jobmaniaRoute: true, jobmaniaDepth: 0 }, '', '#/home');
            renderRoute({ type: 'view', view: 'Home' });
            return;
        }

        history.replaceState({ ...(history.state || {}), jobmaniaRoute: true, jobmaniaDepth: 0 }, '', window.location.href);
        renderRoute(route);
    }

    window.loadView = function (view) {
        if (applyingRoute) return rawLoadView(view);

        // init() finishes by opening Home. Use that moment to honor an incoming deep link.
        if (!bootstrapped) {
            bootstrapped = true;
            applyCurrentHash();
            return;
        }
        navigate(viewHash(view));
    };

    window.loadDetail = function (cat, key) {
        if (applyingRoute) return rawLoadDetail(cat, key);
        if (!validCategories.has(cat) || !key) return;
        navigate(detailHash(cat, key));
    };

    window.goBackToPreviousDetail = function () {
        if (Number(history.state?.jobmaniaDepth || 0) > 0) {
            history.back();
            return;
        }
        const route = parseHash();
        if (route?.type === 'detail') window.loadView(validViews.get(route.cat) || 'Home');
        else window.loadView('Home');
    };

    function handleHistoryNavigation() {
        if (!bootstrapped || lastHandledHref === window.location.href) return;
        const route = parseHash();
        if (route) renderRoute(route);
        else navigate('#/home', true);
    }

    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHistoryNavigation);
})();
