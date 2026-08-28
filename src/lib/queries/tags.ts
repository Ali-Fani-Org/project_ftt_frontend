import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { tags as tagsApi, type Tag } from '$lib/api';
import { queryKeys } from './keys';


/** All team-shared tags. Inherits staleTime 0, so it refetches on every mount while online. */
export function useTagsQuery() {
	return createQuery(() => ({
		queryKey: queryKeys.tags.list(),
		queryFn: () => tagsApi.list()
	}));
}

/**
 * Resolve tag ids to full Tag objects from the tags cache (best-effort, returns
 * [] when the cache hasn't loaded yet). Used by optimistic entry patches so the
 * cache is updated with complete Tag objects rather than stale ids.
 */
export function resolveTagsFromCache(ids: number[]): Tag[] {
	const all = queryClient.getQueryData<Tag[]>(queryKeys.tags.list());
	if (!all) return [];
	const byId = new Map(all.map((tag) => [tag.id, tag]));
	return ids
		.map((id) => byId.get(id))
		.filter((tag): tag is Tag => Boolean(tag));
}

export function useCreateTagMutation() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof tagsApi.create>[0]) => tagsApi.create(data),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: queryKeys.tags.all });
			void client.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		}
	}));
}

export function useUpdateTagMutation() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: ({ id, data }: { id: number; data: Parameters<typeof tagsApi.update>[1] }) =>
			tagsApi.update(id, data),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: queryKeys.tags.all });
			void client.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		}
	}));
}

export function useDeleteTagMutation() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (id: number) => tagsApi.remove(id),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: queryKeys.tags.all });
			void client.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		}
	}));
}

import { queryClient } from '$lib/queryClient';