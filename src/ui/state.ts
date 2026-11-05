import type { InstallRequest, PackageInfo, PlatformId } from '../navdata/types.js';
import type { ScanResult } from '../shared/api.js';

export interface Feedback {
    state: 'loading' | 'success' | 'error';
    message: string;
}

export interface RendererState {
    platformId: PlatformId;
    packageId: string;
    results: ScanResult[];
    packages: PackageInfo[];
    scanning: boolean;
    reloadingPaths: Set<string>;
    installingPath: string | null;
    feedback: Feedback | null;
}

export interface ViewActions {
    selectPlatform(id: PlatformId): void;
    selectPackage(id: string): void;
    scan(): void;
    reload(platformId: PlatformId, databasePath: string): void;
    install(request: InstallRequest): void;
}

export interface NavDataView {
    bind(actions: ViewActions): void;
    render(state: RendererState): void;
}

export function isBusy(state: RendererState): boolean {
    return state.scanning || state.installingPath !== null;
}
