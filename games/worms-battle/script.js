// Worms Battle Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const team1HealthDisplay = document.getElementById('team1Health');
const team2HealthDisplay = document.getElementById('team2Health');
const turnIndicator = document.getElementById('turnIndicator');
const powerSlider = document.getElementById('powerSlider');
const angleSlider = document.getElementById('angleSlider');
const powerValue = document.getElementById('powerValue');
const angleValue = document.getElementById('angleValue');
const windValue = document.getElementById('windValue');
const fireBtn = document.getElementById('fireBtn');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOver');
const winnerText = document.getElementById('winnerText');
const startBtn = document.getElementById('startBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

// Game state
let gameRunning = false;
let currentTeam = 1; // 1 or 2
let wind = 0;
let isFiring = false;
let projectile = null;
let explosionParticles = [];

// Terrain
let terrain = [];
const terrainHeight = [];

// Worms
class Worm {
    constructor(x, team) {
        this.x = x;
        this.y = 0;
        this.team = team;
        this.health = 100;
        this.alive = true;
        this.radius = 8;
        this.color = team === 1 ? '#ff6b6b' : '#4dabf7';
    }

    updatePosition() {
        // Find ground beneath worm
        for (let y = 0; y < canvas.height; y++) {
            if (terrain[Math.floor(this.x)] && terrain[Math.floor(this.x)][y]) {
                this.y = y - this.radius;
                break;
            }
        }
    }

    draw() {
        if (!this.alive) return;

        // Body
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.team === 1 ? '#ff5252' : '#339af0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eyes
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(this.x - 3, this.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + 3, this.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x - 3, this.y - 2, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + 3, this.y - 2, 1, 0, Math.PI * 2);
        ctx.fill();

        // Health bar
        const barWidth = 30;
        const barHeight = 4;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 10;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = this.health > 50 ? '#4caf50' : this.health > 25 ? '#ffc107' : '#f44336';
        ctx.fillRect(barX, barY, (this.health / 100) * barWidth, barHeight);
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
        }
    }
}

let team1Worms = [];
let team2Worms = [];

// Projectile class
class Projectile {
    constructor(x, y, power, angle, wind) {
        this.x = x;
        this.y = y;
        const radians = (angle * Math.PI) / 180;
        const velocity = power / 10;
        this.vx = Math.cos(radians) * velocity + wind / 20;
        this.vy = -Math.sin(radians) * velocity;
        this.gravity = 0.2;
        this.radius = 4;
        this.active = true;
        this.trail = [];
    }

    update() {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 10) this.trail.shift();

        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx += wind / 100;

        // Check collision with terrain
        const px = Math.floor(this.x);
        const py = Math.floor(this.y);

        if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
            if (terrain[px] && terrain[px][py]) {
                this.explode();
                return;
            }
        }

        // Check collision with worms
        [...team1Worms, ...team2Worms].forEach(worm => {
            if (worm.alive) {
                const distance = Math.sqrt((this.x - worm.x) ** 2 + (this.y - worm.y) ** 2);
                if (distance < this.radius + worm.radius) {
                    this.explode();
                }
            }
        });

        // Off screen
        if (this.x < 0 || this.x > canvas.width || this.y > canvas.height) {
            this.active = false;
        }
    }

    draw() {
        // Draw trail
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.trail.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.stroke();

        // Draw projectile
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    explode() {
        this.active = false;
        const explosionRadius = 40;

        // Create explosion particles
        for (let i = 0; i < 30; i++) {
            explosionParticles.push(new ExplosionParticle(this.x, this.y));
        }

        // Destroy terrain
        for (let dx = -explosionRadius; dx <= explosionRadius; dx++) {
            for (let dy = -explosionRadius; dy <= explosionRadius; dy++) {
                const px = Math.floor(this.x + dx);
                const py = Math.floor(this.y + dy);
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= explosionRadius && px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
                    if (terrain[px]) {
                        terrain[px][py] = false;
                    }
                }
            }
        }

        // Damage worms in blast radius
        [...team1Worms, ...team2Worms].forEach(worm => {
            if (worm.alive) {
                const distance = Math.sqrt((this.x - worm.x) ** 2 + (this.y - worm.y) ** 2);
                if (distance <= explosionRadius) {
                    const damage = Math.floor((1 - distance / explosionRadius) * 50);
                    worm.takeDamage(damage);
                }
            }
        });

        updateHealthDisplays();
    }
}

// Explosion particle class
class ExplosionParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1;
        this.decay = 0.02;
        this.size = Math.random() * 4 + 2;
        this.color = ['#ff6b6b', '#ffa500', '#ffff00'][Math.floor(Math.random() * 3)];
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2;
        this.life -= this.decay;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    isDead() {
        return this.life <= 0;
    }
}

// Generate terrain
function generateTerrain() {
    terrain = [];
    for (let x = 0; x < canvas.width; x++) {
        terrain[x] = [];
    }

    // Generate height map with hills
    const baseHeight = canvas.height - 100;
    for (let x = 0; x < canvas.width; x++) {
        const height = baseHeight + Math.sin(x / 50) * 50 + Math.sin(x / 30) * 30;
        terrainHeight[x] = Math.floor(height);
    }

    // Fill terrain
    for (let x = 0; x < canvas.width; x++) {
        for (let y = terrainHeight[x]; y < canvas.height; y++) {
            terrain[x][y] = true;
        }
    }
}

// Draw terrain
function drawTerrain() {
    ctx.fillStyle = '#654321';
    ctx.strokeStyle = '#8b6f47';
    ctx.lineWidth = 2;

    // Draw terrain
    for (let x = 0; x < canvas.width; x++) {
        for (let y = 0; y < canvas.height; y++) {
            if (terrain[x] && terrain[x][y]) {
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    // Draw grass on top
    ctx.fillStyle = '#7cb342';
    for (let x = 0; x < canvas.width; x++) {
        if (terrain[x]) {
            for (let y = 0; y < canvas.height; y++) {
                if (terrain[x][y] && (!terrain[x][y - 1] || !terrain[x][y - 2])) {
                    ctx.fillRect(x, y, 1, 3);
                    break;
                }
            }
        }
    }
}

// Initialize game
function initGame() {
    generateTerrain();

    // Create worms
    team1Worms = [
        new Worm(150, 1),
        new Worm(200, 1)
    ];

    team2Worms = [
        new Worm(canvas.width - 150, 2),
        new Worm(canvas.width - 200, 2)
    ];

    // Position worms on terrain
    [...team1Worms, ...team2Worms].forEach(worm => worm.updatePosition());

    currentTeam = 1;
    wind = Math.floor(Math.random() * 21) - 10; // -10 to 10
    windValue.textContent = wind;
    isFiring = false;
    projectile = null;
    explosionParticles = [];

    updateHealthDisplays();
    updateTurnIndicator();
    fireBtn.disabled = false;
}

// Update health displays
function updateHealthDisplays() {
    const team1Total = team1Worms.reduce((sum, worm) => sum + (worm.alive ? worm.health : 0), 0);
    const team2Total = team2Worms.reduce((sum, worm) => sum + (worm.alive ? worm.health : 0), 0);

    team1HealthDisplay.textContent = team1Total;
    team2HealthDisplay.textContent = team2Total;

    // Check win condition
    if (team1Total <= 0) {
        endGame(2);
    } else if (team2Total <= 0) {
        endGame(1);
    }
}

// Update turn indicator
function updateTurnIndicator() {
    turnIndicator.textContent = currentTeam === 1 ? "Red's Turn" : "Blue's Turn";
    turnIndicator.style.color = currentTeam === 1 ? '#ff6b6b' : '#4dabf7';
}

// Switch turns
function switchTurn() {
    currentTeam = currentTeam === 1 ? 2 : 1;
    wind = Math.floor(Math.random() * 21) - 10;
    windValue.textContent = wind;
    updateTurnIndicator();
    fireBtn.disabled = false;
}

// Fire projectile
function fire() {
    if (isFiring) return;

    const power = parseInt(powerSlider.value);
    const angle = parseInt(angleSlider.value);

    // Find active worm
    const activeWorms = currentTeam === 1 ? team1Worms : team2Worms;
    const activeWorm = activeWorms.find(w => w.alive);

    if (!activeWorm) {
        switchTurn();
        return;
    }

    // Adjust angle direction based on team
    const adjustedAngle = currentTeam === 1 ? angle : 180 - angle;

    projectile = new Projectile(activeWorm.x, activeWorm.y, power, adjustedAngle, wind);
    isFiring = true;
    fireBtn.disabled = true;
}

// End game
function endGame(winningTeam) {
    gameRunning = false;
    winnerText.textContent = winningTeam === 1 ? 'Red Team Wins! 🎉' : 'Blue Team Wins! 🎉';
    winnerText.style.color = winningTeam === 1 ? '#ff6b6b' : '#4dabf7';
    gameOverScreen.classList.add('show');
}

// Game loop
function gameLoop() {
    if (!gameRunning) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw sky
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87ceeb');
    gradient.addColorStop(0.5, '#e3f2fd');
    gradient.addColorStop(1, '#8bc34a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw terrain
    drawTerrain();

    // Update and draw worms
    [...team1Worms, ...team2Worms].forEach(worm => {
        worm.updatePosition();
        worm.draw();
    });

    // Update and draw projectile
    if (projectile && projectile.active) {
        projectile.update();
        projectile.draw();
    } else if (isFiring && projectile && !projectile.active) {
        isFiring = false;
        setTimeout(() => {
            switchTurn();
        }, 1000);
    }

    // Update and draw explosion particles
    explosionParticles = explosionParticles.filter(particle => {
        if (!particle.isDead()) {
            particle.update();
            particle.draw();
            return true;
        }
        return false;
    });

    requestAnimationFrame(gameLoop);
}

// UI Controls
powerSlider.addEventListener('input', (e) => {
    powerValue.textContent = e.target.value;
});

angleSlider.addEventListener('input', (e) => {
    angleValue.textContent = e.target.value;
});

fireBtn.addEventListener('click', fire);

startBtn.addEventListener('click', () => {
    startScreen.classList.add('hide');
    gameRunning = true;
    initGame();
    gameLoop();
});

playAgainBtn.addEventListener('click', () => {
    gameOverScreen.classList.remove('show');
    startScreen.classList.remove('hide');
});

// Initialize
ctx.clearRect(0, 0, canvas.width, canvas.height);
const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
gradient.addColorStop(0, '#87ceeb');
gradient.addColorStop(0.5, '#e3f2fd');
gradient.addColorStop(1, '#8bc34a');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, canvas.width, canvas.height);
