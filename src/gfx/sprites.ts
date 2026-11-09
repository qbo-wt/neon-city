/** Pixel-art sprites as character grids. Each char maps to a palette colour; '.' is transparent. */
export const PALETTE: Record<string, string> = {
  k: '#05030f', // outline
  c: '#00f0ff', C: '#007a8a', // cyan / dark cyan
  m: '#ff2a6d', M: '#8a1038', // magenta / dark magenta
  y: '#f5e663', Y: '#a89a2a', // yellow / dark yellow
  w: '#e8e8ff', g: '#3a3550', G: '#221d35',
  s: '#c98f6b', S: '#8a5a3a', h: '#e8b896', r: '#ff3b3b', p: '#6a2cff', P: '#36167f', e: '#39ff88',
  v: '#a8a6d8', n: '#0b4652', // player: hair shade, deep coat teal
  d: '#5e3b26', // dark skin shade
};

export const SPRITES: Record<string, string[]> = {
  chest: [
    '..kkkkkkkkkkkk..',
    '.kMMMMMMMMMMMMk.',
    '.kMmmmmmmmmmmMk.',
    '.kkkkkkyykkkkkk.',
    '.kggggkyykggggk.',
    '.kggggkkkkggggk.',
    '.kggggggggggggk.',
    '.kkkkkkkkkkkkkk.',
  ],
  'implant-pickup': [
    '..kkkkkkkk..',
    '.kCCCCCCCCk.',
    'kCcckcckcckk',
    'kCckkkkkkcCk',
    'kCkcccccckCk',
    'kCkcwwwwckCk',
    'kCkcwwwwckCk',
    'kCkcccccckCk',
    'kCckkkkkkcCk',
    'kCcckcckcckk',
    '.kCCCCCCCCk.',
    '..kkkkkkkk..',
  ],
  credit: [
    '.kkkk.',
    'kyyyYk',
    'kyYyYk',
    'kyYyYk',
    'kyyyYk',
    '.kkkk.',
  ],
  heal: [
    '...kkkk...',
    '...krrk...',
    '...krrk...',
    'kkkkrrkkkk',
    'krrrrrrrrk',
    'krrrrrrrrk',
    'kkkkrrkkkk',
    '...krrk...',
    '...krrk...',
    '...kkkk...',
  ],
  blocker: [
    '..kkkk..',
    '.kwwwwk.',
    'kwwwwwwk',
    'kwwwwwwk',
    'kkkkkkkk',
    'keeeeeek',
    'keeeeeek',
    '.keeeek.',
    '..kkkk..',
  ],
  bullet: [
    '.yy.',
    'ywwy',
    'ywwy',
    '.yy.',
  ],
  'bullet-player': [
    '.cc.',
    'cwwc',
    'cwwc',
    '.cc.',
  ],
  'fx-spark': ['ww', 'ww'],
  'bullet-hack': [
    '.eeee.',
    'eewwee',
    'ewwwwe',
    'ewwwwe',
    'eewwee',
    '.eeee.',
  ],
  'icon-event': [
    '.kkkkkkkk.',
    'kwwwwwwwwk',
    'kwwkkkwwwk',
    'kwwwwkwwwk',
    'kwwwkwwwwk',
    'kwwwwwwwwk',
    'kwwwkwwwwk',
    '.kkwkkkkk.',
    '..kwk.....',
    '...k......',
  ],
  'icon-elite': [
    '..kkkkkk..',
    '.kmmmmmmk.',
    'kmmmmmmmmk',
    'kmkkmmkkmk',
    'kmkykmkykm',
    'kmmmmmmmmk',
    '.kmmkkmmk.',
    '..kmmmmk..',
    '..kmkmkmk.',
    '...kkkkk..',
  ],
  // Facing indicator drawn pointing right, rotated at runtime.
  chevron: [
    'ww....',
    '.www..',
    '..wwww',
    '.www..',
    'ww....',
  ],
};

