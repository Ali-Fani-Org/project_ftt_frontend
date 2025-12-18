import { createAvatar } from '@dicebear/core';
import { croodles } from '@dicebear/collection';

/**
 * Generate a Dicebear avatar URL using username as seed
 * @param username - The username to use as seed for deterministic avatar generation
 * @param theme - The current theme ('light' or 'dark') to determine background color
 * @returns SVG string of the generated avatar
 */
export function generateDicebearAvatar(username: string, theme: string = 'light'): string {
  try {
    // Define theme-appropriate background colors
    let backgroundColor: string[];
    
    if (theme === 'dark') {
      // Light background for dark theme (better visibility)
      backgroundColor = ['f8fafc']; // Light gray background
    } else {
      // Slightly darker background for light theme for contrast
      backgroundColor = ['e2e8f0']; // Light slate gray background  
    }

    // Create avatar using Adventurer style with username as seed and theme-appropriate background
    const avatar = createAvatar(croodles, {
      seed: username || 'user',
      size: 80, // Small size for sidebar usage
      backgroundColor: backgroundColor,
    });

    // Return SVG string
    return avatar.toString();
  } catch (error) {
    console.error('Error generating Dicebear avatar:', error);
    // Return empty string as fallback
    return '';
  }
}