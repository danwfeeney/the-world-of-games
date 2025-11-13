// Memory Match Game
const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
let cards = [...emojis, ...emojis]; // Duplicate for pairs
let flippedCards = [];
let matchedPairs = 0;
let moves = 0;
let canFlip = true;

const gameBoard = document.getElementById('gameBoard');
const movesDisplay = document.getElementById('moves');
const pairsDisplay = document.getElementById('pairs');
const resetBtn = document.getElementById('resetBtn');
const winModal = document.getElementById('winModal');
const playAgainBtn = document.getElementById('playAgainBtn');
const finalMovesDisplay = document.getElementById('finalMoves');

// Shuffle array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Initialize game
function initGame() {
    matchedPairs = 0;
    moves = 0;
    flippedCards = [];
    canFlip = true;
    cards = shuffle([...emojis, ...emojis]);

    movesDisplay.textContent = moves;
    pairsDisplay.textContent = `${matchedPairs}/${emojis.length}`;
    winModal.classList.remove('show');

    gameBoard.innerHTML = '';

    cards.forEach((emoji, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.dataset.emoji = emoji;

        const front = document.createElement('div');
        front.className = 'front';
        front.textContent = '?';

        const back = document.createElement('div');
        back.className = 'back';
        back.textContent = emoji;

        card.appendChild(front);
        card.appendChild(back);
        card.addEventListener('click', flipCard);

        gameBoard.appendChild(card);
    });
}

// Flip card
function flipCard() {
    if (!canFlip) return;
    if (this.classList.contains('flipped') || this.classList.contains('matched')) return;
    if (flippedCards.length >= 2) return;

    this.classList.add('flipped');
    flippedCards.push(this);

    if (flippedCards.length === 2) {
        moves++;
        movesDisplay.textContent = moves;
        checkMatch();
    }
}

// Check for match
function checkMatch() {
    canFlip = false;
    const [card1, card2] = flippedCards;

    if (card1.dataset.emoji === card2.dataset.emoji) {
        // Match found!
        setTimeout(() => {
            card1.classList.add('matched');
            card2.classList.add('matched');
            matchedPairs++;
            pairsDisplay.textContent = `${matchedPairs}/${emojis.length}`;
            flippedCards = [];
            canFlip = true;

            // Check for win
            if (matchedPairs === emojis.length) {
                setTimeout(showWinModal, 500);
            }
        }, 500);
    } else {
        // No match
        setTimeout(() => {
            card1.classList.remove('flipped');
            card2.classList.remove('flipped');
            flippedCards = [];
            canFlip = true;
        }, 1000);
    }
}

// Show win modal
function showWinModal() {
    finalMovesDisplay.textContent = moves;
    winModal.classList.add('show');
}

// Event listeners
resetBtn.addEventListener('click', initGame);
playAgainBtn.addEventListener('click', initGame);

// Start game
initGame();
