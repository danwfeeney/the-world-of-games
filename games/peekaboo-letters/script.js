// Peekaboo Letters — hop around the meadow one step at a time and catch the
// letters when they peek out of their hiding spots, spelling each word in order.

// ---- DOM references ------------------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const wordsDisplay = document.getElementById('words');
const timeDisplay = document.getElementById('time');
const timeInfoItem = document.getElementById('timeItem');
const bestScoreDisplay = document.getElementById('bestScore');
const startOverlay = document.getElementById('startOverlay');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreDisplay = document.getElementById('finalScore');
const finalWordsDisplay = document.getElementById('finalWords');
const wordListDisplay = document.getElementById('wordList');
const bestLine = document.getElementById('bestLine');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeLevelBtn = document.getElementById('changeLevelBtn');
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
const directionButtons = document.querySelectorAll('[data-direction]');
const muteButton = document.getElementById('muteButton');

// ---- Audio ---------------------------------------------------------------
// All sound is synthesised with the Web Audio API so the game stays
// dependency-free (no audio files to ship). A bouncy music-box loop plays in
// the background with one-shot effects on top, and caught letters and words
// are read aloud with the browser's built-in speech — all behind one mute
// toggle.
const audio = {
    context: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    muted: localStorage.getItem('peekabooLettersMuted') === 'true',
    schedulerId: null,
    nextNoteTime: 0,
    currentStep: 0,

    // Sixteen-step loop in C major: a skipping C–A–F–G bass under a
    // pentatonic music-box tinkle.
    tempo: 112,
    bassPattern: [130.81, null, 196.00, null, 110.00, null, 164.81, null,
                  87.31, null, 130.81, null, 98.00, null, 146.83, null],
    leadPattern: [523.25, 659.25, 783.99, null, 659.25, null, 523.25, 587.33,
                  698.46, null, 880.00, null, 783.99, 659.25, 587.33, null],

    // Lazily create the audio graph on the first user gesture (autoplay rules).
    ensureContext() {
        if (this.context) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.context = new AudioContextClass();

        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.9;
        this.masterGain.connect(this.context.destination);

        // Music is kept quiet so the spoken letters stay easy to hear.
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = 0.24;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.context.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);
    },

    // The audio-clock time to schedule a sound at, or null when the browser
    // has no Web Audio support (the game then simply plays silently).
    ready() {
        this.ensureContext();
        return this.context ? this.context.currentTime : null;
    },

    // Play a single tone with a short attack/decay envelope.
    tone(frequency, startTime, duration, type, peakGain, destination) {
        if (!frequency) return;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(destination || this.sfxGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    },

    // A tone that slides between two pitches — hops, boops and boings.
    sweep(fromFreq, toFreq, startTime, duration, type, peakGain) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(fromFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(toFreq, startTime + duration);
        gain.gain.setValueAtTime(peakGain, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    },

    // Short burst of filtered noise — leafy rustles and the music's shaker.
    noiseBurst(startTime, duration, peakGain, highpass, destination) {
        const sampleCount = Math.floor(this.context.sampleRate * duration);
        const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = this.context.createBufferSource();
        source.buffer = buffer;

        const filter = this.context.createBiquadFilter();
        filter.type = highpass ? 'highpass' : 'lowpass';
        filter.frequency.value = highpass ? 5000 : 1000;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(peakGain, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination || this.sfxGain);
        source.start(startTime);
        source.stop(startTime + duration);
    },

    // Schedule the bass, melody and soft percussion for one sequencer step.
    scheduleStep(step, time) {
        const stepDuration = 30 / this.tempo; // seconds per sixteenth note

        this.tone(this.bassPattern[step], time, stepDuration * 1.6, 'triangle', 0.5, this.musicGain);
        this.tone(this.leadPattern[step], time, stepDuration * 1.2, 'sine', 0.2, this.musicGain);

        // Woodblock clicks on the off-beats and a light shaker keep it skipping.
        if (step % 4 === 2) {
            this.tone(1200, time, 0.04, 'sine', 0.12, this.musicGain);
        }
        if (step % 2 === 1) {
            this.noiseBurst(time, 0.03, 0.04, true, this.musicGain);
        }
    },

    // Look-ahead scheduler: queue notes a little ahead of the audio clock so the
    // loop stays rock-steady regardless of JavaScript timer jitter.
    scheduler() {
        const stepDuration = 30 / this.tempo;
        while (this.nextNoteTime < this.context.currentTime + 0.1) {
            this.scheduleStep(this.currentStep, this.nextNoteTime);
            this.nextNoteTime += stepDuration;
            this.currentStep = (this.currentStep + 1) % 16;
        }
    },

    startMusic() {
        this.ensureContext();
        if (!this.context) return;
        if (this.context.state === 'suspended') this.context.resume();
        this.stopMusic();
        this.currentStep = 0;
        this.nextNoteTime = this.context.currentTime + 0.05;
        this.schedulerId = setInterval(() => this.scheduler(), 25);
    },

    stopMusic() {
        if (this.schedulerId) {
            clearInterval(this.schedulerId);
            this.schedulerId = null;
        }
    },

    hop() {
        const now = this.ready();
        if (now === null) return;
        this.sweep(520, 760, now, 0.07, 'sine', 0.12);
    },

    // Trying to hop off the edge of the meadow.
    bonk() {
        const now = this.ready();
        if (now === null) return;
        this.sweep(180, 90, now, 0.12, 'sine', 0.3);
    },

    // A hiding spot shaking — something's about to peek out!
    rustle() {
        const now = this.ready();
        if (now === null) return;
        this.noiseBurst(now, 0.25, 0.1, true);
        this.noiseBurst(now + 0.14, 0.2, 0.08, true);
    },

    // "Boop!" as a letter pops up.
    peek() {
        const now = this.ready();
        if (now === null) return;
        this.sweep(380, 980, now, 0.14, 'triangle', 0.22);
    },

    catchRight() {
        const now = this.ready();
        if (now === null) return;
        [880.00, 1108.73, 1318.51].forEach((freq, i) => {
            this.tone(freq, now + i * 0.06, 0.15, 'triangle', 0.3);
        });
    },

    // Wrong letter: a cartoony "boing".
    wrongLetter() {
        const now = this.ready();
        if (now === null) return;
        this.sweep(420, 140, now, 0.32, 'square', 0.1);
        this.sweep(300, 110, now + 0.05, 0.3, 'sine', 0.25);
    },

    // "Hee hee hee!" from a letter you jumped on too early.
    giggle() {
        const now = this.ready();
        if (now === null) return;
        [1046.50, 1174.66, 1046.50, 1318.51].forEach((freq, i) => {
            this.tone(freq, now + i * 0.07, 0.06, 'sine', 0.2);
        });
    },

    // A caught letter landing in its slot on the word sign.
    slotPop() {
        const now = this.ready();
        if (now === null) return;
        this.sweep(600, 1300, now, 0.09, 'sine', 0.25);
    },

    wordComplete() {
        const now = this.ready();
        if (now === null) return;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            this.tone(freq, now + i * 0.09, 0.18, 'square', 0.18);
        });
        this.tone(1046.50, now + 0.36, 0.55, 'triangle', 0.3);
        this.tone(1318.51, now + 0.36, 0.55, 'triangle', 0.2);
    },

    // Countdown tick for the final seconds.
    tick() {
        const now = this.ready();
        if (now === null) return;
        this.tone(1500, now, 0.03, 'square', 0.1);
    },

    timeUp() {
        const now = this.ready();
        if (now === null) return;
        [783.99, 659.25, 523.25].forEach((freq, i) => {
            this.tone(freq, now + i * 0.16, 0.24, 'triangle', 0.3);
        });
    },

    // Sparkle when a new word appears.
    newWord() {
        const now = this.ready();
        if (now === null) return;
        [1318.51, 1567.98, 2093.00].forEach((freq, i) => {
            this.tone(freq, now + i * 0.05, 0.1, 'sine', 0.18);
        });
    },

    // Read a letter or word aloud. Speech is an optional extra: browsers
    // without speech synthesis still get all the chimes.
    speak(text) {
        if (this.muted || !('speechSynthesis' in window)) return;
        const synth = window.speechSynthesis;
        // Only the newest phrase matters — don't let them queue up behind each other.
        if (synth.speaking || synth.pending) synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.pitch = 1.25;
        synth.speak(utterance);
    },

    stopSpeech() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },

    toggleMute() {
        this.ensureContext();
        this.muted = !this.muted;
        localStorage.setItem('peekabooLettersMuted', this.muted);
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.9;
        }
        if (this.muted) this.stopSpeech();
        return this.muted;
    }
};

// ---- Static layout constants ---------------------------------------------
const TILE_SIZE = 64;
const GRID_COLUMNS = 8;
const GRID_ROWS = 7;
const BANNER_BOTTOM = 84;          // the word sign fills the canvas above this line
const GRID_TOP = 100;              // a strip of hedge sits between the sign and the meadow
const PLAYER_START_COL = 3;
const PLAYER_START_ROW = 3;

// Where a hiding spot stands on its tile, and how far above that base its top
// edge is — letters peek out over that edge.
const SPOT_BASE_OFFSET = 58;
const SPOT_TOP_OFFSETS = { bush: 40, rock: 35, stump: 34, box: 30 };
const SPOT_TYPES = ['bush', 'rock', 'stump', 'box'];
const RUSTLE_DEBRIS = {
    bush: ['#55efc4', '#00b894', '#2e8b3e'],
    rock: ['#b2bec3', '#dfe6e9'],
    stump: ['#a9744f', '#e0b07e'],
    box: ['#e0a868', '#f5d7a1']
};

// Word sign slot geometry.
const SLOT_WIDTH = 50;
const SLOT_HEIGHT = 56;
const SLOT_GAP = 10;
const SLOT_TOP = 14;

const LETTER_FONT_FAMILY = '"Arial Rounded MT Bold", "Comic Sans MS", "Trebuchet MS", sans-serif';
const TEXT_FONT_FAMILY = '"Comic Sans MS", "Arial Rounded MT Bold", sans-serif';
const EMOJI_FONT_FAMILY = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const LETTER_FONT = `bold 42px ${LETTER_FONT_FAMILY}`;
const SLOT_FONT = `bold 36px ${LETTER_FONT_FAMILY}`;
const LETTER_CAP_HEIGHT = 30;      // approximate height of a capital drawn in LETTER_FONT

const LETTER_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e84393'];
const CONFETTI_COLORS = ['#fd79a8', '#fdcb6e', '#55efc4', '#74b9ff', '#a29bfe', '#ff7675'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Letters that are easy to mix up — Hard mode sends these out as decoys.
const LOOK_ALIKES = {
    A: ['H', 'R'], B: ['P', 'R', 'D', 'E'], C: ['G', 'O', 'Q'], D: ['O', 'B', 'P'],
    E: ['F', 'B'], F: ['E', 'P'], G: ['C', 'O', 'Q'], H: ['N', 'A'], I: ['L', 'T', 'J'],
    J: ['I', 'L'], K: ['X', 'R'], L: ['I', 'J'], M: ['N', 'W'], N: ['M', 'H', 'Z'],
    O: ['Q', 'C', 'D'], P: ['R', 'B', 'F'], Q: ['O', 'G'], R: ['P', 'B', 'K'],
    S: ['Z'], T: ['I', 'L'], U: ['V', 'O'], V: ['U', 'Y'], W: ['M', 'V'],
    X: ['K', 'Y'], Y: ['V', 'X'], Z: ['N', 'S']
};

// Letter names that start with a vowel sound take "an": "an F", "a B".
const VOWEL_SOUND_LETTERS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);

const DIRECTION_VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY_DIRECTIONS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
};

// ---- Timing --------------------------------------------------------------
// Movement is one tile per hop. A quick tap is exactly one hop; holding a
// direction starts hopping repeatedly after a short delay, with a tiny pause
// between hops so every step is its own little jump.
const STEP_DURATION = 0.16;
const STEP_REST = 0.05;
const HOLD_REPEAT_DELAY_MS = 300;
const HOP_HEIGHT = 14;
const LAND_SQUASH_DURATION = 0.1;
const BUMP_DURATION = 0.15;

// A peek: the hiding spot rustles (a pair of eyes peeks over the top) as a
// warning, the letter pops up, stays out for the level's peek time, then ducks.
const RUSTLE_DURATION = 0.7;
const RISE_DURATION = 0.18;
const DUCK_DURATION = 0.2;
const SPOT_APPEAR_DURATION = 0.35;

const INTRO_DURATION = 1.8;        // "Spell it!" card before each word
const CELEBRATE_HOLD = 2.1;        // cheering once the last letter lands
const TIME_UP_DURATION = 1.8;
const FLYER_DURATION = 0.6;        // a caught letter flying up to the word sign
const SLOT_POP_DURATION = 0.3;

const LETTER_POINTS = 10;
const WORD_POINTS_PER_LETTER = 20;

// Each difficulty sets the clock (and the time won back per word), how many
// hiding spots there are, how long letters stay out, the gap between peeks,
// how often the letter you need is the one that peeks out (and the most
// seconds it can stay away), how many letters may be out at once, the time
// lost for catching a wrong letter, and how sneaky the decoy letters are.
const DIFFICULTY_SETTINGS = {
    easy: {
        timeLimit: 150, wordTimeBonus: 15, spotCount: 8,
        peekDuration: 3.4, hiddenGap: [1.5, 4], neededChance: 0.5, pityTime: 4,
        maxOut: 3, wrongPenalty: 0, glowNeeded: true, decoysFromWord: false, lookAlikes: false
    },
    medium: {
        timeLimit: 120, wordTimeBonus: 12, spotCount: 10,
        peekDuration: 2.6, hiddenGap: [2, 5], neededChance: 0.4, pityTime: 6,
        maxOut: 4, wrongPenalty: 2, glowNeeded: false, decoysFromWord: true, lookAlikes: false
    },
    hard: {
        timeLimit: 100, wordTimeBonus: 10, spotCount: 12,
        peekDuration: 1.9, hiddenGap: [2.5, 5.5], neededChance: 0.33, pityTime: 8,
        maxOut: 4, wrongPenalty: 3, glowNeeded: false, decoysFromWord: true, lookAlikes: true
    }
};

// Kid-friendly words with a picture for each. Easy = 3 letters, Medium = 4,
// Hard = 5.
const WORDS = {
    easy: [
        { word: 'CAT', picture: '🐱' }, { word: 'DOG', picture: '🐶' }, { word: 'SUN', picture: '☀️' },
        { word: 'BUS', picture: '🚌' }, { word: 'PIG', picture: '🐷' }, { word: 'COW', picture: '🐮' },
        { word: 'HAT', picture: '🎩' }, { word: 'BEE', picture: '🐝' }, { word: 'CAR', picture: '🚗' },
        { word: 'BED', picture: '🛏️' }, { word: 'EGG', picture: '🥚' }, { word: 'FOX', picture: '🦊' },
        { word: 'OWL', picture: '🦉' }, { word: 'ANT', picture: '🐜' }, { word: 'BAT', picture: '🦇' },
        { word: 'KEY', picture: '🔑' }, { word: 'BOX', picture: '📦' }, { word: 'HEN', picture: '🐔' },
        { word: 'BUG', picture: '🐛' }, { word: 'MAP', picture: '🗺️' }, { word: 'PIE', picture: '🥧' },
        { word: 'EYE', picture: '👁️' }, { word: 'EAR', picture: '👂' }, { word: 'ARM', picture: '💪' },
        { word: 'VAN', picture: '🚐' }, { word: 'WEB', picture: '🕸️' }, { word: 'RAT', picture: '🐀' },
        { word: 'JET', picture: '✈️' }, { word: 'ICE', picture: '🧊' }, { word: 'CUP', picture: '🥤' }
    ],
    medium: [
        { word: 'FROG', picture: '🐸' }, { word: 'FISH', picture: '🐟' }, { word: 'BEAR', picture: '🐻' },
        { word: 'DUCK', picture: '🦆' }, { word: 'LION', picture: '🦁' }, { word: 'CAKE', picture: '🍰' },
        { word: 'BOAT', picture: '⛵' }, { word: 'TREE', picture: '🌳' }, { word: 'STAR', picture: '⭐' },
        { word: 'MOON', picture: '🌙' }, { word: 'BIRD', picture: '🐦' }, { word: 'BALL', picture: '⚽' },
        { word: 'SHIP', picture: '🚢' }, { word: 'CRAB', picture: '🦀' }, { word: 'DEER', picture: '🦌' },
        { word: 'GOAT', picture: '🐐' }, { word: 'MILK', picture: '🥛' }, { word: 'RAIN', picture: '🌧️' },
        { word: 'SNOW', picture: '❄️' }, { word: 'CORN', picture: '🌽' }, { word: 'BOOK', picture: '📖' },
        { word: 'DRUM', picture: '🥁' }, { word: 'BELL', picture: '🔔' }, { word: 'SOCK', picture: '🧦' },
        { word: 'FIRE', picture: '🔥' }, { word: 'LEAF', picture: '🍃' }, { word: 'ROSE', picture: '🌹' },
        { word: 'WOLF', picture: '🐺' }, { word: 'HAND', picture: '✋' }, { word: 'FOOT', picture: '🦶' },
        { word: 'GIFT', picture: '🎁' }, { word: 'PEAR', picture: '🍐' }, { word: 'KITE', picture: '🪁' },
        { word: 'SWAN', picture: '🦢' }, { word: 'BONE', picture: '🦴' }, { word: 'TENT', picture: '⛺' },
        { word: 'WAVE', picture: '🌊' }, { word: 'NOSE', picture: '👃' }, { word: 'KING', picture: '🤴' },
        { word: 'TACO', picture: '🌮' }, { word: 'LOCK', picture: '🔒' }, { word: 'BIKE', picture: '🚲' }
    ],
    hard: [
        { word: 'APPLE', picture: '🍎' }, { word: 'HORSE', picture: '🐴' }, { word: 'TIGER', picture: '🐯' },
        { word: 'ZEBRA', picture: '🦓' }, { word: 'HOUSE', picture: '🏠' }, { word: 'TRAIN', picture: '🚂' },
        { word: 'SHEEP', picture: '🐑' }, { word: 'CLOCK', picture: '⏰' }, { word: 'PIZZA', picture: '🍕' },
        { word: 'CANDY', picture: '🍬' }, { word: 'MOUSE', picture: '🐭' }, { word: 'SNAKE', picture: '🐍' },
        { word: 'WHALE', picture: '🐳' }, { word: 'ROBOT', picture: '🤖' }, { word: 'GHOST', picture: '👻' },
        { word: 'CLOUD', picture: '☁️' }, { word: 'BREAD', picture: '🍞' }, { word: 'GRAPE', picture: '🍇' },
        { word: 'LEMON', picture: '🍋' }, { word: 'MANGO', picture: '🥭' }, { word: 'PANDA', picture: '🐼' },
        { word: 'CAMEL', picture: '🐫' }, { word: 'SHARK', picture: '🦈' }, { word: 'TRUCK', picture: '🚚' },
        { word: 'PIANO', picture: '🎹' }, { word: 'QUEEN', picture: '👸' }, { word: 'CROWN', picture: '👑' },
        { word: 'HEART', picture: '❤️' }, { word: 'BEACH', picture: '🏖️' }, { word: 'TOOTH', picture: '🦷' },
        { word: 'PLANE', picture: '✈️' }, { word: 'SNAIL', picture: '🐌' }, { word: 'EAGLE', picture: '🦅' },
        { word: 'PEACH', picture: '🍑' }, { word: 'DONUT', picture: '🍩' }, { word: 'GLOBE', picture: '🌍' },
        { word: 'MEDAL', picture: '🏅' }, { word: 'BRAIN', picture: '🧠' }, { word: 'KOALA', picture: '🐨' },
        { word: 'LLAMA', picture: '🦙' }, { word: 'SPOON', picture: '🥄' }, { word: 'WATCH', picture: '⌚' },
        { word: 'SKUNK', picture: '🦨' }, { word: 'OTTER', picture: '🦦' }
    ]
};

// ---- Mutable game state --------------------------------------------------
let gameState = 'menu';        // 'menu' | 'intro' | 'playing' | 'celebrate' | 'timeup' | 'over'
let difficulty = 'easy';
let settings = DIFFICULTY_SETTINGS[difficulty];

let wordQueue = [];            // shuffled words still to come this game
let currentWord = null;        // { word, picture }
let nextLetterIndex = 0;       // which letter of the word to catch next
let filledSlots = [];          // per slot: has its caught letter landed on the sign yet?
let slotColors = [];           // colour each caught letter keeps on the sign
let slotPopTimers = [];        // little bounce as a letter lands in its slot

let spots = [];                // hiding spots { col, row, type, phase, phaseTimer, letter, ... }
let decorations = [];          // flowers and grass tufts on the lawn
let flyers = [];               // caught letters flying to the sign
let particles = [];            // leaves, sparkles, dust and confetti
let popups = [];               // floating "+10" texts
let toast = null;              // { text, life } hint line at the bottom
let centerBanner = null;       // big card { title, picture, word, colors, subtitle, life, maxLife }

const player = {
    col: PLAYER_START_COL,     // tile the fox stands on (or is hopping to)
    row: PLAYER_START_ROW,
    fromCol: PLAYER_START_COL, // tile the current hop started from
    fromRow: PLAYER_START_ROW,
    moving: false,
    moveProgress: 1,           // 0..1 through the current hop
    restTimer: 0,
    landTimer: 0,
    bumpTimer: 0,
    bumpDirection: 'down',
    facing: 'down'
};

let heldDirections = [];       // directions currently held (keys / D-pad); newest wins
let heldSince = {};            // direction -> performance.now() when it was pressed
let queuedDirection = null;    // a press that arrived mid-hop, taken on landing
let walkTarget = null;         // { col, row } the fox is walking to after a tap
let pointerHeld = false;

let score = 0;
let wordsSpelled = 0;
let completedWords = [];
let timeLeft = 0;
let bestScore = 0;
let lastShownSecond = null;

let elapsedSeconds = 0;
let neededLastSeenTime = 0;    // last moment the letter we need was out of hiding
let introTimer = 0;
let celebrateTimer = 0;
let celebrationFired = false;
let timeUpTimer = 0;

let lastFrameTime = 0;
let animationFrameId = null;

// ---- Helpers -------------------------------------------------------------
function rand(min, max) {
    return min + Math.random() * (max - min);
}

function randomInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// Fisher–Yates shuffle, in place.
function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// Springy ease that overshoots a little before settling — for pops.
function easeOutBack(t) {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function tileCenterX(col) {
    return col * TILE_SIZE + TILE_SIZE / 2;
}

// Where the fox's feet touch the grass on a row.
function tileGroundY(row) {
    return GRID_TOP + row * TILE_SIZE + TILE_SIZE - 10;
}

function spotTopY(spot) {
    return spot.baseY - SPOT_TOP_OFFSETS[spot.type];
}

function spotAt(col, row) {
    return spots.find((spot) => spot.col === col && spot.row === row) || null;
}

function neededLetter() {
    if (!currentWord || nextLetterIndex >= currentWord.word.length) return null;
    return currentWord.word[nextLetterIndex];
}

function withArticle(letter) {
    return `${VOWEL_SOUND_LETTERS.has(letter) ? 'an' : 'a'} ${letter}`;
}

function bestScoreKey() {
    return `peekabooLettersBest_${difficulty}`;
}

function loadBestScore() {
    bestScore = parseInt(localStorage.getItem(bestScoreKey()), 10) || 0;
    bestScoreDisplay.textContent = bestScore;
}

function updateHud() {
    scoreDisplay.textContent = score;
    wordsDisplay.textContent = wordsSpelled;
    updateTimeDisplay();
}

function updateTimeDisplay() {
    if (gameState === 'menu') {
        timeDisplay.textContent = '–';
        timeInfoItem.classList.remove('low');
        return;
    }
    const secondsLeft = Math.max(0, Math.ceil(timeLeft));
    timeDisplay.textContent = `${secondsLeft}s`;
    timeInfoItem.classList.toggle('low', gameState !== 'over' && secondsLeft <= 10);
}

function showToast(text) {
    toast = { text, life: 3 };
}

function pushPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
}

// Generic particle burst. Leaves and confetti drift; dots and stars fall.
function spawnParticles(x, y, count, colors, options = {}) {
    const gravity = options.gravity !== undefined ? options.gravity : 300;
    const speed = options.speed !== undefined ? options.speed : 120;
    const lifeBase = options.life !== undefined ? options.life : 0.6;
    const shape = options.shape || 'dot';
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.4 + Math.random() * 0.8);
        const life = lifeBase * (0.6 + Math.random() * 0.7);
        particles.push({
            x, y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity - speed * 0.4,
            life,
            maxLife: life,
            size: 3 + Math.random() * 4,
            color: pick(colors),
            gravity,
            shape,
            rotation: Math.random() * Math.PI * 2,
            spin: rand(-8, 8)
        });
    }
}

// Rounded rectangle path helper for the sign, slots, cards and toasts.
function roundedRectPath(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

// ---- Meadow layout --------------------------------------------------------
// Scatter hiding spots over the meadow. No two spots share an edge, so each
// one has open grass around it, and none is placed under the fox.
function generateLayout(spotCount) {
    spots = [];
    let attempts = 0;
    while (spots.length < spotCount && attempts < 2000) {
        attempts++;
        const col = randomInt(0, GRID_COLUMNS - 1);
        const row = randomInt(0, GRID_ROWS - 1);
        if (col === player.col && row === player.row) continue;
        const crowded = spots.some((spot) => Math.abs(spot.col - col) + Math.abs(spot.row - row) <= 1);
        if (crowded) continue;
        spots.push(createSpot(col, row, spots.length));
    }

    decorations = [];
    for (let i = 0; i < 14; i++) {
        const col = randomInt(0, GRID_COLUMNS - 1);
        const row = randomInt(0, GRID_ROWS - 1);
        if (spotAt(col, row)) continue;
        decorations.push({
            x: tileCenterX(col) + rand(-22, 22),
            y: GRID_TOP + row * TILE_SIZE + rand(16, 54),
            kind: Math.random() < 0.55 ? 'flower' : 'tuft',
            color: pick(['#ffffff', '#ffeaa7', '#fab1a0', '#fd79a8', '#a29bfe'])
        });
    }
}

function createSpot(col, row, index) {
    return {
        col,
        row,
        type: pick(SPOT_TYPES),
        baseX: tileCenterX(col),
        baseY: GRID_TOP + row * TILE_SIZE + SPOT_BASE_OFFSET,
        phase: 'hidden',           // 'hidden' | 'rustle' | 'rising' | 'visible' | 'ducking'
        phaseTimer: rand(0.8, 3.5),
        letter: null,
        color: LETTER_COLORS[0],
        catchable: false,          // true from the moment the letter pops up
        appear: 0,                 // 0..1 pop-in when a new layout is made
        appearDelay: index * 0.05,
        wiggleSeed: Math.random() * 10
    };
}

// ---- Hiding letters -------------------------------------------------------
function countSpotsOut() {
    return spots.filter((spot) => spot.phase !== 'hidden').length;
}

// Decide which letter peeks out next. The letter we need comes up often — and
// is guaranteed once it has stayed away too long — but only one copy at a time,
// so there's always a little hunting to do.
function chooseLetter() {
    const needed = neededLetter();
    if (!needed) return pick(ALPHABET);
    const neededAlreadyOut = spots.some((spot) => spot.phase !== 'hidden' && spot.letter === needed);
    if (!neededAlreadyOut) {
        const overdue = elapsedSeconds - neededLastSeenTime >= settings.pityTime;
        if (overdue || Math.random() < settings.neededChance) return needed;
    }
    return chooseDecoy(needed);
}

function chooseDecoy(needed) {
    // Hard: sneaky look-alikes (E for F, O for Q...).
    if (settings.lookAlikes && LOOK_ALIKES[needed] && Math.random() < 0.45) {
        return pick(LOOK_ALIKES[needed]);
    }
    // Medium and Hard: other letters from the same word, to test the order.
    const wordLetters = currentWord.word.split('');
    if (settings.decoysFromWord && Math.random() < 0.35) {
        const otherWordLetters = wordLetters.filter((letter) => letter !== needed);
        if (otherWordLetters.length > 0) return pick(otherWordLetters);
    }
    // Otherwise any letter — on Easy never one from the word, so nothing on the
    // board looks "almost right".
    const pool = ALPHABET.filter((letter) =>
        letter !== needed && (settings.decoysFromWord || !wordLetters.includes(letter)));
    return pick(pool);
}

function startRustle(spot) {
    spot.letter = chooseLetter();
    spot.color = pick(LETTER_COLORS);
    spot.phase = 'rustle';
    spot.phaseTimer = RUSTLE_DURATION;
    spot.catchable = false;
    audio.rustle();
    spawnParticles(spot.baseX, spotTopY(spot) + 8, 4, RUSTLE_DEBRIS[spot.type],
        { gravity: 160, speed: 50, shape: 'leaf', life: 0.6 });
}

function duckSpot(spot) {
    spot.phase = 'ducking';
    spot.phaseTimer = DUCK_DURATION;
}

function hideSpot(spot) {
    spot.phase = 'hidden';
    spot.letter = null;
    spot.catchable = false;
    spot.phaseTimer = rand(settings.hiddenGap[0], settings.hiddenGap[1]);
}

// Send every letter back into hiding (between words, and when time's up).
function hideAllLetters() {
    spots.forEach((spot) => {
        if (spot.phase === 'rustle') {
            hideSpot(spot);
        } else if (spot.phase === 'rising' || spot.phase === 'visible') {
            spot.catchable = false;
            duckSpot(spot);
        }
    });
}

function updateSpots(deltaSeconds, allowNewPeeks) {
    const needed = neededLetter();
    spots.forEach((spot) => {
        if (spot.appear < 1) {
            if (spot.appearDelay > 0) {
                spot.appearDelay -= deltaSeconds;
            } else {
                spot.appear = Math.min(1, spot.appear + deltaSeconds / SPOT_APPEAR_DURATION);
            }
        }

        switch (spot.phase) {
            case 'hidden': {
                if (!allowNewPeeks) break;
                spot.phaseTimer -= deltaSeconds;
                if (spot.phaseTimer > 0) break;
                // Letters are shy: none will come out while the fox stands on its
                // spot. If too many are out already, it waits its turn.
                const foxIsHere = player.col === spot.col && player.row === spot.row;
                if (foxIsHere || countSpotsOut() >= settings.maxOut) {
                    spot.phaseTimer = rand(0.4, 0.9);
                } else {
                    startRustle(spot);
                }
                break;
            }
            case 'rustle':
                spot.phaseTimer -= deltaSeconds;
                if (spot.phaseTimer <= 0) {
                    spot.phase = 'rising';
                    spot.phaseTimer = RISE_DURATION;
                    spot.catchable = true;
                    audio.peek();
                }
                break;
            case 'rising':
                spot.phaseTimer -= deltaSeconds;
                if (spot.phaseTimer <= 0) {
                    spot.phase = 'visible';
                    spot.phaseTimer = settings.peekDuration;
                }
                break;
            case 'visible': {
                // A letter waits for a fox that's already mid-hop onto it.
                const foxHoppingHere = player.moving && player.col === spot.col && player.row === spot.row;
                if (!foxHoppingHere) spot.phaseTimer -= deltaSeconds;
                if (spot.phaseTimer <= 0) duckSpot(spot);
                break;
            }
            case 'ducking':
                spot.phaseTimer -= deltaSeconds;
                if (spot.phaseTimer <= 0) hideSpot(spot);
                break;
        }

        if (needed && spot.letter === needed && spot.phase !== 'hidden' && spot.phase !== 'ducking') {
            neededLastSeenTime = elapsedSeconds;
        }
    });
}

// ---- Catching letters -------------------------------------------------------
function catchLetter(spot) {
    const needed = neededLetter();
    const letterX = spot.baseX;
    const letterY = spotTopY(spot) - 8;

    if (spot.letter === needed) {
        const slotIndex = nextLetterIndex;
        nextLetterIndex += 1;
        score += LETTER_POINTS;
        flyers.push({ letter: spot.letter, color: spot.color, slotIndex, fromX: letterX, fromY: letterY, progress: 0 });
        audio.catchRight();
        audio.speak(spot.letter);
        pushPopup(letterX, letterY - 26, `+${LETTER_POINTS}`, '#6c5ce7');
        spawnParticles(letterX, letterY, 12, ['#ffeaa7', '#fdcb6e', '#ffffff', spot.color],
            { gravity: 80, speed: 130, shape: 'star', life: 0.7 });
        hideSpot(spot);

        if (nextLetterIndex >= currentWord.word.length) {
            beginCelebrate();
        } else {
            neededLastSeenTime = elapsedSeconds;
            showToast(`Yes! Now find ${neededLetter()}!`);
        }
        updateHud();
        return;
    }

    // Wrong letter: it giggles and ducks back into hiding.
    spot.catchable = false;
    duckSpot(spot);
    audio.wrongLetter();
    if (settings.wrongPenalty > 0) {
        timeLeft = Math.max(0, timeLeft - settings.wrongPenalty);
        pushPopup(letterX, letterY - 26, `-${settings.wrongPenalty}s`, '#d63031');
    }
    showToast(`That's ${withArticle(spot.letter)} — find ${needed}!`);
}

// Jumped on a spot while it was still rustling: the shy letter stays hidden.
function letterTooEarly(spot) {
    spawnParticles(spot.baseX, spotTopY(spot) + 8, 5, RUSTLE_DEBRIS[spot.type],
        { gravity: 160, speed: 60, shape: 'leaf', life: 0.6 });
    hideSpot(spot);
    audio.giggle();
    showToast('Hee hee! Too early — wait for it to peek out! 👀');
}

// ---- Fox movement -----------------------------------------------------------
function canWalk() {
    return gameState === 'intro' || gameState === 'playing' || gameState === 'celebrate';
}

function resetPlayer() {
    player.col = PLAYER_START_COL;
    player.row = PLAYER_START_ROW;
    player.fromCol = player.col;
    player.fromRow = player.row;
    player.moving = false;
    player.moveProgress = 1;
    player.restTimer = 0;
    player.landTimer = 0;
    player.bumpTimer = 0;
    player.bumpDirection = 'down';
    player.facing = 'down';
    heldDirections = [];
    heldSince = {};
    queuedDirection = null;
    walkTarget = null;
    pointerHeld = false;
}

// Start one hop. Hopping off the meadow just bonks against the edge (quietly,
// if the direction is merely being held down).
function tryStep(direction, fromHold) {
    const [colChange, rowChange] = DIRECTION_VECTORS[direction];
    player.facing = direction;
    const targetCol = player.col + colChange;
    const targetRow = player.row + rowChange;
    const insideMeadow = targetCol >= 0 && targetCol < GRID_COLUMNS && targetRow >= 0 && targetRow < GRID_ROWS;
    if (!insideMeadow) {
        player.restTimer = 0.12;
        walkTarget = null;
        if (!fromHold) {
            player.bumpTimer = BUMP_DURATION;
            player.bumpDirection = direction;
            audio.bonk();
        }
        return;
    }
    player.fromCol = player.col;
    player.fromRow = player.row;
    player.col = targetCol;
    player.row = targetRow;
    player.moving = true;
    player.moveProgress = 0;
    audio.hop();
}

// What to do once the fox is ready for its next hop: a press that came in
// mid-hop first, then any held direction (after the hold delay), then a tap
// target it's walking toward.
function nextStepDirection() {
    if (queuedDirection) {
        const direction = queuedDirection;
        queuedDirection = null;
        return { direction, fromHold: false };
    }
    if (heldDirections.length > 0) {
        const direction = heldDirections[heldDirections.length - 1];
        if (performance.now() - heldSince[direction] >= HOLD_REPEAT_DELAY_MS) {
            return { direction, fromHold: true };
        }
        return null;
    }
    if (walkTarget) {
        const colDistance = walkTarget.col - player.col;
        const rowDistance = walkTarget.row - player.row;
        if (colDistance === 0 && rowDistance === 0) {
            walkTarget = null;
            return null;
        }
        // Walk the longer way first, so diagonal trips become a staircase.
        if (Math.abs(colDistance) >= Math.abs(rowDistance)) {
            return { direction: colDistance > 0 ? 'right' : 'left', fromHold: true };
        }
        return { direction: rowDistance > 0 ? 'down' : 'up', fromHold: true };
    }
    return null;
}

function updateFox(deltaSeconds) {
    if (player.landTimer > 0) player.landTimer -= deltaSeconds;
    if (player.bumpTimer > 0) player.bumpTimer -= deltaSeconds;

    if (player.moving) {
        player.moveProgress += deltaSeconds / STEP_DURATION;
        if (player.moveProgress >= 1) {
            player.moveProgress = 1;
            player.moving = false;
            player.restTimer = STEP_REST;
            player.landTimer = LAND_SQUASH_DURATION;
            onFoxLanded();
        }
        return;
    }

    if (player.restTimer > 0) {
        player.restTimer -= deltaSeconds;
        return;
    }

    if (!canWalk()) return;
    const next = nextStepDirection();
    if (next) tryStep(next.direction, next.fromHold);
}

function onFoxLanded() {
    spawnParticles(tileCenterX(player.col), tileGroundY(player.row), 3, ['#f1f8e9', '#ffffff'],
        { gravity: 0, speed: 40, life: 0.3 });
    if (gameState !== 'playing') return;

    const spot = spotAt(player.col, player.row);
    if (!spot) return;
    const letterIsOut = spot.phase === 'rising' || spot.phase === 'visible' || spot.phase === 'ducking';
    if (spot.catchable && letterIsOut) {
        catchLetter(spot);
    } else if (spot.phase === 'rustle') {
        letterTooEarly(spot);
    }
}

// A fresh press (key or D-pad): hop now, or straight after the current hop.
function requestStep(direction) {
    if (!canWalk()) return;
    walkTarget = null;
    if (!player.moving && player.restTimer <= 0) {
        tryStep(direction, false);
    } else {
        queuedDirection = direction;
    }
}

function holdDirection(direction) {
    if (!canWalk()) return;
    heldDirections = heldDirections.filter((held) => held !== direction);
    heldDirections.push(direction);
    heldSince[direction] = performance.now();
    requestStep(direction);
}

function releaseDirection(direction) {
    heldDirections = heldDirections.filter((held) => held !== direction);
}

// ---- Effects updates -----------------------------------------------------
function updateFlyers(deltaSeconds) {
    for (let i = flyers.length - 1; i >= 0; i--) {
        const flyer = flyers[i];
        flyer.progress += deltaSeconds / FLYER_DURATION;
        if (flyer.progress >= 1) {
            filledSlots[flyer.slotIndex] = true;
            slotColors[flyer.slotIndex] = flyer.color;
            slotPopTimers[flyer.slotIndex] = SLOT_POP_DURATION;
            const slot = slotRect(flyer.slotIndex, currentWord.word.length);
            spawnParticles(slot.cx, slot.cy, 8, ['#ffeaa7', '#fdcb6e', flyer.color],
                { gravity: 120, speed: 90, shape: 'star', life: 0.5 });
            audio.slotPop();
            flyers.splice(i, 1);
        }
    }
    for (let i = 0; i < slotPopTimers.length; i++) {
        if (slotPopTimers[i] > 0) slotPopTimers[i] = Math.max(0, slotPopTimers[i] - deltaSeconds);
    }
}

function updateEffects(deltaSeconds) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += p.gravity * deltaSeconds;
        if (p.shape === 'leaf' || p.shape === 'confetti') {
            p.vx *= 1 - 1.2 * deltaSeconds; // flutter instead of flying off sideways
        }
        p.x += p.vx * deltaSeconds;
        p.y += p.vy * deltaSeconds;
        p.rotation += p.spin * deltaSeconds;
        p.life -= deltaSeconds;
        if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
        const popup = popups[i];
        popup.y -= 32 * deltaSeconds;
        popup.life -= deltaSeconds;
        if (popup.life <= 0) popups.splice(i, 1);
    }

    if (toast) {
        toast.life -= deltaSeconds;
        if (toast.life <= 0) toast = null;
    }
    if (centerBanner) {
        centerBanner.life -= deltaSeconds;
        if (centerBanner.life <= 0) centerBanner = null;
    }
}

// ---- Update loop ---------------------------------------------------------
function updateClock(deltaSeconds) {
    timeLeft = Math.max(0, timeLeft - deltaSeconds);
    const secondsLeft = Math.ceil(timeLeft);
    if (secondsLeft !== lastShownSecond) {
        lastShownSecond = secondsLeft;
        updateTimeDisplay();
        if (secondsLeft > 0 && secondsLeft <= 5) audio.tick();
    }
    if (timeLeft <= 0) beginTimeUp();
}

function updateCelebrate(deltaSeconds) {
    // Wait for the last caught letter to land on the sign, then cheer.
    if (!celebrationFired) {
        if (flyers.length > 0) return;
        celebrationFired = true;
        celebrateTimer = CELEBRATE_HOLD;

        wordsSpelled += 1;
        completedWords.push(currentWord);
        const wordPoints = currentWord.word.length * WORD_POINTS_PER_LETTER;
        score += wordPoints;
        timeLeft += settings.wordTimeBonus;
        centerBanner = {
            title: '🎉 Hooray! 🎉',
            picture: currentWord.picture,
            word: currentWord.word,
            colors: slotColors.slice(),
            subtitle: `+${wordPoints} points   +${settings.wordTimeBonus}s ⏰`,
            life: CELEBRATE_HOLD,
            maxLife: CELEBRATE_HOLD
        };
        for (let burst = 0; burst < 6; burst++) {
            spawnParticles(rand(60, canvas.width - 60), 40, 8, CONFETTI_COLORS,
                { gravity: 260, speed: 220, shape: 'confetti', life: 1.4 });
        }
        audio.wordComplete();
        audio.speak(currentWord.word.toLowerCase());
        updateHud();
        return;
    }

    celebrateTimer -= deltaSeconds;
    if (celebrateTimer <= 0) beginWord();
}

function update(deltaSeconds) {
    elapsedSeconds += deltaSeconds;
    updateFox(deltaSeconds);
    updateSpots(deltaSeconds, gameState === 'playing');
    updateFlyers(deltaSeconds);
    updateEffects(deltaSeconds);

    if (gameState === 'intro') {
        introTimer -= deltaSeconds;
        if (introTimer <= 0) beginPlaying();
    } else if (gameState === 'playing') {
        updateClock(deltaSeconds);
    } else if (gameState === 'celebrate') {
        updateCelebrate(deltaSeconds);
    } else if (gameState === 'timeup') {
        timeUpTimer -= deltaSeconds;
        if (timeUpTimer <= 0) endGame();
    }
}

// ---- Rendering -----------------------------------------------------------
function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, GRID_TOP);
    sky.addColorStop(0, '#e3f4ff');
    sky.addColorStop(1, '#b8e4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, GRID_TOP);
}

function drawMeadow() {
    // Checkerboard lawn so every single step is easy to see.
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLUMNS; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? '#8fd16a' : '#80c75b';
            ctx.fillRect(col * TILE_SIZE, GRID_TOP + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Hedge between the word sign and the meadow.
    ctx.fillStyle = '#2f8f46';
    ctx.fillRect(0, BANNER_BOTTOM, canvas.width, GRID_TOP - BANNER_BOTTOM);
    ctx.fillStyle = '#3aa655';
    for (let x = 0; x <= canvas.width; x += 22) {
        ctx.beginPath();
        ctx.arc(x + 11, BANNER_BOTTOM + 3, 11, Math.PI, 0);
        ctx.fill();
    }
}

function drawDecorations() {
    decorations.forEach((decoration) => {
        if (decoration.kind === 'flower') {
            ctx.fillStyle = decoration.color;
            for (let petal = 0; petal < 5; petal++) {
                const angle = (petal / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(decoration.x + Math.cos(angle) * 3.5, decoration.y + Math.sin(angle) * 3.5, 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#fdcb6e';
            ctx.beginPath();
            ctx.arc(decoration.x, decoration.y, 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = '#5fa843';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(decoration.x, decoration.y);
            ctx.lineTo(decoration.x - 4, decoration.y - 7);
            ctx.moveTo(decoration.x, decoration.y);
            ctx.lineTo(decoration.x + 1, decoration.y - 8);
            ctx.moveTo(decoration.x, decoration.y);
            ctx.lineTo(decoration.x + 5, decoration.y - 6);
            ctx.stroke();
        }
    });
}

// The four hiding-spot drawings share one origin: the centre of the spot's
// base, sitting on the grass.
function drawBush() {
    ctx.fillStyle = '#2e8b3e';
    [[-15, -13, 13], [15, -13, 13], [0, -22, 17], [-7, -10, 12], [8, -10, 12]].forEach(([x, y, r]) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#3fae52';
    [[-9, -22, 8], [6, -29, 8], [15, -17, 6]].forEach(([x, y, r]) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#e74c3c';
    [[-12, -15], [9, -22], [3, -9]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawRock() {
    ctx.fillStyle = '#9aa5ad';
    ctx.beginPath();
    ctx.moveTo(-25, 0);
    ctx.quadraticCurveTo(-28, -22, -10, -33);
    ctx.quadraticCurveTo(6, -40, 19, -28);
    ctx.quadraticCurveTo(29, -16, 25, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78848c';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#c3ccd2';
    ctx.beginPath();
    ctx.ellipse(-7, -25, 7, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#78848c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, -18);
    ctx.lineTo(13, -11);
    ctx.lineTo(10, -5);
    ctx.stroke();
}

function drawStump() {
    // Trunk flaring into roots.
    ctx.fillStyle = '#8b5a3c';
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(-17, -4, -17, -12);
    ctx.lineTo(-17, -30);
    ctx.lineTo(17, -30);
    ctx.lineTo(17, -12);
    ctx.quadraticCurveTo(17, -4, 24, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#6d4430';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -26);
    ctx.lineTo(-9, -6);
    ctx.moveTo(6, -24);
    ctx.lineTo(7, -4);
    ctx.stroke();

    // Cut top with tree rings.
    ctx.fillStyle = '#e0b07e';
    ctx.beginPath();
    ctx.ellipse(0, -30, 17, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b07d4f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -30, 11, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -30, 5, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
}

function drawBox() {
    // Open flaps.
    ctx.fillStyle = '#c98b4f';
    ctx.beginPath();
    ctx.moveTo(-20, -30);
    ctx.lineTo(-29, -40);
    ctx.lineTo(-9, -38);
    ctx.lineTo(-2, -30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, -30);
    ctx.lineTo(29, -40);
    ctx.lineTo(9, -38);
    ctx.lineTo(2, -30);
    ctx.closePath();
    ctx.fill();

    // Front of the box with a strip of tape.
    ctx.fillStyle = '#e0a868';
    ctx.fillRect(-20, -30, 40, 30);
    ctx.strokeStyle = '#a8733e';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -30, 40, 30);
    ctx.fillStyle = 'rgba(255, 244, 214, 0.8)';
    ctx.fillRect(-4, -30, 8, 30);
}

function drawSpot(spot) {
    if (spot.appear <= 0) return;
    const scale = easeOutBack(spot.appear);
    ctx.save();
    ctx.translate(spot.baseX, spot.baseY);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.ellipse(0, -1, 25 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(scale, scale);
    if (spot.phase === 'rustle') {
        ctx.rotate(Math.sin(elapsedSeconds * 40 + spot.wiggleSeed) * 0.07);
    }
    if (spot.type === 'bush') {
        drawBush();
    } else if (spot.type === 'rock') {
        drawRock();
    } else if (spot.type === 'stump') {
        drawStump();
    } else {
        drawBox();
    }
    ctx.restore();
}

// A unit vector pointing from one point to another (for eyes that follow the fox).
function lookToward(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
}

function drawEyes(x, y, look, radius) {
    [-1, 1].forEach((side) => {
        const eyeX = x + side * radius * 1.3;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeX, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#2d3436';
        ctx.beginPath();
        ctx.arc(eyeX + look.x * radius * 0.38, y + look.y * radius * 0.38, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

// How far a letter has popped up out of its spot: 0 hidden .. 1 fully out.
function letterRise(spot) {
    if (spot.phase === 'rising') return easeOutBack(1 - spot.phaseTimer / RISE_DURATION);
    if (spot.phase === 'visible') return 1;
    if (spot.phase === 'ducking') return 1 - easeInOut(1 - spot.phaseTimer / DUCK_DURATION);
    return 0;
}

// Drawn just before its hiding spot, so the spot hides the bottom of the
// letter and it really looks like it's peeking out from behind.
function drawSpotLetter(spot, foxPos) {
    if (spot.phase === 'hidden' || !spot.letter || spot.appear < 1) return;
    const top = spotTopY(spot);

    if (spot.phase === 'rustle') {
        // Only a pair of eyes peeks over the edge — something's in there!
        const peek = Math.min(1, (RUSTLE_DURATION - spot.phaseTimer) / 0.25);
        const eyeY = top + 6 - peek * 6;
        drawEyes(spot.baseX, eyeY, lookToward(spot.baseX, eyeY, foxPos.x, foxPos.groundY - 30), 5);
        return;
    }

    const rise = letterRise(spot);
    const hiddenBaseline = top + LETTER_CAP_HEIGHT + 8;
    const shownBaseline = top + 8;
    const bob = spot.phase === 'visible' ? Math.sin(elapsedSeconds * 6 + spot.col * 1.3) * 2 : 0;
    const baseline = hiddenBaseline + (shownBaseline - hiddenBaseline) * rise + bob;
    const letterCenterY = baseline - LETTER_CAP_HEIGHT / 2;

    ctx.save();
    // Never let the letter poke out underneath its hiding spot.
    const clipTop = baseline - TILE_SIZE * 1.5;
    ctx.beginPath();
    ctx.rect(spot.baseX - TILE_SIZE / 2, clipTop, TILE_SIZE, spot.baseY - 4 - clipTop);
    ctx.clip();

    // Easy mode: the letter you need glows so the youngest players can spot it.
    if (settings.glowNeeded && gameState === 'playing' && spot.letter === neededLetter()) {
        const pulse = 0.75 + 0.25 * Math.sin(elapsedSeconds * 7);
        const glow = ctx.createRadialGradient(spot.baseX, letterCenterY, 4, spot.baseX, letterCenterY, 34);
        glow.addColorStop(0, `rgba(255, 234, 167, ${0.95 * pulse})`);
        glow.addColorStop(1, 'rgba(255, 234, 167, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(spot.baseX - 36, letterCenterY - 36, 72, 72);
    }

    ctx.font = LETTER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(spot.letter, spot.baseX, baseline);
    ctx.fillStyle = spot.color;
    ctx.fillText(spot.letter, spot.baseX, baseline);

    const eyeY = baseline - LETTER_CAP_HEIGHT + 9;
    drawEyes(spot.baseX, eyeY, lookToward(spot.baseX, eyeY, foxPos.x, foxPos.groundY - 30), 4.6);
    ctx.restore();
}

// Where the fox is right now, mid-hop included.
function foxPosition() {
    const progress = player.moving ? player.moveProgress : 1;
    const eased = easeInOut(progress);
    let x = tileCenterX(player.fromCol) + (tileCenterX(player.col) - tileCenterX(player.fromCol)) * eased;
    let groundY = tileGroundY(player.fromRow) + (tileGroundY(player.row) - tileGroundY(player.fromRow)) * eased;
    if (player.bumpTimer > 0) {
        const [colChange, rowChange] = DIRECTION_VECTORS[player.bumpDirection];
        const nudge = Math.sin((1 - player.bumpTimer / BUMP_DURATION) * Math.PI) * 6;
        x += colChange * nudge;
        groundY += rowChange * nudge;
    }
    const hop = player.moving ? Math.sin(progress * Math.PI) * HOP_HEIGHT : 0;
    return { x, groundY, hop };
}

// A little fox, drawn with its feet at the origin. Its face turns toward the
// direction it last hopped and its tail trails behind.
function drawFox(facing) {
    const lookX = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    const lookY = facing === 'up' ? -1 : facing === 'down' ? 1 : 0;
    const tailSide = facing === 'left' ? 1 : -1;

    // Bushy tail with a white tip.
    ctx.save();
    ctx.scale(tailSide, 1);
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.moveTo(8, -10);
    ctx.quadraticCurveTo(28, -10, 24, -30);
    ctx.quadraticCurveTo(14, -22, 8, -18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(23, -28, 4, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Feet, body and cream belly.
    ctx.fillStyle = '#b9561b';
    ctx.beginPath();
    ctx.ellipse(-6, -2, 5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -2, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0932b';
    ctx.beginPath();
    ctx.ellipse(0, -14, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath();
    ctx.ellipse(lookX * 2, -11, 7.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pointy ears with dark insides.
    ctx.fillStyle = '#f0932b';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(side * 13, -36);
        ctx.lineTo(side * 10, -53);
        ctx.lineTo(side * 2, -42);
        ctx.closePath();
        ctx.fill();
    });
    ctx.fillStyle = '#5d3a1a';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(side * 10.5, -40);
        ctx.lineTo(side * 9.5, -49);
        ctx.lineTo(side * 5, -42);
        ctx.closePath();
        ctx.fill();
    });

    // Head with a cream muzzle, eyes, nose and rosy cheeks.
    ctx.fillStyle = '#f0932b';
    ctx.beginPath();
    ctx.arc(0, -32, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath();
    ctx.ellipse(lookX * 4, -26 + lookY, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2d3436';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(side * 5 + lookX * 3.5, -34 + lookY * 1.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(side * 5 + lookX * 3.5 + 0.8, -35 + lookY * 1.5, 0.8, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#2d3436';
    ctx.beginPath();
    ctx.arc(lookX * 6, -28 + lookY, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 118, 117, 0.45)';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(side * 9 + lookX * 3, -29, 2.6, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawPlayer(foxPos) {
    // Ground shadow shrinks while the fox is in the air.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(foxPos.x, foxPos.groundY, 17 - foxPos.hop * 0.4, 5.5 - foxPos.hop * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stretch mid-hop, squash on landing, breathe gently while standing.
    let squashX = 1;
    let squashY = 1;
    if (player.moving) {
        squashX = 0.94;
        squashY = 1.06;
    } else if (player.landTimer > 0) {
        const squash = (player.landTimer / LAND_SQUASH_DURATION) * 0.16;
        squashX = 1 + squash;
        squashY = 1 - squash;
    } else {
        squashY = 1 + Math.sin(elapsedSeconds * 3) * 0.02;
    }

    ctx.save();
    ctx.translate(foxPos.x, foxPos.groundY - foxPos.hop);
    ctx.scale(squashX, squashY);
    drawFox(player.facing);
    ctx.restore();
}

// Spots, letters and the fox, painter-sorted so nearer things draw in front.
function drawBoardObjects() {
    const foxPos = foxPosition();
    const drawables = [];
    spots.forEach((spot) => {
        drawables.push({ sortY: spot.baseY - 0.5, draw: () => drawSpotLetter(spot, foxPos) });
        drawables.push({ sortY: spot.baseY, draw: () => drawSpot(spot) });
    });
    drawables.push({ sortY: foxPos.groundY + 4.5, draw: () => drawPlayer(foxPos) });
    drawables.sort((a, b) => a.sortY - b.sortY);
    drawables.forEach((drawable) => drawable.draw());
}

function slotRect(index, letterCount) {
    const totalWidth = letterCount * SLOT_WIDTH + (letterCount - 1) * SLOT_GAP;
    const areaLeft = 86;
    const areaRight = canvas.width - 16;
    const startX = areaLeft + (areaRight - areaLeft - totalWidth) / 2;
    const x = startX + index * (SLOT_WIDTH + SLOT_GAP);
    return { x, y: SLOT_TOP, cx: x + SLOT_WIDTH / 2, cy: SLOT_TOP + SLOT_HEIGHT / 2 };
}

// One letter box on the word sign: caught letters in colour, the letter to
// find next glowing gold, the rest as faint hints.
function drawSlot(letter, index, letterCount) {
    const slot = slotRect(index, letterCount);
    const filled = filledSlots[index];
    const incoming = !filled && index < nextLetterIndex;   // caught, still flying here
    const isNext = index === nextLetterIndex && gameState !== 'menu';
    const pop = slotPopTimers[index] > 0
        ? 1 + Math.sin((1 - slotPopTimers[index] / SLOT_POP_DURATION) * Math.PI) * 0.25
        : 1;

    ctx.save();
    ctx.translate(slot.cx, slot.cy);
    ctx.scale(pop, pop);

    ctx.fillStyle = filled || incoming ? '#f1edff' : isNext ? '#fff8dc' : '#f5f6fa';
    roundedRectPath(-SLOT_WIDTH / 2, -SLOT_HEIGHT / 2, SLOT_WIDTH, SLOT_HEIGHT, 10);
    ctx.fill();
    if (isNext) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 6);
        ctx.strokeStyle = `rgba(253, 203, 110, ${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 3 + pulse * 2;
    } else {
        ctx.strokeStyle = filled ? '#a29bfe' : '#dfe6e9';
        ctx.lineWidth = 2;
    }
    ctx.stroke();

    ctx.font = SLOT_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (filled) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(letter, 0, 2);
        ctx.fillStyle = slotColors[index];
        ctx.fillText(letter, 0, 2);
    } else if (!incoming) {
        ctx.fillStyle = isNext ? '#a4b0be' : '#dfe6e9';
        ctx.fillText(letter, 0, 2);
    }
    ctx.restore();
}

function drawSign() {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    roundedRectPath(8, 6, canvas.width - 16, 72, 16);
    ctx.fill();
    ctx.strokeStyle = '#cfc6ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!currentWord) {
        ctx.fillStyle = '#6c5ce7';
        ctx.font = `bold 26px ${TEXT_FONT_FAMILY}`;
        ctx.fillText('👀 Who is hiding? 👀', canvas.width / 2, 42);
        ctx.restore();
        return;
    }

    // A picture of the word to spell.
    ctx.fillStyle = '#fff4c7';
    ctx.beginPath();
    ctx.arc(48, 42, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `36px ${EMOJI_FONT_FAMILY}`;
    ctx.fillText(currentWord.picture, 48, 44);

    const letters = currentWord.word.split('');
    letters.forEach((letter, index) => drawSlot(letter, index, letters.length));
    ctx.restore();
}

function drawFlyers() {
    if (!currentWord) return;
    flyers.forEach((flyer) => {
        const target = slotRect(flyer.slotIndex, currentWord.word.length);
        const t = easeInOut(Math.min(1, flyer.progress));
        // Swoop up along a curve that dips into the slot from just above it.
        const controlX = (flyer.fromX + target.cx) / 2;
        const controlY = target.cy - 60;
        const x = (1 - t) * (1 - t) * flyer.fromX + 2 * (1 - t) * t * controlX + t * t * target.cx;
        const y = (1 - t) * (1 - t) * flyer.fromY + 2 * (1 - t) * t * controlY + t * t * target.cy;
        const scale = 1.25 - 0.4 * t;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.rotate(Math.sin(t * Math.PI) * 0.4);
        ctx.font = LETTER_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(flyer.letter, 0, 2);
        ctx.fillStyle = flyer.color;
        ctx.fillText(flyer.letter, 0, 2);
        ctx.restore();
    });
}

function drawParticles() {
    particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        if (p.shape === 'confetti') {
            ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        } else if (p.shape === 'leaf') {
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.shape === 'star') {
            // Four-pointed twinkle.
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.lineTo(p.size * 0.3, -p.size * 0.3);
            ctx.lineTo(p.size, 0);
            ctx.lineTo(p.size * 0.3, p.size * 0.3);
            ctx.lineTo(0, p.size);
            ctx.lineTo(-p.size * 0.3, p.size * 0.3);
            ctx.lineTo(-p.size, 0);
            ctx.lineTo(-p.size * 0.3, -p.size * 0.3);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });
}

function drawPopups() {
    ctx.save();
    ctx.font = `bold 20px ${TEXT_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    popups.forEach((popup) => {
        ctx.globalAlpha = Math.max(0, popup.life / popup.maxLife);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 5;
        ctx.strokeText(popup.text, popup.x, popup.y);
        ctx.fillStyle = popup.color;
        ctx.fillText(popup.text, popup.x, popup.y);
    });
    ctx.restore();
}

// Big card in the middle of the meadow: "Spell it!", "Hooray!", "Time's up!".
function drawCenterBanner() {
    if (!centerBanner) return;
    const age = centerBanner.maxLife - centerBanner.life;
    const scale = easeOutBack(Math.min(1, age / 0.35));
    const alpha = Math.min(1, centerBanner.life / 0.3);
    const hasSubtitle = Boolean(centerBanner.subtitle);
    const width = 340;
    const height = hasSubtitle ? 170 : 140;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(canvas.width / 2, GRID_TOP + 200);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    roundedRectPath(-width / 2, -height / 2, width, height, 24);
    ctx.fill();
    ctx.strokeStyle = '#a29bfe';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6c5ce7';
    ctx.font = `bold 22px ${TEXT_FONT_FAMILY}`;
    ctx.fillText(centerBanner.title, 0, -height / 2 + 28);

    const rowY = hasSubtitle ? -2 : 14;
    if (centerBanner.word) {
        // Picture, then the word in big letters (in their caught colours when cheering).
        const wordFont = `bold 48px ${LETTER_FONT_FAMILY}`;
        ctx.font = wordFont;
        const letters = centerBanner.word.split('');
        const letterWidths = letters.map((letter) => ctx.measureText(letter).width);
        const letterSpacing = 4;
        const wordWidth = letterWidths.reduce((sum, w) => sum + w, 0) + (letters.length - 1) * letterSpacing;
        const pictureWidth = 54;
        const gap = 14;
        let x = -(pictureWidth + gap + wordWidth) / 2;

        ctx.font = `44px ${EMOJI_FONT_FAMILY}`;
        ctx.fillText(centerBanner.picture, x + pictureWidth / 2, rowY);
        x += pictureWidth + gap;

        ctx.font = wordFont;
        ctx.lineJoin = 'round';
        letters.forEach((letter, index) => {
            const letterX = x + letterWidths[index] / 2;
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(letter, letterX, rowY + 2);
            ctx.fillStyle = centerBanner.colors ? centerBanner.colors[index] : '#2d3436';
            ctx.fillText(letter, letterX, rowY + 2);
            x += letterWidths[index] + letterSpacing;
        });
    } else {
        ctx.font = `56px ${EMOJI_FONT_FAMILY}`;
        ctx.fillText(centerBanner.picture, 0, rowY);
    }

    if (hasSubtitle) {
        ctx.fillStyle = '#636e72';
        ctx.font = `bold 18px ${TEXT_FONT_FAMILY}`;
        ctx.fillText(centerBanner.subtitle, 0, height / 2 - 28);
    }
    ctx.restore();
}

function drawToast() {
    if (!toast) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, toast.life / 0.4);
    ctx.font = `bold 16px ${TEXT_FONT_FAMILY}`;
    const width = Math.min(canvas.width - 20, ctx.measureText(toast.text).width + 30);
    const x = canvas.width / 2;
    const y = canvas.height - 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
    roundedRectPath(x - width / 2, y, width, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#6c5ce7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toast.text, x, y + 15);
    ctx.restore();
}

function render() {
    drawBackdrop();
    drawMeadow();
    drawDecorations();
    drawBoardObjects();
    drawSign();
    drawParticles();
    drawFlyers();
    drawPopups();
    drawCenterBanner();
    drawToast();
}

// ---- Game loop -----------------------------------------------------------
function gameLoop(timestamp) {
    // Delta time in seconds keeps movement smooth and frame-rate independent.
    // Clamp to [0, 0.05] so a backgrounded tab can't teleport everything.
    const deltaSeconds = Math.max(0, Math.min(0.05, (timestamp - lastFrameTime) / 1000)) || 0;
    lastFrameTime = timestamp;

    const active = gameState !== 'menu' && gameState !== 'over';
    if (active) update(deltaSeconds);
    render();

    if (gameState !== 'menu' && gameState !== 'over') {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// ---- Game flow -----------------------------------------------------------
function takeNextWord() {
    if (wordQueue.length === 0) {
        wordQueue = shuffle(WORDS[difficulty].slice());
        // Don't repeat the word just finished right after a reshuffle.
        if (currentWord && wordQueue.length > 1 && wordQueue[0].word === currentWord.word) {
            wordQueue.push(wordQueue.shift());
        }
    }
    return wordQueue.shift();
}

// New word: fresh hiding spots, then a "Spell it!" card before the hunt.
function beginWord() {
    currentWord = takeNextWord();
    nextLetterIndex = 0;
    const letters = currentWord.word.split('');
    filledSlots = letters.map(() => false);
    slotColors = letters.map(() => LETTER_COLORS[0]);
    slotPopTimers = letters.map(() => 0);
    flyers = [];
    generateLayout(settings.spotCount);

    gameState = 'intro';
    introTimer = INTRO_DURATION;
    centerBanner = {
        title: 'Spell it!',
        picture: currentWord.picture,
        word: currentWord.word,
        colors: null,
        subtitle: null,
        life: INTRO_DURATION,
        maxLife: INTRO_DURATION
    };
    toast = null;
    audio.newWord();
    audio.speak(`Let's spell ${currentWord.word.toLowerCase()}!`);
}

function beginPlaying() {
    gameState = 'playing';
    neededLastSeenTime = elapsedSeconds;
    showToast(`Find the letter ${neededLetter()}!`);
}

function beginCelebrate() {
    gameState = 'celebrate';
    celebrationFired = false;
    celebrateTimer = 0;
    hideAllLetters();
}

function beginTimeUp() {
    gameState = 'timeup';
    timeUpTimer = TIME_UP_DURATION;
    hideAllLetters();
    heldDirections = [];
    queuedDirection = null;
    walkTarget = null;
    audio.stopMusic();
    audio.timeUp();
    centerBanner = {
        title: "Time's up!",
        picture: '⏰',
        word: null,
        colors: null,
        subtitle: `You spelled ${wordsSpelled} ${wordsSpelled === 1 ? 'word' : 'words'}!`,
        life: TIME_UP_DURATION,
        maxLife: TIME_UP_DURATION
    };
    updateHud();
}

function startGame(level) {
    difficulty = level;
    settings = DIFFICULTY_SETTINGS[level];
    loadBestScore();

    score = 0;
    wordsSpelled = 0;
    completedWords = [];
    timeLeft = settings.timeLimit;
    lastShownSecond = null;
    elapsedSeconds = 0;
    particles = [];
    popups = [];
    flyers = [];
    toast = null;
    resetPlayer();
    currentWord = null;
    wordQueue = shuffle(WORDS[level].slice());

    startOverlay.classList.remove('show');
    gameOverScreen.classList.remove('show');

    audio.startMusic();
    beginWord();
    updateHud();

    lastFrameTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
    gameState = 'over';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;

    finalScoreDisplay.textContent = score;
    finalWordsDisplay.textContent = wordsSpelled;
    wordListDisplay.textContent = completedWords.map((entry) => entry.picture).join(' ');

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(bestScoreKey(), bestScore);
        bestScoreDisplay.textContent = bestScore;
        bestLine.textContent = '🏆 New best!';
    } else {
        bestLine.textContent = `Best (${difficulty}): ${bestScore}`;
    }

    updateTimeDisplay();
    gameOverScreen.classList.add('show');
}

// A sleepy meadow with a few letters peeking out, shown behind the level menu.
function setUpMenuScene() {
    currentWord = null;
    resetPlayer();
    generateLayout(DIFFICULTY_SETTINGS.easy.spotCount);
    ['A', 'B', 'C'].forEach((letter, index) => {
        const spot = spots[index];
        if (!spot) return;
        spot.phase = 'visible';
        spot.letter = letter;
        spot.color = LETTER_COLORS[index * 2];
    });
    spots.forEach((spot) => {
        spot.appear = 1;
        spot.appearDelay = 0;
    });
    centerBanner = null;
    toast = null;
    flyers = [];
    particles = [];
    popups = [];
}

function showMenu() {
    gameState = 'menu';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    audio.stopMusic();
    audio.stopSpeech();
    gameOverScreen.classList.remove('show');
    startOverlay.classList.add('show');
    setUpMenuScene();
    updateHud();
    render();
}

// ---- Controls ------------------------------------------------------------
// Keyboard: arrow keys (or WASD). A tap is one hop; hold to keep hopping.
document.addEventListener('keydown', (event) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction || gameState === 'menu' || gameState === 'over') return;
    event.preventDefault();
    if (event.repeat) return;   // holding is tracked by heldDirections, not key repeat
    holdDirection(direction);
});

document.addEventListener('keyup', (event) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (direction) releaseDirection(direction);
});

// Losing focus mid-hold would otherwise leave the fox walking forever.
window.addEventListener('blur', () => {
    heldDirections = [];
});

// Tap (or press and drag) on the meadow: the fox hops step by step to that tile.
// Coordinates are normalised against the rendered size so it works while the
// canvas is scaled down on small screens.
function tileFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor((y - GRID_TOP) / TILE_SIZE);
    if (col < 0 || col >= GRID_COLUMNS || row < 0 || row >= GRID_ROWS) return null;
    return { col, row };
}

canvas.addEventListener('pointerdown', (event) => {
    if (!canWalk()) return;
    const tile = tileFromPointer(event);
    if (!tile) return;
    event.preventDefault();
    pointerHeld = true;
    canvas.setPointerCapture(event.pointerId);
    heldDirections = [];
    queuedDirection = null;
    walkTarget = tile;
});

canvas.addEventListener('pointermove', (event) => {
    if (!pointerHeld || !canWalk()) return;
    const tile = tileFromPointer(event);
    if (tile) walkTarget = tile;
});

['pointerup', 'pointercancel'].forEach((eventType) => {
    canvas.addEventListener(eventType, () => {
        pointerHeld = false;
    });
});

// On-screen arrow pad: press to hop, hold to keep hopping (mobile + mouse).
directionButtons.forEach((button) => {
    const direction = button.dataset.direction;
    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        holdDirection(direction);
    });
    const release = () => releaseDirection(direction);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
});

// Difficulty selection and replay buttons.
difficultyButtons.forEach((button) => {
    button.addEventListener('click', () => startGame(button.dataset.level));
});
playAgainBtn.addEventListener('click', () => startGame(difficulty));
changeLevelBtn.addEventListener('click', showMenu);

// Mute toggle.
function updateMuteButton() {
    muteButton.textContent = audio.muted ? '🔇' : '🔊';
    muteButton.classList.toggle('muted', audio.muted);
}
muteButton.addEventListener('click', () => {
    audio.toggleMute();
    updateMuteButton();
});

// Stop any half-spoken word when leaving the page.
window.addEventListener('pagehide', () => audio.stopSpeech());

// ---- Boot ----------------------------------------------------------------
loadBestScore();
updateMuteButton();
setUpMenuScene();
updateHud();
render(); // show the meadow (with a few peeking letters) behind the level menu
