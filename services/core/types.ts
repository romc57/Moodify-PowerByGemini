export type ServiceType = 'music' | 'video' | 'social';

export interface MediaItem {
  id: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  uri: string; // The deep link or playback URI
  serviceId: string; // 'spotify', 'youtube'
  type: 'track' | 'playlist' | 'video';
}

export interface IMediaService {
  id: string;
  name: string;
  type: ServiceType;
  
  // Auth
  isConnected(): boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  
  // Features
  getRecommendations(context: any): Promise<MediaItem[]>;
  play(itemId: string): Promise<void>;
}
