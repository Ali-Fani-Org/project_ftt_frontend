//! Frontend notification channel management
//!
//! This module handles creating and managing notification channels
//! with proper sound properties for the Tauri notification system.

import { browser } from '$app/environment';

// Check if we're in browser environment and Tauri is available
if (browser && typeof window !== 'undefined') {
	import('@tauri-apps/api/event')
		.then(({ listen }) => {
			console.log('🔧 Notification channels: Setting up event listeners...');

			// Listen for channel creation events from the backend
			listen('create-notification-channel', async (event) => {
				console.log('🎯 FRONTEND: Received channel creation event:', event.payload);

				try {
					await createChannel(event.payload);
				} catch (error) {
					console.error('❌ FRONTEND: Failed to create notification channel:', error);
				}
			});

			// Listen for channel-based notification events
			listen('show-notification-with-channel', async (event) => {
				console.log('🎯 FRONTEND: Received notification with channel event:', event.payload);

				try {
					const payload = event.payload as any;
					const { title, body, channelId, notificationType } = payload;
					console.log('🎯 FRONTEND: Processing notification:', {
						title,
						body,
						channelId,
						notificationType
					});
					await showChannelNotification(title, body, channelId, notificationType);
				} catch (error) {
					console.error('❌ FRONTEND: Failed to show channel notification:', error);
				}
			});

			console.log('✅ Notification channels: Event listeners set up successfully');
		})
		.catch((error) => {
			console.error('Failed to set up notification channel event listeners:', error);
		});
}

/**
 * Create a notification channel with sound properties
 */
async function createChannel(channelData: any): Promise<void> {
	console.log('🔧 Creating notification channel:', channelData);

	try {
		// Check if we're in Tauri environment
		if (typeof window === 'undefined' || !(window as any).__TAURI__) {
			console.log('Not in Tauri environment, skipping channel creation');
			return;
		}

		// Use type assertion to handle the dynamic import
		const notificationModule = await (window as any).tauri.invoke('get_notification_api');

		if (!notificationModule) {
			console.warn('Notification plugin not available');
			return;
		}

		// For now, log the channel creation since the JavaScript API isn't directly accessible
		console.log('Channel would be created:', {
			id: channelData.id,
			name: channelData.name,
			description: channelData.description,
			sound: channelData.sound || 'notification_sound'
		});

		console.log('✅ Channel creation simulated for:', channelData.id);
	} catch (error) {
		console.error('❌ Failed to create notification channel:', error);
		// Don't throw error to allow other channels to be created
	}
}

/**
 * Show a notification using a specific channel
 */
async function showChannelNotification(
	title: string,
	body: string,
	channelId: string,
	notificationType: string
): Promise<void> {
	console.log('🔧 Showing channel notification:', { title, body, channelId, notificationType });

	try {
		// Check if we're in Tauri environment
		if (typeof window === 'undefined' || !(window as any).__TAURI__) {
			console.log('Not in Tauri environment, using fallback notification');
			return;
		}

		// Use window.__TAURI__ if available
		const tauri = (window as any).__TAURI__;

		if (tauri && tauri.invoke) {
			// Use Tauri command to show notification with channel
			await tauri.invoke('show_notification_with_channel', {
				title,
				body,
				channelId,
				notificationType
			});

			console.log('✅ Successfully showed channel notification via Tauri:', channelId);
		} else {
			console.warn('Tauri invoke not available, using fallback');
		}
	} catch (error) {
		console.error('❌ Failed to show channel notification:', error);
		// Don't throw error to allow fallback methods
	}
}

/**
 * Test different notification types
 */
export async function testNotification(
	type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL'
): Promise<void> {
	console.log(`🧪 Testing ${type} notification...`);

	try {
		const { invoke } = await import('@tauri-apps/api/core');

		await invoke('show_notification', {
			title: `Test ${type} Notification`,
			body: `This is a test ${type.toLowerCase()} notification to verify sound is working.`,
			notificationType: type
		});

		console.log(`✅ ${type} notification test completed`);
	} catch (error) {
		console.error(`❌ Failed to test ${type} notification:`, error);
	}
}

/**
 * Debug the entire notification system
 */
export async function debugNotificationSystem(): Promise<void> {
	console.log('🔍 Starting notification system debug...');

	try {
		const { invoke } = await import('@tauri-apps/api/core');

		const result = await invoke('debug_notification_system');
		console.log('🔍 Debug result:', result);

		// Test all notification types
		const types = ['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'CRITICAL'] as const;

		for (const type of types) {
			console.log(`🧪 Testing ${type} notification...`);
			await testNotification(type);

			// Small delay between tests
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		console.log('✅ Notification system debug completed');
	} catch (error) {
		console.error('❌ Failed to debug notification system:', error);
	}
}

/**
 * Initialize notification channels for the application
 */
export async function initializeNotificationChannels(): Promise<void> {
	if (!browser) {
		console.warn('Notification channels can only be initialized in browser environment');
		return;
	}

	console.log('🔧 Initializing notification channels...');

	try {
		// Create standard notification channels
		const channels = [
			{
				id: 'time_tracker_info',
				name: 'Time Tracker - Info',
				description: 'Informational notifications from Time Tracker',
				importance: 3, // Default
				sound: 'notification_sound',
				lights: true,
				vibration: true,
				lightColor: '#00FF00'
			},
			{
				id: 'time_tracker_warning',
				name: 'Time Tracker - Warning',
				description: 'Warning notifications from Time Tracker',
				importance: 4, // High
				sound: 'notification_sound',
				lights: true,
				vibration: true,
				lightColor: '#FFFF00'
			},
			{
				id: 'time_tracker_error',
				name: 'Time Tracker - Error',
				description: 'Error notifications from Time Tracker',
				importance: 5, // Max
				sound: 'notification_sound',
				lights: true,
				vibration: true,
				lightColor: '#FF0000'
			},
			{
				id: 'time_tracker_success',
				name: 'Time Tracker - Success',
				description: 'Success notifications from Time Tracker',
				importance: 3, // Default
				sound: 'notification_sound',
				lights: true,
				vibration: true,
				lightColor: '#00FF00'
			},
			{
				id: 'time_tracker_critical',
				name: 'Time Tracker - Critical',
				description: 'Critical notifications from Time Tracker',
				importance: 5, // Max
				sound: 'notification_sound',
				lights: true,
				vibration: true,
				lightColor: '#FF0000'
			}
		];

		// Create each channel
		for (const channel of channels) {
			try {
				await createChannel(channel);
			} catch (error) {
				console.warn(`Failed to create channel ${channel.id}:`, error);
				// Continue with other channels even if one fails
			}
		}

		console.log('✅ Notification channels initialization completed');
	} catch (error) {
		console.error('Failed to initialize notification channels:', error);
		throw error;
	}
}
