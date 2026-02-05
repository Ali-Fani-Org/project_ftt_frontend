<script lang="ts">
	import { user, logout, theme } from '$lib/stores';
	import { get } from 'svelte/store';
	import { generateDicebearAvatar } from '$lib/utils';
	import { onMount } from 'svelte';
	import { auth } from '$lib/api';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { network } from '$lib/network';
	import { addToast } from '$lib/toast';

	// Editable form state
	let firstName = $state('');
	let lastName = $state('');
	let profileImageUrl = $state('');
	let profileImageFile: File | null = $state(null);
	let profileImagePreview = $state('');
	let removeAvatar = $state(false);
	let origFirstName = $state('');
	let origLastName = $state('');
	let origProfileImageUrl = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state('success');
	let showLogoutConfirm = $state(false);

	onMount(() => {
		const u = get(user);
		if (u) {
			firstName = u.first_name || '';
			lastName = u.last_name || '';
			profileImageUrl = u.profile_image || '';
			profileImagePreview = profileImageUrl || '';
			removeAvatar = false;
			origFirstName = firstName;
			origLastName = lastName;
			origProfileImageUrl = profileImageUrl;
		}
	});

	// Get user display name for upper section (always first + last names)
	function getUserDisplayName() {
		const u = get(user);
		if (!u) return 'User';
		if (u.first_name && u.last_name) {
			return `${u.first_name} ${u.last_name}`;
		} else if (u.first_name) {
			return u.first_name;
		} else if (u.last_name) {
			return u.last_name;
		}
		return u.username || 'User';
	}

	// Get username for bottom section (always show username)
	function getUserUsername() {
		const u = get(user);
		return u?.username || '';
	}

	function getAvatarSvg() {
		const u = get(user);
		const currentTheme = get(theme);
		if (u?.profile_image) return '';
		return generateDicebearAvatar(u?.username || 'user', currentTheme);
	}

	async function save(event?: Event) {
		event?.preventDefault();

		// Check if online before saving
		if (!$network.isOnline) {
			addToast('Cannot save profile while offline. Please check your internet connection.', 'error', 4000);
			return;
		}

		error = '';
		success = '';
		loading = true;
		try {
			const form = new FormData();
			form.append('first_name', firstName);
			form.append('last_name', lastName);
			// Do not send username in the update request. Backend can maintain username from session.
			if (profileImageFile) {
				form.append('profile_image', profileImageFile as File);
			}
			if (removeAvatar) {
				// Send a blank `profile_image` field so backend removes it (per API contract)
				form.append('profile_image', '');
			}
			const resp = await auth.updateUserForm(form);
			// Update store
			user.set(resp);
			// show success toast
			toastMessage = 'Profile updated';
			toastType = 'success';
			showToast = true;
			setTimeout(() => (showToast = false), 3000);
			// If server reports a removed profile image (or we requested remove), update local values
			if (!resp.profile_image) {
				profileImageUrl = '';
				profileImagePreview = '';
				removeAvatar = false;
			}
			// Update preview and originals
			origFirstName = resp.first_name || '';
			origLastName = resp.last_name || '';
			origProfileImageUrl = resp.profile_image || '';
			profileImageUrl = resp.profile_image || '';
			profileImagePreview = profileImageUrl || (profileImageFile ? profileImagePreview : '');
			profileImageFile = null;
		} catch (err) {
			console.error(err);
			const msg = 'Failed to update profile';
			toastMessage = msg;
			toastType = 'error';
			showToast = true;
			setTimeout(() => (showToast = false), 6000);
			error = msg;
		} finally {
			loading = false;
		}
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const f = target?.files?.[0] || null;
		if (f) {
			profileImageFile = f;
			if (profileImagePreview && profileImagePreview.startsWith('blob:')) {
				try {
					URL.revokeObjectURL(profileImagePreview);
				} catch (e) {}
			}
			profileImagePreview = URL.createObjectURL(f);
			removeAvatar = false;
		} else {
			profileImageFile = null;
			profileImagePreview = profileImageUrl || '';
			removeAvatar = false;
		}
	}

	function doLogout() {
		logout();
		goto('/login');
	}

	function confirmLogout() {
		showLogoutConfirm = true;
	}

	function cancelLogout() {
		showLogoutConfirm = false;
	}
</script>

<div class="container mx-auto p-4 lg:p-8">
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-primary">Profile</h1>
		<p class="text-base-content/70">Manage your account information</p>
	</div>

	<!-- Offline Warning -->
	{#if !$network.isOnline}
		<div class="alert alert-warning mb-6 shadow-lg max-w-4xl mx-auto">
			<div class="flex items-center gap-3">
				<svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
				<div>
					<p class="font-medium">You are offline</p>
					<p class="text-sm opacity-80">Profile cannot be saved while offline. Please reconnect to save changes.</p>
				</div>
			</div>
		</div>
	{/if}

	<div class="card bg-base-100 shadow-xl max-w-4xl mx-auto">
		<div class="card-body p-8">
			<div class="flex items-center gap-6 mb-8">
				<div class="avatar">
					{#if !removeAvatar && (profileImagePreview || profileImageUrl || $user?.profile_image)}
						<div class="w-24 h-24 rounded-full overflow-hidden bg-neutral">
							<img
								src={profileImagePreview || profileImageUrl || $user?.profile_image}
								alt="Profile"
							/>
						</div>
					{:else}
						<div class="w-24 h-24 rounded-full overflow-hidden">
							{@html getAvatarSvg()}
						</div>
					{/if}
				</div>

				<div class="flex-1">
					<div class="font-semibold text-2xl truncate">{getUserDisplayName()}</div>
					<div class="text-base text-base-content/70 truncate mt-1">{getUserUsername()}</div>
				</div>
			</div>

			<div class="divider"></div>

			<form class="space-y-8" onsubmit={save}>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div class="form-control">
						<label class="label" for="firstName">
							<span class="label-text font-medium text-base">First name</span>
						</label>
						<input id="firstName" type="text" class="input input-bordered" bind:value={firstName} />
					</div>
					<div class="form-control">
						<label class="label" for="lastName">
							<span class="label-text font-medium text-base">Last name</span>
						</label>
						<input id="lastName" type="text" class="input input-bordered" bind:value={lastName} />
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="profileImageFile">
						<span class="label-text font-medium text-base">Profile image</span>
					</label>
					<input
						id="profileImageFile"
						type="file"
						accept="image/*"
						class="file-input file-input-bordered w-full"
						onchange={handleFileChange}
					/>
					{#if profileImageFile}
						<div class="text-xs text-base-content/60 mt-2">
							Selected file: {profileImageFile?.name}
						</div>
					{/if}
					{#if (profileImageUrl || $user?.profile_image) && !removeAvatar}
						<div class="mt-2">
							<button
								type="button"
								class="btn btn-sm btn-error"
								onclick={() => {
									profileImageFile = null;
									profileImagePreview = '';
									removeAvatar = true;
								}}
							>
								Remove avatar
							</button>
						</div>
					{/if}
					{#if removeAvatar}
						<div class="mt-2 text-xs text-base-content/60">Avatar will be removed on save</div>
						<div class="mt-2">
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => {
									removeAvatar = false;
									profileImagePreview = profileImageUrl || '';
								}}
							>
								Undo remove
							</button>
						</div>
					{/if}
				</div>

				{#if error}
					<div class="alert alert-error">
						<span>{error}</span>
					</div>
				{/if}

				<div class="flex flex-col sm:flex-row gap-4">
					<button
						class="btn btn-primary"
						onclick={save}
						disabled={loading ||
							(firstName === origFirstName &&
								lastName === origLastName &&
								!profileImageFile &&
								!removeAvatar)}
						type="submit"
					>
						{loading ? 'Saving...' : 'Save Changes'}
					</button>
					<button class="btn btn-error" onclick={confirmLogout} type="button"> Logout </button>
				</div>
			</form>
		</div>
	</div>
</div>

<!-- Success/Error Toast -->
{#if showToast}
	<div class="toast toast-top toast-end z-50">
		{#if toastType === 'success'}
			<div class="alert alert-success">
				<span>{toastMessage}</span>
			</div>
		{:else}
			<div class="alert alert-error">
				<span>{toastMessage}</span>
			</div>
		{/if}
	</div>
{/if}

<!-- Logout Confirmation Modal -->
{#if showLogoutConfirm}
	<div class="modal modal-open" role="dialog" aria-modal="true">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Confirm Logout</h3>
			<p class="py-4">
				Are you sure you want to logout? You will need to login again to access your account.
			</p>
			<div class="modal-action">
				<button class="btn" onclick={cancelLogout} type="button">Cancel</button>
				<button class="btn btn-error" onclick={doLogout} type="button">Logout</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button onclick={cancelLogout}>close</button>
		</form>
	</div>
{/if}

<style>
	/* Small style tweaks so the Dicebear avatar looks centered */
	.avatar :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
		border-radius: 9999px;
	}
</style>
