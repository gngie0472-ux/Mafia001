import { supabase } from './supabase';

export type LiveKitTokenResponse = {
  token: string;
  server_url: string;
  room_id: string;
};

export async function getLiveKitToken(
  roomId: string
): Promise<LiveKitTokenResponse> {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.functions.invoke('livekit-token', {
      body: {
        room_id: roomId,
      },
    });

  if (error) {
    console.error('LiveKit token error:', error);
    throw error;
  }

  if (!data?.token || !data?.server_url) {
    throw new Error('LiveKit token was not returned');
  }

  return data as LiveKitTokenResponse;
}
