<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { user, logout, theme } from '$lib/stores';
  import { get } from 'svelte/store';
  import { generateDicebearAvatar } from './utils';
  import { onMount, onDestroy } from 'svelte';
  import { auth } from './api';

  const dispatch = createEventDispatcher();
  let { show = $bindable(false) }: { show?: boolean } = $props();

  function close() {
    dispatch('close');
  }

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  // Remove vailed settings button - user can edit in the modal

  function doLogout() {
    close();
    logout();
  }

  function confirmLogout() {
    showLogoutConfirm = true;
  }

  function cancelLogout() {
    showLogoutConfirm = false;
  }

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

  async function save(event?: Event) {
    event?.preventDefault();
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
      // Update store and close modal
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
      // small delay to show success
      // don't close the modal on update; keep it open and show success message
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
        try { URL.revokeObjectURL(profileImagePreview); } catch (e) {}
      }
      profileImagePreview = URL.createObjectURL(f);
      removeAvatar = false;
    } else {
      profileImageFile = null;
      profileImagePreview = profileImageUrl || '';
      removeAvatar = false;
    }
  }
</script>

{#if show}
  <div class="modal modal-open" role="dialog" aria-modal="true">
    <div class="modal-box max-w-xl">
      <div class="flex items-start justify-between mb-6">
        <div>
          <h3 class="text-lg font-bold">Profile</h3>
          <p class="text-sm text-base-content/60 mt-1">Account information</p>
        </div>
        <button class="btn btn-sm btn-circle btn-ghost" aria-label="Close profile" onclick={close}>✕</button>
      </div>

      <div class="flex items-center gap-4">
        <div class="avatar">
          {#if !removeAvatar && (profileImagePreview || profileImageUrl || $user?.profile_image)}
            <div class="w-16 h-16 rounded-full overflow-hidden bg-neutral">
              <img src={(profileImagePreview || profileImageUrl || $user?.profile_image)} alt="Profile" />
            </div>
          {:else}
            <div class="w-16 h-16 rounded-full overflow-hidden">
              {@html getAvatarSvg()}
            </div>
          {/if}
        </div>

        <div class="flex-1">
          <div class="font-semibold text-lg truncate">{getUserDisplayName()}</div>
          <div class="text-sm text-base-content/60 truncate">{getUserUsername()}</div>
        </div>
      </div>

      <div class="divider my-4"></div>

      <form class="space-y-4" onsubmit={save}>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label" for="firstName">
              <span class="label-text">First name</span>
            </label>
            <input id="firstName" type="text" class="input input-bordered w-full" bind:value={firstName} />
          </div>
          <div>
            <label class="label" for="lastName">
              <span class="label-text">Last name</span>
            </label>
            <input id="lastName" type="text" class="input input-bordered w-full" bind:value={lastName} />
          </div>
        </div>

        <div>
          <label class="label" for="profileImageFile">
            <span class="label-text">Profile image (file)</span>
          </label>
          <input id="profileImageFile" type="file" accept="image/*" class="file-input file-input-bordered w-full" onchange={handleFileChange} />
          {#if profileImageFile}
            <div class="text-xs text-base-content/60 mt-2">Selected file: {profileImageFile?.name}</div>
          {/if}
          {#if (profileImageUrl || $user?.profile_image) && !removeAvatar}
            <div class="mt-2">
              <button type="button" class="btn btn-sm btn-error" onclick={() => { profileImageFile = null; profileImagePreview = ''; removeAvatar = true; }}>
                Remove avatar
              </button>
            </div>
          {/if}
          {#if removeAvatar}
            <div class="mt-2 text-xs text-base-content/60">Avatar will be removed on save</div>
            <div class="mt-2">
              <button type="button" class="btn btn-sm" onclick={() => { removeAvatar = false; profileImagePreview = profileImageUrl || ''; }}>
                Undo remove
              </button>
            </div>
          {/if}
        </div>
      </form>

      
      {#if showToast}
        <div class="fixed right-4 top-4 z-50">
          <div class="toast">
            {#if toastType === 'success'}
              <div class="alert alert-success">
                <div>
                  <span>{toastMessage}</span>
                </div>
              </div>
            {:else}
              <div class="alert alert-error">
                <div>
                  <span>{toastMessage}</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
      <div class="modal-action">
        <button class="btn" onclick={close} type="button">Cancel</button>
        <button class="btn btn-primary" onclick={save} disabled={loading || (firstName === origFirstName && lastName === origLastName && !profileImageFile && !removeAvatar)} type="button">{loading ? 'Saving...' : 'Save'}</button>
        <button class="btn btn-error" onclick={confirmLogout} type="button">Logout</button>
      </div>
    </div>
    <!-- Backdrop click to close (optional) -->
    <form method="dialog" class="modal-backdrop"><button onclick={close}>close</button></form>
  </div>
{/if}

<!-- Logout Confirmation Modal -->
{#if showLogoutConfirm}
  <div class="modal modal-open" role="dialog" aria-modal="true">
    <div class="modal-box">
      <h3 class="font-bold text-lg">Confirm Logout</h3>
      <p class="py-4">Are you sure you want to logout? You will need to login again to access your account.</p>
      <div class="modal-action">
        <button class="btn" onclick={cancelLogout} type="button">Cancel</button>
        <button class="btn btn-error" onclick={doLogout} type="button">Logout</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button onclick={cancelLogout}>close</button></form>
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
