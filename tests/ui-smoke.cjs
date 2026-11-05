const { app, BrowserWindow, ipcMain } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
    const { navDataService } = await import(pathToFileURL(path.resolve('dist/navdata/registry.js')));
    const results = [{
        id: 'fenix', name: 'Fenix', location: 'C:\\Test\\Fenix', status: 'ready', message: 'Found 3 database files.',
        files: ['active', 'default', 'standby'].map(name => ({
            name: `navdata-${name}.db3`, path: `C:\\Test\\Fenix\\navdata-${name}.db3`, size: 290000000, modified: new Date().toISOString(),
            packages: [{ packageId: 'gibraltar', name: 'Gibraltar RNAV approaches', version: '1.0.0', state: 'missing', message: '71 required records are missing. Matching records will be reused.' }]
        }))
    }, {
        id: 'fslabs', name: 'FSLabs', location: 'C:\\Test\\FSLabs', status: 'ready', message: 'Found 1 database file.',
        files: [{ name: 'navdata.rom', path: 'C:\\Test\\FSLabs\\navdata.rom', size: 100, modified: new Date().toISOString(),
            packages: [{packageId: 'gibraltar', name: 'Gibraltar RNAV approaches', version: '1.0.0', state: 'missing', message: '67 required records are missing.'}] }]
    }];
    const called = new Set();
    ipcMain.handle('navdata:packages', () => navDataService.packages.map(({id,name,version,description})=>({id,name,version,description})));
    ipcMain.handle('navdata:scan', () => results);
    ipcMain.handle('navdata:reload', (_event, platformId, databasePath) => {
        assert.equal(platformId, 'fenix');
        assert.equal(databasePath, results[0].files[0].path);
        return { ...results[0].files[0], airac: { cycle: '2611', revision: '005' } };
    });
    // Exercise the renderer action without modifying an installed database.
    ipcMain.handle('navdata:install', (_event, request) => {
        assert.ok(['fenix','fslabs'].includes(request.platformId));
        assert.equal(request.packageId,'gibraltar');
        const file=results.find(result=>result.id===request.platformId).files[0];
        assert.equal(request.databasePath,file.path);
        called.add(request.platformId);
        file.packages[0].state='installed';
        file.packages[0].message='UI test: all required records installed.';
        return {success:true,message:'UI test insertion completed.'};
    });
    const win = new BrowserWindow({show:false,width:1200,height:900,webPreferences:{preload:path.resolve('dist/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
    await win.loadFile(path.resolve('src/index.html'));
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now(); const timer=setInterval(()=>{
        if(document.querySelectorAll('#files tr').length){clearInterval(timer);resolve();}
        else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('UI did not load'));}
      },50);
    })`);
    const ui = await win.webContents.executeJavaScript(`({title:document.title,rows:document.querySelectorAll('#files tr').length,buttons:document.querySelectorAll('.insert-button').length,package:document.querySelector('#data-package').value})`);
    assert.equal(ui.title,'BAVirtual Custom Nav Data');
    assert.equal(ui.rows,3);
    assert.equal(ui.buttons,3);
    assert.equal(ui.package,'gibraltar');
    await win.webContents.executeJavaScript(`document.querySelector('.reload-button').click()`);
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now(); const timer=setInterval(()=>{
        if(document.querySelector('.airac-cell').textContent.includes('Rev 005')){clearInterval(timer);resolve();}
        else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('AIRAC did not update after reloading'));}
      },50);
    })`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#files tr').length`),3);
    const screenshot=path.join(app.getPath('temp'),'bav-navdata-ui.png');
    await writeFile(screenshot,(await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('.insert-button').click()`);
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now(); const timer=setInterval(()=>{
        if(document.querySelector('#operation-feedback').dataset.state==='success' && !document.querySelector('#refresh').disabled){clearInterval(timer);resolve();}
        else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Insert UI did not settle'));}
      },50);
    })`);
    assert.equal(called.has('fenix'),true);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.insert-button').length`),2);
    await win.webContents.executeJavaScript(`document.querySelector('#tab-fslabs').click()`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.insert-button').length`),1);
    await win.webContents.executeJavaScript(`document.querySelector('.insert-button').click()`);
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now(); const timer=setInterval(()=>{
        if(document.querySelector('#operation-feedback').dataset.state==='success' && !document.querySelector('#refresh').disabled){clearInterval(timer);resolve();}
        else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('FSLabs insert UI did not settle'));}
      },50);
    })`);
    assert.equal(called.has('fslabs'),true);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.insert-button').length`),0);
    console.log('PASS: real Electron preload, package selector, status rows, mock insert action, and FSLabs tab.');
    console.log('Screenshot:',screenshot);
    app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
