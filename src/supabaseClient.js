import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://b2-gym.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

/**
 * Subscribe to realtime changes on a table with a fallback callback
 */
export function subscribeToTable(table, onPayload, onFallbackPoll) {
  let channel = null;
  try {
    channel = supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (onPayload) onPayload(payload);
      })
      .subscribe();
  } catch (err) {
    console.warn(`Supabase realtime error on ${table}:`, err);
  }

  // Set up fallback poll interval every 5 seconds for instant consistency
  const intervalId = setInterval(() => {
    if (onFallbackPoll) onFallbackPoll();
  }, 5000);

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    clearInterval(intervalId);
  };
}
