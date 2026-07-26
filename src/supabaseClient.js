import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !rawUrl.includes('b2-gym.supabase.co') &&
  !rawKey.includes('dummy')
);

export const supabase = isConfigured
  ? (() => {
      try {
        return createClient(rawUrl, rawKey, {
          realtime: {
            params: {
              eventsPerSecond: 5
            }
          }
        });
      } catch (err) {
        console.warn('⚠️ Supabase Realtime client initialization failed:', err);
        return null;
      }
    })()
  : null;

/**
 * Safely subscribe to realtime changes on a table.
 * If Supabase is not configured or fails to connect, handles errors gracefully
 * without blocking UI, crashing the tab, or spamming HTTP requests.
 */
export function subscribeToTable(table, onPayload) {
  if (!supabase || !isConfigured) {
    return () => {};
  }

  let channel = null;
  try {
    channel = supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        try {
          if (onPayload) onPayload(payload);
        } catch (cbErr) {
          console.warn(`Realtime callback error on ${table}:`, cbErr);
        }
      })
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Supabase Realtime channel warning on table [${table}]:`, status, err);
        }
      });
  } catch (err) {
    console.warn(`Failed to open Supabase Realtime channel on table [${table}]:`, err);
  }

  return () => {
    if (channel && supabase) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
}
