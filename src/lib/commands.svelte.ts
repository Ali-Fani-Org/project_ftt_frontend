// Import invoke dynamically to avoid issues in non-Tauri environments
let invoke: any;

// Try to import invoke only when needed and check if Tauri is available
async function getInvoke() {
  if (invoke) return invoke;
  
  try {
    // Check if we're in a Tauri environment
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
      invoke = tauriInvoke;
      console.log('✅ Tauri invoke imported successfully');
    } else {
      console.log('❌ Not in Tauri environment, invoke will be undefined');
    }
  } catch (error) {
    console.error('❌ Failed to import Tauri invoke:', error);
  }
  
  return invoke;
}

export const preventDefault = <T extends Event>(fn: (e: T) => void): ((e: T) => void) => {
	return (e: T) => {
		e.preventDefault();
		fn(e);
	};
};
