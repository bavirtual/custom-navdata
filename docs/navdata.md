# Custom nav data

The first package is **Gibraltar RNAV approaches**, version 1.0.0. Both platforms use normalized content with 20 terminal waypoints and 27 approach legs. Fenix retains R09-V / R27-V; FSLabs uses the supplied R09 / R27 definitions. Content is bundled with the app; scans and inserts do not download or execute remote code.

## Design and extension

See [architecture.md](architecture.md) for the code map and application data flow.

- `src/navdata/content.ts`: platform-neutral content and explicit time/distance units.
- `src/navdata/types.ts`: package check states and insertion requests/results.
- `src/navdata/packages/gibraltar.ts`: Fenix content from the supplied Python implementation; no SQL.
- `src/navdata/packages/gibraltar-fslabs.ts`: normalized FSLabs content converted from the supplied CSV files; no SQL.
- `src/navdata/adapter.ts`: `PlatformAdapter.plan(database, package)` returns keyed records without writing. Adapters validate schemas and resolve database references. An optional value comparator handles fixed-width padding.
- `src/navdata/adapters/fenix-dfd.ts`: Fenix DFD runtime schema 9 or later, including runtime lookup tables.
- `src/navdata/adapters/fslabs.ts`: FSLabs WAYPOINT, VHF_NAVAID, AIRPORT_PROCEDURE and both flight-planning continuation tables.
- `src/navdata/adapters/fenix/` and `src/navdata/adapters/fslabs/`: focused schema/context, waypoint, navaid and procedure planning modules used by the adapter entry points.
- `src/navdata/service.ts`: common record comparison, find-or-create, SQLite backup, transactions, and verification.
- `src/navdata/database/`: shared SQL queries, row comparison/insertion, backup and error helpers.
- `src/navdata/registry.ts`: registers packages and adapters. Discovery and UI use the registry.

To add content, create a typed `NavDataPackage` and register it. The selector and scan checks update automatically. Packages may provide `platformVariants` with neutral `NavDataContent`; the service selects the variant before invoking the platform adapter. Variants describe actual source-content differences, not database columns. The current Gibraltar variants preserve the distinct approach names, waypoint precision, descriptions and hold definitions in the supplied sources.

To add an adapter, implement `PlatformAdapter` and register it. Return keyed `PlannedRow[]` so backups, transactions and checks remain shared. Extend the neutral model when adding new content categories; adapters should reject categories they cannot support rather than silently skipping them. FSLabs requires matching schema fields and AIRAC 2001 or later. Unknown/incomplete layouts are reported per database.

## Find-or-create and backups

Scans use read-only SQLite connections and check every required record. Missing rows are insertable; matching rows are reused. Conflicting values, duplicate identities, unexpected procedure legs, ambiguous references or unsupported schemas block insertion with a reason. Correct partial installs can be completed. Existing records are never overwritten or deleted.

PIMOS / UPMUP references and runway records are resolved from the current database, using airport/region and location checks. Their actual ICAO codes are retained, including UPMUP cycle differences. Missing or ambiguous references block insertion instead of guessing.

FSLabs also checks the 20 waypoint continuation records and the GBR continuation. Its existing Gibraltar GBR facility is reused only if identity, class, frequency and location match; current AIRAC coordinates/elevation are preserved. If absent, GBR is created from the supplied navaid CSV. Same-named facilities in other regions are not changed. New `FILE_RECD_NR` values exceed the global maximum. Reused record numbers/cycles are retained; new CSV records retain source cycles, and added arc centres use the current AIRAC cycle.

Close Fenix, FSLabs and navdata updaters before inserting. Click **Insert data** for the chosen database/package. One insertion runs at a time. A consistent SQLite backup, including committed WAL contents, is created in Electron's user-data `backups` directory. Its unique filename and full path are shown in the result. Backups are retained.

Insertion rechecks under `BEGIN IMMEDIATE`, writes only missing records, verifies and commits. Failures roll back. A raw backup is never copied over an open database. Locks, permissions, missing files and schema problems are returned to the UI. Only currently discovered top-level files in the platform directory can be modified; linked/out-of-folder paths and arbitrary SQL from the renderer are rejected.

Re-scan after navdata updates, which may replace the database. Automatic restoring, manifest/checksum rewriting and in-simulator validation are not implemented.

## FSLabs source conversion and hold encoding

The supplied sources were `FSLabs (1).cs` (old inserter), `FSLabs.cs` (models), `WAYPOINT.csv`, `VHF_NAVAID.csv`, and `AIRPORT_PROCEDURE.csv`. The actual MSFS 2024 databases match the relevant model tables; the old P3D registry paths are not used.

The CSVs contain 15 terminal waypoints, one navaid and 27 approach legs. Five missing arc-centre fixes (GB403, GB409, GB501, GB509, GB513) are supplied from the existing canonical Gibraltar package, scoped to LXGB. The importer retains the CSV waypoint precision, procedure sequencing, descriptions, qualifications, altitudes, RNP and fixed arc radii. It resolves external fixes and GBR to their database ICAO codes.

The CSV inputs are preserved under `tests/fixtures/fslabs-source/`, and source hashes appear in `gibraltar-fslabs.ts`. The normalized content is maintained directly in that TypeScript package file. The app does not execute the C# files or rely on the Downloads folder at runtime.

Storage conversions:

| Neutral meaning | FSLabs value |
| --- | --- |
| One-minute holding leg | `T010` |
| 4.5 NM route distance | `0045` |
| 4.3 NM RF radius | `ARC_RADIUS = 4300` |
| 0.3 NM RNP (source CSV `302`) | `RNP = 0.3` |

The CSV RNP field uses ARINC mantissa/exponent coding: `010` means 1, `302` means 0.3. These are decoded because the current database stores numeric RNP values, not the encoded source integer.

The supplied FSLabs HM legs use one minute, retained as explicit `distanceUnit: 'minutes'` and encoded `T010`. The existing Fenix package's four-NM holds are unchanged. The shared model and both adapters can distinguish time from distance.

Read-only verification in `NAV2610002.rom` confirmed existing timed procedure holds: DAAE R08-Z / R26-W / R26-Z hold at AE701 with `PATH_AND_TERMINATION = HM` and `ROUTE_DISTANCE_HOLDING_DISTANCE_OR_TIME = T010`. Other examples include DAUZ I05 at ZARTI and DBBB I24-Y at METOX.

BNN is stored differently: EGLL STAR rows contain no embedded HM/HF/HA hold. The BNN hold is in `HOLDING_PATTERN`, with `LEG_LENGTH = NULL` and `LEG_TIME = '10'` for the 7000–14000-foot variant, or `'15'` for the higher 14000–17000-foot variant. LAM1Z's `CF` leg to BNN has `0070`, representing the route leg's distance rather than a holding time. Thus both timed conventions exist; Gibraltar's embedded missed-approach HM records use `T010`, as supplied.

## Fenix provenance

Original implementation/model:

- https://github.com/bavirtual/BAVirtual.Gibraltar/blob/main/BAVirtual.Gibraltar/Addons/Fenix.cs
- https://github.com/bavirtual/BAVirtual.Gibraltar/blob/main/BAVirtual.Gibraltar/Models/Fenix.cs

Those models target older Waypoints/Terminals tables. Current local NavdataDFD databases use tbl_pc_terminal_waypoints / tbl_pf_iaps and runtime tables. The supplied Python implementation is the source for this mapping and package. Its hash is in `gibraltar.ts`, where the normalized content is maintained directly. No Python installation is required by the app.

The Fenix variant does not insert the old console tool's additional GBR navaid, matching the Python implementation. Existing navaid data is preserved.

DFD field reference: https://developers.navigraph.com/docs/navigation-data/dfd-data-format-v2

## Validation

`npm test` builds and runs temporary SQLite fixture tests for both actual schema shapes. Coverage includes normalized units, timed holds, navaids, continuation/runtime rows, read-only scans, complete/partial installs, repeat installs, conflicts, rollback, backups, locks, invalid schemas/files, package/adapter extension, and top-level discovery.

Manual integration checks installed into a temporary copy of the Fenix active database and copies of all four discovered FSLabs ROMs (NAV2401001, NAV2609001, NAV2610001, NAV2610002). Subsequent checks reported installed, repeat insertion was a no-op, and both FSLabs holds stored T010. Original installed databases were not modified.

`npm run test:ui` exercises the actual Electron preload/renderer with mocked handlers, including Fenix and FSLabs insertion buttons. It does not modify installed databases. Database tests validate stored records; simulator/FMS behaviour still requires a user test.
