// Tic-Tac-Toe Game
const X_CLASS = 'x';
const O_CLASS = 'o';
const WINNING_COMBINATIONS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

const cellElements = document.querySelectorAll('[data-cell]');
const board = document.getElementById('gameBoard');
const winningMessageElement = document.getElementById('winningMessage');
const winningTextElement = document.getElementById('winningText');
const playAgainButton = document.getElementById('playAgainBtn');
const resetButton = document.getElementById('resetBtn');
const currentPlayerElement = document.getElementById('currentPlayer');
const xWinsElement = document.getElementById('xWins');
const oWinsElement = document.getElementById('oWins');
const drawsElement = document.getElementById('draws');

let oTurn;
let xWins = localStorage.getItem('tictactoeXWins') || 0;
let oWins = localStorage.getItem('tictactoeOWins') || 0;
let draws = localStorage.getItem('tictactoeDraws') || 0;

xWinsElement.textContent = xWins;
oWinsElement.textContent = oWins;
drawsElement.textContent = draws;

startGame();

playAgainButton.addEventListener('click', () => {
    winningMessageElement.classList.remove('show');
    startGame();
});

resetButton.addEventListener('click', startGame);

function startGame() {
    oTurn = false;
    updateCurrentPlayer();
    cellElements.forEach(cell => {
        cell.classList.remove(X_CLASS);
        cell.classList.remove(O_CLASS);
        cell.classList.remove('winner');
        cell.removeEventListener('click', handleClick);
        cell.addEventListener('click', handleClick, { once: true });
    });
}

function handleClick(e) {
    const cell = e.target;
    const currentClass = oTurn ? O_CLASS : X_CLASS;
    placeMark(cell, currentClass);

    if (checkWin(currentClass)) {
        endGame(false);
    } else if (isDraw()) {
        endGame(true);
    } else {
        swapTurns();
        updateCurrentPlayer();
    }
}

function placeMark(cell, currentClass) {
    cell.classList.add(currentClass);
}

function swapTurns() {
    oTurn = !oTurn;
}

function updateCurrentPlayer() {
    currentPlayerElement.textContent = oTurn ? 'O' : 'X';
}

function checkWin(currentClass) {
    return WINNING_COMBINATIONS.some(combination => {
        const isWin = combination.every(index => {
            return cellElements[index].classList.contains(currentClass);
        });

        if (isWin) {
            // Highlight winning cells
            combination.forEach(index => {
                cellElements[index].classList.add('winner');
            });
        }

        return isWin;
    });
}

function isDraw() {
    return [...cellElements].every(cell => {
        return cell.classList.contains(X_CLASS) || cell.classList.contains(O_CLASS);
    });
}

function endGame(draw) {
    if (draw) {
        winningTextElement.textContent = "It's a Draw! 🤝";
        draws++;
        drawsElement.textContent = draws;
        localStorage.setItem('tictactoeDraws', draws);
    } else {
        const winner = oTurn ? 'O' : 'X';
        winningTextElement.textContent = `${winner} Wins! 🎉`;

        if (winner === 'X') {
            xWins++;
            xWinsElement.textContent = xWins;
            localStorage.setItem('tictactoeXWins', xWins);
        } else {
            oWins++;
            oWinsElement.textContent = oWins;
            localStorage.setItem('tictactoeOWins', oWins);
        }
    }

    winningMessageElement.classList.add('show');
}
