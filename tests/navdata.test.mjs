import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { NavDataService } from '../dist/navdata/service.js';
import { FenixDfdAdapter } from '../dist/navdata/adapters/fenix-dfd.js';
import { gibraltar } from '../dist/navdata/packages/gibraltar.js';
import { scanDirectory } from '../dist/discovery.js';

const schema = await readFile(new URL('./fixtures/fenix-dfd-schema.sql', import.meta.url), 'utf8');
const service = () => new NavDataService([gibraltar], [new FenixDfdAdapter()]);
async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'bav-navdata-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'navdata-active.db3');
    const db = new DatabaseSync(file);
    db.exec(schema);
    db.exec(`
      INSERT INTO ps_runtime_metadata VALUES (9);
      INSERT INTO tbl_pa_airports (airport_identifier,airport_name,airport_ref_latitude,airport_ref_longitude,airport_type,area_code,icao_code,longest_runway_surface_code,id)
        VALUES ('LXGB','GIBRALTAR',36.15116944,-5.34975,'M','EUR','LX','H','PA:1');
      INSERT INTO tbl_pg_runways (airport_identifier,runway_identifier,runway_latitude,runway_longitude,runway_length,runway_width,landing_threshold_elevation,threshold_crossing_height,id)
        VALUES ('LXGB','RW09',36.15088056,-5.3581,5899,148,11,40,'PG:1'),('LXGB','RW27',36.15146944,-5.34116944,5899,148,11,40,'PG:2');
      INSERT INTO tbl_ea_enroute_waypoints (area_code,waypoint_identifier,waypoint_latitude,waypoint_longitude,waypoint_name,waypoint_type,icao_code,id)
        VALUES ('EUR','PIMOS',36.15036111,-4.89347222,'PIMOS','C Z','LE','EA:1');
      INSERT INTO tbl_pc_terminal_waypoints (area_code,region_code,waypoint_identifier,waypoint_latitude,waypoint_longitude,waypoint_name,waypoint_type,icao_code,id)
        VALUES ('EUR','LXGB','UPMUP',36,-5,'UPMUP','R E','LE','PC:1');
      INSERT INTO ps_runtime_waypoints VALUES ('EA:1','PIMOS',36.15036111,-4.89347222,NULL),('PC:1','UPMUP',36,-5,NULL);
    `);
    db.close();
    return { root, file, backupDir: path.join(root, 'backups'), api: service() };
}
function edit(file, action) { const db = new DatabaseSync(file); try { return action(db); } finally { db.close(); } }
const check = f => f.api.inspect('fenix', f.file)[0];
const install = f => f.api.install('fenix', f.file, 'gibraltar', f.backupDir);

test('package matches the supplied DFD procedure counts and correction', () => {
    assert.equal(gibraltar.waypoints.length, 20);
    assert.equal(gibraltar.approaches.find(a => a.ident === 'R09-V').legs.length, 13);
    assert.equal(gibraltar.approaches.find(a => a.ident === 'R27-V').legs.length, 14);
    assert.equal(gibraltar.approaches.find(a => a.ident === 'R09-V').legs.find(l => l.fix === 'GB094').route, 'A');
});

test('scan is read-only; install creates complete runtime data, backup and no duplicates', async t => {
    const f = await fixture(t);
    const before = await readFile(f.file);
    assert.equal(check(f).state, 'missing');
    assert.deepEqual(await readFile(f.file), before);
    const result = await install(f);
    assert.equal(result.success, true, result.message);
    assert.ok(result.backupPath);
    assert.equal(check(f).state, 'installed');
    edit(f.file, db => {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pc_terminal_waypoints').get().n, 21);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pf_iaps').get().n, 27);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ps_runtime_procedures').get().n, 4);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ps_runtime_waypoints').get().n, 22);
        const runway = db.prepare("SELECT * FROM tbl_pf_iaps WHERE procedure_identifier='R27-V' AND waypoint_identifier='RW27'").get();
        assert.equal(runway.altitude1, 51);
        assert.equal(runway.vertical_angle, -3);
        assert.equal(runway.waypoint_identifier_id, 'PG:2');
        const arc = db.prepare("SELECT * FROM tbl_pf_iaps WHERE waypoint_identifier='GB272'").get();
        assert.ok(arc.arc_radius > 0);
        assert.equal(arc.distance_time, 9.4);
        assert.equal(arc.center_waypoint, 'GB501');
        assert.equal(db.prepare("SELECT waypoint_icao_code AS code FROM tbl_pf_iaps WHERE waypoint_identifier='UPMUP' LIMIT 1").get().code, 'LE');
    });
    edit(result.backupPath, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pf_iaps').get().n, 0));
    const installed = await readFile(f.file);
    const again = await install(f);
    assert.equal(again.success, true);
    assert.equal(again.backupPath, undefined);
    assert.deepEqual(await readFile(f.file), installed);
    assert.equal((await readdir(f.backupDir)).length, 1);
});

test('Fenix runtime schema 11 supports scanning and installation', async t => {
    const f = await fixture(t);
    edit(f.file, db => db.exec('UPDATE ps_runtime_metadata SET schema_version=11'));
    assert.equal(check(f).state, 'missing');
    const result = await install(f);
    assert.equal(result.success, true, result.message);
    assert.equal(check(f).state, 'installed');
});

test('find-or-create completes partial data without duplicating matching records', async t => {
    const f = await fixture(t);
    assert.equal((await install(f)).success, true);
    edit(f.file, db => db.exec(`DELETE FROM tbl_pf_iaps WHERE procedure_identifier='R09-V' AND route_type='A' AND seqno=10;
      DELETE FROM ps_runtime_procedures WHERE procedure_identifier='R09-V' AND route_type='A';
      DELETE FROM ps_runtime_waypoints WHERE identifier='BUGOV';`));
    assert.equal(check(f).state, 'missing');
    const result = await install(f);
    assert.equal(result.success, true, result.message);
    assert.equal(check(f).state, 'installed');
    edit(f.file, db => {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pf_iaps').get().n, 27);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pc_terminal_waypoints').get().n, 21);
    });
});

test('BUGOV alone is not considered an installed package', async t => {
    const f = await fixture(t);
    const plan = new FenixDfdAdapter();
    edit(f.file, db => {
        for (const row of plan.plan(db, gibraltar).filter(row => row.table === 'tbl_pc_terminal_waypoints' && row.values.waypoint_identifier === 'BUGOV')) {
            const columns = Object.keys(row.values);
            db.prepare(`INSERT INTO ${row.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row.values));
        }
    });
    assert.equal(check(f).state, 'missing');
    assert.equal((await install(f)).success, true);
    assert.equal(check(f).state, 'installed');
});

test('conflicting values and unexpected legs block insertion without modifying data', async t => {
    const f = await fixture(t);
    assert.equal((await install(f)).success, true);
    edit(f.file, db => db.exec("UPDATE tbl_pc_terminal_waypoints SET waypoint_latitude=0 WHERE waypoint_identifier='BUGOV'"));
    const before = await readFile(f.file);
    assert.equal(check(f).state, 'conflict');
    assert.equal((await install(f)).success, false);
    assert.deepEqual(await readFile(f.file), before);
});

test('a mid-write SQLite error rolls back every inserted record', async t => {
    const f = await fixture(t);
    edit(f.file, db => db.exec("CREATE TRIGGER reject_hold BEFORE INSERT ON tbl_pf_iaps WHEN NEW.path_termination='HM' BEGIN SELECT RAISE(ABORT,'Simulated insert failure'); END;"));
    const result = await install(f);
    assert.equal(result.success, false);
    assert.match(result.message, /Simulated insert failure/);
    assert.ok(result.backupPath);
    edit(f.file, db => {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pf_iaps').get().n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pc_terminal_waypoints').get().n, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ps_runtime_waypoints').get().n, 2);
    });
});

test('unsupported schema, missing dependencies, corrupt files and unsupported platforms are reported', async t => {
    const f = await fixture(t);
    edit(f.file, db => db.exec('UPDATE ps_runtime_metadata SET schema_version=8'));
    assert.equal(check(f).state, 'unsupported');
    assert.equal((await install(f)).success, false);
    edit(f.file, db => db.exec("UPDATE ps_runtime_metadata SET schema_version=9; DELETE FROM tbl_pg_runways WHERE runway_identifier='RW09'"));
    assert.equal(check(f).state, 'conflict');
    assert.equal(f.api.inspect('fslabs', f.file)[0].state, 'unsupported');
    await writeFile(f.file, 'not sqlite');
    assert.equal(check(f).state, 'error');
});

test('backup failure and a locked database leave navdata unchanged', async t => {
    const f = await fixture(t);
    await writeFile(f.backupDir, 'not a folder');
    assert.equal((await install(f)).success, false);
    edit(f.file, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tbl_pf_iaps').get().n, 0));
    await rm(f.backupDir);
    const lock = new DatabaseSync(f.file);
    lock.exec('BEGIN IMMEDIATE');
    try {
        const result = await install(f);
        assert.equal(result.success, false);
        assert.match(result.message, /busy/);
    } finally { lock.exec('ROLLBACK'); lock.close(); }
});

test('new packages use the same service without Gibraltar-specific logic', async t => {
    const f = await fixture(t);
    const second = structuredClone(gibraltar);
    second.id = 'another-package'; second.name = 'Another data package';
    second.approaches.forEach(a => { a.ident = a.ident.replace('-V','-W'); });
    const api = new NavDataService([gibraltar, second], [new FenixDfdAdapter()]);
    assert.equal((await api.install('fenix',f.file,second.id,f.backupDir)).success,true);
    assert.equal(api.inspect('fenix',f.file).find(p => p.packageId === second.id).state,'installed');
    assert.equal(api.inspect('fenix',f.file).find(p => p.packageId === 'gibraltar').state,'missing');
});

test('discovery remains top-level and case-insensitive with clean missing-folder results', async t => {
    const f = await fixture(t);
    const nested = path.join(f.root,'nested');
    await import('node:fs/promises').then(fs => fs.mkdir(nested));
    await writeFile(path.join(nested,'hidden.db3'),'not sqlite');
    await writeFile(path.join(f.root,'other.DB3'),'not sqlite');
    const result = await scanDirectory('fenix','Fenix',f.root,'.db3');
    assert.deepEqual(result.files.map(f => f.name).sort(),['navdata-active.db3','other.DB3']);
    assert.equal(result.files.find(f=>f.name==='other.DB3').packages[0].state,'error');
    assert.equal((await scanDirectory('fenix','Fenix',path.join(f.root,'missing'),'.db3')).status,'unavailable');
});

test('unexpected additional procedure legs are treated as conflicts', async t => {
    const f = await fixture(t);
    assert.equal((await install(f)).success, true);
    edit(f.file, db => db.exec(`INSERT INTO tbl_pf_iaps (airport_identifier,procedure_identifier,route_type,transition_identifier,seqno,path_termination)
      VALUES ('LXGB','R09-V','R',NULL,999,'TF')`));
    assert.equal(check(f).state, 'conflict');
    assert.equal((await install(f)).success, false);
});

test('the shared service can use a different platform adapter', async t => {
    const f = await fixture(t);
    edit(f.file, db => db.exec('CREATE TABLE example_platform_records (package_id TEXT PRIMARY KEY, label TEXT)'));
    const adapter = {
        platformId: 'fslabs', name: 'Example test adapter (not a real FSLabs schema)',
        plan(_db, data) { return [{table:'example_platform_records',key:{package_id:data.id},values:{package_id:data.id,label:data.name}}]; }
    };
    const api = new NavDataService([gibraltar], [adapter]);
    assert.equal(api.inspect('fslabs',f.file)[0].state,'missing');
    assert.equal((await api.install('fslabs',f.file,'gibraltar',f.backupDir)).success,true);
    assert.equal(api.inspect('fslabs',f.file)[0].state,'installed');
});

test('FSLabs scans sort filenames numerically and targeted reload rereads AIRAC metadata', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'bav-fslabs-scan-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const older = path.join(root, 'navdata-9.rom');
    const newer = path.join(root, 'navdata-10.rom');
    for (const file of [older, newer]) {
        edit(file, db => db.exec(`
            CREATE TABLE CYCLE_INFO (PARAMETER TEXT, VALUE TEXT);
            INSERT INTO CYCLE_INFO VALUES ('CYCLE', '2610');
        `));
    }

    const initial = await scanDirectory('fslabs', 'FSLabs', root, '.rom');
    assert.deepEqual(initial.files.map(file => file.path), [newer, older]);
    assert.equal(initial.files[0].airac.cycle, '2610');
    assert.equal(initial.files[0].airac.revision, undefined);

    edit(newer, db => db.exec(`
        UPDATE CYCLE_INFO SET VALUE = '2611' WHERE PARAMETER = 'CYCLE';
        INSERT INTO CYCLE_INFO VALUES ('SEQUENCE', '005');
    `));
    const refreshed = await scanDirectory('fslabs', 'FSLabs', root, '.rom', newer);
    assert.deepEqual(refreshed.files.map(file => file.path), [newer]);
    assert.equal(refreshed.files[0].airac.cycle, '2611');
    assert.equal(refreshed.files[0].airac.revision, '005');
});

test('Fenix scans read cycle and revision from the DFD header', async t => {
    const f = await fixture(t);
    edit(f.file, db => db.exec(`
        CREATE TABLE tbl_hdr_header (cycle TEXT, revision TEXT);
        INSERT INTO tbl_hdr_header VALUES ('2611', '005');
    `));
    const result = await scanDirectory('fenix', 'Fenix', f.root, '.db3');
    assert.deepEqual(result.files[0].airac, { cycle: '2611', revision: '005' });
});
