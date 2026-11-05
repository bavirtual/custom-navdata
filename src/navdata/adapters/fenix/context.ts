import type { DatabaseSync } from 'node:sqlite';
import type { PlannedRow } from '../../adapter.js';
import { UnsupportedSchemaError } from '../../database/errors.js';
import { matchingRows, quote } from '../../database/queries.js';
import { expectOne } from '../../database/values.js';
import type { Fix, NavDataPackage } from '../../types.js';

export interface ResolvedFix extends Fix {
    id: string;
    region: string;
    table: 'PC' | 'EA' | 'PG';
}

export class FenixPlanContext {
    readonly rows: PlannedRow[] = [];
    readonly fixes = new Map<string, ResolvedFix>();
    nextWaypointId: number;
    constructor(readonly db: DatabaseSync, readonly data: NavDataPackage) {
        if (data.navaids?.length)
            throw new UnsupportedSchemaError('This Fenix adapter does not support custom navaid insertion yet.');
        for (const table of ['tbl_pa_airports', 'tbl_pg_runways', 'tbl_pc_terminal_waypoints', 'tbl_ea_enroute_waypoints', 'tbl_pf_iaps', 'ps_runtime_waypoints', 'ps_runtime_procedures', 'ps_runtime_metadata']) {
            if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
                throw new UnsupportedSchemaError(`Unsupported Fenix layout: ${table} is missing.`);
            }
        }
        const metadata = db.prepare('SELECT schema_version FROM ps_runtime_metadata').all();
        const version = metadata[0]?.schema_version;
        if (metadata.length !== 1 || typeof version !== 'number' || !Number.isInteger(version) || version < 9)
            throw new UnsupportedSchemaError('This Fenix runtime schema is not supported (expected version 9 or later).');
        expectOne(matchingRows(db, 'tbl_pa_airports', { airport_identifier: data.airport }), `${data.airport} airport`);
        // Preserve the existing PC:<integer> ID convention, including orphaned runtime IDs.
        this.nextWaypointId = Number(db.prepare(`SELECT MAX(value) AS value FROM (
            SELECT COALESCE(MAX(CAST(substr(id,4) AS INTEGER)),0) AS value FROM tbl_pc_terminal_waypoints WHERE id LIKE 'PC:%'
            UNION ALL SELECT COALESCE(MAX(CAST(substr(id,4) AS INTEGER)),0) FROM ps_runtime_waypoints WHERE id LIKE 'PC:%'
        )`).get()!.value);
    }
    addRuntime(fix: ResolvedFix): void {
        this.rows.push({
            table: 'ps_runtime_waypoints',
            key: { id: fix.id },
            values: {
                id: fix.id,
                identifier: fix.ident,
                latitude: fix.latitude,
                longitude: fix.longitude,
                navaid_id: null
            }
        });
    }

    finish(): PlannedRow[] {
        const tables = new Map<string, Set<string>>();
        for (const row of this.rows) {
            let columns = tables.get(row.table);
            if (!columns) {
                columns = new Set(this.db.prepare(`PRAGMA table_info(${quote(row.table)})`).all().map(column => String(column.name)));
                tables.set(row.table, columns);
            }
            for (const column of Object.keys(row.values)) {
                if (!columns.has(column))
                    throw new UnsupportedSchemaError(`Unsupported Fenix layout: ${row.table}.${column} is missing.`);
            }
        }
        return this.rows;
    }
}
