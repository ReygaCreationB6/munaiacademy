export const lessons = [
    { id: 'b1', level: 'Beginner', title: 'What is MUN?', desc: 'Model United Nations explained from zero.' },
    { id: 'b2', level: 'Beginner', title: 'The UN and its organs', desc: 'GA, SC, ECOSOC, and specialised agencies.' },
    { id: 'b3', level: 'Beginner', title: 'Committees & delegates', desc: 'Who does what in a committee room.' },
    { id: 'b4', level: 'Beginner', title: 'The Chair', desc: 'Role of the Chair and the Dais.' },
    { id: 'b5', level: 'Beginner', title: 'Resolutions & position papers', desc: 'Core written outputs of MUN.' },
    { id: 'b6', level: 'Beginner', title: 'Caucuses: moderated & unmoderated', desc: 'The two main debate formats.' },
    { id: 'b7', level: 'Beginner', title: 'Motions, points & POIs', desc: 'Parliamentary procedure basics.' },

    { id: 'i1', level: 'Intermediate', title: 'Setting the agenda', desc: 'Opening debate and choosing the topic order.' },
    { id: 'i2', level: 'Intermediate', title: 'The General Speakers List', desc: 'How the GSL works and how to use it.' },
    { id: 'i3', level: 'Intermediate', title: 'Bloc formation', desc: 'Finding allies and building coalitions.' },
    { id: 'i4', level: 'Intermediate', title: 'Drafting operative clauses', desc: 'Action, actor, mechanism, funding, timeline.' },
    { id: 'i5', level: 'Intermediate', title: 'Amendments', desc: 'Friendly vs unfriendly; how to pass them.' },
    { id: 'i6', level: 'Intermediate', title: 'Lobbying & negotiation', desc: 'Working the room during unmoderated caucus.' },

    { id: 'a1', level: 'Advanced', title: 'Strategic diplomacy', desc: 'Long-game positioning and leverage.' },
    { id: 'a2', level: 'Advanced', title: 'Crisis committees', desc: 'Fast-moving, dynamic crisis arcs.' },
    { id: 'a3', level: 'Advanced', title: 'Advanced rhetoric', desc: 'Framing, narrative, and persuasion.' },
    { id: 'a4', level: 'Advanced', title: 'Handling hostile POIs', desc: 'Redirect, reframe, recover.' },
    { id: 'a5', level: 'Advanced', title: 'Resolution architecture', desc: 'Designing a resolution that actually passes.' }
];

/* ------------------------------------------------------------------ */
/* Custom lessons (populated at boot from /api/content/lessons)        */
/* ------------------------------------------------------------------ */

let customLessons = [];

export function registerCustomLessons(list) {
    if (!Array.isArray(list)) return;
    customLessons = list.filter(l => l && l.id && l.title).map(l => ({
        id: String(l.id),
        level: l.level || 'Beginner',
        title: String(l.title),
        desc: String(l.desc || l.description || ''),
        content: String(l.content || ''),
        custom: true
    }));
}

export function getLessons() {
    return customLessons.length ? [...lessons, ...customLessons] : lessons;
}

export function lessonsByLevel() {
    return getLessons().reduce((acc, l) => {
        (acc[l.level] ||= []).push(l);
        return acc;
    }, {});
}