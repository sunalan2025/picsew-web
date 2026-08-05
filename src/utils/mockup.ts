import type { MockupConfig } from '../types';

/**
 * Draws a gorgeous device mockup wrapper around a source canvas.
 * Handles both "Standard Mockup" (cropped to aspect ratio) and "Extended Long Mockup" (device bezels wrap the entire long image).
 */
export function drawMockup(
  targetCanvas: HTMLCanvasElement,
  contentCanvas: HTMLCanvasElement,
  config: MockupConfig
) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const { device, bgColorType, bgGradientStart, bgGradientEnd, bgSolid, padding, shadow, extendBottom } = config;

  if (device === 'none') {
    // Just copy content
    let resized = false;
    // PERFORMANCE OPTIMIZATION:
    // Only set canvas dimensions if they've changed to avoid layout thrashing and implicit buffer clearing
    if (targetCanvas.width !== contentCanvas.width) {
      targetCanvas.width = contentCanvas.width;
      resized = true;
    }
    if (targetCanvas.height !== contentCanvas.height) {
      targetCanvas.height = contentCanvas.height;
      resized = true;
    }

    // Explicitly clear the rect when dimensions haven't changed to ensure clean buffer for redrawing
    if (!resized) {
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    }

    ctx.drawImage(contentCanvas, 0, 0);
    return;
  }

  // Device Specifications
  const isTablet = device === 'ipad';
  const bezel = isTablet ? 32 : 18; // phone bezel: 18px, tablet: 32px
  const cornerRadius = isTablet ? 36 : 48; // screen corner radius
  const deviceCornerRadius = cornerRadius + bezel; // outer device corner radius

  // Target Screen dimensions
  const screenW = contentCanvas.width;
  let screenH = contentCanvas.height;

  // Aspect ratio for standard crop mode (typical modern iPhone is 19.5:9 -> height is 2.16 times width)
  const phoneAspectRatio = 2.16;
  const tabletAspectRatio = 1.43; // 4.3:3
  const aspectRatio = isTablet ? tabletAspectRatio : phoneAspectRatio;

  if (!extendBottom) {
    // Standard mode: screen height is determined by aspect ratio of the phone
    screenH = screenW * aspectRatio;
  }

  // Calculate final device dimensions
  const deviceW = screenW + bezel * 2;
  const deviceH = screenH + bezel * 2;

  // Calculate overall canvas dimensions
  const canvasW = deviceW + padding * 2;
  const canvasH = deviceH + padding * 2;

  let resized = false;
  // PERFORMANCE OPTIMIZATION:
  // Conditionally assign canvas dimension properties only on change to significantly reduce rendering latency
  if (targetCanvas.width !== canvasW) {
    targetCanvas.width = canvasW;
    resized = true;
  }
  if (targetCanvas.height !== canvasH) {
    targetCanvas.height = canvasH;
    resized = true;
  }

  if (!resized) {
    ctx.clearRect(0, 0, canvasW, canvasH);
  }

  // --- Step 1: Draw Background ---
  ctx.save();
  if (bgColorType === 'solid') {
    ctx.fillStyle = bgSolid || '#0e0f14';
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (bgColorType === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    grad.addColorStop(0, bgGradientStart || '#7c3aed');
    grad.addColorStop(1, bgGradientEnd || '#a855f7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (bgColorType === 'blur') {
    // Fill dark base first
    ctx.fillStyle = '#0f1016';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw blurred screenshot background
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.filter = 'blur(40px)';
    // Scale image to cover canvas
    const scale = Math.max(canvasW / contentCanvas.width, canvasH / contentCanvas.height);
    const w = contentCanvas.width * scale;
    const h = contentCanvas.height * scale;
    const x = (canvasW - w) / 2;
    const y = (canvasH - h) / 2;
    ctx.drawImage(contentCanvas, x, y, w, h);
    ctx.restore();
  }
  ctx.restore();

  // --- Step 2: Draw Device Shadow ---
  const deviceX = padding;
  const deviceY = padding;

  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(deviceX, deviceY, deviceW, deviceH, deviceCornerRadius);
    } else {
      ctx.rect(deviceX, deviceY, deviceW, deviceH);
    }
    ctx.fill();
    ctx.restore();
  }

  // --- Step 3: Draw Device Outer Frame (Black shell) ---
  ctx.save();
  ctx.fillStyle = '#1c1d22'; // Sleek dark Titanium / matte black frame
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(deviceX, deviceY, deviceW, deviceH, deviceCornerRadius);
  } else {
    ctx.rect(deviceX, deviceY, deviceW, deviceH);
  }
  ctx.fill();

  // Outer bezel highlight (subtle metallic border)
  ctx.strokeStyle = '#32343c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // --- Step 4: Draw Screen Content (with rounded clipping) ---
  ctx.save();
  const screenX = deviceX + bezel;
  const screenY = deviceY + bezel;

  // Clip to rounded screen corners
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(screenX, screenY, screenW, screenH, cornerRadius);
  } else {
    ctx.rect(screenX, screenY, screenW, screenH);
  }
  ctx.clip();

  // Clear screen background
  ctx.fillStyle = '#000000';
  ctx.fillRect(screenX, screenY, screenW, screenH);

  if (extendBottom) {
    // Draw full content
    ctx.drawImage(contentCanvas, screenX, screenY);
  } else {
    // Draw content, scale if needed or just align to top (typical scrolling screenshots are top-aligned)
    // Here we draw top-aligned
    ctx.drawImage(
      contentCanvas,
      0, 0, contentCanvas.width, Math.min(contentCanvas.height, screenH),
      screenX, screenY, screenW, Math.min(contentCanvas.height, screenH)
    );
  }
  ctx.restore();

  // --- Step 5: Draw Device Screen Glare & Inner Shadow ---
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(screenX, screenY, screenW, screenH, cornerRadius);
  } else {
    ctx.rect(screenX, screenY, screenW, screenH);
  }
  ctx.stroke();
  ctx.restore();

  // --- Step 6: Draw Dynamic Island / Notch ---
  ctx.save();
  ctx.fillStyle = '#000000';

  if (device === 'iphone15') {
    // Dynamic Island
    const islandW = screenW * 0.28;
    const islandH = Math.round(islandW * 0.26);
    const islandX = screenX + (screenW - islandW) / 2;
    const islandY = screenY + bezel * 0.7;
    const islandR = islandH / 2;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(islandX, islandY, islandW, islandH, islandR);
    } else {
      ctx.rect(islandX, islandY, islandW, islandH);
    }
    ctx.fill();

    // Camera reflection (tiny dark blue-green dot)
    ctx.fillStyle = '#0a101f';
    ctx.beginPath();
    ctx.arc(islandX + islandW * 0.78, islandY + islandH * 0.5, islandH * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#142036';
    ctx.beginPath();
    ctx.arc(islandX + islandW * 0.78, islandY + islandH * 0.5, islandH * 0.05, 0, Math.PI * 2);
    ctx.fill();

  } else if (device === 'iphone14') {
    // Classic Notch
    const notchW = screenW * 0.38;
    const notchH = bezel * 1.25;
    const notchX = screenX + (screenW - notchW) / 2;
    const notchY = screenY;
    const notchR = 12;

    ctx.beginPath();
    ctx.moveTo(notchX, notchY);
    // Draw notch with rounded bottom corners
    ctx.lineTo(notchX + 5, notchY + notchH - 5);
    ctx.arcTo(notchX + 5, notchY + notchH, notchX + notchR + 5, notchY + notchH, notchR);
    ctx.lineTo(notchX + notchW - notchR - 5, notchY + notchH);
    ctx.arcTo(notchX + notchW - 5, notchY + notchH, notchX + notchW - 5, notchY + notchH - 5, notchR);
    ctx.lineTo(notchX + notchW, notchY);
    ctx.closePath();
    ctx.fill();

    // Camera dot
    ctx.fillStyle = '#0a101f';
    ctx.beginPath();
    ctx.arc(notchX + notchW * 0.65, notchY + notchH * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (device === 'ipad') {
    // Tablet Camera dot in bezel
    const camSize = 5;
    ctx.beginPath();
    ctx.arc(screenX + screenW / 2, deviceY + bezel / 2, camSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Step 7: Draw iOS Home Indicator Bar (at bottom) ---
  if (!isTablet && (device === 'iphone15' || device === 'iphone14')) {
    const barW = screenW * 0.36;
    const barH = 5;
    const barX = screenX + (screenW - barW) / 2;
    const barY = screenY + screenH - 12;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; // White pill bar
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(barX, barY, barW, barH, 2.5);
    } else {
      ctx.rect(barX, barY, barW, barH);
    }
    ctx.fill();
  } else if (isTablet) {
    // iPad home bar is wider
    const barW = screenW * 0.28;
    const barH = 6;
    const barX = screenX + (screenW - barW) / 2;
    const barY = screenY + screenH - 14;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(barX, barY, barW, barH, 3);
    } else {
      ctx.rect(barX, barY, barW, barH);
    }
    ctx.fill();
  }

  ctx.restore();
}
