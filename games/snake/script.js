// Snake Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('highScore');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreDisplay = document.getElementById('finalScore');
const playAgainBtn = document.getElementById('playAgainBtn');
const mobileControls = document.querySelectorAll('.control-btn');

const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [{ x: 10, y: 10 }];
let food = { x: 15, y: 15 };
let dx = 0;
let dy = 0;
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameLoop;
let isGameOver = false;

highScoreDisplay.textContent = highScore;

// Draw functions
function drawSnake() {
    ctx.fillStyle = '#4ecdc4';
    ctx.strokeStyle = '#44a3a3';
    ctx.lineWidth = 2;

    snake.forEach((segment, index) => {
        ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
        ctx.strokeRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);

        // Draw eyes on the head
        if (index === 0) {
            ctx.fillStyle = 'white';
            ctx.fillRect(segment.x * gridSize + 5, segment.y * gridSize + 5, 4, 4);
            ctx.fillRect(segment.x * gridSize + 11, segment.y * gridSize + 5, 4, 4);
            ctx.fillStyle = 'black';
            ctx.fillRect(segment.x * gridSize + 6, segment.y * gridSize + 6, 2, 2);
            ctx.fillRect(segment.x * gridSize + 12, segment.y * gridSize + 6, 2, 2);
            ctx.fillStyle = '#4ecdc4';
        }
    });
}

function drawFood() {
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(
        food.x * gridSize + gridSize / 2,
        food.y * gridSize + gridSize / 2,
        gridSize / 2 - 2,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Draw leaf on apple
    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(food.x * gridSize + gridSize / 2 - 1, food.y * gridSize + 2, 2, 4);
}

function drawGrid() {
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;

    for (let i = 0; i < tileCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
    }
}

function clearCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Game logic
function moveSnake() {
    if (dx === 0 && dy === 0) return;

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    // Check wall collision
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        endGame();
        return;
    }

    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        endGame();
        return;
    }

    snake.unshift(head);

    // Check food collision
    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreDisplay.textContent = score;
        generateFood();

        // Update high score
        if (score > highScore) {
            highScore = score;
            highScoreDisplay.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
        }
    } else {
        snake.pop();
    }
}

function generateFood() {
    let newFood;
    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));

    food = newFood;
}

function endGame() {
    isGameOver = true;
    clearInterval(gameLoop);
    finalScoreDisplay.textContent = score;
    gameOverScreen.classList.add('show');
}

function resetGame() {
    snake = [{ x: 10, y: 10 }];
    dx = 0;
    dy = 0;
    score = 0;
    isGameOver = false;
    scoreDisplay.textContent = score;
    gameOverScreen.classList.remove('show');
    generateFood();
    startGame();
}

function gameStep() {
    clearCanvas();
    drawGrid();
    moveSnake();
    drawFood();
    drawSnake();
}

function startGame() {
    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(gameStep, 150);
}

// Controls
document.addEventListener('keydown', (e) => {
    if (isGameOver) return;

    switch (e.key) {
        case 'ArrowUp':
            if (dy === 0) {
                dx = 0;
                dy = -1;
            }
            e.preventDefault();
            break;
        case 'ArrowDown':
            if (dy === 0) {
                dx = 0;
                dy = 1;
            }
            e.preventDefault();
            break;
        case 'ArrowLeft':
            if (dx === 0) {
                dx = -1;
                dy = 0;
            }
            e.preventDefault();
            break;
        case 'ArrowRight':
            if (dx === 0) {
                dx = 1;
                dy = 0;
            }
            e.preventDefault();
            break;
    }
});

// Mobile controls
mobileControls.forEach(btn => {
    btn.addEventListener('click', () => {
        if (isGameOver) return;

        const direction = btn.dataset.direction;
        switch (direction) {
            case 'up':
                if (dy === 0) {
                    dx = 0;
                    dy = -1;
                }
                break;
            case 'down':
                if (dy === 0) {
                    dx = 0;
                    dy = 1;
                }
                break;
            case 'left':
                if (dx === 0) {
                    dx = -1;
                    dy = 0;
                }
                break;
            case 'right':
                if (dx === 0) {
                    dx = 1;
                    dy = 0;
                }
                break;
        }
    });
});

// Touch swipe controls
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
    if (isGameOver) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (diffX > 0 && dx === 0) {
            dx = 1;
            dy = 0;
        } else if (diffX < 0 && dx === 0) {
            dx = -1;
            dy = 0;
        }
    } else {
        // Vertical swipe
        if (diffY > 0 && dy === 0) {
            dx = 0;
            dy = 1;
        } else if (diffY < 0 && dy === 0) {
            dx = 0;
            dy = -1;
        }
    }
}, { passive: true });

// Event listeners
playAgainBtn.addEventListener('click', resetGame);

// Initialize game
generateFood();
gameStep();
startGame();
