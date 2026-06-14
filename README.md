# Mini Games Collection

A fun, colorful collection of browser-based games designed to be kid-friendly and responsive across all devices!

## Features

- **Fully Responsive Design** - Works on desktop, tablet, and mobile devices
- **Kid-Friendly Interface** - Bright colors, fun emojis, and easy-to-use controls
- **No Dependencies** - Pure HTML, CSS, and JavaScript - just open and play!
- **Local Storage** - High scores and game stats are saved automatically

## Games Included

### 🧠 Memory Match
Find matching pairs of cute emoji cards! Test your memory and try to complete the game in as few moves as possible.

**Features:**
- 8 pairs of emoji cards
- Move counter
- Win celebration
- Smooth flip animations

### 🐍 Snake Game
Classic snake game with a colorful twist! Eat apples to grow longer, but don't hit the walls or yourself!

**Features:**
- Keyboard controls (arrow keys)
- Touch swipe controls for mobile
- On-screen button controls
- High score tracking
- Smooth animations

### ⭕ Tic-Tac-Toe
The classic game of three in a row! Play with a friend and see who can win the most rounds.

**Features:**
- Two-player gameplay
- Win/draw tracking
- Score history saved locally
- Winning combination highlight

### 🚗 Car Dodge
Steer your car between three lanes to dodge oncoming traffic and grab coins for bonus points. Pick Easy, Medium, or Hard — the road also speeds up the longer you survive!

**Features:**
- Three difficulty levels (Easy / Medium / Hard)
- Difficulty ramps up over time as you survive
- Collectible coins for bonus points
- Throttle control — the car only moves while you hold the accelerator
- Weapon power-ups drop at score checkpoints: collect one, then press Spacebar (or 🔥) to shoot and blow up cars
- Crash explosion effect with flying debris
- Tap the left/right side of the road on mobile, or arrow keys on desktop
- Synthesised soundtrack, engine sound that revs with speed, and sound effects (Web Audio API) with a mute toggle
- Per-difficulty high scores saved locally

## Project Structure

```
mini-games/
├── index.html              # Main game discovery page
├── styles.css              # Main page styles
├── main.js                 # Main page interactions
├── README.md              # This file
└── games/
    ├── memory-match/
    │   ├── index.html
    │   ├── styles.css
    │   └── script.js
    ├── snake/
    │   ├── index.html
    │   ├── styles.css
    │   └── script.js
    └── tic-tac-toe/
        ├── index.html
        ├── styles.css
        └── script.js
```

## How to Use

1. Open `index.html` in any modern web browser
2. Click on any game card to start playing
3. Use the "Back" button in each game to return to the main menu

## Adding New Games

To add a new game:

1. Create a new folder in the `games/` directory
2. Add `index.html`, `styles.css`, and `script.js` files
3. Update the main `index.html` to add a new game card
4. Follow the existing responsive design patterns

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Technologies Used

- HTML5
- CSS3 (Grid, Flexbox, Animations)
- Vanilla JavaScript (ES6+)
- Canvas API (for Snake game)
- Local Storage API

Enjoy playing! 🎮
