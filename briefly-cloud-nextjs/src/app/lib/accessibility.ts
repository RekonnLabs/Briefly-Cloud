/**
 * Accessibility Utilities and WCAG Compliance
 * 
 * This module provides utilities for ensuring WCAG 2.1 AA compliance
 */

// Color contrast utilities
export function getContrastRatio(color1: string, color2: string): number {
  const luminance1 = getLuminance(color1);
  const luminance2 = getLuminance(color2);
  
  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

export function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function isContrastCompliant(
  foreground: string, 
  background: string, 
  level: 'AA' | 'AAA' = 'AA',
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  
  if (level === 'AAA') {
    return isLargeText ? ratio >= 4.5 : ratio >= 7;
  } else {
    return isLargeText ? ratio >= 3 : ratio >= 4.5;
  }
}

// Focus management utilities
export function trapFocus(element: HTMLElement): () => void {
  const focusableElements = getFocusableElements(element);
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  firstFocusable?.focus();

  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
}

export function getFocusableElements(element: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  return Array.from(element.querySelectorAll(focusableSelectors)) as HTMLElement[];
}

// Screen reader utilities
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// Keyboard navigation utilities
export function handleArrowKeyNavigation(
  event: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
  orientation: 'horizontal' | 'vertical' = 'vertical'
): number {
  const { key } = event;
  let newIndex = currentIndex;

  if (orientation === 'vertical') {
    if (key === 'ArrowDown') {
      newIndex = (currentIndex + 1) % items.length;
    } else if (key === 'ArrowUp') {
      newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
    }
  } else {
    if (key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % items.length;
    } else if (key === 'ArrowLeft') {
      newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
    }
  }

  if (newIndex !== currentIndex) {
    event.preventDefault();
    items[newIndex]?.focus();
  }

  return newIndex;
}

// ARIA utilities
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export function setAriaExpanded(element: HTMLElement, expanded: boolean): void {
  element.setAttribute('aria-expanded', expanded.toString());
}

export function setAriaSelected(element: HTMLElement, selected: boolean): void {
  element.setAttribute('aria-selected', selected.toString());
}

// Reduced motion utilities
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function respectReducedMotion<T>(
  normalValue: T,
  reducedValue: T
): T {
  return prefersReducedMotion() ? reducedValue : normalValue;
}

// Text utilities
export function isTextTooLong(text: string, maxLength: number): boolean {
  return text.length > maxLength;
}

export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

// Form validation utilities
export function validateRequired(value: string): string | null {
  return value.trim() === '' ? 'This field is required' : null;
}

export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? null : 'Please enter a valid email address';
}

export function validateMinLength(value: string, minLength: number): string | null {
  return value.length < minLength ? `Must be at least ${minLength} characters` : null;
}

// Accessibility audit utilities
export interface AccessibilityIssue {
  type: 'error' | 'warning';
  rule: string;
  element: HTMLElement;
  message: string;
}

export function auditAccessibility(container: HTMLElement = document.body): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Check for missing alt text on images
  const images = container.querySelectorAll('img');
  images.forEach(img => {
    if (!img.hasAttribute('alt')) {
      issues.push({
        type: 'error',
        rule: 'WCAG 1.1.1',
        element: img,
        message: 'Image missing alt attribute'
      });
    }
  });

  // Check for missing form labels
  const inputs = container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const id = input.getAttribute('id');
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    
    if (id) {
      const label = container.querySelector(`label[for="${id}"]`);
      if (!label && !ariaLabel && !ariaLabelledBy) {
        issues.push({
          type: 'error',
          rule: 'WCAG 1.3.1',
          element: input as HTMLElement,
          message: 'Form control missing accessible label'
        });
      }
    }
  });

  // Check for insufficient color contrast
  const textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, a, button');
  textElements.forEach(element => {
    const styles = window.getComputedStyle(element);
    const color = styles.color;
    const backgroundColor = styles.backgroundColor;
    
    if (color && backgroundColor && color !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
      const fontSize = parseFloat(styles.fontSize);
      const isLargeText = fontSize >= 18 || (fontSize >= 14 && styles.fontWeight === 'bold');
      
      // Convert RGB to hex for contrast checking
      const colorHex = rgbToHex(color);
      const bgHex = rgbToHex(backgroundColor);
      
      if (colorHex && bgHex && !isContrastCompliant(colorHex, bgHex, 'AA', isLargeText)) {
        issues.push({
          type: 'warning',
          rule: 'WCAG 1.4.3',
          element: element as HTMLElement,
          message: 'Insufficient color contrast ratio'
        });
      }
    }
  });

  // Check for missing heading hierarchy
  const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let lastLevel = 0;
  headings.forEach(heading => {
    const level = parseInt(heading.tagName.charAt(1));
    if (level > lastLevel + 1) {
      issues.push({
        type: 'warning',
        rule: 'WCAG 1.3.1',
        element: heading as HTMLElement,
        message: 'Heading level skipped - may confuse screen readers'
      });
    }
    lastLevel = level;
  });

  // Check for missing focus indicators
  const interactiveElements = container.querySelectorAll('a, button, input, select, textarea, [tabindex]');
  interactiveElements.forEach(element => {
    const styles = window.getComputedStyle(element, ':focus');
    const outline = styles.outline;
    const boxShadow = styles.boxShadow;
    
    if (outline === 'none' && boxShadow === 'none') {
      issues.push({
        type: 'warning',
        rule: 'WCAG 2.4.7',
        element: element as HTMLElement,
        message: 'Interactive element missing focus indicator'
      });
    }
  });

  return issues;
}

function rgbToHex(rgb: string): string | null {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return null;
  
  const [, r, g, b] = match;
  return `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
}

// High contrast mode detection
export function isHighContrastMode(): boolean {
  return window.matchMedia('(prefers-contrast: high)').matches;
}

// Font size preferences
export function getFontSizePreference(): 'small' | 'medium' | 'large' {
  const fontSize = window.getComputedStyle(document.documentElement).fontSize;
  const baseFontSize = parseFloat(fontSize);
  
  if (baseFontSize >= 20) return 'large';
  if (baseFontSize >= 16) return 'medium';
  return 'small';
}

// Skip link utilities
export function createSkipLink(targetId: string, text: string = 'Skip to main content'): HTMLElement {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = text;
  skipLink.className = 'skip-link sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded';
  
  return skipLink;
}

// Live region utilities
export function createLiveRegion(id: string, level: 'polite' | 'assertive' = 'polite'): HTMLElement {
  const liveRegion = document.createElement('div');
  liveRegion.id = id;
  liveRegion.setAttribute('aria-live', level);
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  
  return liveRegion;
}

// Landmark utilities
export function ensureLandmarks(): void {
  const body = document.body;
  
  // Ensure main landmark exists
  if (!body.querySelector('main')) {
    const main = document.createElement('main');
    main.setAttribute('role', 'main');
    
    // Move existing content to main
    const children = Array.from(body.children);
    children.forEach(child => {
      if (child.tagName !== 'HEADER' && child.tagName !== 'FOOTER' && child.tagName !== 'NAV') {
        main.appendChild(child);
      }
    });
    
    body.appendChild(main);
  }
}

// Export all utilities
export const a11y = {
  // Color contrast
  getContrastRatio,
  getLuminance,
  isContrastCompliant,
  
  // Focus management
  trapFocus,
  getFocusableElements,
  
  // Screen reader
  announceToScreenReader,
  
  // Keyboard navigation
  handleArrowKeyNavigation,
  
  // ARIA utilities
  generateId,
  setAriaExpanded,
  setAriaSelected,
  
  // Motion preferences
  prefersReducedMotion,
  respectReducedMotion,
  
  // Text utilities
  isTextTooLong,
  truncateText,
  
  // Form validation
  validateRequired,
  validateEmail,
  validateMinLength,
  
  // Accessibility audit
  auditAccessibility,
  
  // Preferences
  isHighContrastMode,
  getFontSizePreference,
  
  // Skip links and landmarks
  createSkipLink,
  createLiveRegion,
  ensureLandmarks
};