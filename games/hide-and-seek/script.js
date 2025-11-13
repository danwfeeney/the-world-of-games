class HideAndSeekGame {
    constructor() {
        this.gameState = 'waiting'; // waiting, countdown, playing, gameOver
        this.difficulty = 'extreme'; // easy, medium, hard, extreme
        this.difficultySettings = {
            easy: { time: 70, label: 'Easy' },
            medium: { time: 60, label: 'Medium' },
            hard: { time: 50, label: 'Hard' },
            extreme: { time: 20, label: 'Extreme' }
        };
        this.timeLeft = this.difficultySettings[this.difficulty].time;
        this.maxTime = this.difficultySettings[this.difficulty].time;
        this.score = 0;
        this.foundCharacters = new Set();
        this.totalCharacters = 8;
        this.timer = null;
        this.countdownTimer = null;
        this.gameStartTime = null;
        
        this.initializeElements();
        this.bindEvents();
        this.hideAllCharacters();
        this.updateTimerDisplay();
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.timerElement = document.getElementById('timer');
        this.foundElement = document.getElementById('found');
        this.totalElement = document.getElementById('total');
        this.scoreElement = document.getElementById('score');
        this.gameArea = document.getElementById('gameArea');
        this.countdownElement = document.getElementById('countdown');
        this.countdownNumber = document.querySelector('.countdown-number');
        this.gameOverElement = document.getElementById('gameOver');
        this.gameOverTitle = document.getElementById('gameOverTitle');
        this.gameOverMessage = document.getElementById('gameOverMessage');
        this.finalFound = document.getElementById('finalFound');
        this.finalTotal = document.getElementById('finalTotal');
        this.finalScore = document.querySelector('#finalScore span');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        this.hiddenCharacters = document.querySelectorAll('.hidden-character');
        this.hidingSpots = document.querySelectorAll('.hiding-spot');
        this.difficultyButtons = document.querySelectorAll('.btn-difficulty');
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startGame());
        this.resetBtn.addEventListener('click', () => this.resetGame());
        this.playAgainBtn.addEventListener('click', () => this.resetGame());
        
        // Add click events to difficulty buttons
        this.difficultyButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleDifficultyChange(e));
        });
        
        // Add click events to hiding spots
        this.hidingSpots.forEach(spot => {
            spot.addEventListener('click', (e) => this.handleSpotClick(e));
        });
        
        // Add click events to characters
        this.hiddenCharacters.forEach(character => {
            character.addEventListener('click', (e) => this.handleCharacterClick(e));
        });
    }
    
    handleDifficultyChange(e) {
        if (this.gameState !== 'waiting') return; // Can only change difficulty when not playing
        
        const button = e.currentTarget;
        const newDifficulty = button.getAttribute('data-difficulty');
        
        // Update active button styling
        this.difficultyButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update difficulty settings
        this.difficulty = newDifficulty;
        this.timeLeft = this.difficultySettings[this.difficulty].time;
        this.maxTime = this.difficultySettings[this.difficulty].time;
        
        // Update timer display
        this.updateTimerDisplay();
        
        // Play selection sound
        soundEffects.playFoundSound();
    }
    
    updateTimerDisplay() {
        this.timerElement.textContent = this.timeLeft;
    }
    
    hideAllCharacters() {
        this.hiddenCharacters.forEach(character => {
            character.classList.remove('visible', 'found', 'peek');
        });
    }
    
    startGame() {
        if (this.gameState !== 'waiting') return;
        
        soundEffects.playStartGameSound();
        this.showCountdown();
    }
    
    showCountdown() {
        this.gameState = 'countdown';
        this.countdownElement.classList.remove('hidden');
        let count = 3;
        
        const updateCountdown = () => {
            this.countdownNumber.textContent = count;
            this.countdownNumber.style.animation = 'none';
            setTimeout(() => {
                this.countdownNumber.style.animation = 'pulse 1s ease-in-out';
            }, 10);
            
            if (count === 0) {
                this.countdownNumber.textContent = 'GO!';
                soundEffects.playGameStartSound();
                setTimeout(() => {
                    this.countdownElement.classList.add('hidden');
                    this.initializeGameplay();
                }, 1000);
            } else {
                soundEffects.playCountdownSound();
                count--;
                setTimeout(updateCountdown, 1000);
            }
        };
        
        updateCountdown();
    }
    
    initializeGameplay() {
        this.gameState = 'playing';
        this.gameStartTime = Date.now();
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Game in Progress';
        
        // Randomly show characters in hiding spots
        this.shuffleCharacters();
        this.showRandomCharacters();
        this.startTimer();
        
        // Add some visual feedback
        this.gameArea.style.boxShadow = '0 0 20px rgba(0, 123, 255, 0.5)';
    }
    
    shuffleCharacters() {
        // Create array of character positions and shuffle them
        const positions = Array.from({length: this.totalCharacters}, (_, i) => i + 1);
        
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        
        // Assign shuffled positions to characters
        this.hiddenCharacters.forEach((character, index) => {
            character.setAttribute('data-id', positions[index]);
        });
    }
    
    showRandomCharacters() {
        const shuffledCharacters = Array.from(this.hiddenCharacters).sort(() => Math.random() - 0.5);
        
        // Start all characters in hiding, they will peek occasionally
        shuffledCharacters.forEach((character, index) => {
            this.startCharacterPeeking(character, index);
        });
    }
    
    startCharacterPeeking(character, index) {
        if (this.gameState !== 'playing') return;
        
        const peekInterval = () => {
            if (this.gameState !== 'playing' || character.classList.contains('found')) return;
            
            // Random peek timing - characters peek every 3-8 seconds
            const nextPeek = Math.random() * 5000 + 3000;
            
            setTimeout(() => {
                if (this.gameState === 'playing' && !character.classList.contains('found')) {
                    // Only peek if not already visible
                    if (!character.classList.contains('visible') && !character.classList.contains('peek')) {
                        character.classList.add('peek');
                        
                        // Remove peek class after animation
                        setTimeout(() => {
                            character.classList.remove('peek');
                            peekInterval(); // Schedule next peek
                        }, 2000);
                    } else {
                        peekInterval(); // Try again sooner if already peeking
                    }
                }
            }, nextPeek);
        };
        
        // Start first peek with staggered timing
        setTimeout(() => peekInterval(), Math.random() * 4000 + index * 500);
    }
    
    startTimer() {
        this.timer = setInterval(() => {
            this.timeLeft--;
            this.timerElement.textContent = this.timeLeft;
            
            // Add urgency effects as time runs low
            if (this.timeLeft <= 10) {
                this.timerElement.style.color = '#dc3545';
                this.timerElement.style.animation = 'pulse 0.5s ease-in-out infinite';
                // Play urgent countdown sound for last 10 seconds
                soundEffects.playUrgentCountdownSound();
            } else if (this.timeLeft <= 20) {
                this.timerElement.style.color = '#ffc107';
            }
            
            if (this.timeLeft <= 0) {
                this.endGame('timeout');
            }
        }, 1000);
    }
    
    handleSpotClick(e) {
        if (this.gameState !== 'playing') return;
        
        const spot = e.currentTarget;
        const character = spot.querySelector('.hidden-character');
        
        if (character && !character.classList.contains('found')) {
            // Check if character is currently peeking or visible
            if (character.classList.contains('peek') || character.classList.contains('visible')) {
                this.foundCharacter(character);
            } else {
                // Check if character is hiding here but not visible - make them peek briefly
                if (Math.random() < 0.4) { // 40% chance to disturb them
                    character.classList.add('peek');
                    setTimeout(() => character.classList.remove('peek'), 1000);
                    soundEffects.playDisturbSound();
                    this.showDisturbEffect(e.clientX, e.clientY);
                } else {
                    // Wrong click - penalty
                    this.score = Math.max(0, this.score - 5);
                    this.updateScore();
                    this.showMissEffect(e.clientX, e.clientY);
                }
            }
        } else {
            // Wrong click - penalty
            this.score = Math.max(0, this.score - 5);
            this.updateScore();
            this.showMissEffect(e.clientX, e.clientY);
        }
    }
    
    handleCharacterClick(e) {
        if (this.gameState !== 'playing') return;
        
        e.stopPropagation();
        const character = e.currentTarget;
        
        if ((character.classList.contains('visible') || character.classList.contains('peek')) && !character.classList.contains('found')) {
            this.foundCharacter(character);
        }
    }
    
    foundCharacter(character) {
        const characterId = character.getAttribute('data-id');
        
        if (this.foundCharacters.has(characterId)) return;
        
        this.foundCharacters.add(characterId);
        character.classList.remove('visible', 'peek');
        character.classList.add('found');
        
        // Calculate score based on time remaining and difficulty
        const timeBonus = Math.floor(this.timeLeft * 3);
        const speedBonus = Math.floor((60 - this.timeLeft) * 2);
        const difficultyBonus = 150; // Higher base score for harder game
        const earnedScore = difficultyBonus + timeBonus + speedBonus;
        
        this.score += earnedScore;
        this.updateStats();
        
        // Show score popup
        this.showScorePopup(character, `+${earnedScore}`);
        
        // Check if all characters found
        if (this.foundCharacters.size >= this.totalCharacters) {
            setTimeout(() => this.endGame('completed'), 500);
        }
    }
    
    showScorePopup(character, scoreText) {
        const popup = document.createElement('div');
        popup.textContent = scoreText;
        popup.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #28a745;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 14px;
            pointer-events: none;
            z-index: 100;
            animation: scorePopup 1s ease forwards;
        `;
        
        character.parentElement.appendChild(popup);
        
        setTimeout(() => popup.remove(), 1000);
    }
    
    showMissEffect(x, y) {
        const miss = document.createElement('div');
        miss.textContent = 'Miss! -5';
        miss.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            transform: translate(-50%, -50%);
            background: #dc3545;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 14px;
            pointer-events: none;
            z-index: 100;
            animation: missEffect 1s ease forwards;
        `;
        
        document.body.appendChild(miss);
        setTimeout(() => miss.remove(), 1000);
    }
    
    showDisturbEffect(x, y) {
        const disturb = document.createElement('div');
        disturb.textContent = 'Disturbed!';
        disturb.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            transform: translate(-50%, -50%);
            background: #ffc107;
            color: #212529;
            padding: 5px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 14px;
            pointer-events: none;
            z-index: 100;
            animation: missEffect 1s ease forwards;
        `;
        
        document.body.appendChild(disturb);
        setTimeout(() => disturb.remove(), 1000);
    }
    
    updateStats() {
        this.foundElement.textContent = this.foundCharacters.size;
        this.updateScore();
    }
    
    updateScore() {
        this.scoreElement.textContent = this.score;
    }
    
    endGame(reason) {
        this.gameState = 'gameOver';
        
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Handle different end game scenarios
        if (reason === 'timeout') {
            // Explode unfound characters
            this.explodeUnfoundCharacters();
        } else {
            // Show all remaining characters normally for completion
            this.hiddenCharacters.forEach(character => {
                if (!character.classList.contains('found')) {
                    character.classList.remove('peek');
                    character.classList.add('visible');
                    character.style.opacity = '0.5';
                    character.style.filter = 'none';
                }
            });
        }
        
        // Remove game area effects
        this.gameArea.style.boxShadow = '';
        this.timerElement.style.color = '';
        this.timerElement.style.animation = '';
        
        // Show game over screen
        setTimeout(() => this.showGameOverScreen(reason), reason === 'timeout' ? 2000 : 1000);
    }
    
    explodeUnfoundCharacters() {
        const unfoundCharacters = Array.from(this.hiddenCharacters).filter(character => 
            !character.classList.contains('found')
        );
        
        unfoundCharacters.forEach((character, index) => {
            setTimeout(() => {
                // Make character visible first
                character.classList.remove('peek');
                character.classList.add('visible');
                character.style.opacity = '1';
                character.style.filter = 'none';
                
                // Get character position
                const rect = character.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                
                // Create explosion effect
                this.createCharacterExplosion(x, y);
                
                // Hide character after explosion starts
                setTimeout(() => {
                    character.style.opacity = '0';
                }, 300);
                
            }, index * 200); // Stagger explosions
        });
    }
    
    createCharacterExplosion(x, y) {
        // Create explosion container
        const explosionContainer = document.createElement('div');
        explosionContainer.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1001;
        `;
        document.body.appendChild(explosionContainer);
        
        // Create explosion particles
        const particleCount = 8;
        const colors = ['#ff4444', '#ff8800', '#ffaa00', '#ff6600'];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const angle = (i / particleCount) * Math.PI * 2;
            const velocity = Math.random() * 80 + 40;
            const size = Math.random() * 8 + 6;
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: 50%;
                left: 0;
                top: 0;
                box-shadow: 0 0 8px ${color};
            `;
            
            explosionContainer.appendChild(particle);
            
            // Animate particle
            const deltaX = Math.cos(angle) * velocity;
            const deltaY = Math.sin(angle) * velocity;
            
            particle.animate([
                { 
                    transform: 'translate(0, 0) scale(1)',
                    opacity: 1
                },
                { 
                    transform: `translate(${deltaX}px, ${deltaY}px) scale(0)`,
                    opacity: 0
                }
            ], {
                duration: 600,
                easing: 'ease-out'
            }).addEventListener('finish', () => {
                particle.remove();
            });
        }
        
        // Create flash effect
        const flash = document.createElement('div');
        flash.textContent = '💥';
        flash.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            transform: translate(-50%, -50%);
            font-size: 30px;
            z-index: 1002;
        `;
        explosionContainer.appendChild(flash);
        
        flash.animate([
            { 
                transform: 'translate(-50%, -50%) scale(0)',
                opacity: 0
            },
            { 
                transform: 'translate(-50%, -50%) scale(1.5)',
                opacity: 1
            },
            { 
                transform: 'translate(-50%, -50%) scale(0.5)',
                opacity: 0
            }
        ], {
            duration: 800,
            easing: 'ease-out'
        }).addEventListener('finish', () => {
            flash.remove();
        });
        
        // Play explosion sound
        this.playExplosionSound();
        
        // Remove container after animation
        setTimeout(() => {
            if (explosionContainer.parentNode) {
                explosionContainer.remove();
            }
        }, 1000);
    }
    
    playExplosionSound() {
        if (!soundEffects.audioContext) return;
        
        const oscillator = soundEffects.audioContext.createOscillator();
        const gainNode = soundEffects.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(soundEffects.audioContext.destination);
        
        // Explosion sound - low rumble to high pop
        oscillator.frequency.setValueAtTime(80, soundEffects.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, soundEffects.audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(100, soundEffects.audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.3, soundEffects.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, soundEffects.audioContext.currentTime + 0.4);
        
        oscillator.start(soundEffects.audioContext.currentTime);
        oscillator.stop(soundEffects.audioContext.currentTime + 0.4);
    }
    
    showGameOverScreen(reason) {
        let title, message;
        
        if (reason === 'completed') {
            title = '🎉 Congratulations!';
            message = 'You found all the hidden characters!';
            // Bonus for completing
            this.score += this.timeLeft * 10;
            soundEffects.playVictorySound();
            // Launch fireworks celebration!
            this.launchFireworks();
        } else {
            title = '⏰ Time\'s Up!';
            message = 'Better luck next time!';
            soundEffects.playGameOverSound();
        }
        
        this.gameOverTitle.textContent = title;
        this.gameOverMessage.innerHTML = message;
        this.finalFound.textContent = this.foundCharacters.size;
        this.finalTotal.textContent = this.totalCharacters;
        this.finalScore.textContent = this.score;
        
        this.gameOverElement.classList.remove('hidden');
    }
    
    launchFireworks() {
        // Create fireworks container
        const fireworksContainer = document.createElement('div');
        fireworksContainer.id = 'fireworks-container';
        fireworksContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
            overflow: hidden;
        `;
        document.body.appendChild(fireworksContainer);
        
        // Launch multiple fireworks with staggered timing
        const fireworkColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#fd79a8'];
        
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                this.createFirework(fireworksContainer, fireworkColors);
            }, i * 300);
        }
        
        // Remove fireworks container after animation
        setTimeout(() => {
            if (fireworksContainer.parentNode) {
                fireworksContainer.remove();
            }
        }, 4000);
    }
    
    createFirework(container, colors) {
        // Random position for launch
        const x = Math.random() * window.innerWidth;
        const y = window.innerHeight;
        const targetY = Math.random() * window.innerHeight * 0.3 + 50;
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        // Create rocket trail
        const rocket = document.createElement('div');
        rocket.style.cssText = `
            position: absolute;
            width: 4px;
            height: 20px;
            background: linear-gradient(to top, ${color}, transparent);
            left: ${x}px;
            top: ${y}px;
            transform: translateX(-50%);
            border-radius: 2px;
        `;
        container.appendChild(rocket);
        
        // Animate rocket to explosion point
        rocket.animate([
            { top: `${y}px`, opacity: 1 },
            { top: `${targetY}px`, opacity: 0.7 }
        ], {
            duration: 800,
            easing: 'ease-out'
        }).addEventListener('finish', () => {
            rocket.remove();
            this.explodeFirework(container, x, targetY, color);
        });
    }
    
    explodeFirework(container, x, y, color) {
        const particleCount = 12;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const angle = (i / particleCount) * Math.PI * 2;
            const velocity = Math.random() * 100 + 50;
            const size = Math.random() * 6 + 4;
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: 50%;
                left: ${x}px;
                top: ${y}px;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 6px ${color};
            `;
            
            container.appendChild(particle);
            particles.push(particle);
            
            // Animate particle explosion
            const deltaX = Math.cos(angle) * velocity;
            const deltaY = Math.sin(angle) * velocity;
            
            particle.animate([
                { 
                    transform: 'translate(-50%, -50%) scale(1)',
                    opacity: 1
                },
                { 
                    transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0)`,
                    opacity: 0
                }
            ], {
                duration: 1000,
                easing: 'ease-out'
            }).addEventListener('finish', () => {
                particle.remove();
            });
        }
        
        // Create sparkles
        for (let i = 0; i < 6; i++) {
            setTimeout(() => {
                this.createSparkle(container, x, y, color);
            }, Math.random() * 300);
        }
    }
    
    createSparkle(container, x, y, color) {
        const sparkle = document.createElement('div');
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 60;
        
        sparkle.textContent = '✨';
        sparkle.style.cssText = `
            position: absolute;
            left: ${x + offsetX}px;
            top: ${y + offsetY}px;
            transform: translate(-50%, -50%);
            font-size: ${Math.random() * 10 + 15}px;
            color: ${color};
            text-shadow: 0 0 6px ${color};
            pointer-events: none;
        `;
        
        container.appendChild(sparkle);
        
        sparkle.animate([
            { 
                transform: 'translate(-50%, -50%) scale(0) rotate(0deg)',
                opacity: 0
            },
            { 
                transform: 'translate(-50%, -50%) scale(1) rotate(180deg)',
                opacity: 1
            },
            { 
                transform: 'translate(-50%, -50%) scale(0) rotate(360deg)',
                opacity: 0
            }
        ], {
            duration: 800,
            easing: 'ease-in-out'
        }).addEventListener('finish', () => {
            sparkle.remove();
        });
    }
    
    resetGame() {
        // Clear any running timers
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        // Reset game state
        this.gameState = 'waiting';
        this.timeLeft = this.difficultySettings[this.difficulty].time;
        this.maxTime = this.difficultySettings[this.difficulty].time;
        this.score = 0;
        this.foundCharacters.clear();
        
        // Reset UI elements
        this.startBtn.disabled = false;
        this.startBtn.textContent = 'Start Game';
        this.updateTimerDisplay();
        this.timerElement.style.color = '';
        this.timerElement.style.animation = '';
        this.foundElement.textContent = '0';
        this.scoreElement.textContent = '0';
        
        // Hide overlays
        this.countdownElement.classList.add('hidden');
        this.gameOverElement.classList.add('hidden');
        
        // Reset characters
        this.hideAllCharacters();
        this.hiddenCharacters.forEach(character => {
            character.style.opacity = '';
            character.style.filter = '';
        });
        
        // Reset game area
        this.gameArea.style.boxShadow = '';
    }
}

// Add CSS animations via JavaScript
const style = document.createElement('style');
style.textContent = `
    @keyframes scorePopup {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(-50%, -150%) scale(1); opacity: 0; }
    }
    
    @keyframes missEffect {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
        100% { transform: translate(-50%, -100%) scale(1); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new HideAndSeekGame();
    // Play welcome sound when game loads
    setTimeout(() => {
        soundEffects.playLoadedSound();
    }, 500);
});

// Add some fun sound effects using Web Audio API (optional)
class SoundEffects {
    constructor() {
        this.audioContext = null;
        this.initAudio();
    }
    
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    playStartGameSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Ascending notes for start game
        oscillator.frequency.setValueAtTime(261.63, this.audioContext.currentTime); // C4
        oscillator.frequency.setValueAtTime(329.63, this.audioContext.currentTime + 0.1); // E4
        oscillator.frequency.setValueAtTime(392.00, this.audioContext.currentTime + 0.2); // G4
        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime + 0.3); // C5
        
        gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }
    
    playCountdownSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
    
    playGameStartSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Exciting "GO!" sound
        oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime); // E5
        oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.1); // G5
        oscillator.frequency.setValueAtTime(1046.50, this.audioContext.currentTime + 0.2); // C6
        
        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.4);
    }
    
    playFoundSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2); // G5
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    playMissSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
    
    playDisturbSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(350, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.25, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
    
    playGameOverSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Descending notes for game over
        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(466.16, this.audioContext.currentTime + 0.2); // Bb4
        oscillator.frequency.setValueAtTime(415.30, this.audioContext.currentTime + 0.4); // Ab4
        oscillator.frequency.setValueAtTime(369.99, this.audioContext.currentTime + 0.6); // F#4
        
        gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.8);
    }
    
    playVictorySound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Victory fanfare
        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2); // G5
        oscillator.frequency.setValueAtTime(1046.50, this.audioContext.currentTime + 0.3); // C6
        oscillator.frequency.setValueAtTime(1318.51, this.audioContext.currentTime + 0.4); // E6
        
        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.7);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.7);
    }
    
    playLoadedSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Simple welcome chime
        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.15); // E5
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    playUrgentCountdownSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Urgent high-pitched beep
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5 - higher pitch for urgency
        oscillator.frequency.setValueAtTime(1046.50, this.audioContext.currentTime + 0.05); // C6 - even higher
        
        gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
}

// Initialize sound effects
const soundEffects = new SoundEffects();

// Add sound effects to the game (modify the existing foundCharacter and showMissEffect methods)
document.addEventListener('DOMContentLoaded', () => {
    // Override methods to include sound effects
    const originalFoundCharacter = HideAndSeekGame.prototype.foundCharacter;
    HideAndSeekGame.prototype.foundCharacter = function(character) {
        soundEffects.playFoundSound();
        originalFoundCharacter.call(this, character);
    };
    
    const originalShowMissEffect = HideAndSeekGame.prototype.showMissEffect;
    HideAndSeekGame.prototype.showMissEffect = function(x, y) {
        soundEffects.playMissSound();
        originalShowMissEffect.call(this, x, y);
    };
    
    const originalShowDisturbEffect = HideAndSeekGame.prototype.showDisturbEffect;
    HideAndSeekGame.prototype.showDisturbEffect = function(x, y) {
        originalShowDisturbEffect.call(this, x, y);
    };
});
