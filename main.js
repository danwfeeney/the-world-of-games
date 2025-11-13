// Add interactive animations to game cards
document.addEventListener('DOMContentLoaded', () => {
    const gameCards = document.querySelectorAll('.game-card');

    gameCards.forEach((card, index) => {
        // Stagger the animation
        card.style.animationDelay = `${index * 0.1}s`;

        // Add click sound effect (visual feedback)
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('play-button')) {
                card.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    card.style.transform = '';
                }, 100);
            }
        });
    });
});
