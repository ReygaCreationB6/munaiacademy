export const COUNTRY_PROFILES = {
    'Chad': {
        region: 'Africa',
        blocs: ['African Group', 'LDC', 'G77'],
        economicLevel: 'LDC',
        interests: ['climate finance', 'adaptation funding', 'LDC support', 'food security', 'water security', 'technology transfer'],
        redLines: ['mandatory emissions cuts for LDCs', 'reduction of development aid', 'external oversight of internal policy'],
        allies: ['Kenya', 'Senegal', 'Mali', 'Niger', 'Bangladesh', 'Maldives'],
        commitments: ['Paris Agreement', 'Kyoto Protocol', 'AU Agenda 2063', 'NDC under UNFCCC'],
        defaultPersonality: 'HUMANITARIAN'
    },
    'Germany': {
        region: 'Europe',
        blocs: ['European Union', 'Western European and Others Group'],
        economicLevel: 'Developed',
        interests: ['multilateralism', 'climate finance', 'EU cohesion', 'rule of law', 'human rights protection'],
        redLines: ['undermining EU common position', 'retreat from Paris Agreement', 'weakening UN mechanisms'],
        allies: ['France', 'Netherlands', 'Sweden', 'Canada', 'Brazil'],
        commitments: ['Paris Agreement', 'Kyoto Protocol', 'EU Green Deal', 'UNFCCC'],
        defaultPersonality: 'NEGOTIATOR'
    },
    'United States': {
        region: 'North America',
        blocs: ['Western European and Others Group', 'P5'],
        economicLevel: 'Developed',
        interests: ['national sovereignty', 'voluntary commitments', 'market-based solutions', 'innovation and technology'],
        redLines: ['binding emissions targets', 'mandatory climate reparations', 'supranational enforcement'],
        allies: ['United Kingdom', 'Australia', 'Japan', 'Israel', 'Canada'],
        commitments: ['Paris Agreement', 'UDHR', 'Kyoto Protocol (signed, not ratified)'],
        defaultPersonality: 'HARDLINER'
    },
    'China': {
        region: 'Asia-Pacific',
        blocs: ['G77', 'BRICS', 'P5'],
        economicLevel: 'Developing (upper)',
        interests: ['common but differentiated responsibilities', 'non-interference', 'South-South cooperation', 'development rights'],
        redLines: ['mandatory emission cuts that constrain development', 'external oversight of internal policy'],
        allies: ['Russia', 'Pakistan', 'Iran', 'Brazil', 'India'],
        commitments: ['Paris Agreement', 'CBDR principles', 'Belt and Road Initiative'],
        defaultPersonality: 'RESEARCHER'
    },
    'Kenya': {
        region: 'Africa',
        blocs: ['African Group', 'Commonwealth'],
        economicLevel: 'Developing',
        interests: ['adaptation', 'African representation', 'technology transfer', 'climate finance', 'biodiversity'],
        redLines: ['exclusion of African voices', 'unfair trade barriers', 'unfunded mandates'],
        allies: ['Chad', 'Senegal', 'South Africa', 'Nigeria', 'Brazil'],
        commitments: ['Paris Agreement', 'AU Agenda 2063', 'Nairobi Declaration'],
        defaultPersonality: 'COALITION_BUILDER'
    },
    'Brazil': {
        region: 'Latin America',
        blocs: ['GRULAC', 'BRICS', 'G20'],
        economicLevel: 'Developing (upper)',
        interests: ['rainforest protection', 'sustainable development', 'South-South cooperation', 'climate finance'],
        redLines: ['external control of Amazon', 'trade barriers', 'binding emissions targets'],
        allies: ['India', 'China', 'South Africa', 'Argentina', 'Germany'],
        commitments: ['Paris Agreement', 'Kyoto Protocol', 'Amazon Fund', 'Convention on Biological Diversity'],
        defaultPersonality: 'NEGOTIATOR'
    },
    'India': {
        region: 'Asia-Pacific',
        blocs: ['G77', 'BRICS', 'G20'],
        economicLevel: 'Developing (upper)',
        interests: ['common but differentiated responsibilities', 'development space', 'technology access', 'climate finance'],
        redLines: ['mandatory emission caps', 'carbon border tariffs', 'external oversight'],
        allies: ['Brazil', 'South Africa', 'China', 'Indonesia'],
        commitments: ['Paris Agreement', 'International Solar Alliance', 'NDC under UNFCCC'],
        defaultPersonality: 'COALITION_BUILDER'
    },
    'Maldives': {
        region: 'Asia-Pacific (SIDS)',
        blocs: ['Alliance of Small Island States', 'Commonwealth'],
        economicLevel: 'SIDS',
        interests: ['sea-level rise', 'adaptation', 'SIDS representation', 'climate finance', 'loss and damage'],
        redLines: ['temperature overshoot beyond 1.5°C', 'exclusion of SIDS voices', 'unambitious mitigation'],
        allies: ['Tuvalu', 'Marshall Islands', 'Bangladesh', 'Chad'],
        commitments: ['Paris Agreement', 'SAMOA Pathway', 'SIDS Accelerated Modalities'],
        defaultPersonality: 'HUMANITARIAN'
    }
};

export function profileFor(country) {
    return COUNTRY_PROFILES[country] || {
        region: 'Unknown',
        blocs: ['Non-Aligned'],
        economicLevel: 'Developing',
        interests: ['multilateral cooperation'],
        redLines: [],
        allies: [],
        commitments: ['UN Charter'],
        defaultPersonality: 'NEGOTIATOR'
    };
}