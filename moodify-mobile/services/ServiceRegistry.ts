import { create } from 'zustand';
import { IMediaService } from './core/types';

interface RegistryState {
    services: Record<string, IMediaService>;
    register: (service: IMediaService) => void;
    getService: (id: string) => IMediaService | undefined;
    getAllServices: () => IMediaService[];
}

export const useServiceRegistry = create<RegistryState>((set, get) => ({
    services: {},
    register: (service) => set((state) => ({ services: { ...state.services, [service.id]: service } })),
    getService: (id) => get().services[id],
    getAllServices: () => Object.values(get().services),
}));

class ServiceRegistry {
    private static instance: ServiceRegistry;
    private services: Map<string, IMediaService> = new Map();

    private constructor() { }

    static getInstance(): ServiceRegistry {
        if (!ServiceRegistry.instance) {
            ServiceRegistry.instance = new ServiceRegistry();
        }
        return ServiceRegistry.instance;
    }

    register(service: IMediaService) {
        this.services.set(service.id, service);
        useServiceRegistry.getState().register(service);
    }

    get(id: string) {
        return this.services.get(id);
    }

    getAll() {
        return Array.from(this.services.values());
    }
}

export const registry = ServiceRegistry.getInstance();
