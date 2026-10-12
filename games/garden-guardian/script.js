// Garden Guardian — bluebirds drop seeds; water them into flowers while
// shooing hungry critters and blasting seed-stealing crows out of the sky.

// ---- DOM references ------------------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const dayDisplay = document.getElementById('day');
const flowersDisplay = document.getElementById('flowers');
const heartsDisplay = document.getElementById('hearts');
const bestScoreDisplay = document.getElementById('bestScore');
const startOverlay = document.getElementById('startOverlay');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreDisplay = document.getElementById('finalScore');
const finalFlowersDisplay = document.getElementById('finalFlowers');
const finalDaysDisplay = document.getElementById('finalDays');
const bestLine = document.getElementById('bestLine');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeLevelBtn = document.getElementById('changeLevelBtn');
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
const toolButtons = document.querySelectorAll('[data-tool]');
const muteButton = document.getElementById('muteButton');

// ---- Audio ---------------------------------------------------------------
// All sound is synthesised with the Web Audio API so the game stays
// dependency-free (no audio files to ship). A gentle pastoral loop plays in
// the background with one-shot effects on top, all behind a mute toggle.
const audio = {
    context: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    muted: localStorage.getItem('gardenGuardianMuted') === 'true',
    schedulerId: null,
    nextNoteTime: 0,
    currentStep: 0,

    // Slow, sunny sixteen-step loop: I–V–vi–IV in C major.
    tempo: 92,
    bassPattern: [130.81, null, 130.81, null, 98.00, null, 98.00, null,
                  110.00, null, 110.00, null, 87.31, null, 87.31, null],
    // Sparse music-box melody floating over the top.
    leadPattern: [659.25, null, 783.99, null, 1046.50, null, 987.77, null,
                  880.00, null, 1046.50, null, 1318.51, null, 987.77, null],

    // Lazily create the audio graph on the first user gesture (autoplay rules).
    ensureContext() {
        if (this.context) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.context = new AudioContextClass();

        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.9;
        this.masterGain.connect(this.context.destination);

        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = 0.3;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.context.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);
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

    // A tone that slides between two pitches — chirps, whistles and squawks.
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

    // Short burst of filtered noise — splashes, rustles and the shotgun blast.
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

        this.tone(this.bassPattern[step], time, stepDuration * 1.8, 'triangle', 0.6, this.musicGain);
        this.tone(this.leadPattern[step], time, stepDuration * 1.5, 'sine', 0.22, this.musicGain);

        // A soft brush of noise on the main beats keeps it strolling along.
        if (step % 8 === 0) {
            this.noiseBurst(time, 0.1, 0.18, false, this.musicGain);
        }
        if (step % 4 === 2) {
            this.noiseBurst(time, 0.025, 0.05, true, this.musicGain);
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

    // Watering: a splashy noise with a happy downward bloop.
    splash() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.noiseBurst(now, 0.22, 0.4, false);
        this.sweep(520, 210, now, 0.22, 'sine', 0.3);
    },

    // A seed plipping into the soil.
    seedPlip() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.sweep(680, 320, now, 0.08, 'sine', 0.3);
    },

    // A plant reaching its next growth stage.
    stageUp() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(523.25, now, 0.1, 'square', 0.2);
        this.tone(659.25, now + 0.09, 0.14, 'square', 0.2);
    },

    // Full bloom fanfare.
    bloom() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            this.tone(freq, now + i * 0.07, 0.16, 'square', 0.24);
        });
    },

    sparkle() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(1318.51, now, 0.08, 'sine', 0.22);
    },

    // Low double pulse warning that a plant is about to dry out.
    wiltAlarm() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(220, now, 0.12, 'sawtooth', 0.18);
        this.tone(220, now + 0.18, 0.12, 'sawtooth', 0.18);
    },

    // Sad descending line when a plant is lost.
    plantLost() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(392, now, 0.18, 'triangle', 0.3);
        this.tone(311.13, now + 0.16, 0.18, 'triangle', 0.3);
        this.tone(233.08, now + 0.32, 0.3, 'triangle', 0.3);
    },

    // Slide-whistle "shoo!" as a critter bolts.
    shoo() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.sweep(300, 950, now, 0.18, 'square', 0.22);
        this.noiseBurst(now, 0.1, 0.15, true);
    },

    // Little nibbling crunch while a pest munches a plant.
    munch() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.noiseBurst(now, 0.05, 0.25, false);
        this.tone(150, now, 0.06, 'square', 0.15);
    },

    // Crow squawk: two rough descending rasps.
    caw() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.sweep(620, 380, now, 0.12, 'sawtooth', 0.2);
        this.sweep(560, 330, now + 0.15, 0.12, 'sawtooth', 0.18);
    },

    // Bluebird hello: two quick cheerful chirps.
    chirp() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.sweep(1200, 1700, now, 0.07, 'sine', 0.2);
        this.sweep(1400, 1900, now + 0.1, 0.07, 'sine', 0.2);
    },

    // The shotgun: a big soft boom with a high crack on top.
    shotgun() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.noiseBurst(now, 0.35, 0.9, false);
        this.noiseBurst(now, 0.07, 0.5, true);
        this.tone(85, now, 0.28, 'sawtooth', 0.4);
    },

    // Startled squawk of a bird tumbling out of the sky.
    birdHit() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.sweep(820, 260, now, 0.3, 'sawtooth', 0.24);
    },

    // Losing a heart: a gloomy minor third.
    heartLost() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(329.63, now, 0.25, 'triangle', 0.3);
        this.tone(261.63, now + 0.2, 0.35, 'triangle', 0.3);
    },

    // Sunrise jingle for a new day.
    newDay() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            this.tone(freq, now + i * 0.1, 0.2, 'triangle', 0.28);
        });
    },

    toggleMute() {
        this.ensureContext();
        this.muted = !this.muted;
        localStorage.setItem('gardenGuardianMuted', this.muted);
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.9;
        }
        return this.muted;
    }
};

// ---- Static layout constants ---------------------------------------------
const SKY_BOTTOM = 190;           // where sky meets the garden (fence line)

// Eight tilled soil plots in two rows. Seeds only ever land in these.
const plots = [
    { x: 80, y: 310, plant: null }, { x: 200, y: 310, plant: null },
    { x: 320, y: 310, plant: null }, { x: 440, y: 310, plant: null },
    { x: 80, y: 470, plant: null }, { x: 200, y: 470, plant: null },
    { x: 320, y: 470, plant: null }, { x: 440, y: 470, plant: null }
];

// Growth: seed -> sprout -> bud -> bloom. Seconds per stage while watered.
const STAGE_DURATION = [4, 8, 10];
const STAGE_BLOOM = 3;

// Plants only grow while their water is above this; below it they look thirsty.
const GROW_WATER_MIN = 25;

const HEARTS_START = 3;
const DAY_LENGTH = 45;            // seconds per day
const SHOTGUN_COOLDOWN = 0.9;     // pump-action pause between blasts
const BLAST_RADIUS = 42;          // how close a blast must be to hit a bird
const MUNCH_EVERY = 1.9;          // seconds between critter bites
const PECK_EVERY = 1.7;           // seconds between crow pecks

const BLOOM_POINTS = 75;
const SPARKLE_POINTS = 5;         // trickle from every healthy bloom
const SPARKLE_EVERY = 12;
const CRITTER_POINTS = 10;
const CRITTER_SCARE_RADIUS = 70;  // the bang frightens every critter this close
const CROW_POINTS = 25;
const BLUEBIRD_PENALTY = 15;      // for shooting a friendly seed-carrier
const DAY_BONUS = 30;

const PETAL_COLORS = ['#ff6b81', '#feca57', '#ff9ff3', '#54a0ff', '#ff7f50', '#e84393', '#f5f6fa'];

// Each difficulty tunes how fast plants dry out, how long a bone-dry plant
// hangs on before dying, how often friends/pests arrive, and pest behaviour.
// Gap ranges are [min, max] seconds between spawns.
const DIFFICULTY_SETTINGS = {
    easy: {
        drainRate: 2.4, wiltGrace: 8, birdGap: [4, 7], critterGap: [10, 15],
        crowGap: [12, 18], critterSpeed: 30, crowSpeed: 60, maxCritters: 2, maxCrows: 1
    },
    medium: {
        drainRate: 3.2, wiltGrace: 6, birdGap: [4, 8], critterGap: [8, 12],
        crowGap: [9, 14], critterSpeed: 42, crowSpeed: 75, maxCritters: 3, maxCrows: 2
    },
    hard: {
        drainRate: 4.2, wiltGrace: 4.5, birdGap: [5, 9], critterGap: [6, 9],
        crowGap: [7, 11], critterSpeed: 55, crowSpeed: 90, maxCritters: 3, maxCrows: 3
    }
};

// ---- Mutable game state --------------------------------------------------
let gameState = 'menu';        // 'menu' | 'playing' | 'ending' | 'over'
let difficulty = 'medium';
let settings = DIFFICULTY_SETTINGS[difficulty];

let bluebirds = [];            // friendly seed couriers { x, y, vx, vy, state, targetPlot, dropped, phase }
let crows = [];                // plant-pecking villains { x, y, vx, vy, state, targetPlot, ... }
let critters = [];             // ground pests { type, x, y, state, targetPlot, ... }
let fallingSeeds = [];         // seeds mid-drop { x, y, vy, plot }
let particles = [];            // splashes, feathers, sparkles, crumbs
let popups = [];               // floating "+75" score texts
let blasts = [];               // shotgun muzzle rings { x, y, life, maxLife }

let score = 0;
let flowersBloomed = 0;
let hearts = HEARTS_START;
let bestScore = 0;
let day = 1;
let dayTimer = DAY_LENGTH;

let elapsedSeconds = 0;
let birdTimer = 0;             // countdowns to the next spawn of each kind
let critterTimer = 0;
let crowTimer = 0;

let activeTool = 'water';      // 'water' | 'shoo' | 'shotgun'
let shotgunCooldown = 0;
let shakeTime = 0;             // little screen shake for the shotgun / lost hearts

let toast = null;              // { text, life } one-line hint at the bottom
let dayBanner = null;          // { text, life } big "Day N!" splash
let endingTimer = 0;           // short pause after the last heart before game over

let mouseX = 0;
let mouseY = 0;
let mouseOnCanvas = false;     // only true for a real mouse — no cursor art on touch

let lastFrameTime = 0;
let animationFrameId = null;

// Fixed random scenery so the garden looks the same all game long.
const grassTufts = [];
for (let i = 0; i < 46; i++) {
    grassTufts.push({
        x: Math.random() * 520,
        y: 230 + Math.random() * 315
    });
}
const clouds = [
    { x: 110, y: 52, scale: 1.0, speed: 7 },
    { x: 300, y: 95, scale: 0.7, speed: 10 },
    { x: 450, y: 40, scale: 0.85, speed: 5 }
];

// ---- Helpers -------------------------------------------------------------
function rand(min, max) {
    return min + Math.random() * (max - min);
}

function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

function bestScoreKey() {
    return `gardenGuardianBest_${difficulty}`;
}

function loadBestScore() {
    bestScore = parseInt(localStorage.getItem(bestScoreKey()), 10) || 0;
    bestScoreDisplay.textContent = bestScore;
}

// Days make everything a little meaner: pests come sooner and soil dries faster.
function spawnRamp() {
    return Math.max(0.5, Math.pow(0.93, day - 1));
}

function drainFactor() {
    return Math.min(1.6, 1 + (day - 1) * 0.06);
}

function updateHud() {
    scoreDisplay.textContent = Math.max(0, Math.floor(score));
    dayDisplay.textContent = day;
    flowersDisplay.textContent = flowersBloomed;
    heartsDisplay.textContent = '❤️'.repeat(hearts) + '🖤'.repeat(HEARTS_START - hearts);
}

function showToast(text) {
    toast = { text, life: 3 };
}

function pushPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
}

// Generic particle burst. Feathers and sparkles flutter; dirt and water fall.
function spawnParticles(x, y, count, colors, options = {}) {
    const gravity = options.gravity !== undefined ? options.gravity : 320;
    const speed = options.speed !== undefined ? options.speed : 130;
    const flutter = options.flutter || false;
    const lifeBase = options.life !== undefined ? options.life : 0.6;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.4 + Math.random() * 0.8);
        const life = lifeBase * (0.6 + Math.random() * 0.7);
        particles.push({
            x, y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity - speed * 0.5,
            life,
            maxLife: life,
            size: 3 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity,
            flutter
        });
    }
}

// Pick a plot that has a plant on it, for a pest to go bother. Crows prefer
// the showiest plants (blooms first), critters just grab whatever's closest
// to random. Returns null when the garden is empty.
function pickPlantPlot(includeSeeds, preferGrown) {
    const candidates = plots.filter((plot) =>
        plot.plant && (includeSeeds || plot.plant.stage >= 1));
    if (candidates.length === 0) return null;

    if (preferGrown) {
        // Weight by stage so blooms are the tastiest targets.
        const total = candidates.reduce((sum, plot) => sum + plot.plant.stage + 1, 0);
        let roll = Math.random() * total;
        for (const plot of candidates) {
            roll -= plot.plant.stage + 1;
            if (roll <= 0) return plot;
        }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---- Plant lifecycle ------------------------------------------------------
function createPlant(plot) {
    plot.plant = {
        stage: 0,              // 0 seed, 1 sprout, 2 bud, 3 bloom
        growth: 0,             // 0..1 progress toward the next stage
        water: 0,              // fresh seeds arrive dry — first job: water them!
        petalColor: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        wiltTimer: null,       // counts down once bone-dry; death at zero
        sparkleTimer: SPARKLE_EVERY,
        shake: 0               // wobble timer while being munched
    };
}

function loseHeart() {
    hearts -= 1;
    shakeTime = Math.max(shakeTime, 0.3);
    audio.heartLost();
    updateHud();
    if (hearts <= 0 && gameState === 'playing') {
        beginEnding();
    }
}

// A plant dying outright (dried out, or eaten to nothing while grown).
function destroyPlant(plot, causeText, crumbColors) {
    spawnParticles(plot.x, plot.y - 20, 14, crumbColors, { gravity: 260, speed: 90 });
    plot.plant = null;
    audio.plantLost();
    showToast(causeText);
    loseHeart();
}

// One bite/peck of damage. Big plants get knocked back a stage; a sprout is
// gobbled whole (that costs a heart), and a bare seed is just lost.
function damagePlant(plot) {
    const plant = plot.plant;
    if (!plant) return;
    plant.shake = 0.35;
    if (plant.stage >= 2) {
        plant.stage -= 1;
        plant.growth = 0;
        audio.munch();
        spawnParticles(plot.x, plot.y - 40, 6, ['#66bb6a', plant.petalColor], { gravity: 200, speed: 70 });
    } else if (plant.stage === 1) {
        destroyPlant(plot, 'A plant got eaten! 💔', ['#66bb6a', '#a5d6a7', '#8d6e63']);
    } else {
        // A seed eaten before it sprouted — a shame, but no heart lost.
        spawnParticles(plot.x, plot.y - 10, 6, ['#8d6e63', '#6d4c41'], { gravity: 240, speed: 60 });
        plot.plant = null;
        audio.munch();
        showToast('A seed got gobbled up! 🐰');
    }
}

function updatePlants(deltaSeconds) {
    plots.forEach((plot) => {
        const plant = plot.plant;
        if (!plant) return;

        // Bigger plants are thirstier.
        const drain = settings.drainRate * drainFactor() * (0.75 + plant.stage * 0.15);
        plant.water = Math.max(0, plant.water - drain * deltaSeconds);

        // Only grown plants can die of thirst; a dry seed just waits patiently.
        if (plant.stage >= 1) {
            if (plant.water <= 0) {
                if (plant.wiltTimer === null) {
                    plant.wiltTimer = settings.wiltGrace;
                    audio.wiltAlarm();
                    showToast('A plant is drying out — water it! 💧');
                } else {
                    plant.wiltTimer -= deltaSeconds;
                    if (plant.wiltTimer <= 0) {
                        destroyPlant(plot, 'A plant dried out! 💔', ['#8d6e63', '#a1887f', '#795548']);
                        return;
                    }
                }
            } else {
                plant.wiltTimer = null;
            }
        }

        // Growth needs water in the tank.
        if (plant.stage < STAGE_BLOOM && plant.water > GROW_WATER_MIN) {
            plant.growth += deltaSeconds / STAGE_DURATION[plant.stage];
            if (plant.growth >= 1) {
                plant.stage += 1;
                plant.growth = 0;
                if (plant.stage === STAGE_BLOOM) {
                    flowersBloomed += 1;
                    score += BLOOM_POINTS;
                    audio.bloom();
                    pushPopup(plot.x, plot.y - 80, `+${BLOOM_POINTS}`, '#2e7d32');
                    spawnParticles(plot.x, plot.y - 60, 12, [plant.petalColor, '#fff59d'],
                        { gravity: 60, speed: 70, flutter: true, life: 1 });
                    showToast('A flower bloomed! 🌸');
                    updateHud();
                } else {
                    audio.stageUp();
                }
            }
        }

        // Healthy blooms drip bonus points as long as you keep them alive.
        if (plant.stage === STAGE_BLOOM && plant.water > 0) {
            plant.sparkleTimer -= deltaSeconds;
            if (plant.sparkleTimer <= 0) {
                plant.sparkleTimer = SPARKLE_EVERY;
                score += SPARKLE_POINTS;
                audio.sparkle();
                pushPopup(plot.x, plot.y - 75, `+${SPARKLE_POINTS}`, '#f9a825');
                spawnParticles(plot.x, plot.y - 60, 4, ['#fff59d', '#ffee58'],
                    { gravity: -30, speed: 30, flutter: true, life: 0.8 });
            }
        }

        if (plant.shake > 0) plant.shake -= deltaSeconds;
    });
}

// ---- Spawning ------------------------------------------------------------
function spawnBluebird() {
    const fromLeft = Math.random() < 0.5;
    const emptyPlots = plots.filter((plot) => !plot.plant);
    const targetPlot = emptyPlots.length > 0
        ? emptyPlots[Math.floor(Math.random() * emptyPlots.length)]
        : null;
    bluebirds.push({
        x: fromLeft ? -30 : canvas.width + 30,
        y: rand(55, 150),
        vx: (fromLeft ? 1 : -1) * rand(60, 80),
        vy: 0,
        state: 'flying',       // 'flying' | 'startled'
        targetPlot,
        dropped: targetPlot === null,
        phase: Math.random() * 6
    });
    audio.chirp();
}

function spawnCritter() {
    const targetPlot = pickPlantPlot(true, false);
    if (!targetPlot) return false;
    const fromLeft = Math.random() < 0.5;
    const type = Math.random() < 0.6 ? 'bunny' : 'snail';
    critters.push({
        type,
        x: fromLeft ? -40 : canvas.width + 40,
        y: targetPlot.y,
        state: 'walking',      // 'walking' | 'munching' | 'fleeing' | 'leaving'
        targetPlot,
        // Stand beside the plant, on the side it walked in from.
        eatOffset: fromLeft ? -32 : 32,
        speed: settings.critterSpeed * (type === 'bunny' ? 1 : 0.55),
        facing: fromLeft ? 1 : -1,
        fleeDir: 0,
        munchTimer: MUNCH_EVERY,
        hopPhase: Math.random() * 6
    });
    return true;
}

function spawnCrow() {
    const targetPlot = pickPlantPlot(true, true);
    if (!targetPlot) return false;
    const fromLeft = Math.random() < 0.5;
    crows.push({
        x: fromLeft ? -30 : canvas.width + 30,
        y: rand(45, 130),
        vx: 0,
        vy: 0,
        state: 'flying',       // 'flying' | 'pecking' | 'stealing' | 'leaving' | 'hit'
        targetPlot,
        peckTimer: PECK_EVERY,
        phase: Math.random() * 6,
        spin: 0,
        hasSeed: false
    });
    audio.caw();
    return true;
}

function updateSpawnTimers(deltaSeconds) {
    const ramp = spawnRamp();

    birdTimer -= deltaSeconds;
    if (birdTimer <= 0) {
        // Never more than a couple of couriers at once.
        if (bluebirds.filter((b) => b.state === 'flying').length < 2) {
            spawnBluebird();
            birdTimer = rand(settings.birdGap[0], settings.birdGap[1]) * ramp;
        } else {
            birdTimer = 2;
        }
    }

    // Pests grow slightly more numerous as the days go by.
    const extraPests = Math.min(2, Math.floor((day - 1) / 2));

    critterTimer -= deltaSeconds;
    if (critterTimer <= 0) {
        const active = critters.filter((c) => c.state !== 'fleeing').length;
        if (active < settings.maxCritters + extraPests && spawnCritter()) {
            critterTimer = rand(settings.critterGap[0], settings.critterGap[1]) * ramp;
        } else {
            critterTimer = 2.5;
        }
    }

    crowTimer -= deltaSeconds;
    if (crowTimer <= 0) {
        const active = crows.filter((c) => c.state !== 'hit' && c.state !== 'leaving').length;
        if (active < settings.maxCrows + Math.min(1, Math.floor((day - 1) / 3)) && spawnCrow()) {
            crowTimer = rand(settings.crowGap[0], settings.crowGap[1]) * ramp;
        } else {
            crowTimer = 2.5;
        }
    }
}

// ---- Entity updates ------------------------------------------------------
function updateBluebirds(deltaSeconds) {
    for (let i = bluebirds.length - 1; i >= 0; i--) {
        const bird = bluebirds[i];
        bird.phase += deltaSeconds * 10;

        if (bird.state === 'startled') {
            bird.x += bird.vx * deltaSeconds;
            bird.y += bird.vy * deltaSeconds;
            if (bird.y < -50 || bird.x < -80 || bird.x > canvas.width + 80) {
                bluebirds.splice(i, 1);
            }
            continue;
        }

        bird.x += bird.vx * deltaSeconds;

        // Release the seed as the bird passes over its chosen plot.
        if (!bird.dropped && bird.targetPlot) {
            const past = bird.vx > 0 ? bird.x >= bird.targetPlot.x : bird.x <= bird.targetPlot.x;
            if (past) {
                bird.dropped = true;
                if (!bird.targetPlot.plant) {
                    fallingSeeds.push({ x: bird.targetPlot.x, y: bird.y + 8, vy: 40, plot: bird.targetPlot });
                    audio.seedPlip();
                }
            }
        }

        if (bird.x < -60 || bird.x > canvas.width + 60) {
            bluebirds.splice(i, 1);
        }
    }
}

function updateFallingSeeds(deltaSeconds) {
    for (let i = fallingSeeds.length - 1; i >= 0; i--) {
        const seed = fallingSeeds[i];
        seed.vy += 420 * deltaSeconds;
        seed.y += seed.vy * deltaSeconds;
        if (seed.y >= seed.plot.y - 8) {
            spawnParticles(seed.plot.x, seed.plot.y - 6, 5, ['#8d6e63', '#a1887f'], { gravity: 260, speed: 50 });
            if (!seed.plot.plant) {
                createPlant(seed.plot);
                showToast('A bluebird planted a seed — water it! 💧');
            }
            fallingSeeds.splice(i, 1);
        }
    }
}

function updateCritters(deltaSeconds) {
    for (let i = critters.length - 1; i >= 0; i--) {
        const critter = critters[i];
        const moving = critter.state === 'walking' || critter.state === 'fleeing' || critter.state === 'leaving';
        critter.hopPhase += deltaSeconds * (critter.state === 'fleeing' ? 14 : moving ? 9 : 4);

        if (critter.state === 'fleeing') {
            critter.x += critter.fleeDir * critter.speed * 5 * deltaSeconds;
            critter.facing = critter.fleeDir;
            if (critter.x < -60 || critter.x > canvas.width + 60) critters.splice(i, 1);
            continue;
        }

        // Lost its snack (someone else ate it / it died)? Find another, or go home.
        if (critter.state !== 'leaving' && !critter.targetPlot.plant) {
            const next = pickPlantPlot(true, false);
            if (next) {
                critter.targetPlot = next;
                critter.eatOffset = critter.x < next.x ? -32 : 32;
                critter.state = 'walking';
            } else {
                critter.state = 'leaving';
                critter.fleeDir = critter.x > canvas.width / 2 ? 1 : -1;
            }
        }

        if (critter.state === 'leaving') {
            critter.x += critter.fleeDir * critter.speed * deltaSeconds;
            critter.facing = critter.fleeDir;
            if (critter.x < -60 || critter.x > canvas.width + 60) critters.splice(i, 1);
            continue;
        }

        if (critter.state === 'walking') {
            const targetX = critter.targetPlot.x + critter.eatOffset;
            const targetY = critter.targetPlot.y;
            const dx = targetX - critter.x;
            const dy = targetY - critter.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 6) {
                critter.state = 'munching';
                critter.munchTimer = MUNCH_EVERY;
            } else {
                critter.x += (dx / distance) * critter.speed * deltaSeconds;
                critter.y += (dy / distance) * critter.speed * deltaSeconds;
                critter.facing = dx >= 0 ? 1 : -1;
            }
        } else if (critter.state === 'munching') {
            // Face the plant while nibbling.
            critter.facing = critter.targetPlot.x >= critter.x ? 1 : -1;
            critter.munchTimer -= deltaSeconds;
            if (critter.munchTimer <= 0) {
                critter.munchTimer = MUNCH_EVERY;
                damagePlant(critter.targetPlot);
            }
        }
    }
}

function updateCrows(deltaSeconds) {
    for (let i = crows.length - 1; i >= 0; i--) {
        const crow = crows[i];
        crow.phase += deltaSeconds * 9;

        if (crow.state === 'hit') {
            crow.x += crow.vx * deltaSeconds;
            crow.y += crow.vy * deltaSeconds;
            crow.spin += deltaSeconds * 12;
            if (crow.y < -60 || crow.x < -80 || crow.x > canvas.width + 80) {
                crows.splice(i, 1);
            }
            continue;
        }

        if (crow.state === 'leaving') {
            const exitX = crow.x > canvas.width / 2 ? canvas.width + 60 : -60;
            const dx = exitX - crow.x;
            const dy = -80 - crow.y;
            const distance = Math.hypot(dx, dy);
            crow.x += (dx / distance) * settings.crowSpeed * 1.3 * deltaSeconds;
            crow.y += (dy / distance) * settings.crowSpeed * 1.3 * deltaSeconds;
            if (crow.x < -70 || crow.x > canvas.width + 70 || crow.y < -70) {
                crows.splice(i, 1);
            }
            continue;
        }

        // Target vanished? Pick a new victim or fly home.
        if (!crow.targetPlot.plant) {
            const next = pickPlantPlot(true, true);
            if (next) {
                crow.targetPlot = next;
                crow.state = 'flying';
            } else {
                crow.state = 'leaving';
            }
            continue;
        }

        const hoverX = crow.targetPlot.x;
        const hoverY = crow.targetPlot.y - 100;

        if (crow.state === 'flying') {
            const dx = hoverX - crow.x;
            const dy = hoverY - crow.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 8) {
                if (crow.targetPlot.plant.stage === 0) {
                    crow.state = 'stealing';
                } else {
                    crow.state = 'pecking';
                    crow.peckTimer = PECK_EVERY;
                    audio.caw();
                }
            } else {
                crow.x += (dx / distance) * settings.crowSpeed * deltaSeconds;
                crow.y += (dy / distance) * settings.crowSpeed * deltaSeconds;
            }
        } else if (crow.state === 'stealing') {
            // Dive down, snatch the seed, and make off with it.
            const grabY = crow.targetPlot.y - 18;
            crow.y += settings.crowSpeed * 1.6 * deltaSeconds;
            if (crow.y >= grabY) {
                crow.targetPlot.plant = null;
                crow.hasSeed = true;
                crow.state = 'leaving';
                audio.caw();
                showToast('A crow stole a seed! 🔫 Get it next time!');
            }
        } else if (crow.state === 'pecking') {
            // Hover-bob above the plant, taking a bite at each dip.
            crow.y = hoverY + Math.sin(crow.phase) * 7;
            crow.peckTimer -= deltaSeconds;
            if (crow.peckTimer <= 0) {
                crow.peckTimer = PECK_EVERY;
                damagePlant(crow.targetPlot);
            }
        }
    }
}

// ---- Tools ---------------------------------------------------------------
function selectTool(tool) {
    activeTool = tool;
    toolButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
}

function waterAt(x, y) {
    let closest = null;
    let closestDist = 60; // generous tap target for small fingers
    plots.forEach((plot) => {
        const d = dist(x, y, plot.x, plot.y - 25);
        if (d < closestDist) {
            closest = plot;
            closestDist = d;
        }
    });
    if (closest && closest.plant) {
        const wasSeed = closest.plant.stage === 0 && closest.plant.water <= GROW_WATER_MIN;
        closest.plant.water = 100;
        closest.plant.wiltTimer = null;
        audio.splash();
        spawnParticles(closest.x, closest.y - 30, 10, ['#4fc3f7', '#81d4fa', '#b3e5fc'],
            { gravity: 380, speed: 110 });
        if (wasSeed) showToast('Seed watered — here it comes! 🌱');
    } else {
        // Watering bare dirt is harmless fun.
        audio.splash();
        spawnParticles(x, y, 6, ['#4fc3f7', '#81d4fa'], { gravity: 380, speed: 80 });
    }
}

function fireShotgun(x, y) {
    if (shotgunCooldown > 0) return;
    shotgunCooldown = SHOTGUN_COOLDOWN;
    shakeTime = Math.max(shakeTime, 0.14);
    blasts.push({ x, y, life: 0.2, maxLife: 0.2 });
    audio.shotgun();

    // The bang panics every critter near it — they all bolt for the fence.
    let scaredCount = 0;
    critters.forEach((critter) => {
        if (critter.state === 'fleeing') return;
        if (dist(x, y, critter.x, critter.y - 14) < CRITTER_SCARE_RADIUS) {
            critter.state = 'fleeing';
            critter.fleeDir = critter.x > canvas.width / 2 ? 1 : -1;
            score += CRITTER_POINTS;
            pushPopup(critter.x, critter.y - 40, `+${CRITTER_POINTS}`, '#2e7d32');
            spawnParticles(critter.x, critter.y - 10, 6, ['#efebe9', '#d7ccc8'], { gravity: 160, speed: 60 });
            scaredCount += 1;
        }
    });
    if (scaredCount > 0) {
        audio.shoo();
    }

    // Crows next — they're the aerial target.
    let hitCrow = null;
    let hitDist = BLAST_RADIUS;
    crows.forEach((crow) => {
        if (crow.state === 'hit') return;
        const d = dist(x, y, crow.x, crow.y);
        if (d < hitDist) {
            hitCrow = crow;
            hitDist = d;
        }
    });
    if (hitCrow) {
        hitCrow.state = 'hit';
        hitCrow.hasSeed = false;
        hitCrow.vx = (Math.random() < 0.5 ? -1 : 1) * rand(90, 170);
        hitCrow.vy = -rand(240, 330);
        score += CROW_POINTS;
        audio.birdHit();
        pushPopup(hitCrow.x, hitCrow.y - 20, `+${CROW_POINTS}`, '#2e7d32');
        spawnParticles(hitCrow.x, hitCrow.y, 12, ['#263238', '#37474f', '#455a64'],
            { gravity: 50, speed: 90, flutter: true, life: 1.1 });
        return;
    }

    // Oops — that was a friendly seed courier.
    let hitBird = null;
    hitDist = BLAST_RADIUS;
    bluebirds.forEach((bird) => {
        if (bird.state === 'startled') return;
        const d = dist(x, y, bird.x, bird.y);
        if (d < hitDist) {
            hitBird = bird;
            hitDist = d;
        }
    });
    if (hitBird) {
        hitBird.state = 'startled';
        hitBird.dropped = true; // too rattled to deliver its seed
        hitBird.vx = (hitBird.vx >= 0 ? 1 : -1) * rand(200, 280);
        hitBird.vy = -rand(260, 340);
        score = Math.max(0, score - BLUEBIRD_PENALTY);
        audio.birdHit();
        pushPopup(hitBird.x, hitBird.y - 20, `-${BLUEBIRD_PENALTY}`, '#d63031');
        spawnParticles(hitBird.x, hitBird.y, 10, ['#42a5f5', '#90caf9', '#e3f2fd'],
            { gravity: 50, speed: 80, flutter: true, life: 1 });
        showToast("Oh no — don't shoot the bluebirds! They bring seeds! 🐦");
        return;
    }

    // A clean miss: just a puff of smoke.
    if (scaredCount === 0) {
        spawnParticles(x, y, 5, ['#cfd8dc', '#eceff1'], { gravity: -40, speed: 40, life: 0.5 });
    }
}

function applyTool(x, y) {
    if (activeTool === 'water') {
        waterAt(x, y);
    } else if (activeTool === 'shotgun') {
        fireShotgun(x, y);
    }
}

// ---- Effects updates -----------------------------------------------------
function updateParticles(deltaSeconds) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += p.gravity * deltaSeconds;
        if (p.flutter) {
            p.x += Math.sin(p.life * 12) * 30 * deltaSeconds;
            p.vy *= 1 - 1.5 * deltaSeconds; // feathers/sparkles drift, not plummet
        }
        p.x += p.vx * deltaSeconds;
        p.y += p.vy * deltaSeconds;
        p.life -= deltaSeconds;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function updateEffects(deltaSeconds) {
    updateParticles(deltaSeconds);

    for (let i = popups.length - 1; i >= 0; i--) {
        const popup = popups[i];
        popup.y -= 32 * deltaSeconds;
        popup.life -= deltaSeconds;
        if (popup.life <= 0) popups.splice(i, 1);
    }

    for (let i = blasts.length - 1; i >= 0; i--) {
        blasts[i].life -= deltaSeconds;
        if (blasts[i].life <= 0) blasts.splice(i, 1);
    }

    if (toast) {
        toast.life -= deltaSeconds;
        if (toast.life <= 0) toast = null;
    }
    if (dayBanner) {
        dayBanner.life -= deltaSeconds;
        if (dayBanner.life <= 0) dayBanner = null;
    }
    if (shakeTime > 0) shakeTime -= deltaSeconds;
}

// ---- Update loop ---------------------------------------------------------
function update(deltaSeconds) {
    elapsedSeconds += deltaSeconds;
    shotgunCooldown = Math.max(0, shotgunCooldown - deltaSeconds);

    dayTimer -= deltaSeconds;
    if (dayTimer <= 0) {
        dayTimer = DAY_LENGTH;
        day += 1;
        score += DAY_BONUS;
        dayBanner = { text: `🌅 Day ${day}!`, life: 2.2 };
        audio.newDay();
        updateHud();
    }

    clouds.forEach((cloud) => {
        cloud.x += cloud.speed * deltaSeconds;
        if (cloud.x > canvas.width + 60) cloud.x = -60;
    });

    updateSpawnTimers(deltaSeconds);
    updateBluebirds(deltaSeconds);
    updateFallingSeeds(deltaSeconds);
    updatePlants(deltaSeconds);
    updateCritters(deltaSeconds);
    updateCrows(deltaSeconds);
    updateEffects(deltaSeconds);

    scoreDisplay.textContent = Math.max(0, Math.floor(score));
}

// Short beat after the last heart so the final crumble is visible.
function updateEnding(deltaSeconds) {
    updateEffects(deltaSeconds);
    endingTimer -= deltaSeconds;
    if (endingTimer <= 0) {
        endGame();
    }
}

// ---- Rendering -----------------------------------------------------------
function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_BOTTOM);
    sky.addColorStop(0, '#6ec6f2');
    sky.addColorStop(1, '#bfe9ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, SKY_BOTTOM);

    // Smiley sun with slowly turning rays.
    const sunX = 62;
    const sunY = 62;
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 4;
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + elapsedSeconds * 0.15;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * 36, sunY + Math.sin(angle) * 36);
        ctx.lineTo(sunX + Math.cos(angle) * 46, sunY + Math.sin(angle) * 46);
        ctx.stroke();
    }
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f57f17';
    ctx.beginPath();
    ctx.arc(sunX - 9, sunY - 5, 3, 0, Math.PI * 2);
    ctx.arc(sunX + 9, sunY - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f57f17';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sunX, sunY + 4, 11, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // Drifting clouds.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    clouds.forEach((cloud) => {
        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        ctx.scale(cloud.scale, cloud.scale);
        ctx.beginPath();
        ctx.arc(-20, 0, 14, 0, Math.PI * 2);
        ctx.arc(0, -8, 18, 0, Math.PI * 2);
        ctx.arc(22, 0, 13, 0, Math.PI * 2);
        ctx.ellipse(0, 6, 34, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawGarden() {
    // Lawn.
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, SKY_BOTTOM, canvas.width, canvas.height - SKY_BOTTOM);

    // Little picket fence along the horizon.
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, SKY_BOTTOM + 10, canvas.width, 4);
    ctx.fillRect(0, SKY_BOTTOM + 22, canvas.width, 4);
    for (let x = 8; x < canvas.width; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, SKY_BOTTOM + 32);
        ctx.lineTo(x, SKY_BOTTOM + 6);
        ctx.lineTo(x + 5, SKY_BOTTOM);
        ctx.lineTo(x + 10, SKY_BOTTOM + 6);
        ctx.lineTo(x + 10, SKY_BOTTOM + 32);
        ctx.closePath();
        ctx.fill();
    }

    // Grass tufts for texture.
    ctx.strokeStyle = '#558b2f';
    ctx.lineWidth = 2;
    grassTufts.forEach((tuft) => {
        ctx.beginPath();
        ctx.moveTo(tuft.x, tuft.y);
        ctx.lineTo(tuft.x - 3, tuft.y - 6);
        ctx.moveTo(tuft.x, tuft.y);
        ctx.lineTo(tuft.x + 1, tuft.y - 7);
        ctx.moveTo(tuft.x, tuft.y);
        ctx.lineTo(tuft.x + 4, tuft.y - 5);
        ctx.stroke();
    });

    // Tilled soil plots.
    plots.forEach((plot) => {
        ctx.fillStyle = '#795548';
        ctx.beginPath();
        ctx.ellipse(plot.x, plot.y + 4, 46, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Furrow ridges.
        ctx.strokeStyle = 'rgba(93, 64, 55, 0.7)';
        ctx.beginPath();
        for (let r = -1; r <= 1; r++) {
            ctx.moveTo(plot.x - 30, plot.y + 4 + r * 6);
            ctx.lineTo(plot.x + 30, plot.y + 4 + r * 6);
        }
        ctx.stroke();
    });
}

function drawPlant(plot) {
    const plant = plot.plant;
    const baseX = plot.x;
    const baseY = plot.y;

    // Wobble while being munched; gentle sway otherwise.
    const shakeX = plant.shake > 0 ? Math.sin(elapsedSeconds * 55) * 3 : 0;

    // Colour and droop track thirst.
    const thirsty = plant.water <= 30;
    const bone_dry = plant.water <= 0;
    const stemColor = bone_dry ? '#8d6e63' : thirsty ? '#9e9d24' : '#2e7d32';
    const leafColor = bone_dry ? '#a1887f' : thirsty ? '#afb42b' : '#43a047';
    const droop = bone_dry ? 1 : thirsty ? 0.45 : 0;
    const sway = Math.sin(elapsedSeconds * 1.7 + baseX * 0.05) * (1.5 + plant.stage) * (1 - droop * 0.7);

    ctx.save();
    // Flash while on the wilt countdown so the danger is unmissable.
    if (plant.wiltTimer !== null) {
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(elapsedSeconds * 9);
    }

    if (plant.stage === 0) {
        // A seed nestled in a little mound.
        ctx.fillStyle = '#6d4c41';
        ctx.beginPath();
        ctx.ellipse(baseX, baseY - 2, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(baseX + shakeX, baseY - 8, 5, 7, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8d6e63';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(baseX + shakeX - 2, baseY - 12);
        ctx.lineTo(baseX + shakeX + 2, baseY - 4);
        ctx.stroke();
    } else {
        const height = plant.stage === 1 ? 20 + plant.growth * 10
            : plant.stage === 2 ? 36 + plant.growth * 12
            : 52;
        const tipX = baseX + sway + droop * 12 + shakeX;
        const tipY = baseY - height + droop * 10;

        // Stem, bending with the sway/droop.
        ctx.strokeStyle = stemColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(baseX, baseY - height * 0.6, tipX, tipY);
        ctx.stroke();

        // Leaf pairs.
        const drawLeafPair = (ly) => {
            ctx.fillStyle = leafColor;
            ctx.beginPath();
            ctx.ellipse(baseX - 9, ly, 9, 4.5, -0.5 - droop * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(baseX + 9, ly, 9, 4.5, 0.5 + droop * 0.5, 0, Math.PI * 2);
            ctx.fill();
        };
        drawLeafPair(baseY - height * 0.4);
        if (plant.stage >= 2) drawLeafPair(baseY - height * 0.7);

        if (plant.stage === 2) {
            // A closed bud with a peek of petal colour.
            ctx.fillStyle = leafColor;
            ctx.beginPath();
            ctx.ellipse(tipX, tipY - 6, 8, 11, sway * 0.02, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = plant.petalColor;
            ctx.beginPath();
            ctx.ellipse(tipX, tipY - 13, 4.5, 5.5, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (plant.stage === STAGE_BLOOM) {
            // Full flower: a ring of petals with a smiling face.
            const cx = tipX;
            const cy = tipY - 8;
            ctx.fillStyle = bone_dry ? '#bcaaa4' : plant.petalColor;
            for (let p = 0; p < 6; p++) {
                const angle = (p / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.ellipse(cx + Math.cos(angle) * 13, cy + Math.sin(angle) * 13, 8.5, 6, angle, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#ffca28';
            ctx.beginPath();
            ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f57f17';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Face: happy when watered, worried when thirsty.
            ctx.fillStyle = '#5d4037';
            ctx.beginPath();
            ctx.arc(cx - 3, cy - 2, 1.3, 0, Math.PI * 2);
            ctx.arc(cx + 3, cy - 2, 1.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5d4037';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            if (thirsty) {
                ctx.arc(cx, cy + 5, 3, 1.15 * Math.PI, 1.85 * Math.PI); // frown
            } else {
                ctx.arc(cx, cy + 2, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); // smile
            }
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawWaterBar(plot) {
    const plant = plot.plant;
    const barX = plot.x - 21;
    const barY = plot.y - 92;
    const width = 42;
    const height = 6;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(barX - 1, barY - 1, width + 2, height + 2);
    const fill = Math.max(0, plant.water) / 100;
    ctx.fillStyle = plant.water > 30 ? '#29b6f6' : plant.water > 0 ? '#ffa726' : '#ef5350';
    ctx.fillRect(barX, barY, width * fill, height);

    // Pulsing droplet when the plant is thirsty or wilting — including dry
    // seeds, which won't sprout until they get their first drink.
    if (plant.water <= 30) {
        const pulse = 0.6 + 0.4 * Math.sin(elapsedSeconds * 8);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#039be5';
        ctx.beginPath();
        ctx.moveTo(plot.x, barY - 16);
        ctx.quadraticCurveTo(plot.x + 6, barY - 7, plot.x, barY - 4);
        ctx.quadraticCurveTo(plot.x - 6, barY - 7, plot.x, barY - 16);
        ctx.fill();
        ctx.restore();
    }
}

function drawBunny(critter) {
    const hop = Math.abs(Math.sin(critter.hopPhase)) *
        (critter.state === 'fleeing' ? 8 : critter.state === 'munching' ? 1 : 5);
    ctx.save();
    ctx.translate(critter.x, critter.y - hop);
    ctx.scale(critter.facing, 1);

    // Tail, body, head.
    ctx.fillStyle = '#eceff1';
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-13, -9, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -11, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, -19, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears with pink centres — nibbling makes them bob.
    const earTilt = critter.state === 'munching' ? Math.sin(elapsedSeconds * 10) * 0.15 : 0;
    [[-0.35, 8], [0.1, 12]].forEach(([tilt, ex]) => {
        ctx.save();
        ctx.translate(ex, -26);
        ctx.rotate(tilt + earTilt);
        ctx.fillStyle = '#eceff1';
        ctx.beginPath();
        ctx.ellipse(0, -6, 3.4, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f8bbd0';
        ctx.beginPath();
        ctx.ellipse(0, -5, 1.6, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Face and feet.
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(13.5, -21, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f48fb1';
    ctx.beginPath();
    ctx.arc(18, -18, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eceff1';
    ctx.beginPath();
    ctx.ellipse(4, -2, 5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(-6, -2, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawSnail(critter) {
    const squish = 1 + Math.sin(critter.hopPhase) * 0.05;
    ctx.save();
    ctx.translate(critter.x, critter.y);
    ctx.scale(critter.facing * squish, 1);

    // Slug body with eye stalks.
    ctx.fillStyle = '#bcaaa4';
    ctx.beginPath();
    ctx.ellipse(2, -5, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, -8);
    ctx.lineTo(17, -17);
    ctx.moveTo(10, -9);
    ctx.lineTo(11, -17);
    ctx.stroke();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.arc(17, -18, 2, 0, Math.PI * 2);
    ctx.arc(11, -18, 2, 0, Math.PI * 2);
    ctx.fill();

    // Spiral shell.
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.arc(-4, -13, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-4, -13, 6.5, 0, Math.PI * 1.6);
    ctx.arc(-4, -13, 3, Math.PI * 1.6, Math.PI * 3);
    ctx.stroke();

    ctx.restore();
}

function drawCrow(crow) {
    const flap = Math.sin(crow.phase) * (crow.state === 'pecking' ? 0.35 : 0.8);
    ctx.save();
    ctx.translate(crow.x, crow.y);
    if (crow.state === 'hit') {
        ctx.rotate(crow.spin);
    } else if (crow.state === 'pecking' || crow.state === 'stealing') {
        ctx.rotate(0.5); // head-down, going for the plant
    }

    // Tail, body, head.
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(-24, -8);
    ctx.lineTo(-22, 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(13, -6, 7, 0, Math.PI * 2);
    ctx.fill();

    // Beak and beady eye.
    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.moveTo(19, -8);
    ctx.lineTo(28, -4);
    ctx.lineTo(19, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(14, -7, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(14.7, -7, 1.1, 0, Math.PI * 2);
    ctx.fill();

    // Flapping wing.
    ctx.save();
    ctx.translate(-2, -3);
    ctx.rotate(flap);
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.ellipse(-2, -6, 11, 6, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A pilfered seed in its beak.
    if (crow.hasSeed) {
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(26, -1, 4, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawBluebird(bird) {
    const flap = Math.sin(bird.phase) * 0.8;
    const bob = Math.sin(bird.phase * 0.4) * 3;
    const facing = bird.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(bird.x, bird.y + bob);
    ctx.scale(facing, 1);
    if (bird.state === 'startled') ctx.rotate(Math.sin(elapsedSeconds * 20) * 0.3);

    // Body with a pale belly.
    ctx.fillStyle = '#42a5f5';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e3f2fd';
    ctx.beginPath();
    ctx.ellipse(1, 3, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head, beak, eye.
    ctx.fillStyle = '#42a5f5';
    ctx.beginPath();
    ctx.arc(10, -5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.moveTo(14, -6.5);
    ctx.lineTo(21, -4.5);
    ctx.lineTo(14, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(11, -6, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(11.6, -6, 1, 0, Math.PI * 2);
    ctx.fill();

    // Tail and wing.
    ctx.fillStyle = '#1e88e5';
    ctx.beginPath();
    ctx.moveTo(-9, -1);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-16, 2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(-1, -2);
    ctx.rotate(flap);
    ctx.beginPath();
    ctx.ellipse(-1, -5, 8, 4.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The seed it's carrying.
    if (!bird.dropped) {
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(2, 9, 3.5, 4.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawBlast(blast) {
    const t = 1 - blast.life / blast.maxLife;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, 8 + t * 30, 0, Math.PI * 2);
    ctx.stroke();
    // Pellet spokes.
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        const inner = 10 + t * 26;
        ctx.beginPath();
        ctx.moveTo(blast.x + Math.cos(angle) * inner, blast.y + Math.sin(angle) * inner);
        ctx.lineTo(blast.x + Math.cos(angle) * (inner + 9), blast.y + Math.sin(angle) * (inner + 9));
        ctx.stroke();
    }
    ctx.restore();
}

function drawParticles() {
    particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        if (p.flutter) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, p.life * 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    });
    ctx.globalAlpha = 1;
}

function drawPopups() {
    ctx.font = 'bold 18px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    popups.forEach((popup) => {
        ctx.globalAlpha = Math.max(0, popup.life / popup.maxLife);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 4;
        ctx.strokeText(popup.text, popup.x, popup.y);
        ctx.fillStyle = popup.color;
        ctx.fillText(popup.text, popup.x, popup.y);
    });
    ctx.globalAlpha = 1;
}

function drawToast() {
    if (!toast) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, toast.life / 0.5);
    ctx.font = 'bold 15px "Comic Sans MS", sans-serif';
    const width = ctx.measureText(toast.text).width + 28;
    const x = canvas.width / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, 524, width, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#2e7d32';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toast.text, x, 539);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
}

function drawDayBanner() {
    if (!dayBanner) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, dayBanner.life / 0.6);
    ctx.font = 'bold 36px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 6;
    ctx.strokeText(dayBanner.text, canvas.width / 2, 130);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(dayBanner.text, canvas.width / 2, 130);
    ctx.restore();
}

// The tool cursor, drawn in-canvas (the CSS cursor is hidden). Mouse only.
function drawCursor() {
    if (!mouseOnCanvas || gameState !== 'playing') return;
    ctx.save();
    if (activeTool === 'shotgun') {
        const ready = shotgunCooldown <= 0;
        ctx.strokeStyle = ready ? '#d63031' : '#9e9e9e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 12, 0, Math.PI * 2);
        ctx.moveTo(mouseX - 18, mouseY);
        ctx.lineTo(mouseX - 6, mouseY);
        ctx.moveTo(mouseX + 6, mouseY);
        ctx.lineTo(mouseX + 18, mouseY);
        ctx.moveTo(mouseX, mouseY - 18);
        ctx.lineTo(mouseX, mouseY - 6);
        ctx.moveTo(mouseX, mouseY + 6);
        ctx.lineTo(mouseX, mouseY + 18);
        ctx.stroke();
        // Reload progress arc while pumping the next shell.
        if (!ready) {
            ctx.strokeStyle = '#ffb300';
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, 16, -Math.PI / 2,
                -Math.PI / 2 + (1 - shotgunCooldown / SHOTGUN_COOLDOWN) * Math.PI * 2);
            ctx.stroke();
        }
    } else {
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.fillText('💧', mouseX, mouseY + 8);
    }
    ctx.restore();
}

function render() {
    ctx.save();
    if (shakeTime > 0) {
        ctx.translate(rand(-3, 3), rand(-3, 3));
    }

    drawSky();
    drawGarden();

    // Ground layer, painter-sorted so nearer things draw in front.
    const groundThings = [];
    plots.forEach((plot) => {
        if (plot.plant) groundThings.push({ y: plot.y, draw: () => drawPlant(plot) });
    });
    critters.forEach((critter) => {
        groundThings.push({
            y: critter.y,
            draw: () => (critter.type === 'bunny' ? drawBunny(critter) : drawSnail(critter))
        });
    });
    groundThings.sort((a, b) => a.y - b.y);
    groundThings.forEach((thing) => thing.draw());

    plots.forEach((plot) => {
        if (plot.plant) drawWaterBar(plot);
    });

    // Falling seeds, then birds over everything.
    fallingSeeds.forEach((seed) => {
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(seed.x, seed.y, 4, 5.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
    });
    bluebirds.forEach(drawBluebird);
    crows.forEach(drawCrow);

    blasts.forEach(drawBlast);
    drawParticles();
    drawPopups();
    drawDayBanner();
    drawToast();
    drawCursor();

    ctx.restore();
}

// ---- Game loop -----------------------------------------------------------
function gameLoop(timestamp) {
    // Delta time in seconds keeps movement smooth and frame-rate independent.
    // Clamp to [0, 0.05] so a backgrounded tab can't teleport everything.
    const deltaSeconds = Math.max(0, Math.min(0.05, (timestamp - lastFrameTime) / 1000)) || 0;
    lastFrameTime = timestamp;

    if (gameState === 'playing') {
        update(deltaSeconds);
    } else if (gameState === 'ending') {
        updateEnding(deltaSeconds);
    }
    render();

    if (gameState === 'playing' || gameState === 'ending') {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// ---- Game flow -----------------------------------------------------------
function startGame(level) {
    difficulty = level;
    settings = DIFFICULTY_SETTINGS[level];
    loadBestScore();

    plots.forEach((plot) => { plot.plant = null; });
    bluebirds = [];
    crows = [];
    critters = [];
    fallingSeeds = [];
    particles = [];
    popups = [];
    blasts = [];

    score = 0;
    flowersBloomed = 0;
    hearts = HEARTS_START;
    day = 1;
    dayTimer = DAY_LENGTH;
    elapsedSeconds = 0;
    shotgunCooldown = 0;
    shakeTime = 0;
    toast = null;
    dayBanner = null;

    // The first bluebird arrives almost immediately; pests give the player a
    // head start so there's something growing before trouble shows up.
    birdTimer = 1.2;
    critterTimer = rand(settings.critterGap[0], settings.critterGap[1]) + 6;
    crowTimer = rand(settings.crowGap[0], settings.crowGap[1]) + 10;

    selectTool('water');
    updateHud();
    showToast('Here comes a bluebird with your first seed! 🐦');

    startOverlay.classList.remove('show');
    gameOverScreen.classList.remove('show');

    gameState = 'playing';
    lastFrameTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);

    audio.startMusic();
}

function beginEnding() {
    gameState = 'ending';
    endingTimer = 1.3;
    audio.stopMusic();
}

function endGame() {
    gameState = 'over';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const finalScore = Math.max(0, Math.floor(score));
    finalScoreDisplay.textContent = finalScore;
    finalFlowersDisplay.textContent = flowersBloomed;
    finalDaysDisplay.textContent = day;

    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem(bestScoreKey(), bestScore);
        bestScoreDisplay.textContent = bestScore;
        bestLine.textContent = '🏆 New best!';
    } else {
        bestLine.textContent = `Best (${difficulty}): ${bestScore}`;
    }

    gameOverScreen.classList.add('show');
}

function showMenu() {
    gameState = 'menu';
    audio.stopMusic();
    gameOverScreen.classList.remove('show');
    startOverlay.classList.add('show');
    render(); // draw the idle garden behind the menu
}

// ---- Controls ------------------------------------------------------------
// Convert a pointer event to canvas coordinates (the canvas may be CSS-scaled).
function canvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

canvas.addEventListener('pointerdown', (event) => {
    if (gameState !== 'playing') return;
    const { x, y } = canvasCoords(event);
    applyTool(x, y);
    event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
    const { x, y } = canvasCoords(event);
    mouseX = x;
    mouseY = y;
    mouseOnCanvas = event.pointerType === 'mouse';
});

canvas.addEventListener('pointerleave', () => {
    mouseOnCanvas = false;
});

// Tool buttons + number-key shortcuts.
toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
});

document.addEventListener('keydown', (e) => {
    if (e.key === '1') {
        selectTool('water');
    } else if (e.key === '2') {
        selectTool('shotgun');
    }
});

// Difficulty selection and replay buttons.
difficultyButtons.forEach((btn) => {
    btn.addEventListener('click', () => startGame(btn.dataset.level));
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

// ---- Boot ----------------------------------------------------------------
loadBestScore();
updateMuteButton();
updateHud();
render(); // show the sunny, empty garden behind the level menu
