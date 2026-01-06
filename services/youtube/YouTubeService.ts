import axios from 'axios';
import { dbService } from '../database/DatabaseService';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeService {
    private static instance: YouTubeService;

    private constructor() { }

    static getInstance(): YouTubeService {
        if (!YouTubeService.instance) {
            YouTubeService.instance = new YouTubeService();
        }
        return YouTubeService.instance;
    }

    private async getApiKey(): Promise<string | null> {
        return await dbService.getSecret('YOUTUBE_API_KEY');
    }

    private async getOAuthToken(): Promise<string | null> {
        return await dbService.getServiceToken('youtube_oauth');
    }

    async search(query: string) {
        const token = await this.getOAuthToken();
        const apiKey = await this.getApiKey();

        if (!token && !apiKey) {
            console.warn('[YouTube] No Auth (Token or Key) found');
            return [];
        }

        try {
            const config: any = {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: 5
                }
            };

            if (token) {
                config.headers = { Authorization: `Bearer ${token}` };
            } else {
                config.params.key = apiKey;
            }

            const response = await axios.get(`${YOUTUBE_API_BASE}/search`, config);

            return response.data.items.map((item: any) => ({
                id: item.id.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.medium.url,
                channel: item.snippet.channelTitle
            }));
        } catch (e: any) {
            console.error('[YouTube] Search Error', e.response?.data || e.message);
            return [];
        }
    }
}

export const youtubeService = YouTubeService.getInstance();
