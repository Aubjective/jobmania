// Preload mechanics/description resources before the wiki becomes interactive.
(function () {
    'use strict';

    const urls = [
        'skillunit.js',
        'mechanics.js',
        'data/mechanics.json',
        'data/mechanics_localisation.json',
        'data/abilities_description.json',
        'data/passives_description.json',
        'data/abilities_description_localisation.json',
        'data/passives_description_localisation.json',
        'data/apply_tags.json',
        'data/apply_tags_abilities_0.json',
        'data/apply_tags_abilities_1.json',
        'data/apply_tags_abilities_2.json',
        'data/apply_tags_abilities_3.json',
        'data/apply_tags_abilities_4.json',
        'data/apply_tags_passives.json',
        'data/ability_costs.json',
        'data/delivery_patterns.json',
        'data/relic_passives.json',
        'data/relic_passive_localisation.json'
    ];

    window.JOBMANIA_PRELOAD_PROMISE = Promise.allSettled(
        urls.map(url => fetch(url, { cache: 'force-cache' }))
    ).then(results => {
        const failed = results
            .map((result, index) => ({ result, url: urls[index] }))
            .filter(item => item.result.status === 'rejected' || !item.result.value?.ok);

        if (failed.length) {
            console.warn('Some Jobmania support resources could not be preloaded:', failed.map(item => item.url));
        }

        return { total: urls.length, failed: failed.map(item => item.url) };
    });
})();
