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

### 🌻 Garden Guardian
Bluebirds fly over and drop seeds — water them and watch your garden bloom! But watch out: bunnies and snails sneak in to munch your plants, and crows swoop down to peck flowers and steal seeds.

**Features:**
- Two tools: watering can 💧 and a shotgun 🔫 — blast crows out of the sky, and the bang scares off bunnies and snails too (but don't shoot the friendly bluebirds!)
- Plants grow through four stages: seed → sprout → bud → bloom
- Water meters — thirsty plants wilt and can dry out for good
- Day counter with rising difficulty and three starting levels (Easy / Medium / Hard)
- Three hearts: lose one each time a grown plant is eaten or dries out
- Synthesised pastoral soundtrack and sound effects (Web Audio API) with a mute toggle
- Per-difficulty high scores saved locally

### 🔠 Peekaboo Letters
Letters are hiding behind bushes, rocks, stumps and boxes! Hop around the meadow one step at a time and catch each letter when it peeks out — in the right order — to spell the word shown on the sign.

**Features:**
- Step-by-step movement: arrow keys (or WASD), the on-screen arrow pad, or tap a tile to walk there
- Letters rustle and peek out, then hide again — jump in too early and they giggle and stay hidden
- Kid-friendly words with pictures: 3 letters on Easy, 4 on Medium, 5 on Hard
- Easy makes the letter you need glow; Hard sends out sneaky look-alike decoys (E for F, O for Q...)
- Countdown clock with bonus time for every word spelled
- Caught letters and finished words are read aloud (browser speech synthesis), plus a synthesised music-box soundtrack and sound effects, all behind a mute toggle
- Per-difficulty high scores saved locally

### ☀️ Sun Showdown
The sun is far too hot and it's melting all the snow! Help Snowy the snowman pelt it with snowballs to cool it down before they melt into a puddle.

**Features:**
- Tap or click anywhere in the sky to throw — a dotted arc shows where the snowball will fly
- Snowballs shrink in the sun's heat haze, so throw them fast and true
- Dodge the sun's fireballs (or knock them out of the sky with a snowball) and its telegraphed sunbeams
- Snowy shrinks as they melt — catch falling snowflakes to heal, and hit clouds to shake more loose
- Catch 5 snowflakes to charge a MEGA snowball (Spacebar or the ❄️ button)
- Cool the sun to bring on a snowy night, then face an even hotter sun the next day
- The sun's face reacts: smug, ouch, angry when nearly cooled, and sleepy once it's beaten
- Three difficulty levels (Easy / Medium / Hard) — harder suns dodge snowballs and fire sunbeams sooner
- Synthesised jingly soundtrack and sound effects (Web Audio API) with a mute toggle
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
