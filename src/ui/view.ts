import { getPlatform, isPlatformId } from '../shared/platforms.js';
import { renderDatabaseTable } from './database-table.js';
import { isBusy, type NavDataView, type RendererState, type ViewActions } from './state.js';

function element<T extends HTMLElement>(id: string): T {
    const result = document.getElementById(id);
    if (!result)
        throw new Error(`Required UI element #${id} is missing.`);
    return result as T;
}

/** Collect DOM references once and keep all DOM mutations in this view layer. */
export function createNavDataView(): NavDataView {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const refresh = element<HTMLButtonElement>('refresh');
    const packages = element<HTMLSelectElement>('data-package');
    const panel = element('platform-panel');
    const location = element('location');
    const status = element('status');
    const feedback = element('operation-feedback');
    const description = element('package-description');
    const platformTitle = element('platform-title');
    const fileType = element('file-type');
    const platformDescription = element('platform-description');
    const table = element('database-table');
    const body = element('files');
    let actions: ViewActions;
    function renderTabs(state: RendererState): void {
        tabs.forEach(tab => {
            if (!isPlatformId(tab.dataset.platform))
                return;
            const platform = getPlatform(tab.dataset.platform);
            const active = platform.id === state.platformId;
            const result = state.results.find(result => result.id === platform.id);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            tab.textContent = `${platform.name}${result ? ` (${result.files.length})` : ''}`;
        });
    }
    function renderPackageSelector(state: RendererState): void {
        const ids = state.packages.map(data => data.id);
        const currentIds = Array.from(packages.options).map(option => option.value);
        if (ids.length && ids.join('|') !== currentIds.join('|')) {
            packages.replaceChildren(...state.packages.map(data => {
                const option = document.createElement('option');
                option.value = data.id;
                option.textContent = `${data.name} · v${data.version}`;
                return option;
            }));
        }
        if (state.packageId)
            packages.value = state.packageId;
        packages.disabled = isBusy(state) || !state.packages.length;
        description.textContent = state.packages.find(data => data.id === state.packageId)?.description || 'Loading data packages…';
    }
    return {
        bind(handlers) {
            actions = handlers;
            packages.addEventListener('change', () => actions.selectPackage(packages.value));
            refresh.addEventListener('click', () => actions.scan());
            tabs.forEach((tab, index) => {
                tab.addEventListener('click', () => {
                    if (isPlatformId(tab.dataset.platform))
                        actions.selectPlatform(tab.dataset.platform);
                });
                tab.addEventListener('keydown', event => {
                    const target = tabTarget(event.key, index, tabs.length);
                    if (target === undefined)
                        return;
                    event.preventDefault();
                    tabs[target].click();
                    tabs[target].focus();
                });
            });
        },
        render(state) {
            renderTabs(state);
            renderPackageSelector(state);
            const platform = getPlatform(state.platformId);
            const result = state.results.find(result => result.id === platform.id);
            refresh.disabled = isBusy(state) || state.reloadingPaths.size > 0;
            refresh.textContent = state.scanning ? 'Scanning…' : 'Rescan Databases';
            platformTitle.textContent = `${platform.name} Databases`;
            fileType.textContent = platform.extension;
            platformDescription.textContent = 'Package status is checked in each database during scanning.';
            panel.setAttribute('aria-labelledby', `tab-${platform.id}`);
            location.textContent = result?.location || platform.locationHint;
            status.textContent = state.scanning ? 'Scanning Databases and checking custom data…' : result?.message || 'No scan results available.';
            status.dataset.state = state.scanning ? 'loading' : result?.status || 'error';
            feedback.hidden = !state.feedback;
            if (state.feedback) {
                feedback.dataset.state = state.feedback.state;
                feedback.textContent = state.feedback.message;
            }
            renderDatabaseTable(table, body, state, actions);
        }
    };
}

function tabTarget(key: string, index: number, count: number): number | undefined {
    switch (key) {
        case 'ArrowRight': return (index + 1) % count;
        case 'ArrowLeft': return (index + count - 1) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return undefined;
    }
}
