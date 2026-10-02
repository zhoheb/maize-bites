import {
  alertPreferencesSchema,
  meResponseSchema,
  pushPublicKeySchema,
  type AlertPreferencesInput,
  type CurrentUser,
} from '@maize-bites/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, getJson } from './client';
import { sendJson } from './mutations';

export const accountKeys = {
  me: ['me'] as const,
  subscription: ['me', 'subscription'] as const,
  pushKey: ['push', 'public-key'] as const,
};

/** The signed-in user, or null. */
export async function fetchMe(): Promise<CurrentUser | null> {
  try {
    return (await getJson('/api/me', meResponseSchema)).user;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: accountKeys.me, queryFn: fetchMe, staleTime: 5 * 60_000 });
}

export function requestMagicLink(email: string) {
  return sendJson('POST', '/api/auth/magic-link', { email });
}

export async function verifyMagicLink(token: string): Promise<CurrentUser> {
  return (await getJson('/api/auth/verify', meResponseSchema, { params: { token } })).user;
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => sendJson('POST', '/api/auth/logout', {}),
    onSuccess: () => {
      client.setQueryData(accountKeys.me, null);
      client.removeQueries({ queryKey: accountKeys.subscription });
    },
  });
}

export function useAlertPreferences(enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.subscription,
    queryFn: () => getJson('/api/me/subscription', alertPreferencesSchema),
    enabled,
  });
}

export function useSaveAlertPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prefs: AlertPreferencesInput) =>
      sendJson('PUT', '/api/me/subscription', prefs, alertPreferencesSchema),
    onSuccess: (saved) => {
      client.setQueryData(accountKeys.subscription, saved);
    },
  });
}

export function usePushPublicKey() {
  return useQuery({
    queryKey: accountKeys.pushKey,
    queryFn: async () => (await getJson('/api/push/public-key', pushPublicKeySchema)).publicKey,
    staleTime: Infinity,
  });
}
