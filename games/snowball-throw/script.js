// Snowball Throw Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const highScoreDisplay = document.getElementById('highScore');
const gameOverScreen = document.getElementById('gameOver');
const startScreen = document.getElementById('startScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const newHighScoreDisplay = document.getElementById('newHighScore');
const playAgainBtn = document.getElementById('playAgainBtn');
const startBtn = document.getElementById('startBtn');

let score = 0;
let timeLeft = 30;
let highScore = localStorage.getItem('snowballHighScore') || 0;
let gameRunning = false;
let gameLoop;
let timerInterval;

// Game objects
let snowballs = [];
let targets = [];
let particles = [];

// Target class
class Target {
    constructor() {
        this.width = 60;
        this.height = 80;
        this.x = Math.random() < 0.5 ? -this.width : canvas.width;
        this.y = canvas.height - this.height - 20;
        this.speed = 1 + Math.random() * 2;
        this.direction = this.x < 0 ? 1 : -1;
        this.hit = false;
    }

    update() {
        this.x += this.speed * this.direction;
    }

    draw() {
        if (this.hit) return;

        // Draw snowman
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        // Bottom snowball
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 15, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Middle snowball
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 45, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 15, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eyes
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x + this.width / 2 - 5, this.y + 12, 3, 3);
        ctx.fillRect(this.x + this.width / 2 + 2, this.y + 12, 3, 3);

        // Carrot nose
        ctx.fillStyle = '#ff8c42';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + 17);
        ctx.lineTo(this.x + this.width / 2 + 8, this.y + 17);
        ctx.lineTo(this.x + this.width / 2, this.y + 19);
        ctx.fill();

        // Smile
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 18, 5, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Buttons
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 40, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 50, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    isOffScreen() {
        return this.x < -this.width - 20 || this.x > canvas.width + 20;
    }

    checkCollision(x, y) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        return distance < 40;
    }
}

// Snowball class
class Snowball {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.startY = startY;

        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        this.speed = 8;
        this.vx = (dx / distance) * this.speed;
        this.vy = (dy / distance) * this.speed - 5; // Add upward arc
        this.gravity = 0.3;
        this.radius = 8;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity; // Apply gravity

        // Remove if off screen
        if (this.y > canvas.height || this.x < 0 || this.x > canvas.width) {
            this.active = false;
        }
    }

    draw() {
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

// Particle class for hit effects
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1;
        this.decay = 0.02;
        this.size = Math.random() * 5 + 3;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }

    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.life})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    isDead() {
        return this.life <= 0;
    }
}

// Draw background
function drawBackground() {
    // Ground
    ctx.fillStyle = '#f0f8ff';
    ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

    // Ground line
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 30);
    ctx.lineTo(canvas.width, canvas.height - 30);
    ctx.stroke();
}

// Initialize game
function initGame() {
    score = 0;
    timeLeft = 30;
    snowballs = [];
    targets = [];
    particles = [];
    gameRunning = false;

    scoreDisplay.textContent = score;
    timerDisplay.textContent = timeLeft;
    highScoreDisplay.textContent = highScore;
    gameOverScreen.classList.remove('show');
    newHighScoreDisplay.classList.remove('show');
}

// Start game
function startGame() {
    gameRunning = true;
    startScreen.classList.add('hide');

    // Start timer
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;

        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);

    // Start game loop
    gameLoop = requestAnimationFrame(update);
}

// End game
function endGame() {
    gameRunning = false;
    clearInterval(timerInterval);
    cancelAnimationFrame(gameLoop);

    finalScoreDisplay.textContent = score;

    // Check high score
    if (score > highScore) {
        highScore = score;
        highScoreDisplay.textContent = highScore;
        localStorage.setItem('snowballHighScore', highScore);
        newHighScoreDisplay.classList.add('show');
    }

    gameOverScreen.classList.add('show');
}

// Spawn targets
let lastSpawnTime = 0;
const spawnInterval = 2000; // 2 seconds

function spawnTarget(timestamp) {
    if (timestamp - lastSpawnTime > spawnInterval) {
        targets.push(new Target());
        lastSpawnTime = timestamp;
    }
}

// Update game
let lastTimestamp = 0;
function update(timestamp) {
    if (!gameRunning) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    drawBackground();

    // Spawn targets
    spawnTarget(timestamp);

    // Update and draw targets
    targets = targets.filter(target => {
        if (!target.hit && !target.isOffScreen()) {
            target.update();
            target.draw();
            return true;
        }
        return false;
    });

    // Update and draw snowballs
    snowballs = snowballs.filter(snowball => {
        if (snowball.active) {
            snowball.update();

            // Check collision with targets
            targets.forEach(target => {
                if (!target.hit && target.checkCollision(snowball.x, snowball.y)) {
                    target.hit = true;
                    snowball.active = false;
                    score += 10;
                    scoreDisplay.textContent = score;

                    // Create particles
                    for (let i = 0; i < 15; i++) {
                        particles.push(new Particle(snowball.x, snowball.y));
                    }
                }
            });

            snowball.draw();
            return true;
        }
        return false;
    });

    // Update and draw particles
    particles = particles.filter(particle => {
        if (!particle.isDead()) {
            particle.update();
            particle.draw();
            return true;
        }
        return false;
    });

    lastTimestamp = timestamp;
    gameLoop = requestAnimationFrame(update);
}

// Handle click/tap
canvas.addEventListener('click', (e) => {
    if (!gameRunning) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Throw from bottom center
    const startX = canvas.width / 2;
    const startY = canvas.height - 10;

    snowballs.push(new Snowball(startX, startY, x, y));
});

// Touch events for mobile
canvas.addEventListener('touchstart', (e) => {
    if (!gameRunning) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    const startX = canvas.width / 2;
    const startY = canvas.height - 10;

    snowballs.push(new Snowball(startX, startY, x, y));
}, { passive: false });

// Event listeners
startBtn.addEventListener('click', () => {
    initGame();
    startGame();
});

playAgainBtn.addEventListener('click', () => {
    initGame();
    startScreen.classList.remove('hide');
});

// Initialize
highScoreDisplay.textContent = highScore;
drawBackground();
