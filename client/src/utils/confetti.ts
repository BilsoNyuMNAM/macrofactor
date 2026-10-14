import confetti from 'canvas-confetti';

/**
 * Triggers a multi-stage celebratory particle confetti explosion
 * using MacroFactor brand colors: coral (#ff6b4a), lavender (#c7b8f5),
 * emerald (#10b981), amber (#f59e0b), and sky (#38bdf8).
 */
export const triggerGoalCelebration = () => {
  const brandColors = ['#ff6b4a', '#c7b8f5', '#10b981', '#f59e0b', '#38bdf8', '#ffffff'];

  // 1. Center explosion
  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.55 },
    colors: brandColors,
    startVelocity: 45,
    ticks: 250,
    gravity: 0.9,
    shapes: ['square', 'circle'],
    scalar: 1.1
  });

  // 2. Left side cannon
  setTimeout(() => {
    confetti({
      particleCount: 45,
      angle: 60,
      spread: 65,
      origin: { x: 0.05, y: 0.7 },
      colors: brandColors,
      startVelocity: 50,
      ticks: 200,
      scalar: 1.0
    });
  }, 180);

  // 3. Right side cannon
  setTimeout(() => {
    confetti({
      particleCount: 45,
      angle: 120,
      spread: 65,
      origin: { x: 0.95, y: 0.7 },
      colors: brandColors,
      startVelocity: 50,
      ticks: 200,
      scalar: 1.0
    });
  }, 350);
};
