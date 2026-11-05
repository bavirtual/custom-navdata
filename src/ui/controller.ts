import type { InstallRequest } from '../navdata/types.js';
import type { NavDataApi } from '../shared/api.js';
import { platforms, type PlatformId } from '../shared/platforms.js';
import type { NavDataView, RendererState } from './state.js';

/** Owns async application state; DOM rendering is delegated to the view. */
export class NavDataController {
    private readonly state: RendererState = {
        platformId: 'fenix',
        packageId: '',
        results: [],
        packages: [],
        scanning: false,
        reloadingPaths: new Set(),
        installingPath: null,
        feedback: null
    };
    constructor(private readonly api: NavDataApi, private readonly view: NavDataView) {
        view.bind({
            selectPlatform: id => this.selectPlatform(id),
            selectPackage: id => this.selectPackage(id),
            scan: () => { void this.scan(); },
            reload: (id, file) => { void this.reload(id, file); },
            install: request => { void this.install(request); }
        });
    }

    async initialize(): Promise<void> {
        const scan = this.scan();
        try {
            this.state.packages = await this.api.packages();
            this.state.packageId = this.state.packages[0]?.id || '';
        }
        catch {
            this.state.feedback = {
                state: 'error',
                message: 'Data packages could not be loaded. Restart the app and try again.'
            };
        }
        this.render();
        await scan;
    }

    private selectPlatform(id: PlatformId): void {
        this.state.platformId = id;
        this.render();
    }

    private selectPackage(id: string): void {
        this.state.packageId = id;
        this.render();
    }

    private async scan(): Promise<void> {
        if (this.state.scanning || this.state.reloadingPaths.size)
            return;
        this.state.scanning = true;
        this.render();
        try {
            this.state.results = await this.api.scan();
        }
        catch {
            this.state.results = platforms.map(({ id, name }) => ({
                id,
                name,
                location: null,
                status: 'error',
                files: [],
                message: 'Unable to scan databases. Please try again.'
            }));
        }
        finally {
            this.state.scanning = false;
            this.render();
        }
    }

    private async reload(id: PlatformId, databasePath: string): Promise<void> {
        const { reloadingPaths } = this.state;
        const platform = this.state.results.find(result => result.id === id);
        if (!platform?.files.some(file => file.path === databasePath) || this.state.scanning || this.state.installingPath || reloadingPaths.has(databasePath))
            return;

        reloadingPaths.add(databasePath);
        this.state.feedback = null;
        this.render();
        try {
            const updated = await this.api.reload(id, databasePath);
            if (updated) {
                platform.files = platform.files.map(file => file.path === databasePath ? updated : file);
            }
            else {
                platform.files = platform.files.filter(file => file.path !== databasePath);
                platform.message = `Database removed. ${platform.files.length} remaining.`;
                this.state.feedback = { state: 'error', message: 'The database is no longer available. Rescan to check for replacement files.' };
            }
        }
        catch {
            this.state.feedback = { state: 'error', message: 'Unable to reload the database. Check access and try again.' };
        }
        finally {
            reloadingPaths.delete(databasePath);
            this.render();
        }
    }

    private async install(request: InstallRequest): Promise<void> {
        if (this.state.installingPath || this.state.scanning || this.state.reloadingPaths.size)
            return;
        this.state.installingPath = request.databasePath;
        this.state.feedback = {
            state: 'loading',
            message: 'Checking the database, creating a backup, and inserting missing data…'
        };
        this.render();
        try {
            const result = await this.api.install(request);
            const backup = result.backupPath ? ` Backup: ${result.backupPath}` : '';
            this.state.feedback = {
                state: result.success ? 'success' : 'error',
                message: `${result.message}${backup}`
            };
        }
        catch {
            this.state.feedback = {
                state: 'error',
                message: 'The insertion request could not be completed. Rescan to check the database status before trying again.'
            };
        }
        finally {
            await this.scan();
            this.state.installingPath = null;
            this.render();
        }
    }

    private render(): void {
        this.view.render(this.state);
    }
}
