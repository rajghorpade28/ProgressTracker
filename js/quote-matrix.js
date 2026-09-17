/**
 * ============================================================================
 * Quote & Animated Dot-Matrix Engine (Progress Tracker wisdom component)
 * ============================================================================
 * Features:
 * - High-precision dot-matrix portrait rendering
 * - Strictly uniform 300px height across all photos
 * - Right-anchored layout: width expands to the left, maintaining strictly equal
 *   top, bottom, and right margins
 * - High-contrast thresholding for silhouettes and portraits
 * - Dynamic theme color inheritance via CSS custom properties
 * - 10-second auto-rotation with graceful cross-fade transitions
 * - Interactive pause/resume on hover & quick-jump indicator dots
 */

(function () {
  'use strict';

  // 1. Exact 6 Quote Objects as required
  const QUOTES = [
    {
      author: "Shri Krishna",
      quote: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।",
      imagePath: "assets/quotes/krishna.png",
      isSanskrit: true,
      width: 275,
      height: 300
    },
    {
      author: "Swami Vivekananda",
      quote: "Arise, awake, and stop not till the goal is reached.",
      imagePath: "assets/quotes/vivekananda.png",
      isSanskrit: false,
      width: 300,
      height: 300
    },
    {
      author: "Dr. A.P.J. Abdul Kalam",
      quote: "You have to dream before your dreams can come true.",
      imagePath: "assets/quotes/kalam.png",
      isSanskrit: false,
      width: 300,
      height: 300
    },
    {
      author: "Andrew Ng",
      quote: "Don't worry about being the best. Worry about being better than you were yesterday.",
      imagePath: "assets/quotes/andrew_ng.png",
      isSanskrit: false,
      width: 300,
      height: 300
    },
    {
      author: "Linus Torvalds",
      quote: "Talk is cheap. Show me the code.",
      imagePath: "assets/quotes/linus.png",
      isSanskrit: false,
      width: 300,
      height: 300
    },
    {
      author: "Jensen Huang",
      quote: "Run, don't walk. Remember, either you're running for food, or you are running from becoming food.",
      imagePath: "assets/quotes/jensen.png",
      isSanskrit: false,
      width: 300,
      height: 300
    }
  ];

  // Merge precomputed data URIs, dimensions, and dot arrays from quotes-data.js if available
  if (window.MOTIVATIONAL_QUOTES && Array.isArray(window.MOTIVATIONAL_QUOTES)) {
    window.MOTIVATIONAL_QUOTES.forEach((item, idx) => {
      if (QUOTES[idx]) {
        if (item.imageDataUri) QUOTES[idx].imageDataUri = item.imageDataUri;
        if (item.dots) QUOTES[idx].dots = item.dots;
        if (item.width) QUOTES[idx].width = item.width;
        if (item.height) QUOTES[idx].height = item.height;
      }
    });
  }

  // Expose array globally if needed by other components
  window.MOTIVATIONAL_QUOTES = QUOTES;

  // Configuration constants
  const ROTATION_INTERVAL_MS = 10000; // 10 seconds auto-rotation
  const GRID_SPACING = 2.0;            // Fine 2.0px Dithered dot grid
  const CANVAS_LOGICAL_HEIGHT = 300;   // Strictly uniform height for all portraits
  const MAX_DOT_RADIUS = (GRID_SPACING / 2.0) * 0.95;

  // State
  let currentIndex = 0;
  let currentCanvasWidth = 275;
  let rotationTimer = null;
  let activeDots = [];
  const dotsCache = new Map();

  // DOM references
  let cardEl = null;
  let textContainerEl = null;
  let quoteTextEl = null;
  let quoteAuthorEl = null;
  let dotsIndicatorEl = null;
  let visibleCanvas = null;
  let visibleCtx = null;
  let hiddenCanvas = null;
  let hiddenCtx = null;

  /**
   * Initializes the offscreen and visible canvas elements with HiDPI support
   */
  function initCanvases() {
    visibleCanvas = document.getElementById('quote-dot-canvas');
    if (!visibleCanvas) return false;

    visibleCtx = visibleCanvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const firstItem = QUOTES[0];
    const initialW = (firstItem && firstItem.width) ? firstItem.width : 275;
    currentCanvasWidth = initialW;

    visibleCanvas.width = Math.round(initialW * dpr);
    visibleCanvas.height = Math.round(CANVAS_LOGICAL_HEIGHT * dpr);
    visibleCanvas.style.width = `${initialW}px`;
    visibleCanvas.style.height = `${CANVAS_LOGICAL_HEIGHT}px`;
    visibleCtx.scale(dpr, dpr);

    hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = initialW;
    hiddenCanvas.height = CANVAS_LOGICAL_HEIGHT;
    hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

    return true;
  }

  /**
   * Reads theme primary color dynamically from CSS custom properties
   */
  function getThemePrimaryColor() {
    try {
      const style = getComputedStyle(document.documentElement);
      const color = style.getPropertyValue('--accent-primary').trim() ||
                    style.getPropertyValue('--primary').trim();
      if (color) return color;
    } catch (e) {
      // fallback
    }
    return '#c0c1ff'; // Soft electric lavender matching Obsidian Dark palette
  }

  /**
   * Fallback: Extracts Halftone dot matrix from an Image element
   */
  function processImageToDots(img, W, H) {
    if (!hiddenCtx) return [];

    hiddenCanvas.width = W;
    hiddenCanvas.height = H;
    hiddenCtx.fillStyle = '#000000';
    hiddenCtx.fillRect(0, 0, W, H);

    hiddenCtx.drawImage(img, 0, 0, W, H);

    let imgData;
    try {
      imgData = hiddenCtx.getImageData(0, 0, W, H).data;
    } catch (e) {
      console.warn('Canvas getImageData restricted:', e);
      return [];
    }

    const dots = [];
    const step = GRID_SPACING;
    const cols = Math.floor(W / step);
    const rows = Math.floor(H / step);
    const maxR = MAX_DOT_RADIUS;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * step;
        const cy = (r + 0.5) * step;

        let totalLum = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = Math.min(W - 1, Math.max(0, Math.round(cx + dx)));
            const sy = Math.min(H - 1, Math.max(0, Math.round(cy + dy)));
            const idx = (sy * W + sx) * 4;
            const red = imgData[idx];
            const green = imgData[idx + 1];
            const blue = imgData[idx + 2];
            const alpha = imgData[idx + 3];

            const pixelLum = alpha < 20 ? 0 : (red * 0.299 + green * 0.587 + blue * 0.114);
            totalLum += pixelLum;
            count++;
          }
        }

        const avgLum = totalLum / count;
        const normLum = avgLum / 255.0;

        if (normLum > 0.06) {
          const intensity = Math.pow(normLum, 1.0);
          const baseRadius = Math.max(0.4, maxR * (0.65 + 0.35 * intensity));
          const baseAlpha = Math.min(1.0, 0.40 + 0.60 * intensity);

          dots.push({
            x: cx,
            y: cy,
            baseRadius,
            baseAlpha,
            intensity,
            normX: cx / W,
            normY: cy / H
          });
        }
      }
    }

    return dots;
  }

  /**
   * Preloads an image and extracts its dot matrix, with data URI fallback
   */
  function loadQuoteDots(index) {
    return new Promise((resolve) => {
      if (dotsCache.has(index)) {
        resolve(dotsCache.get(index));
        return;
      }

      const item = QUOTES[index];

      // Fast-path: If precomputed high-detail dithered dot array is present, map directly
      if (item && item.dots && Array.isArray(item.dots) && item.dots.length > 0) {
        const dots = item.dots.map(d => ({
          x: d[0],
          y: d[1],
          baseRadius: d[2],
          baseAlpha: d[3],
          normX: d[4],
          normY: d[5]
        }));
        dotsCache.set(index, dots);
        resolve(dots);
        return;
      }

      const img = new Image();
      const targetW = item.width || (item.author === 'Shri Krishna' ? 275 : 300);

      img.onload = () => {
        const dots = processImageToDots(img, targetW, CANVAS_LOGICAL_HEIGHT);
        dotsCache.set(index, dots);
        resolve(dots);
      };

      img.onerror = () => {
        if (item.imageDataUri && img.src !== item.imageDataUri) {
          img.src = item.imageDataUri;
        } else if (item.imagePath.endsWith('.png')) {
          img.src = item.imagePath.replace('.png', '.webp');
        } else {
          resolve([]);
        }
      };

      if (item.imageDataUri) {
        img.src = item.imageDataUri;
      } else {
        const globalQuotes = window.MOTIVATIONAL_QUOTES && window.MOTIVATIONAL_QUOTES[index];
        if (globalQuotes && globalQuotes.imageDataUri) {
          img.src = globalQuotes.imageDataUri;
        } else {
          img.src = item.imagePath;
        }
      }
    });
  }

  /**
   * Renders the dot-matrix portrait onto the visible canvas
   */
  function drawActiveDots() {
    if (!visibleCtx) return;
    visibleCtx.clearRect(0, 0, currentCanvasWidth, CANVAS_LOGICAL_HEIGHT);

    if (!activeDots || activeDots.length === 0) return;

    const primaryColor = getThemePrimaryColor();
    visibleCtx.fillStyle = primaryColor;

    for (let i = 0; i < activeDots.length; i++) {
      const dot = activeDots[i];
      visibleCtx.globalAlpha = dot.baseAlpha;
      visibleCtx.beginPath();
      visibleCtx.arc(dot.x, dot.y, dot.baseRadius, 0, Math.PI * 2);
      visibleCtx.fill();
    }
  }

  /**
   * Renders the minimal indicator pills at the bottom left
   */
  function renderDotsIndicator() {
    if (!dotsIndicatorEl) return;
    dotsIndicatorEl.innerHTML = '';

    QUOTES.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `transition-all duration-300 rounded-full cursor-pointer ${
        idx === currentIndex
          ? 'w-5 h-1 bg-primary'
          : 'w-1 h-1 bg-outline-variant/30 hover:bg-on-surface-variant'
      }`;
      btn.title = `${q.author}`;
      btn.setAttribute('aria-label', `View quote by ${q.author}`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        rotateTo(idx);
        startRotationTimer();
      });
      dotsIndicatorEl.appendChild(btn);
    });
  }

  /**
   * Graceful, serene cross-fade transition to a target quote index
   */
  async function rotateTo(targetIndex) {
    if (targetIndex < 0) targetIndex = QUOTES.length - 1;
    if (targetIndex >= QUOTES.length) targetIndex = 0;

    const item = QUOTES[targetIndex];
    const targetW = item.width || (item.author === 'Shri Krishna' ? 275 : 300);

    // 1. Fade out text and canvas smoothly
    if (textContainerEl) {
      textContainerEl.style.opacity = '0';
    }
    if (visibleCanvas) {
      visibleCanvas.style.opacity = '0';
    }

    // 2. Preload/fetch dot data during the fade-out window
    const newDots = await loadQuoteDots(targetIndex);

    // 3. Update DOM content after fade-out transition duration (~200ms)
    setTimeout(() => {
      currentIndex = targetIndex;
      activeDots = newDots;
      currentCanvasWidth = targetW;

      // Adjust canvas resolution and CSS dimensions to match photo aspect ratio
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      visibleCanvas.width = Math.round(targetW * dpr);
      visibleCanvas.height = Math.round(CANVAS_LOGICAL_HEIGHT * dpr);
      visibleCanvas.style.width = `${targetW}px`;
      visibleCanvas.style.height = `${CANVAS_LOGICAL_HEIGHT}px`;
      visibleCtx.scale(dpr, dpr);

      if (quoteTextEl) {
        quoteTextEl.textContent = `“${item.quote}”`;
        if (item.isSanskrit) {
          quoteTextEl.className = "quote-text-sanskrit text-[26px] sm:text-[32px] md:text-[36px] text-on-surface font-normal leading-[1.35] tracking-wide";
        } else {
          quoteTextEl.className = "quote-text-english text-[20px] sm:text-[24px] md:text-[27px] text-on-surface font-medium leading-[1.4] tracking-normal";
        }
      }

      if (quoteAuthorEl) quoteAuthorEl.textContent = `— ${item.author}`;

      renderDotsIndicator();
      drawActiveDots();

      // 4. Fade back in smoothly
      if (textContainerEl) {
        textContainerEl.style.opacity = '1';
      }
      if (visibleCanvas) {
        visibleCanvas.style.opacity = '1';
      }
    }, 200);
  }

  /**
   * Starts the 5-second automatic rotation loop (continuous, no hover pause)
   */
  function startRotationTimer() {
    clearInterval(rotationTimer);
    rotationTimer = setInterval(() => {
      rotateTo((currentIndex + 1) % QUOTES.length);
    }, ROTATION_INTERVAL_MS);
  }

  /**
   * Main Component Bootstrapper
   */
  function initQuoteMatrixComponent() {
    cardEl = document.getElementById('quote-matrix-card');
    if (!cardEl) return;

    textContainerEl = document.getElementById('quote-text-container');
    quoteTextEl = document.getElementById('quote-text');
    quoteAuthorEl = document.getElementById('quote-author');
    dotsIndicatorEl = document.getElementById('quote-dots-indicator');

    if (!initCanvases()) return;

    // Set initial quote text and author immediately with double quotes and typography
    const firstItem = QUOTES[0];
    if (quoteTextEl) {
      quoteTextEl.textContent = `“${firstItem.quote}”`;
      quoteTextEl.className = firstItem.isSanskrit
        ? "quote-text-sanskrit text-[26px] sm:text-[32px] md:text-[36px] text-on-surface font-normal leading-[1.35] tracking-wide"
        : "quote-text-english text-[20px] sm:text-[24px] md:text-[27px] text-on-surface font-medium leading-[1.4] tracking-normal";
    }
    if (quoteAuthorEl) {
      quoteAuthorEl.textContent = `— ${firstItem.author}`;
    }

    // Load initial quote immediately
    loadQuoteDots(0).then((dots) => {
      activeDots = dots;
      renderDotsIndicator();
      drawActiveDots();
      startRotationTimer();
    });

    // Preload remaining quotes in background for instant responsiveness
    setTimeout(() => {
      for (let i = 1; i < QUOTES.length; i++) {
        loadQuoteDots(i);
      }
    }, 800);
  }

  // Self-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuoteMatrixComponent);
  } else {
    initQuoteMatrixComponent();
  }

  window.initQuoteMatrixComponent = initQuoteMatrixComponent;
})();
