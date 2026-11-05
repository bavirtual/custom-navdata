import { fileURLToPath } from 'node:url';

const windowsIcon = fileURLToPath(new URL('./src/images/logo.ico', import.meta.url));

const signing = process.env.WINDOWS_CERTIFICATE_FILE ? {
    certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD
} : undefined;

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
    packagerConfig: {
        asar: true,
        prune: true,
        icon: windowsIcon,
        name: 'BAVirtual Custom Nav Data',
        executableName: 'BAVirtualCustomNavData',
        appCopyright: 'Copyright 2026 BAVirtual',
        windowsSign: signing,
        // Ship only compiled code, renderer assets, production dependencies and the licence.
        ignore: file => {
            const name = file.replaceAll('\\', '/');
            if (!name || ['/dist', '/node_modules', '/src'].includes(name)) return false;
            return !(
                name.startsWith('/dist/') || name.startsWith('/node_modules/') ||
                ['/package.json', '/LICENSE', '/src/index.html', '/src/styles.css', '/src/images', '/src/images/logo.svg', '/src/images/logo.png'].includes(name)
            );
        }
    },
    makers: [{
        name: '@electron-forge/maker-squirrel',
        platforms: ['win32'],
        config: {
            name: 'bavirtual_custom_navdata',
            authors: 'BAVirtual',
            description: 'BAVirtual custom navigation data tools for Fenix and FSLabs.',
            setupExe: 'BAVirtualCustomNavDataSetup.exe',
            noMsi: true,
            setupIcon: windowsIcon,
            windowsSign: signing
        }
    }],
    publishers: [{
        name: '@electron-forge/publisher-github',
        config: {
            repository: { owner: 'bavirtual', name: 'custom-navdata' },
            draft: true,
            prerelease: false,
            generateReleaseNotes: true
        }
    }]
};

export default config;
