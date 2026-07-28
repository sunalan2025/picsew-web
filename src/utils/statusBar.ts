import type { StatusBarConfig } from '../types';

/**
 * Renders a high-fidelity iOS-style status bar onto a canvas context.
 */
export function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: StatusBarConfig
) {
  const isLight = config.style === 'light';
  const color = isLight ? '#ffffff' : '#000000';
  
  ctx.save();
  
  // Clear status bar background (or keep transparent so it sits on top of screenshot background)
  // Let's set a slight gradient or transparent background if needed, but transparent is usually best.
  
  // Set text/draw styles
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Draw Time (Left side)
  const fontSize = Math.round(height * 0.38);
  ctx.font = `semibold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const timeX = width * 0.06;
  const timeY = height * 0.52;
  ctx.fillText(config.time || '9:41', timeX, timeY);

  // 2. Right Side Icons Group (Signal, Wifi, Battery)
  const rightOffset = width * 0.06;
  const iconHeight = height * 0.32;
  const iconSpacing = Math.round(height * 0.18);
  let currentX = width - rightOffset;

  // Draw Battery Icon (far right)
  const batteryWidth = iconHeight * 2;
  const batteryHeight = iconHeight;
  const batteryX = currentX - batteryWidth;
  const batteryY = (height - batteryHeight) / 2;

  // Battery body outline
  ctx.lineWidth = Math.max(1.5, height * 0.03);
  ctx.beginPath();
  const radius = batteryHeight * 0.25;
  
  // Draw rounded rect manually for maximum compatibility
  if (ctx.roundRect) {
    ctx.roundRect(batteryX, batteryY, batteryWidth, batteryHeight, radius);
  } else {
    ctx.rect(batteryX, batteryY, batteryWidth, batteryHeight);
  }
  ctx.stroke();

  // Battery cap (terminal)
  const capWidth = batteryWidth * 0.08;
  const capHeight = batteryHeight * 0.35;
  const capX = batteryX + batteryWidth;
  const capY = batteryY + (batteryHeight - capHeight) / 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(capX, capY, capWidth, capHeight, [0, radius * 0.5, radius * 0.5, 0]);
  } else {
    ctx.rect(capX, capY, capWidth, capHeight);
  }
  ctx.fill();

  // Battery fill
  const padding = Math.max(1.5, height * 0.03) + 1;
  const maxFillWidth = batteryWidth - padding * 2;
  const fillWidth = maxFillWidth * (config.battery / 100);
  const fillHeight = batteryHeight - padding * 2;
  const fillX = batteryX + padding;
  const fillY = batteryY + padding;

  if (config.battery <= 20) {
    ctx.fillStyle = '#ff3b30'; // Low battery red
  } else {
    ctx.fillStyle = color;
  }
  
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(fillX, fillY, fillWidth, fillHeight, radius * 0.7);
  } else {
    ctx.rect(fillX, fillY, fillWidth, fillHeight);
  }
  ctx.fill();

  // Restore fillStyle
  ctx.fillStyle = color;

  currentX -= (batteryWidth + iconSpacing);

  // Draw Wifi Icon
  if (config.wifi === 'wifi') {
    const wifiSize = iconHeight * 1.1;
    const wifiX = currentX - wifiSize;
    const wifiY = height * 0.5;

    ctx.lineWidth = Math.max(1.5, height * 0.035);
    ctx.beginPath();
    
    // Draw 3 arcs for Wifi signal
    const centerX = wifiX + wifiSize / 2;
    const centerY = wifiY + wifiSize / 3;

    // Dot at center
    ctx.beginPath();
    ctx.arc(centerX, centerY + wifiSize/3, wifiSize * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Arc 1
    ctx.beginPath();
    ctx.arc(centerX, centerY + wifiSize/3, wifiSize * 0.35, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();

    // Arc 2
    ctx.beginPath();
    ctx.arc(centerX, centerY + wifiSize/3, wifiSize * 0.65, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();

    // Arc 3
    ctx.beginPath();
    ctx.arc(centerX, centerY + wifiSize/3, wifiSize * 0.95, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();

    currentX -= (wifiSize + iconSpacing);
  }

  // Draw Cellular Icon
  if (config.wifi === 'cellular') {
    const cellWidth = iconHeight * 1.2;
    const cellHeight = iconHeight;
    const cellX = currentX - cellWidth;
    const cellY = (height - cellHeight) / 2;

    const barCount = 4;
    const barWidth = cellWidth / (barCount * 1.6);
    const barGap = cellWidth / (barCount * 2.5);

    ctx.lineWidth = 1;
    for (let i = 0; i < barCount; i++) {
      const bh = cellHeight * ((i + 1) / barCount);
      const bx = cellX + i * (barWidth + barGap);
      const by = cellY + (cellHeight - bh);
      
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, barWidth, bh, barWidth * 0.3);
      } else {
        ctx.rect(bx, by, barWidth, bh);
      }
      ctx.fill();
    }

    currentX -= (cellWidth + iconSpacing);
  }

  ctx.restore();
}
