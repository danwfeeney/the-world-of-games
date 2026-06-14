// Car Dodge — switch lanes to avoid oncoming traffic and collect coins.

// ---- DOM references ------------------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const coinsDisplay = document.getElementById('coins');
const speedDisplay = document.getElementById('speed');
const ammoDisplay = document.getElementById('ammo');
const bestScoreDisplay = document.getElementById('bestScore');
const startOverlay = document.getElementById('startOverlay');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreDisplay = document.getElementById('finalScore');
const finalCoinsDisplay = document.getElementById('finalCoins');
const bestLine = document.getElementById('bestLine');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeLevelBtn = document.getElementById('changeLevelBtn');
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
const directionButtons = document.querySelectorAll('[data-direction]');
const throttleButtons = document.querySelectorAll('[data-throttle]');
const fireButton = document.getElementById('fireButton');
const muteButton = document.getElementById('muteButton');

// ---- Audio ---------------------------------------------------------------
// All sound is synthesised with the Web Audio API so the game stays
// dependency-free (no audio files to ship). The engine provides a looping
// background soundtrack plus one-shot sound effects, all behind a mute toggle.
const audio = {
    context: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    muted: localStorage.getItem('carDodgeMuted') === 'true',
    schedulerId: null,
    nextNoteTime: 0,
    currentStep: 0,

    // Tempo: sixteen sixteenth-note steps make one 4-second loop.
    tempo: 124,
    // Driving bass riff (A minor) — null means a rest.
    bassPattern: [110.00, null, 110.00, 164.81, 130.81, null, 130.81, 196.00,
                  146.83, null, 146.83, 220.00, 130.81, null, 196.00, 164.81],
    // Sparkly lead arpeggio an octave or two up.
    leadPattern: [440.00, 523.25, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25,
                  698.46, 659.25, 587.33, 523.25, 659.25, 783.99, 880.00, 659.25],

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
        this.musicGain.gain.value = 0.32;
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

    // Short burst of filtered noise — used for the hi-hat and the crash.
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
        filter.frequency.value = highpass ? 6000 : 1200;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(peakGain, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination || this.sfxGain);
        source.start(startTime);
        source.stop(startTime + duration);
    },

    // Schedule the bass note, lead note and drums for one sequencer step.
    scheduleStep(step, time) {
        const stepDuration = 30 / this.tempo; // seconds per sixteenth note

        this.tone(this.bassPattern[step], time, stepDuration * 1.4, 'triangle', 0.8, this.musicGain);

        if (step % 2 === 0) {
            this.tone(this.leadPattern[step], time, stepDuration * 0.9, 'square', 0.18, this.musicGain);
        }

        // Kick on the beat, hi-hat on every step.
        if (step % 4 === 0) {
            this.noiseBurst(time, 0.12, 0.45, false, this.musicGain);
        }
        this.noiseBurst(time, 0.03, 0.12, true, this.musicGain);
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

    laneSwitch() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(660, now, 0.08, 'square', 0.3);
    },

    coin() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.tone(988, now, 0.09, 'square', 0.3);          // E6
        this.tone(1319, now + 0.08, 0.12, 'square', 0.3);  // E7 — bright "ding"
    },

    crash() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.noiseBurst(now, 0.5, 0.8, false);             // explosion-ish thud
        this.tone(160, now, 0.4, 'sawtooth', 0.4);         // descending growl
        this.tone(80, now + 0.05, 0.45, 'sawtooth', 0.4);
    },

    // Bright rising arpeggio when a weapon power-up is collected.
    weaponPickup() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        [784, 1047, 1319].forEach((freq, i) => {
            this.tone(freq, now + i * 0.06, 0.12, 'square', 0.28);
        });
    },

    // "Pew" laser shot: a quick downward frequency sweep.
    shoot() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.22);
    },

    // Small thud when a shot blows up a car.
    carHit() {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        this.noiseBurst(now, 0.2, 0.5, false);
        this.tone(120, now, 0.2, 'sawtooth', 0.3);
    },

    // Continuous engine drone: two detuned saw/square oscillators through a
    // low-pass filter. Its pitch, brightness and volume all rise with speed.
    engineOscA: null,
    engineOscB: null,
    engineGain: null,
    engineFilter: null,

    startEngine() {
        this.ensureContext();
        if (!this.context) return;
        if (this.context.state === 'suspended') this.context.resume();
        this.stopEngine();

        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0.0;
        this.engineGain.connect(this.masterGain);

        this.engineFilter = this.context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 500;
        this.engineFilter.connect(this.engineGain);

        this.engineOscA = this.context.createOscillator();
        this.engineOscA.type = 'sawtooth';
        this.engineOscA.frequency.value = 45;
        this.engineOscA.connect(this.engineFilter);

        this.engineOscB = this.context.createOscillator();
        this.engineOscB.type = 'square';
        this.engineOscB.frequency.value = 67;   // slightly detuned for a rougher idle
        this.engineOscB.connect(this.engineFilter);

        this.engineOscA.start();
        this.engineOscB.start();
        this.engineGain.gain.setTargetAtTime(0.07, this.context.currentTime, 0.1);
    },

    // speedRatio is 0 (idle) .. 1 (top speed). Higher = faster, brighter, louder.
    updateEngine(speedRatio) {
        if (!this.context || !this.engineOscA) return;
        const t = this.context.currentTime;
        const base = 45 + speedRatio * 150;     // 45 Hz idle -> ~195 Hz at full speed
        this.engineOscA.frequency.setTargetAtTime(base, t, 0.05);
        this.engineOscB.frequency.setTargetAtTime(base * 1.5, t, 0.05);
        this.engineFilter.frequency.setTargetAtTime(400 + speedRatio * 1700, t, 0.05);
        this.engineGain.gain.setTargetAtTime(0.06 + speedRatio * 0.09, t, 0.08);
    },

    stopEngine() {
        if (this.engineOscA) {
            try { this.engineOscA.stop(); this.engineOscB.stop(); } catch (e) { /* already stopped */ }
            this.engineOscA = null;
            this.engineOscB = null;
        }
        if (this.engineGain) {
            this.engineGain.disconnect();
            this.engineGain = null;
        }
    },

    toggleMute() {
        this.ensureContext();
        this.muted = !this.muted;
        localStorage.setItem('carDodgeMuted', this.muted);
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.9;
        }
        return this.muted;
    }
};

// ---- Static layout constants ---------------------------------------------
const LANE_COUNT = 3;
const LANE_WIDTH = canvas.width / LANE_COUNT;          // 120px with a 360px canvas
const CAR_WIDTH = 64;
const CAR_HEIGHT = 104;
const PLAYER_TOP = canvas.height - CAR_HEIGHT - 24;    // player sits near the bottom
const COIN_RADIUS = 18;

// Each difficulty sets the slow forward-speed band of the other cars (kept
// narrow so rows don't bunch into each other), the starting vertical gap kept
// clear between rows of traffic, how quickly that gap tightens over time, and
// how likely a row is to block two lanes instead of one.
const DIFFICULTY_SETTINGS = {
    easy:   { trafficMin: 45, trafficMax: 75,  startGap: 300, rampRate: 0.012, twoLaneChance: 0.10 },
    medium: { trafficMin: 60, trafficMax: 95,  startGap: 280, rampRate: 0.016, twoLaneChance: 0.35 },
    hard:   { trafficMin: 80, trafficMax: 115, startGap: 260, rampRate: 0.022, twoLaneChance: 0.60 }
};

// Smallest vertical gap ever kept clear at the top before a new row spawns —
// always leaves the player room to see a row and pick a lane.
const MIN_SPAWN_GAP = CAR_HEIGHT + 70;

// The car has a throttle: it only moves forward while the accelerator is held,
// coasts to a stop otherwise, and brakes harder on demand (pixels/second²).
const PLAYER_MAX_SPEED = 520;
const ACCELERATION = 240;      // while ↑ / accelerate is held
const COAST_FRICTION = 80;     // gentle slow-down when nothing is held
const BRAKE_DECEL = 360;       // stronger slow-down while ↓ / brake is held

// How long the crash explosion plays before the game-over screen appears.
const EXPLOSION_DURATION = 0.85;

// A weapon power-up drops onto the road every time the score crosses one of
// these checkpoints. Collecting it grants shots; spacebar fires them upward to
// blow up cars.
const WEAPON_CHECKPOINT = 500;   // score points between weapon drops
const AMMO_PER_PICKUP = 3;       // shots granted per power-up collected
const PROJECTILE_SPEED = 620;    // pixels/second, travelling up the road
const SHOT_BONUS = 25;           // score for destroying a car with a shot

const TRAFFIC_COLORS = ['#48dbfb', '#1dd1a1', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];
const COIN_POINTS = 50;

// ---- Mutable game state --------------------------------------------------
let gameState = 'menu';        // 'menu' | 'playing' | 'exploding' | 'over'
let difficulty = 'medium';
let settings = DIFFICULTY_SETTINGS[difficulty];

let trafficCars = [];          // { lane, x, y, speed, color }
let coins = [];                // { lane, x, y }
let weapons = [];              // weapon power-ups on the road { x, y }
let projectiles = [];          // shots in flight { x, y }
let particles = [];            // explosion debris { x, y, vx, vy, life, maxLife, size, color }

let ammo = 0;                  // shots available; spacebar / fire button uses them
let lastWeaponCheckpoint = 0;  // highest checkpoint already passed

let playerLane = 1;            // target lane index (0..2)
let playerX = laneCenter(playerLane) - CAR_WIDTH / 2; // animated current x of the car
let playerSpeed = 0;           // forward speed (pixels/second); throttle-controlled
let accelerating = false;      // ↑ / accelerate button held
let braking = false;           // ↓ / brake button held

let score = 0;
let coinCount = 0;
let bestScore = 0;

let elapsedSeconds = 0;
let lastOpenLane = 1;          // guarantees every spawned row leaves a reachable gap
let roadScroll = 0;            // animates the dashed lane lines for a sense of motion
let explosionTimer = 0;        // counts down the crash animation before game over

let lastFrameTime = 0;
let animationFrameId = null;

// ---- Helpers -------------------------------------------------------------
function laneCenter(laneIndex) {
    return laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
}

function bestScoreKey() {
    return `carDodgeBest_${difficulty}`;
}

function loadBestScore() {
    bestScore = parseInt(localStorage.getItem(bestScoreKey()), 10) || 0;
    bestScoreDisplay.textContent = bestScore;
}

// Show the player's speed as a friendly gauge value rather than raw pixels/sec.
function updateSpeedDisplay() {
    speedDisplay.textContent = Math.round(playerSpeed / 4);
}

function updateAmmoDisplay() {
    ammoDisplay.textContent = ammo;
}

// Axis-aligned bounding-box overlap test used for both crashes and coin pickups.
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---- Spawning ------------------------------------------------------------
// Spawn one "row" of traffic. We always keep at least one open lane, and that
// open lane stays within one step of the previous row's open lane, so the
// player can always reach it in time — the game stays winnable however fast it
// gets. Coins are dropped into an open lane for a risk/reward grab.
function spawnRow() {
    // Pick the guaranteed-open lane adjacent to the previous one.
    const drift = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
    const openLane = Math.max(0, Math.min(LANE_COUNT - 1, lastOpenLane + drift));

    // Start by blocking every lane except the open one, then maybe unblock one
    // more so most rows only block a single lane (harder levels block two).
    const blockedLanes = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (lane !== openLane) blockedLanes.push(lane);
    }

    const blockTwoLanes = Math.random() < settings.twoLaneChance;
    if (!blockTwoLanes && blockedLanes.length > 1) {
        // Remove one blocked lane so only a single lane is occupied this row.
        const removeIndex = Math.floor(Math.random() * blockedLanes.length);
        blockedLanes.splice(removeIndex, 1);
    }

    // Every car in this row shares one slow cruising speed, so the row stays a
    // coherent band with its guaranteed open lane instead of smearing apart.
    const rowSpeed = settings.trafficMin +
        Math.random() * (settings.trafficMax - settings.trafficMin);
    blockedLanes.forEach((lane) => {
        trafficCars.push({
            lane,
            x: laneCenter(lane) - CAR_WIDTH / 2,
            y: -CAR_HEIGHT,
            speed: rowSpeed,
            color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
        });
    });

    // Occasionally drop a coin into an open lane (never on top of a car).
    const openLanes = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (!blockedLanes.includes(lane)) openLanes.push(lane);
    }
    if (Math.random() < 0.45 && openLanes.length > 0) {
        const coinLane = openLanes[Math.floor(Math.random() * openLanes.length)];
        coins.push({
            lane: coinLane,
            x: laneCenter(coinLane),
            y: -COIN_RADIUS * 2
        });
    }

    lastOpenLane = openLane;
}

// Drop a weapon power-up onto the road, preferring a lane that's clear near the
// top so the player can reach it.
function spawnWeapon() {
    const occupied = new Set(
        trafficCars.filter((car) => car.y < CAR_HEIGHT + 40).map((car) => car.lane)
    );
    const freeLanes = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (!occupied.has(lane)) freeLanes.push(lane);
    }
    const choices = freeLanes.length > 0 ? freeLanes : [0, 1, 2];
    const lane = choices[Math.floor(Math.random() * choices.length)];
    weapons.push({ x: laneCenter(lane), y: -40 });
}

// Fire a shot up the road, if the player is armed.
function fire() {
    if (gameState !== 'playing' || ammo <= 0) return;
    ammo -= 1;
    updateAmmoDisplay();
    projectiles.push({ x: playerX + CAR_WIDTH / 2, y: PLAYER_TOP });
    audio.shoot();
}

// ---- Update loop ---------------------------------------------------------
function update(deltaSeconds) {
    elapsedSeconds += deltaSeconds;

    // Throttle: the car only gains speed while the accelerator is held. Let go
    // and it coasts to a stop; hold the brake to slow down faster. So it never
    // moves forward on its own.
    if (accelerating) {
        playerSpeed += ACCELERATION * deltaSeconds;
    } else if (braking) {
        playerSpeed -= BRAKE_DECEL * deltaSeconds;
    } else {
        playerSpeed -= COAST_FRICTION * deltaSeconds;
    }
    playerSpeed = Math.max(0, Math.min(PLAYER_MAX_SPEED, playerSpeed));
    updateSpeedDisplay();
    audio.updateEngine(playerSpeed / PLAYER_MAX_SPEED);

    // Difficulty ramp: the clear gap kept between rows tightens the longer you
    // survive, down to a reaction-safe floor, so traffic gets denser over time.
    const rampFactor = Math.min(2.5, 1 + elapsedSeconds * settings.rampRate);
    const effectiveGap = Math.max(MIN_SPAWN_GAP, settings.startGap / rampFactor);

    // Spawn a new row only once the top of the road is clear by that gap. This
    // throttles spawning to however fast cars are actually descending, so the
    // road never overcrowds and there is always a reachable opening — however
    // slow or fast the player chooses to drive.
    if (trafficCars.every((car) => car.y >= effectiveGap)) {
        spawnRow();
    }

    // Smoothly slide the player car toward its target lane.
    const targetX = laneCenter(playerLane) - CAR_WIDTH / 2;
    playerX += (targetX - playerX) * Math.min(1, deltaSeconds * 14);

    // The road (and the coins resting on it) scroll past at the player's speed.
    // Each traffic car drifts relative to the player at the *difference* between
    // the player's speed and its own slow cruising speed: drive faster than a
    // car and it rushes up toward you; drive slower and it pulls away ahead.
    const groundScroll = playerSpeed * deltaSeconds;

    for (let i = trafficCars.length - 1; i >= 0; i--) {
        const car = trafficCars[i];
        car.y += (playerSpeed - car.speed) * deltaSeconds;

        if (rectsOverlap(playerX, PLAYER_TOP, CAR_WIDTH, CAR_HEIGHT,
                         car.x, car.y, CAR_WIDTH, CAR_HEIGHT)) {
            triggerCrash();
            return;
        }

        // Remove cars once they leave the bottom, or drift off the top when the
        // player is slower than they are.
        if (car.y > canvas.height || car.y < -CAR_HEIGHT - 4) {
            trafficCars.splice(i, 1);
        }
    }

    // Fly shots up the road. A shot blows up the first car it hits.
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const shot = projectiles[i];
        shot.y -= PROJECTILE_SPEED * deltaSeconds;

        let hit = false;
        for (let j = trafficCars.length - 1; j >= 0; j--) {
            const car = trafficCars[j];
            if (rectsOverlap(shot.x - 4, shot.y - 12, 8, 16,
                             car.x, car.y, CAR_WIDTH, CAR_HEIGHT)) {
                burstParticles(car.x + CAR_WIDTH / 2, car.y + CAR_HEIGHT / 2, 18);
                trafficCars.splice(j, 1);
                score += SHOT_BONUS;
                audio.carHit();
                hit = true;
                break;
            }
        }

        if (hit || shot.y < -20) {
            projectiles.splice(i, 1);
        }
    }

    // Move coins with the road and detect pickups.
    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        coin.y += groundScroll;

        if (rectsOverlap(playerX, PLAYER_TOP, CAR_WIDTH, CAR_HEIGHT,
                         coin.x - COIN_RADIUS, coin.y - COIN_RADIUS, COIN_RADIUS * 2, COIN_RADIUS * 2)) {
            coinCount++;
            score += COIN_POINTS;
            coinsDisplay.textContent = coinCount;
            audio.coin();
            coins.splice(i, 1);
            continue;
        }

        if (coin.y - COIN_RADIUS > canvas.height) {
            coins.splice(i, 1);
        }
    }

    // Move weapon power-ups with the road and detect pickups.
    for (let i = weapons.length - 1; i >= 0; i--) {
        const weapon = weapons[i];
        weapon.y += groundScroll;

        if (rectsOverlap(playerX, PLAYER_TOP, CAR_WIDTH, CAR_HEIGHT,
                         weapon.x - 20, weapon.y - 24, 40, 48)) {
            ammo += AMMO_PER_PICKUP;
            updateAmmoDisplay();
            audio.weaponPickup();
            weapons.splice(i, 1);
            continue;
        }

        if (weapon.y - 30 > canvas.height) {
            weapons.splice(i, 1);
        }
    }

    // Score climbs with distance travelled (i.e. how fast you choose to drive).
    score += groundScroll / 10;
    scoreDisplay.textContent = Math.floor(score);

    // Crossing a checkpoint drops a weapon power-up onto the road.
    const checkpoint = Math.floor(score / WEAPON_CHECKPOINT);
    if (checkpoint > lastWeaponCheckpoint) {
        lastWeaponCheckpoint = checkpoint;
        spawnWeapon();
    }

    // Advance any in-play car-explosion debris.
    updateParticles(deltaSeconds);

    // Scroll the dashed centre lines to sell the sense of speed.
    roadScroll = (roadScroll + groundScroll) % 60;
}

// ---- Rendering -----------------------------------------------------------
function drawRoad() {
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dashed lane dividers between the lanes.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 5;
    ctx.setLineDash([28, 32]);
    ctx.lineDashOffset = -roadScroll;
    for (let lane = 1; lane < LANE_COUNT; lane++) {
        const x = lane * LANE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Solid edges of the road.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(3, canvas.height);
    ctx.moveTo(canvas.width - 3, 0);
    ctx.lineTo(canvas.width - 3, canvas.height);
    ctx.stroke();
}

// Rounded rectangle path helper for drawing the car bodies.
function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawCar(x, y, bodyColor, isPlayer) {
    // Wheels.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, y + 16, 8, 24);
    ctx.fillRect(x + CAR_WIDTH - 4, y + 16, 8, 24);
    ctx.fillRect(x - 4, y + CAR_HEIGHT - 40, 8, 24);
    ctx.fillRect(x + CAR_WIDTH - 4, y + CAR_HEIGHT - 40, 8, 24);

    // Body.
    ctx.fillStyle = bodyColor;
    roundedRect(x, y, CAR_WIDTH, CAR_HEIGHT, 14);
    ctx.fill();

    // Windshields (front + rear).
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    roundedRect(x + 10, y + 14, CAR_WIDTH - 20, 22, 6);
    ctx.fill();
    roundedRect(x + 10, y + CAR_HEIGHT - 34, CAR_WIDTH - 20, 20, 6);
    ctx.fill();

    // Headlights / taillights tint to tell the player car apart.
    ctx.fillStyle = isPlayer ? '#fff59d' : '#ff6b6b';
    ctx.fillRect(x + 8, y + (isPlayer ? CAR_HEIGHT - 8 : 4), 12, 4);
    ctx.fillRect(x + CAR_WIDTH - 20, y + (isPlayer ? CAR_HEIGHT - 8 : 4), 12, 4);
}

function drawCoin(coin) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e6a817';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#e6a817';
    ctx.font = 'bold 20px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', coin.x, coin.y + 1);
}

function drawParticles() {
    particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

// Weapon power-up: a little missile/rocket in a soft glow.
function drawWeapon(weapon) {
    const x = weapon.x;
    const y = weapon.y;

    ctx.fillStyle = 'rgba(255, 206, 84, 0.30)';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.fillStyle = '#ee5253';
    roundedRect(x - 8, y - 12, 16, 26, 5);
    ctx.fill();

    // Nose cone.
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 12);
    ctx.lineTo(x + 8, y - 12);
    ctx.lineTo(x, y - 24);
    ctx.closePath();
    ctx.fill();

    // Fins.
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x - 12, y + 8, 5, 8);
    ctx.fillRect(x + 7, y + 8, 5, 8);

    // Window glint.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(x - 3, y - 6, 6, 6);
}

// A shot in flight: a bright bolt with a faint trail.
function drawProjectile(shot) {
    ctx.fillStyle = 'rgba(254, 202, 87, 0.35)';
    ctx.fillRect(shot.x - 2, shot.y - 4, 4, 22);

    ctx.fillStyle = '#feca57';
    roundedRect(shot.x - 4, shot.y - 12, 8, 16, 4);
    ctx.fill();

    ctx.fillStyle = '#fff7d6';
    ctx.fillRect(shot.x - 2, shot.y - 10, 4, 5);
}

function render() {
    drawRoad();
    coins.forEach(drawCoin);
    weapons.forEach(drawWeapon);
    trafficCars.forEach((car) => drawCar(car.x, car.y, car.color, false));
    projectiles.forEach(drawProjectile);

    // The player car is hidden once it explodes.
    if (gameState !== 'exploding' && gameState !== 'over') {
        drawCar(playerX, PLAYER_TOP, '#ee5253', true);
    }

    // Expanding flash at the moment of impact.
    if (gameState === 'exploding') {
        const cx = playerX + CAR_WIDTH / 2;
        const cy = PLAYER_TOP + CAR_HEIGHT / 2;
        const progress = 1 - explosionTimer / EXPLOSION_DURATION;
        ctx.globalAlpha = Math.max(0, 0.85 - progress);
        ctx.fillStyle = '#ffce54';
        ctx.beginPath();
        ctx.arc(cx, cy, 20 + progress * 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    if (particles.length > 0) {
        drawParticles();
    }
}

// ---- Game loop -----------------------------------------------------------
function gameLoop(timestamp) {
    // Delta time in seconds keeps movement smooth and frame-rate independent.
    // Clamp to [0, 0.05] so a paused/backgrounded tab can't teleport everything
    // and a non-monotonic timestamp can't run the simulation backwards.
    const deltaSeconds = Math.max(0, Math.min(0.05, (timestamp - lastFrameTime) / 1000)) || 0;
    lastFrameTime = timestamp;

    if (gameState === 'playing') {
        update(deltaSeconds);
    } else if (gameState === 'exploding') {
        updateExplosion(deltaSeconds);
    }
    render();

    if (gameState === 'playing' || gameState === 'exploding') {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// ---- Game flow -----------------------------------------------------------
function startGame(level) {
    difficulty = level;
    settings = DIFFICULTY_SETTINGS[level];
    loadBestScore();

    trafficCars = [];
    coins = [];
    weapons = [];
    projectiles = [];
    particles = [];
    playerLane = 1;
    playerX = laneCenter(playerLane) - CAR_WIDTH / 2;
    playerSpeed = 0;            // starts stopped — hold the accelerator to go
    accelerating = false;
    braking = false;
    score = 0;
    coinCount = 0;
    ammo = 0;
    lastWeaponCheckpoint = 0;
    elapsedSeconds = 0;
    explosionTimer = 0;
    lastOpenLane = 1;
    roadScroll = 0;

    scoreDisplay.textContent = '0';
    coinsDisplay.textContent = '0';
    updateSpeedDisplay();
    updateAmmoDisplay();

    startOverlay.classList.remove('show');
    gameOverScreen.classList.remove('show');

    gameState = 'playing';
    lastFrameTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);

    audio.startMusic();
    audio.startEngine();
}

// Kick off the crash: blow the car apart, then show game over once the
// explosion finishes (see updateExplosion).
function triggerCrash() {
    gameState = 'exploding';
    explosionTimer = EXPLOSION_DURATION;
    accelerating = false;
    braking = false;

    audio.stopMusic();
    audio.stopEngine();
    audio.crash();

    spawnExplosion(playerX + CAR_WIDTH / 2, PLAYER_TOP + CAR_HEIGHT / 2);
}

// Push a burst of debris particles outward from a point. Used for both the
// player's crash and for cars destroyed by a shot.
function burstParticles(cx, cy, count) {
    const debrisColors = ['#ee5253', '#ff6b6b', '#ff9f43', '#feca57', '#ffffff', '#576574'];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 280;
        const life = 0.45 + Math.random() * 0.4;
        particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 70, // slight upward bias
            life,
            maxLife: life,
            size: 4 + Math.random() * 9,
            color: debrisColors[Math.floor(Math.random() * debrisColors.length)]
        });
    }
}

// Advance and retire all debris particles. Shared by the crash animation and
// in-play car explosions.
function updateParticles(deltaSeconds) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 360 * deltaSeconds;     // gravity pulls debris back down
        p.x += p.vx * deltaSeconds;
        p.y += p.vy * deltaSeconds;
        p.life -= deltaSeconds;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function spawnExplosion(cx, cy) {
    particles = [];
    burstParticles(cx, cy, 30);
}

function updateExplosion(deltaSeconds) {
    explosionTimer -= deltaSeconds;
    updateParticles(deltaSeconds);

    if (explosionTimer <= 0) {
        endGame();
    }
}

function endGame() {
    gameState = 'over';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const finalScore = Math.floor(score);
    finalScoreDisplay.textContent = finalScore;
    finalCoinsDisplay.textContent = coinCount;

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
    particles = [];
    weapons = [];
    projectiles = [];
    audio.stopMusic();
    audio.stopEngine();
    gameOverScreen.classList.remove('show');
    startOverlay.classList.add('show');
    render(); // draw an idle road behind the menu
}

// ---- Controls ------------------------------------------------------------
function moveLeft() {
    if (gameState !== 'playing') return;
    const newLane = Math.max(0, playerLane - 1);
    if (newLane !== playerLane) {
        playerLane = newLane;
        audio.laneSwitch();
    }
}

function moveRight() {
    if (gameState !== 'playing') return;
    const newLane = Math.min(LANE_COUNT - 1, playerLane + 1);
    if (newLane !== playerLane) {
        playerLane = newLane;
        audio.laneSwitch();
    }
}

// Keyboard (desktop): ←/→ switch lanes, hold ↑ to accelerate, ↓ to brake.
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        moveLeft();
        e.preventDefault();
    } else if (e.key === 'ArrowRight') {
        moveRight();
        e.preventDefault();
    } else if (e.key === 'ArrowUp') {
        if (gameState === 'playing') accelerating = true;
        e.preventDefault();
    } else if (e.key === 'ArrowDown') {
        if (gameState === 'playing') braking = true;
        e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
        fire();
        e.preventDefault();
    }
});

// Releasing the throttle / brake always clears it, even if the game ended.
document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') {
        accelerating = false;
    } else if (e.key === 'ArrowDown') {
        braking = false;
    }
});

// Tapping the left/right half of the road (mobile + mouse). Coordinates are
// normalised against the rendered size so it works while the canvas is scaled.
canvas.addEventListener('pointerdown', (e) => {
    if (gameState !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width;
    if (relativeX < 0.5) {
        moveLeft();
    } else {
        moveRight();
    }
    e.preventDefault();
});

// On-screen lane buttons.
directionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        if (btn.dataset.direction === 'left') {
            moveLeft();
        } else {
            moveRight();
        }
    });
});

// On-screen throttle buttons: hold to accelerate / brake (mobile + mouse).
throttleButtons.forEach((btn) => {
    const isAccelerate = btn.dataset.throttle === 'accelerate';
    const press = (e) => {
        if (gameState !== 'playing') return;
        if (isAccelerate) accelerating = true; else braking = true;
        e.preventDefault();
    };
    const release = () => {
        if (isAccelerate) accelerating = false; else braking = false;
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
});

// On-screen fire button (mobile + mouse).
if (fireButton) {
    fireButton.addEventListener('click', (e) => {
        fire();
        e.preventDefault();
    });
}

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
updateSpeedDisplay();
updateAmmoDisplay();
render(); // show the empty road behind the difficulty menu
