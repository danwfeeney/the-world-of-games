// Sun Showdown — the sun is far too hot and it's melting all the snow!
// Snowy the snowman pelts it with snowballs to cool it down, dodging
// fireballs and sunbeams and catching snowflakes to stay frosty.

// ---- DOM references ------------------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const dayDisplay = document.getElementById('day');
const healthDisplay = document.getElementById('health');
const bestScoreDisplay = document.getElementById('bestScore');
const startOverlay = document.getElementById('startOverlay');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreDisplay = document.getElementById('finalScore');
const finalSunsDisplay = document.getElementById('finalSuns');
const bestLine = document.getElementById('bestLine');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeLevelBtn = document.getElementById('changeLevelBtn');
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const megaBtn = document.getElementById('megaBtn');
const muteButton = document.getElementById('muteButton');

// ---- Audio ---------------------------------------------------------------
// All sound is synthesised with the Web Audio API so the game stays
// dependency-free (no audio files to ship). A jingly wintry loop plays in
// the background with one-shot effects on top, all behind a mute toggle.
const audio = {
    context: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    muted: localStorage.getItem('sunShowdownMuted') === 'true',
    schedulerId: null,
    nextNoteTime: 0,
    currentStep: 0,

    // Bouncy sixteen-step loop: I–vi–IV–V in G major.
    tempo: 128,
    bassPattern: [98.00, null, 146.83, null, 82.41, null, 123.47, null,
                  130.81, null, 98.00, null, 146.83, null, 110.00, null],
    // Sleigh-bell style melody twinkling over the top.
    leadPattern: [783.99, 987.77, 1174.66, null, 1318.51, 1174.66, 987.77, null,
                  1046.50, 1318.51, 1567.98, null, 1479.98, 1174.66, 880.00, null],

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
        this.musicGain.gain.value = 0.25;
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

    // A tone that slides between two pitches — whooshes, zaps and wails.
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

    // Short burst of filtered noise — throws, sizzles and splats.
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
        filter.frequency.value = highpass ? 4000 : 900;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(peakGain, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination || this.sfxGain);
        source.start(startTime);
        source.stop(startTime + duration);
    },

    // Look-ahead scheduler: queue notes slightly ahead of time for steady timing.
    scheduleMusic() {
        const stepLength = 60 / this.tempo / 2;
        while (this.nextNoteTime < this.context.currentTime + 0.12) {
            const step = this.currentStep;
            const t = this.nextNoteTime;
            this.tone(this.bassPattern[step], t, stepLength * 1.8, 'triangle', 0.5, this.musicGain);
            this.tone(this.leadPattern[step], t, stepLength * 0.9, 'sine', 0.22, this.musicGain);
            // Sleigh-bell shimmer on the off-beats.
            if (step % 2 === 1) {
                this.noiseBurst(t, 0.05, 0.12, true, this.musicGain);
            }
            this.nextNoteTime += stepLength;
            this.currentStep = (this.currentStep + 1) % this.bassPattern.length;
        }
    },

    startMusic() {
        this.ensureContext();
        if (!this.context) return;
        if (this.context.state === 'suspended') this.context.resume();
        this.stopMusic();
        this.currentStep = 0;
        this.nextNoteTime = this.context.currentTime + 0.05;
        this.schedulerId = setInterval(() => this.scheduleMusic(), 25);
    },

    stopMusic() {
        if (this.schedulerId) {
            clearInterval(this.schedulerId);
            this.schedulerId = null;
        }
    },

    play(effect) {
        this.ensureContext();
        if (!this.context) return;
        const now = this.context.currentTime;
        switch (effect) {
            case 'throw':
                this.noiseBurst(now, 0.12, 0.25, true);
                this.sweep(500, 900, now, 0.1, 'sine', 0.08);
                break;
            case 'mega':
                this.noiseBurst(now, 0.35, 0.4, false);
                this.sweep(200, 900, now, 0.35, 'triangle', 0.25);
                break;
            case 'hitSun':
                // Sizzle + a squishy "ouch".
                this.noiseBurst(now, 0.3, 0.35, true);
                this.sweep(620, 300, now, 0.18, 'square', 0.12);
                break;
            case 'melt':
                // Snowball evaporated before it reached the sun.
                this.noiseBurst(now, 0.15, 0.12, true);
                break;
            case 'fireball':
                this.sweep(400, 120, now, 0.35, 'sawtooth', 0.1);
                break;
            case 'douse':
                this.noiseBurst(now, 0.25, 0.3, true);
                this.tone(880, now, 0.12, 'triangle', 0.2);
                break;
            case 'hurt':
                this.sweep(500, 140, now, 0.3, 'square', 0.18);
                this.noiseBurst(now, 0.2, 0.25, true);
                break;
            case 'flake':
                this.tone(1318.51, now, 0.15, 'sine', 0.25);
                this.tone(1975.53, now + 0.06, 0.2, 'sine', 0.18);
                break;
            case 'megaReady':
                [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => {
                    this.tone(f, now + i * 0.06, 0.2, 'sine', 0.22);
                });
                break;
            case 'cloud':
                this.noiseBurst(now, 0.2, 0.2, false);
                this.tone(1567.98, now + 0.05, 0.15, 'sine', 0.15);
                break;
            case 'beamWarn':
                this.sweep(300, 1200, now, 0.9, 'sine', 0.12);
                break;
            case 'beam':
                this.sweep(180, 90, now, 0.6, 'sawtooth', 0.15);
                this.noiseBurst(now, 0.5, 0.15, false);
                break;
            case 'cooled':
                // Lullaby-ish arpeggio as the sun dozes off.
                [783.99, 987.77, 1174.66, 1567.98, 1174.66, 1567.98].forEach((f, i) => {
                    this.tone(f, now + i * 0.13, 0.35, 'triangle', 0.25);
                });
                break;
            case 'newDay':
                [523.25, 659.25, 783.99].forEach((f, i) => {
                    this.tone(f, now + i * 0.1, 0.2, 'triangle', 0.28);
                });
                break;
            case 'gameOver':
                [523.25, 440, 349.23, 261.63].forEach((f, i) => {
                    this.tone(f, now + i * 0.22, 0.4, 'triangle', 0.3);
                });
                break;
        }
    },

    toggleMute() {
        this.ensureContext();
        this.muted = !this.muted;
        localStorage.setItem('sunShowdownMuted', this.muted);
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.9;
        }
        return this.muted;
    }
};

// ---- Constants -----------------------------------------------------------
const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 540;          // top of the snowy ground Snowy stands on
const GRAVITY = 600;           // px/s² pulling snowballs back down
const AMMO_MAX = 8;
const MEGA_FLAKES = 5;         // snowflakes needed to charge a mega snowball
const SNOWBALL_RADIUS = 9;
const MEGA_RADIUS = 18;
const SUN_RADIUS = 46;
const SUN_AURA = 70;           // snowballs melt inside this ring around the sun
const PLAYER_SPEED = 260;

const DIFFICULTY_SETTINGS = {
    easy: {
        sunHits: 10, hitGrowth: 2, sunSpeed: 70, dodgeChance: 0,
        fireballGap: 2.8, fireballSpeed: 150, fireballDamage: 12,
        beamFromDay: 3, beamGap: 8, beamDamage: 18,
        passiveMelt: 0.35, ammoRegen: 0.45, flakeGap: 4
    },
    medium: {
        sunHits: 14, hitGrowth: 3, sunSpeed: 95, dodgeChance: 0.15,
        fireballGap: 2.1, fireballSpeed: 190, fireballDamage: 16,
        beamFromDay: 2, beamGap: 6.5, beamDamage: 24,
        passiveMelt: 0.6, ammoRegen: 0.6, flakeGap: 5
    },
    hard: {
        sunHits: 18, hitGrowth: 4, sunSpeed: 120, dodgeChance: 0.3,
        fireballGap: 1.6, fireballSpeed: 230, fireballDamage: 20,
        beamFromDay: 1, beamGap: 5, beamDamage: 30,
        passiveMelt: 0.9, ammoRegen: 0.75, flakeGap: 6
    }
};

// ---- Game state ----------------------------------------------------------
let difficulty = 'medium';
let settings = DIFFICULTY_SETTINGS[difficulty];
let gameState = 'menu';        // 'menu' | 'playing' | 'cooled' | 'ending' | 'over'
let animationFrameId = null;
let lastFrameTime = 0;

let score = 0;
let bestScore = 0;
let day = 1;
let sunsCooled = 0;

let player;
let sun;
let snowballs = [];
let fireballs = [];
let beams = [];
let clouds = [];
let snowflakes = [];
let particles = [];
let popups = [];

let ammo = AMMO_MAX;
let ammoTimer = 0;
let throwCooldown = 0;
let flakesCaught = 0;          // progress towards the next mega snowball
let megaReady = false;

let fireballTimer = 0;
let beamTimer = 0;
let cloudTimer = 0;
let flakeTimer = 0;
let cooledTimer = 0;
let endingTimer = 0;
let shakeTime = 0;
let banner = null;             // { text, time }
let elapsed = 0;               // drives idle animations

// Input
const keys = { left: false, right: false };
const held = { left: false, right: false };
let walkTargetX = null;        // tap on the ground to walk there
let aimX = W / 2;
let aimY = 200;
let aimVisible = false;

// ---- Helpers -------------------------------------------------------------
function rand(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function bestScoreKey() {
    return `sunShowdownBest_${difficulty}`;
}

function loadBestScore() {
    bestScore = parseInt(localStorage.getItem(bestScoreKey()), 10) || 0;
    bestScoreDisplay.textContent = bestScore;
}

function playerScale() {
    // Snowy visibly shrinks as they melt.
    return 0.55 + 0.45 * (player.health / 100);
}

function playerHand() {
    const s = playerScale();
    return { x: player.x + 26 * s, y: GROUND_Y - 78 * s };
}

function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color: color || '#fff', life: 1 });
}

function burst(x, y, count, colors, speed, gravity, size) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = rand(speed * 0.3, speed);
        particles.push({
            x, y,
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v,
            gravity,
            size: rand(size * 0.5, size),
            color: colors[Math.floor(Math.random() * colors.length)],
            life: rand(0.5, 1),
            maxLife: 1
        });
    }
}

function steam(x, y, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x + rand(-8, 8), y,
            vx: rand(-20, 20), vy: rand(-80, -30),
            gravity: -20,
            size: rand(5, 10),
            color: 'rgba(240, 240, 255, 0.8)',
            life: rand(0.5, 0.9),
            maxLife: 0.9
        });
    }
}

function showBanner(text, time) {
    banner = { text, time: time || 2 };
}

function sunMaxHeat() {
    return settings.sunHits + settings.hitGrowth * (day - 1);
}

// Later days speed things up, but never beyond a sensible floor.
function dayFactor() {
    return Math.pow(0.9, day - 1);
}

// ---- Game objects --------------------------------------------------------
function createSun() {
    const maxHeat = sunMaxHeat();
    return {
        x: W / 2,
        y: -SUN_RADIUS * 2,        // rises into view at the start of each day
        targetX: W / 2,
        targetY: 120,
        heat: maxHeat,
        maxHeat,
        hurtTime: 0,
        charging: null,            // the beam being charged, if any
        rising: true,
        dodgeCooldown: 0
    };
}

function pickSunTarget() {
    sun.targetX = rand(70, W - 70);
    sun.targetY = rand(70, 170);
}

function spawnCloud() {
    const fromLeft = Math.random() < 0.5;
    const width = rand(90, 130);
    clouds.push({
        x: fromLeft ? -width : W + width,
        y: rand(220, 320),
        width,
        speed: rand(20, 40) * (fromLeft ? 1 : -1),
        flakes: 3,
        puff: 0
    });
}

function spawnSnowflake(x, y, vy) {
    snowflakes.push({
        x,
        y,
        vy: vy || rand(45, 70),
        swayPhase: Math.random() * Math.PI * 2,
        spin: rand(-2, 2),
        angle: 0
    });
}

function launchFireball() {
    // Aim roughly at where Snowy is, with a little wobble so it's dodgeable.
    const targetX = player.x + rand(-40, 40);
    const dx = targetX - sun.x;
    const dy = GROUND_Y - sun.y;
    const dist = Math.hypot(dx, dy);
    const speed = settings.fireballSpeed * (1 + 0.06 * (day - 1));
    fireballs.push({
        x: sun.x,
        y: sun.y + SUN_RADIUS * 0.6,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        r: 12,
        trail: 0
    });
    audio.play('fireball');
}

function startBeam() {
    const beam = {
        x: clamp(player.x, 40, W - 40),
        width: 50,
        phase: 'warn',
        time: 1.1,
        hit: false
    };
    beams.push(beam);
    sun.charging = beam;
    audio.play('beamWarn');
}

function throwSnowball(tx, ty, mega) {
    const hand = playerHand();
    // Never aim below the hand — throws always go up into the sky.
    ty = Math.min(ty, hand.y - 20);
    const dx = tx - hand.x;
    const dy = ty - hand.y;
    const dist = Math.hypot(dx, dy);
    // Pick a flight time based on distance and solve for the launch velocity
    // so the snowball's arc passes right through the point the player tapped.
    const t = clamp(dist / 650, 0.3, 0.85);
    snowballs.push({
        x: hand.x,
        y: hand.y,
        vx: dx / t,
        vy: dy / t - 0.5 * GRAVITY * t,
        r: mega ? MEGA_RADIUS : SNOWBALL_RADIUS,
        startR: mega ? MEGA_RADIUS : SNOWBALL_RADIUS,
        mega,
        dodgeRoll: Math.random(),
        dodgeChecked: false
    });
    player.throwAnim = 0.2;
    audio.play(mega ? 'mega' : 'throw');
}

function tryThrow(tx, ty) {
    if (gameState !== 'playing' || throwCooldown > 0) return;
    if (ammo <= 0) {
        if (!popups.some((pop) => pop.text === 'Out of snow!')) {
            addPopup(player.x, GROUND_Y - 130, 'Out of snow!', '#e3f2fd');
        }
        return;
    }
    ammo--;
    throwCooldown = 0.18;
    throwSnowball(tx, ty, false);
}

function throwMega() {
    if (gameState !== 'playing' || !megaReady) return;
    megaReady = false;
    flakesCaught = 0;
    // The mega snowball goes wherever the player is aiming (or straight at the
    // sun if they've never aimed — e.g. keyboard-only on a touch device).
    const tx = aimVisible ? aimX : sun.x;
    const ty = aimVisible ? aimY : sun.y;
    throwSnowball(tx, ty, true);
    updateMegaButton();
}

function hurtPlayer(amount) {
    if (player.invulnerable > 0) return;
    player.health = Math.max(0, player.health - amount);
    player.invulnerable = 0.9;
    shakeTime = 0.3;
    steam(player.x, GROUND_Y - 60 * playerScale(), 10);
    addPopup(player.x, GROUND_Y - 130, `-${amount}`, '#ff7043');
    audio.play('hurt');
}

// ---- Update --------------------------------------------------------------
function update(dt) {
    elapsed += dt;
    throwCooldown = Math.max(0, throwCooldown - dt);
    shakeTime = Math.max(0, shakeTime - dt);
    if (banner) {
        banner.time -= dt;
        if (banner.time <= 0) banner = null;
    }

    updatePlayer(dt);
    updateSun(dt);
    updateSnowballs(dt);
    updateFireballs(dt);
    updateBeams(dt);
    updateClouds(dt);
    updateSnowflakes(dt);
    updateEffects(dt);

    // Ammo slowly regenerates — Snowy scoops up more snow.
    if (ammo < AMMO_MAX) {
        ammoTimer += dt;
        if (ammoTimer >= settings.ammoRegen) {
            ammoTimer = 0;
            ammo++;
        }
    } else {
        ammoTimer = 0;
    }

    // The hotter the sun, the faster Snowy melts just standing there.
    if (!sun.rising) {
        player.health -= settings.passiveMelt * (sun.heat / sun.maxHeat) * dt;
    }

    // Attack timers only tick once the sun is up and not mid-beam.
    if (!sun.rising) {
        fireballTimer -= dt;
        if (fireballTimer <= 0) {
            launchFireball();
            const gap = Math.max(0.6, settings.fireballGap * dayFactor());
            // An angry (nearly cooled) sun throws a tantrum and fires faster.
            fireballTimer = rand(gap * 0.7, gap * 1.2) * (sun.heat / sun.maxHeat < 0.3 ? 0.65 : 1);
        }

        if (day >= settings.beamFromDay && !sun.charging) {
            beamTimer -= dt;
            if (beamTimer <= 0) {
                startBeam();
                beamTimer = rand(settings.beamGap * 0.8, settings.beamGap * 1.2) * Math.max(0.6, dayFactor());
            }
        }
    }

    cloudTimer -= dt;
    if (cloudTimer <= 0) {
        if (clouds.length < 2) spawnCloud();
        cloudTimer = rand(6, 10);
    }

    flakeTimer -= dt;
    if (flakeTimer <= 0) {
        spawnSnowflake(rand(30, W - 30), -10);
        flakeTimer = rand(settings.flakeGap * 0.7, settings.flakeGap * 1.3);
    }

    if (player.health <= 0) {
        player.health = 0;
        beginEnding();
    }

    updateHud();
}

function updatePlayer(dt) {
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.throwAnim = Math.max(0, player.throwAnim - dt);

    let dir = 0;
    if (keys.left || held.left) dir -= 1;
    if (keys.right || held.right) dir += 1;
    if (dir !== 0) {
        walkTargetX = null;
    } else if (walkTargetX !== null) {
        const diff = walkTargetX - player.x;
        if (Math.abs(diff) < 4) {
            walkTargetX = null;
        } else {
            dir = Math.sign(diff);
        }
    }

    player.x = clamp(player.x + dir * PLAYER_SPEED * dt, 30, W - 30);
    if (dir !== 0) {
        player.facing = dir;
        player.wobble += dt * 14;
    }
}

function updateSun(dt) {
    sun.hurtTime = Math.max(0, sun.hurtTime - dt);
    sun.dodgeCooldown = Math.max(0, sun.dodgeCooldown - dt);

    if (sun.rising) {
        sun.y += 90 * dt;
        if (sun.y >= 120) {
            sun.y = 120;
            sun.rising = false;
            pickSunTarget();
        }
        return;
    }

    const angry = sun.heat / sun.maxHeat < 0.3;
    let speed = settings.sunSpeed * (1 + 0.08 * (day - 1)) * (angry ? 1.4 : 1);

    if (sun.charging) {
        // Hurry over the beam's column and hold still while charging.
        sun.targetX = sun.charging.x;
        sun.targetY = 110;
        speed *= 3;
    }

    const dx = sun.targetX - sun.x;
    const dy = sun.targetY - sun.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
        if (!sun.charging) pickSunTarget();
    } else {
        const step = Math.min(dist, speed * dt);
        sun.x += (dx / dist) * step;
        sun.y += (dy / dist) * step;
    }

    // Sneaky suns sometimes sidestep a snowball that's about to hit.
    if (settings.dodgeChance > 0 && !sun.charging && sun.dodgeCooldown <= 0) {
        for (const ball of snowballs) {
            if (ball.dodgeChecked) continue;
            if (Math.hypot(ball.x - sun.x, ball.y - sun.y) < 130 && ball.vy < 0) {
                ball.dodgeChecked = true;
                if (ball.dodgeRoll < settings.dodgeChance) {
                    const side = ball.x < sun.x ? 1 : -1;
                    sun.targetX = clamp(sun.x + side * rand(110, 160), 60, W - 60);
                    sun.targetY = sun.y + rand(-20, 20);
                    sun.dodgeCooldown = 1.2;
                    addPopup(sun.x, sun.y - 60, 'Missed me!', '#fff59d');
                }
                break;
            }
        }
    }
}

function updateSnowballs(dt) {
    for (let i = snowballs.length - 1; i >= 0; i--) {
        const ball = snowballs[i];
        ball.vy += GRAVITY * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        const sunDist = Math.hypot(ball.x - sun.x, ball.y - sun.y);

        // Snowballs melt in the sun's hot aura — throw them quick and true!
        if (sunDist < SUN_RADIUS + SUN_AURA && !sun.rising) {
            ball.r -= (ball.mega ? 8 : 14) * dt;
            if (Math.random() < 0.4) steam(ball.x, ball.y, 1);
        }

        if (ball.r < 3) {
            steam(ball.x, ball.y, 4);
            audio.play('melt');
            snowballs.splice(i, 1);
            continue;
        }

        // Hit the sun.
        if (!sun.rising && sunDist < SUN_RADIUS + ball.r) {
            const power = ball.mega ? 4 : ball.r / ball.startR;
            sun.heat = Math.max(0, sun.heat - power);
            sun.hurtTime = 0.35;
            const points = ball.mega ? 50 : Math.max(5, Math.round(10 * power));
            score += points;
            addPopup(ball.x, ball.y - 10, `+${points}`, '#e1f5fe');
            burst(ball.x, ball.y, ball.mega ? 30 : 12, ['#ffffff', '#e3f2fd', '#b3e5fc'], 160, 300, 5);
            steam(ball.x, ball.y, ball.mega ? 12 : 6);
            audio.play('hitSun');
            snowballs.splice(i, 1);
            if (sun.heat <= 0) coolSun();
            continue;
        }

        // Hit a cloud — the snowball gets stuck but shakes a snowflake loose.
        let absorbed = false;
        for (const cloud of clouds) {
            if (Math.abs(ball.x - cloud.x) < cloud.width / 2 && Math.abs(ball.y - cloud.y) < 24) {
                absorbed = true;
                cloud.puff = 0.3;
                if (cloud.flakes > 0) {
                    cloud.flakes--;
                    spawnSnowflake(ball.x, cloud.y + 20, 60);
                    if (ball.mega) {
                        spawnSnowflake(ball.x - 25, cloud.y + 20, 55);
                        spawnSnowflake(ball.x + 25, cloud.y + 20, 65);
                    }
                }
                burst(ball.x, ball.y, 8, ['#ffffff', '#eceff1'], 90, 100, 4);
                audio.play('cloud');
                break;
            }
        }
        if (absorbed) {
            snowballs.splice(i, 1);
            continue;
        }

        // Fell back down or flew off-screen.
        if (ball.y > GROUND_Y + 10 || ball.x < -40 || ball.x > W + 40) {
            if (ball.y > GROUND_Y) burst(ball.x, GROUND_Y, 6, ['#ffffff'], 80, 300, 4);
            snowballs.splice(i, 1);
        }
    }
}

function updateFireballs(dt) {
    for (let i = fireballs.length - 1; i >= 0; i--) {
        const fire = fireballs[i];
        fire.vy += 60 * dt;
        fire.x += fire.vx * dt;
        fire.y += fire.vy * dt;

        fire.trail -= dt;
        if (fire.trail <= 0) {
            fire.trail = 0.03;
            particles.push({
                x: fire.x + rand(-4, 4), y: fire.y + rand(-4, 4),
                vx: rand(-15, 15), vy: rand(-40, -10), gravity: 0,
                size: rand(4, 8),
                color: Math.random() < 0.5 ? '#ffb300' : '#ff7043',
                life: 0.35, maxLife: 0.35
            });
        }

        // Snowball meets fireball — fsssst! Both go out.
        let doused = false;
        for (let j = snowballs.length - 1; j >= 0; j--) {
            const ball = snowballs[j];
            if (Math.hypot(ball.x - fire.x, ball.y - fire.y) < ball.r + fire.r) {
                doused = true;
                if (!ball.mega) snowballs.splice(j, 1); // mega snowballs plough on through
                break;
            }
        }
        if (!doused) {
            for (const cloud of clouds) {
                if (Math.abs(fire.x - cloud.x) < cloud.width / 2 && Math.abs(fire.y - cloud.y) < 24) {
                    doused = true;
                    cloud.puff = 0.3;
                    break;
                }
            }
        }
        if (doused) {
            score += 15;
            addPopup(fire.x, fire.y - 10, '+15', '#ffe082');
            steam(fire.x, fire.y, 10);
            audio.play('douse');
            fireballs.splice(i, 1);
            continue;
        }

        // Hit Snowy.
        const s = playerScale();
        if (Math.abs(fire.x - player.x) < 26 * s + fire.r &&
            fire.y > GROUND_Y - 110 * s && fire.y < GROUND_Y + fire.r) {
            hurtPlayer(settings.fireballDamage);
            burst(fire.x, fire.y, 12, ['#ffb300', '#ff7043', '#ffe082'], 140, 200, 5);
            fireballs.splice(i, 1);
            continue;
        }

        if (fire.y > GROUND_Y + 5 || fire.x < -30 || fire.x > W + 30) {
            burst(fire.x, GROUND_Y, 10, ['#ffb300', '#ff7043'], 120, 250, 4);
            steam(fire.x, GROUND_Y, 5);
            fireballs.splice(i, 1);
        }
    }
}

function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
        const beam = beams[i];
        beam.time -= dt;
        if (beam.phase === 'warn' && beam.time <= 0) {
            beam.phase = 'fire';
            beam.time = 0.6;
            shakeTime = 0.25;
            audio.play('beam');
        } else if (beam.phase === 'fire') {
            const s = playerScale();
            if (!beam.hit && Math.abs(player.x - beam.x) < beam.width / 2 + 18 * s) {
                beam.hit = true;
                hurtPlayer(settings.beamDamage);
            }
            if (Math.random() < 0.6) steam(beam.x + rand(-beam.width / 2, beam.width / 2), GROUND_Y, 1);
            if (beam.time <= 0) {
                beams.splice(i, 1);
                if (sun.charging === beam) {
                    sun.charging = null;
                    pickSunTarget();
                }
            }
        }
    }
}

function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
        const cloud = clouds[i];
        cloud.x += cloud.speed * dt;
        cloud.puff = Math.max(0, cloud.puff - dt);
        if (cloud.x < -cloud.width * 1.5 || cloud.x > W + cloud.width * 1.5) {
            clouds.splice(i, 1);
        }
    }
}

function updateSnowflakes(dt) {
    const s = playerScale();
    for (let i = snowflakes.length - 1; i >= 0; i--) {
        const flake = snowflakes[i];
        flake.swayPhase += dt * 2;
        flake.angle += flake.spin * dt;
        flake.x += Math.sin(flake.swayPhase) * 30 * dt;
        flake.y += flake.vy * dt;

        if (Math.abs(flake.x - player.x) < 30 * s + 10 &&
            flake.y > GROUND_Y - 120 * s && flake.y < GROUND_Y + 5) {
            catchSnowflake(flake);
            snowflakes.splice(i, 1);
            continue;
        }

        if (flake.y > GROUND_Y + 8) {
            snowflakes.splice(i, 1);
        }
    }
}

function catchSnowflake(flake) {
    player.health = Math.min(100, player.health + 6);
    score += 5;
    addPopup(flake.x, flake.y - 10, '+5 ❄️', '#e1f5fe');
    burst(flake.x, flake.y, 8, ['#ffffff', '#b3e5fc'], 80, 0, 3);
    audio.play('flake');

    if (!megaReady) {
        flakesCaught++;
        if (flakesCaught >= MEGA_FLAKES) {
            megaReady = true;
            showBanner('MEGA snowball ready! ❄️', 1.6);
            audio.play('megaReady');
            updateMegaButton();
        }
    }
}

function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
        const pop = popups[i];
        pop.y -= 40 * dt;
        pop.life -= dt;
        if (pop.life <= 0) popups.splice(i, 1);
    }
}

// The sun is cool! Night falls, it snows, then a new (hotter) day begins.
function coolSun() {
    gameState = 'cooled';
    cooledTimer = 3.2;
    sunsCooled++;
    const bonus = 100 * day + Math.round(player.health);
    score += bonus;
    player.health = Math.min(100, player.health + 30);
    fireballs.forEach((fire) => steam(fire.x, fire.y, 6));
    fireballs = [];
    beams = [];
    sun.charging = null;
    showBanner(`Sun cooled! +${bonus}`, 3);
    audio.play('cooled');
    for (let i = 0; i < 14; i++) {
        spawnSnowflake(rand(20, W - 20), rand(-200, -10), rand(50, 80));
    }
    updateHud();
}

function updateCooled(dt) {
    elapsed += dt;
    cooledTimer -= dt;
    // The sleepy sun sinks out of sight while the snow comes down.
    sun.y += 70 * dt;
    updateSnowballs(dt);
    updateClouds(dt);
    updatePlayer(dt);
    updateSnowflakes(dt);
    updateEffects(dt);
    if (banner) {
        banner.time -= dt;
        if (banner.time <= 0) banner = null;
    }
    updateHud();

    if (cooledTimer <= 0) {
        day++;
        sun = createSun();
        snowballs = [];
        ammo = AMMO_MAX;
        fireballTimer = 2;
        beamTimer = settings.beamGap * 0.6;
        showBanner(`Day ${day} — it's even hotter! 🔥`, 2.2);
        audio.play('newDay');
        gameState = 'playing';
    }
}

function updateEnding(dt) {
    elapsed += dt;
    endingTimer -= dt;
    updateEffects(dt);
    if (Math.random() < 0.5) steam(player.x + rand(-20, 20), GROUND_Y - 10, 1);
    if (endingTimer <= 0) endGame();
}

// ---- Rendering -----------------------------------------------------------
function heatFraction() {
    if (!sun) return 1;
    return sun.heat / sun.maxHeat;
}

function drawSky() {
    const night = gameState === 'cooled' ? clamp(1 - (cooledTimer - 0.4) / 2.6, 0, 1) : 0;
    const hot = heatFraction();

    // Hot suns turn the sky a warm orange; a cooled sun lets night fall.
    const topDay = [lerp(110, 255, hot * 0.5), lerp(190, 170, hot * 0.6), lerp(250, 120, hot * 0.6)];
    const botDay = [lerp(200, 255, hot * 0.6), lerp(235, 210, hot * 0.6), lerp(255, 160, hot * 0.6)];
    const topNight = [20, 30, 80];
    const botNight = [60, 70, 140];
    const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], night))).join(',')})`;

    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, mix(topDay, topNight));
    grad.addColorStop(1, mix(botDay, botNight));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND_Y);

    if (night > 0) {
        ctx.save();
        ctx.globalAlpha = night;
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 137) % W;
            const sy = (i * 71) % 300;
            const twinkle = 1 + Math.sin(elapsed * 3 + i) * 0.5;
            ctx.fillRect(sx, sy, twinkle * 1.5, twinkle * 1.5);
        }
        // The moon takes over for the night.
        ctx.fillStyle = '#fffde7';
        ctx.beginPath();
        ctx.arc(420, 80, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mix(topDay, topNight);
        ctx.beginPath();
        ctx.arc(408, 72, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawScenery() {
    // Distant snowy hills.
    ctx.fillStyle = '#e3f2fd';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.quadraticCurveTo(90, 440, 200, 500);
    ctx.quadraticCurveTo(300, 430, 400, 490);
    ctx.quadraticCurveTo(470, 450, W, 480);
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Pine trees.
    [[40, 0.9], [110, 0.7], [470, 1], [395, 0.75]].forEach(([tx, s]) => {
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(tx - 4 * s, GROUND_Y - 18 * s, 8 * s, 18 * s);
        for (let layer = 0; layer < 3; layer++) {
            const ly = GROUND_Y - 18 * s - layer * 22 * s;
            const lw = (34 - layer * 8) * s;
            ctx.fillStyle = '#2e7d32';
            ctx.beginPath();
            ctx.moveTo(tx - lw, ly);
            ctx.lineTo(tx, ly - 34 * s);
            ctx.lineTo(tx + lw, ly);
            ctx.closePath();
            ctx.fill();
            // Snow caps — they droop as the sun gets hotter.
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.moveTo(tx - lw * 0.45, ly - 18 * s);
            ctx.lineTo(tx, ly - 34 * s);
            ctx.lineTo(tx + lw * 0.45, ly - 18 * s);
            ctx.closePath();
            ctx.fill();
        }
    });

    // Little igloo — Snowy's home.
    ctx.fillStyle = '#f5f9ff';
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(250, GROUND_Y, 38, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(214, GROUND_Y - 14);
    ctx.lineTo(286, GROUND_Y - 14);
    ctx.moveTo(220, GROUND_Y - 27);
    ctx.lineTo(280, GROUND_Y - 27);
    ctx.stroke();
    ctx.fillStyle = '#546e7a';
    ctx.beginPath();
    ctx.arc(250, GROUND_Y, 13, Math.PI, 0);
    ctx.fill();

    // Snowy ground.
    const ground = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    ground.addColorStop(0, '#ffffff');
    ground.addColorStop(1, '#cfe8fc');
    ctx.fillStyle = ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
}

function drawSun() {
    if (!sun) return;
    const hot = heatFraction();
    const cooled = gameState === 'cooled';
    const angry = !cooled && hot < 0.3;
    const hurt = sun.hurtTime > 0;
    const r = SUN_RADIUS;
    const wiggle = hurt ? Math.sin(elapsed * 60) * 3 : 0;
    const x = sun.x + wiggle;
    const y = sun.y;

    // Heat shimmer aura — the zone where snowballs start melting.
    if (!cooled) {
        const aura = ctx.createRadialGradient(x, y, r, x, y, r + SUN_AURA);
        aura.addColorStop(0, `rgba(255, 160, 0, ${0.25 + 0.2 * hot})`);
        aura.addColorStop(1, 'rgba(255, 160, 0, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(x, y, r + SUN_AURA, 0, Math.PI * 2);
        ctx.fill();
    }

    // Rays spin faster the hotter it is.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(elapsed * (0.3 + hot * 0.9));
    ctx.fillStyle = cooled ? '#fff59d' : (angry ? '#ff5722' : '#ffa000');
    const rayCount = 12;
    const rayLen = cooled ? 10 : 16 + hot * 10 + Math.sin(elapsed * 6) * 3;
    for (let i = 0; i < rayCount; i++) {
        ctx.rotate((Math.PI * 2) / rayCount);
        ctx.beginPath();
        ctx.moveTo(-7, -r + 2);
        ctx.lineTo(0, -r - rayLen);
        ctx.lineTo(7, -r + 2);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Body: fiery orange when hot, fading to a pale lemon as it cools.
    const body = ctx.createRadialGradient(x - 12, y - 14, 6, x, y, r);
    if (cooled) {
        body.addColorStop(0, '#fffde7');
        body.addColorStop(1, '#fff176');
    } else {
        body.addColorStop(0, '#fff9c4');
        body.addColorStop(1, `rgb(255, ${Math.round(lerp(220, 120, hot))}, ${Math.round(lerp(80, 0, hot))})`);
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Face.
    ctx.strokeStyle = '#6d3a00';
    ctx.fillStyle = '#6d3a00';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (cooled) {
        // Sleepy closed eyes and a little "zzz".
        ctx.beginPath();
        ctx.arc(x - 15, y - 6, 7, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.moveTo(x + 22, y - 6);
        ctx.arc(x + 15, y - 6, 7, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y + 14, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('z', x + r - 4, y - r + 4 - Math.sin(elapsed * 3) * 4);
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('z', x + r + 10, y - r - 10 - Math.sin(elapsed * 3 + 1) * 4);
    } else if (hurt) {
        // Squeezed-shut "ouch" eyes and a wobbly mouth.
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 12); ctx.lineTo(x - 10, y - 6); ctx.lineTo(x - 22, y);
        ctx.moveTo(x + 22, y - 12); ctx.lineTo(x + 10, y - 6); ctx.lineTo(x + 22, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y + 16, 10, 8, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Eyes (with sunglasses-style glare when charging a beam).
        const eyeColor = sun.charging ? '#ff1744' : '#6d3a00';
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(x - 15, y - 8, 5, 0, Math.PI * 2);
        ctx.arc(x + 15, y - 8, 5, 0, Math.PI * 2);
        ctx.fill();
        if (angry || sun.charging) {
            ctx.beginPath();
            ctx.moveTo(x - 25, y - 22); ctx.lineTo(x - 8, y - 15);
            ctx.moveTo(x + 25, y - 22); ctx.lineTo(x + 8, y - 15);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y + 22, 12, 1.15 * Math.PI, 1.85 * Math.PI);
            ctx.stroke();
        } else {
            // Smug grin.
            ctx.beginPath();
            ctx.arc(x, y + 6, 16, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
        }
        // Rosy cheeks.
        ctx.fillStyle = 'rgba(255, 82, 82, 0.4)';
        ctx.beginPath();
        ctx.arc(x - 26, y + 8, 6, 0, Math.PI * 2);
        ctx.arc(x + 26, y + 8, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.lineCap = 'butt';
}

function drawBeams() {
    beams.forEach((beam) => {
        if (beam.phase === 'warn') {
            const flash = 0.15 + 0.15 * Math.abs(Math.sin(elapsed * 14));
            ctx.fillStyle = `rgba(255, 82, 82, ${flash})`;
            ctx.fillRect(beam.x - beam.width / 2, sun.y, beam.width, GROUND_Y - sun.y);
            ctx.strokeStyle = 'rgba(255, 82, 82, 0.7)';
            ctx.setLineDash([8, 8]);
            ctx.lineWidth = 2;
            ctx.strokeRect(beam.x - beam.width / 2, sun.y, beam.width, GROUND_Y - sun.y);
            ctx.setLineDash([]);
            ctx.font = '26px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️', beam.x, GROUND_Y - 20);
        } else {
            const grad = ctx.createLinearGradient(beam.x - beam.width / 2, 0, beam.x + beam.width / 2, 0);
            grad.addColorStop(0, 'rgba(255, 193, 7, 0)');
            grad.addColorStop(0.3, 'rgba(255, 213, 79, 0.9)');
            grad.addColorStop(0.5, 'rgba(255, 255, 230, 1)');
            grad.addColorStop(0.7, 'rgba(255, 213, 79, 0.9)');
            grad.addColorStop(1, 'rgba(255, 193, 7, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(sun.x - 18, sun.y);
            ctx.lineTo(sun.x + 18, sun.y);
            ctx.lineTo(beam.x + beam.width / 2, GROUND_Y);
            ctx.lineTo(beam.x - beam.width / 2, GROUND_Y);
            ctx.closePath();
            ctx.fill();
        }
    });
}

function drawCloud(cloud) {
    const puff = 1 + cloud.puff * 0.5;
    const w = cloud.width;
    ctx.save();
    ctx.translate(cloud.x, cloud.y);
    ctx.scale(puff, puff);
    // Clouds with snow left in them look fluffy-white; empty ones go grey.
    ctx.fillStyle = cloud.flakes > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(207,216,220,0.9)';
    ctx.beginPath();
    ctx.arc(-w * 0.28, 4, w * 0.2, 0, Math.PI * 2);
    ctx.arc(0, -6, w * 0.26, 0, Math.PI * 2);
    ctx.arc(w * 0.28, 4, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-w * 0.42, 0, w * 0.84, w * 0.18);
    if (cloud.flakes > 0) {
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄️'.repeat(cloud.flakes), 0, 14);
    }
    ctx.restore();
}

function drawSnowflake(flake) {
    ctx.save();
    ctx.translate(flake.x, flake.y);
    ctx.rotate(flake.angle);
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -10);
        ctx.moveTo(0, -6);
        ctx.lineTo(-3, -9);
        ctx.moveTo(0, -6);
        ctx.lineTo(3, -9);
        ctx.stroke();
    }
    ctx.restore();
}

function drawSnowball(ball) {
    ctx.save();
    if (ball.mega) {
        ctx.shadowColor = '#81d4fa';
        ctx.shadowBlur = 16;
    }
    const grad = ctx.createRadialGradient(ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, 1, ball.x, ball.y, ball.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, ball.mega ? '#81d4fa' : '#cfd8dc');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawFireball(fire) {
    const grad = ctx.createRadialGradient(fire.x, fire.y, 2, fire.x, fire.y, fire.r + 4);
    grad.addColorStop(0, '#fffde7');
    grad.addColorStop(0.4, '#ffca28');
    grad.addColorStop(1, 'rgba(255, 87, 34, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fire.x, fire.y, fire.r + 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlayer() {
    const s = playerScale();
    const x = player.x;
    const baseY = GROUND_Y;

    if (gameState === 'ending' || gameState === 'over') {
        // A sad little puddle with a hat, carrot and two coal eyes floating in it.
        ctx.fillStyle = 'rgba(179, 229, 252, 0.9)';
        ctx.beginPath();
        ctx.ellipse(x, baseY + 4, 46, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#263238';
        ctx.fillRect(x - 14, baseY - 14, 28, 14);
        ctx.fillRect(x - 20, baseY - 2, 40, 4);
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.moveTo(x + 22, baseY + 2);
        ctx.lineTo(x + 38, baseY + 5);
        ctx.lineTo(x + 22, baseY + 7);
        ctx.fill();
        ctx.fillStyle = '#263238';
        ctx.beginPath();
        ctx.arc(x - 28, baseY + 4, 3, 0, Math.PI * 2);
        ctx.arc(x - 20, baseY + 7, 3, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    // Blink while invulnerable after a hit.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;

    const bob = Math.sin(player.wobble) * 2;
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s, s);
    ctx.rotate(Math.sin(player.wobble) * 0.04);

    // Shadow.
    ctx.fillStyle = 'rgba(100, 140, 180, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 34, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 2;
    // Bottom, middle and head snowballs.
    [[0, -26, 28], [0, -66 + bob * 0.5, 21], [0, -98 + bob, 16]].forEach(([bx, by, br]) => {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    // Buttons.
    ctx.fillStyle = '#263238';
    [-74, -62, -50].forEach((by) => {
        ctx.beginPath();
        ctx.arc(0, by + bob * 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Scarf.
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-16, -86 + bob, 32, 7);
    ctx.fillRect(player.facing > 0 ? -14 : 6, -82 + bob, 8, 20);

    // Face (looks the way Snowy is walking).
    const look = player.facing * 3;
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(-6 + look, -102 + bob, 2.5, 0, Math.PI * 2);
    ctx.arc(6 + look, -102 + bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7043';
    ctx.beginPath();
    ctx.moveTo(look, -97 + bob);
    ctx.lineTo(look + player.facing * 16, -95 + bob);
    ctx.lineTo(look, -93 + bob);
    ctx.closePath();
    ctx.fill();
    // Worried mouth when melting, happy smile otherwise.
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (player.health < 35) {
        ctx.arc(look, -84 + bob, 5, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
        ctx.arc(look, -92 + bob, 6, 0.2 * Math.PI, 0.8 * Math.PI);
    }
    ctx.stroke();

    // Top hat.
    ctx.fillStyle = '#263238';
    ctx.fillRect(-18, -114 + bob, 36, 4);
    ctx.fillRect(-11, -134 + bob, 22, 21);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(-11, -118 + bob, 22, 4);

    // Stick arms — the throwing arm swings up when a snowball flies.
    ctx.strokeStyle = '#6d4c41';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -68 + bob);
    ctx.lineTo(-40, -82 + bob);
    ctx.moveTo(18, -68 + bob);
    if (player.throwAnim > 0) {
        ctx.lineTo(34, -100 + bob);
    } else {
        ctx.lineTo(40, -80 + bob);
    }
    ctx.stroke();

    // Sweat drops when Snowy is really melting.
    if (player.health < 50) {
        ctx.fillStyle = '#4fc3f7';
        const drip = (elapsed * 40) % 30;
        ctx.beginPath();
        ctx.arc(-18, -104 + drip + bob, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawAimGuide() {
    if (!aimVisible || gameState !== 'playing') return;
    const hand = playerHand();
    const ty = Math.min(aimY, hand.y - 20);
    const dx = aimX - hand.x;
    const dy = ty - hand.y;
    const t = clamp(Math.hypot(dx, dy) / 650, 0.3, 0.85);
    const vx = dx / t;
    const vy = dy / t - 0.5 * GRAVITY * t;

    // Dotted preview of the snowball's arc.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 1; i <= 8; i++) {
        const tt = (t * i) / 8;
        ctx.beginPath();
        ctx.arc(hand.x + vx * tt, hand.y + vy * tt + 0.5 * GRAVITY * tt * tt, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Crosshair.
    ctx.strokeStyle = ammo > 0 ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(aimX, aimY, 12, 0, Math.PI * 2);
    ctx.moveTo(aimX - 18, aimY); ctx.lineTo(aimX - 6, aimY);
    ctx.moveTo(aimX + 6, aimY); ctx.lineTo(aimX + 18, aimY);
    ctx.moveTo(aimX, aimY - 18); ctx.lineTo(aimX, aimY - 6);
    ctx.moveTo(aimX, aimY + 6); ctx.lineTo(aimX, aimY + 18);
    ctx.stroke();
}

function drawHud() {
    if (!sun) return;

    // Sun heat bar along the top.
    const barX = 110;
    const barW = W - 220;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    roundRect(barX - 4, 12, barW + 8, 22, 11);
    ctx.fill();
    const frac = heatFraction();
    const heatGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    heatGrad.addColorStop(0, '#ffeb3b');
    heatGrad.addColorStop(1, '#ff3d00');
    ctx.fillStyle = heatGrad;
    roundRect(barX, 16, Math.max(0, barW * frac), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('☀️ Heat', barX - 10, 28);

    // Snowball ammo along the bottom-left.
    for (let i = 0; i < AMMO_MAX; i++) {
        ctx.fillStyle = i < ammo ? '#ffffff' : 'rgba(255,255,255,0.25)';
        ctx.strokeStyle = '#90a4ae';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(20 + i * 20, H - 22, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Mega snowball meter on the bottom-right.
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "Comic Sans MS", sans-serif';
    ctx.fillStyle = '#1565c0';
    ctx.fillText(megaReady ? 'MEGA ready! (Space)' : `Mega ${flakesCaught}/${MEGA_FLAKES}`, W - 14, H - 34);
    for (let i = 0; i < MEGA_FLAKES; i++) {
        ctx.fillStyle = megaReady || i < flakesCaught ? '#29b6f6' : 'rgba(41,182,246,0.25)';
        ctx.beginPath();
        ctx.arc(W - 20 - i * 16, H - 18, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawBanner() {
    if (!banner) return;
    const alpha = clamp(banner.time / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 28px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(21, 101, 192, 0.8)';
    ctx.strokeText(banner.text, W / 2, 230);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(banner.text, W / 2, 230);
    ctx.restore();
}

function render() {
    ctx.save();
    if (shakeTime > 0) {
        ctx.translate(rand(-4, 4), rand(-4, 4));
    }

    drawSky();
    if (sun && gameState !== 'menu') drawSun();
    drawScenery();
    drawBeams();
    clouds.forEach(drawCloud);
    snowflakes.forEach(drawSnowflake);
    fireballs.forEach(drawFireball);
    snowballs.forEach(drawSnowball);
    if (player) drawPlayer();

    particles.forEach((p) => {
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    popups.forEach((pop) => {
        ctx.globalAlpha = clamp(pop.life, 0, 1);
        ctx.font = 'bold 18px "Comic Sans MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeText(pop.text, pop.x, pop.y);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y);
    });
    ctx.globalAlpha = 1;

    if (gameState !== 'menu') {
        drawAimGuide();
        drawHud();
        drawBanner();
    }
    ctx.restore();
}

// ---- HUD -----------------------------------------------------------------
function updateHud() {
    scoreDisplay.textContent = Math.floor(score);
    dayDisplay.textContent = day;
    healthDisplay.textContent = player ? `${Math.ceil(player.health)}%` : '100%';
}

function updateMegaButton() {
    megaBtn.classList.toggle('ready', megaReady);
}

// ---- Game loop -----------------------------------------------------------
function gameLoop(timestamp) {
    // Delta time in seconds keeps movement smooth and frame-rate independent.
    // Clamp to [0, 0.05] so a backgrounded tab can't teleport everything.
    const deltaSeconds = Math.max(0, Math.min(0.05, (timestamp - lastFrameTime) / 1000)) || 0;
    lastFrameTime = timestamp;

    if (gameState === 'playing') {
        update(deltaSeconds);
    } else if (gameState === 'cooled') {
        updateCooled(deltaSeconds);
    } else if (gameState === 'ending') {
        updateEnding(deltaSeconds);
    }
    render();

    if (gameState === 'playing' || gameState === 'cooled' || gameState === 'ending') {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// ---- Game flow -----------------------------------------------------------
function resetPlayer() {
    player = {
        x: W / 2 - 110,
        health: 100,
        invulnerable: 0,
        throwAnim: 0,
        facing: 1,
        wobble: 0
    };
}

function startGame(level) {
    difficulty = level;
    settings = DIFFICULTY_SETTINGS[level];
    loadBestScore();

    score = 0;
    day = 1;
    sunsCooled = 0;
    resetPlayer();
    sun = createSun();
    snowballs = [];
    fireballs = [];
    beams = [];
    clouds = [];
    snowflakes = [];
    particles = [];
    popups = [];

    ammo = AMMO_MAX;
    ammoTimer = 0;
    throwCooldown = 0;
    flakesCaught = 0;
    megaReady = false;
    fireballTimer = 2.5;
    beamTimer = settings.beamGap * 0.6;
    cloudTimer = 1.5;
    flakeTimer = 2;
    shakeTime = 0;
    walkTargetX = null;
    showBanner('Cool down the sun! ❄️', 2.2);

    updateMegaButton();
    updateHud();

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
    endingTimer = 1.6;
    snowflakes = [];
    fireballs = [];
    beams = [];
    snowballs = [];
    audio.stopMusic();
    audio.play('gameOver');
}

function endGame() {
    gameState = 'over';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const finalScore = Math.max(0, Math.floor(score));
    finalScoreDisplay.textContent = finalScore;
    finalSunsDisplay.textContent = sunsCooled;

    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem(bestScoreKey(), bestScore);
        bestScoreDisplay.textContent = bestScore;
        bestLine.textContent = '🏆 New best!';
    } else {
        bestLine.textContent = `Best (${difficulty}): ${bestScore}`;
    }

    render();
    gameOverScreen.classList.add('show');
}

function showMenu() {
    gameState = 'menu';
    audio.stopMusic();
    gameOverScreen.classList.remove('show');
    startOverlay.classList.add('show');
    resetPlayer();
    sun = null;
    clouds = [];
    snowflakes = [];
    particles = [];
    popups = [];
    render(); // draw the idle winter scene behind the menu
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
    aimX = x;
    aimY = y;
    aimVisible = true;
    if (y >= GROUND_Y) {
        // Tapping the snowy ground walks Snowy there.
        walkTargetX = clamp(x, 30, W - 30);
    } else {
        tryThrow(x, y);
    }
    event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
    const { x, y } = canvasCoords(event);
    aimX = x;
    aimY = y;
    aimVisible = event.pointerType === 'mouse' ? y < GROUND_Y : aimVisible;
});

canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') aimVisible = false;
});

// Hold-to-move on-screen buttons.
function bindHoldButton(button, dir) {
    const press = (event) => {
        held[dir] = true;
        button.classList.add('held');
        event.preventDefault();
    };
    const release = () => {
        held[dir] = false;
        button.classList.remove('held');
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
}
bindHoldButton(leftBtn, 'left');
bindHoldButton(rightBtn, 'right');
megaBtn.addEventListener('click', throwMega);

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = true;
        e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = true;
        e.preventDefault();
    } else if (e.key === ' ' || e.code === 'Space') {
        throwMega();
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

// Don't leave Snowy walking forever if the window loses focus mid-keypress.
window.addEventListener('blur', () => {
    keys.left = keys.right = false;
    held.left = held.right = false;
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
resetPlayer();
updateHud();
render(); // show the snowy scene behind the level menu
