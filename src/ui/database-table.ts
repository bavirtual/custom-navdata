import type { PackageCheck, PackageState } from '../navdata/types.js';
import type { DatabaseFile, ScanResult } from '../shared/api.js';
import { isBusy, type RendererState, type ViewActions } from './state.js';

const statusLabels: Record<PackageState, string> = {
    installed: 'Installed',
    missing: 'Not fully installed',
    conflict: 'Conflicting data',
    unsupported: 'Not supported yet',
    error: 'Unable to check'
};
function cell(value: string, className: string): HTMLTableCellElement {
    const element = document.createElement('td');
    element.textContent = value;
    element.className = className;
    return element;
}

function packageCell(check: PackageCheck | undefined): HTMLTableCellElement {
    const element = cell('', 'package-cell');
    const badge = document.createElement('span');
    badge.className = 'package-state';
    badge.dataset.state = check?.state || 'error';
    badge.textContent = check ? statusLabels[check.state] : 'Not checked';
    const detail = document.createElement('p');
    detail.className = 'package-detail';
    detail.textContent = check?.message || 'Select a data package and rescan.';
    element.append(badge, detail);
    return element;
}

function actionCell(file: DatabaseFile, platform: ScanResult, check: PackageCheck | undefined, state: RendererState, actions: ViewActions): HTMLTableCellElement {
    const element = cell('', 'action-cell');
    const reload = document.createElement('button');
    const reloading = state.reloadingPaths.has(file.path);
    reload.className = 'reload-button';
    reload.type = 'button';
    reload.textContent = reloading ? 'Reloading…' : '↻ Reload';
    reload.setAttribute('aria-label', `Reload ${file.name}`);
    reload.disabled = isBusy(state) || reloading;
    reload.addEventListener('click', () => actions.reload(platform.id, file.path));
    element.append(reload);
    if (check?.state !== 'missing')
        return element;
    const button = document.createElement('button');
    button.className = 'insert-button';
    button.type = 'button';
    button.textContent = state.installingPath === file.path ? 'Inserting…' : 'Insert data';
    button.disabled = isBusy(state) || state.reloadingPaths.size > 0;
    button.setAttribute('aria-label', `Insert ${check.name} into ${file.name}`);
    button.addEventListener('click', () => actions.install({
        databasePath: file.path,
        packageId: check.packageId,
        platformId: platform.id
    }));
    element.prepend(button);
    return element;
}

function databaseRow(file: DatabaseFile, platform: ScanResult, state: RendererState, actions: ViewActions): HTMLTableRowElement {
    const row = document.createElement('tr');
    const name = cell(file.name, 'filename-cell');
    name.title = file.path;
    const check = file.packages.find(check => check.packageId === state.packageId);
    const airac = cell(file.airac?.cycle ?? 'Unavailable', 'airac-cell');
    if (file.airac?.revision) {
        const detail = document.createElement('small');
        detail.textContent = `Rev ${file.airac.revision}`;
        airac.append(detail);
    }
    row.append(name, airac, cell(new Date(file.modified).toLocaleString(), 'date-cell'), packageCell(check), actionCell(file, platform, check, state, actions));
    return row;
}

export function renderDatabaseTable(table: HTMLElement, body: HTMLElement, state: RendererState, actions: ViewActions): void {
    const platform = state.results.find(result => result.id === state.platformId);
    table.hidden = !platform?.files.length;
    body.replaceChildren();
    if (!platform)
        return;
    body.append(...platform.files.map(file => databaseRow(file, platform, state, actions)));
}
