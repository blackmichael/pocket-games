// Metadata only. Never import a game's implementation or dictionary here.
export const games = [
  {
    id: 'fivefold',
    title: 'Fivefold',
    category: 'Words & deduction',
    description: 'Guess the five-letter word in six tries.',
    duration: '3–5 minutes',
    href: '/games/fivefold/'
  },
  {
    id: 'kings',
    title: 'Kings',
    category: 'Logic',
    description: 'Place ten kings without sharing any land.',
    duration: '2–5 minutes',
    href: '/games/kings/'
  }
] as const;
