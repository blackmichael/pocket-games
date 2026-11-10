// Metadata only. Never import a game's implementation or dictionary here.
export const games = [
  {
    id: 'fivefold',
    title: 'Fivefold',
    category: 'Words & deduction',
    description: 'Guess the five-letter word in six tries.',
    preview: {
      src: '/previews/fivefold.webp',
      alt: 'Fivefold board with letter guesses and green, yellow, and gray feedback.'
    },
    duration: '3–5 minutes',
    href: '/games/fivefold/'
  },
  {
    id: 'kings',
    title: 'Kings',
    category: 'Logic',
    description: 'Place ten kings without sharing any land.',
    preview: {
      src: '/previews/kings.webp',
      alt: 'Kings board with crowns placed in different colored regions.'
    },
    duration: '2–5 minutes',
    href: '/games/kings/'
  },
  {
    id: 'sunmoon',
    title: 'Catdog',
    category: 'Logic',
    description: 'Balance Poppy and Pigeon using neighbor clues.',
    preview: {
      src: '/previews/catdog.webp',
      alt: 'Six-by-six Catdog board with tan dog and gray-and-white cat portraits, and equals and cross clues.'
    },
    duration: '3–7 minutes',
    href: '/games/catdog/'
  }
] as const;
