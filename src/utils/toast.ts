export function showToast(message: string, duration: number = 3000) {
  // Check if a toast container already exists
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.zIndex = '9999';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  // Create the toast element
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  toast.style.color = 'white';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out';
  toast.style.transform = 'translateY(-20px)';
  toast.style.pointerEvents = 'auto'; // allow interaction if needed in future

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Remove toast after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';

    // Wait for animation to finish before removing from DOM
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
      // Remove container if empty
      if (container && container.childNodes.length === 0 && container.parentNode === document.body) {
        document.body.removeChild(container);
      }
    }, 300); // 300ms matches the transition duration
  }, duration);
}
