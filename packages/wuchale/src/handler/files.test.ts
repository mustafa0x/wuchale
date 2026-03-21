// $ node --import ../../testing/resolve.ts %f

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type TestContext, test } from 'node:test'
import type { Adapter } from '../adapters.js'
import { defaultFS, type FS } from '../fs.js'
import { Files, generatedDir } from './files.js'

function createFS() {
    const files = new Map<string, string>()
    const fs = {
        write: (file: string, data: string) => {
            files.set(file, data)
        },
        read: (file: string) => files.get(file) ?? '',
        mkdir: () => {},
        exists: () => false,
        remove: (file: string) => {
            files.delete(file)
        },
    } as FS
    return { files, fs }
}

test('writeUrlFiles removes stale generated helpers', async (t: TestContext) => {
    const { files, fs } = createFS()
    const filesHandler = new Files({ loaderExts: ['.js'], defaultLoaderPath: null } as Adapter, 'test', '/project/src/locales', fs, '/project')
    await filesHandler.init('test', 'en')
    const manifestPath = resolve('/project/src/locales', generatedDir, 'test.urls.js')
    const helperPath = resolve('/project/src/locales', 'test.url.js')
    await filesHandler.writeUrlFiles([['/items', ['/items', '/elementos']]], 'en')
    t.assert.strictEqual(files.has(manifestPath), true)
    t.assert.strictEqual(files.has(helperPath), true)
    await filesHandler.writeUrlFiles([], 'en')
    t.assert.strictEqual(files.has(manifestPath), false)
    t.assert.strictEqual(files.has(helperPath), false)
})

test('writeTransformed resolves outDir from the project root', async (t: TestContext) => {
    const { files, fs } = createFS()
    const filesHandler = new Files(
        { loaderExts: ['.js'], defaultLoaderPath: null, outDir: 'dist' } as Adapter,
        'test',
        'src/locales',
        fs,
        '/project',
    )
    await filesHandler.init('test', 'en')
    await filesHandler.writeTransformed('src/foo.js', 'export {}')
    t.assert.strictEqual(files.get(resolve('/project', 'dist', 'src/foo.js')), 'export {}')
})


test('generated proxies support non-identifier load IDs', async (t: TestContext) => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-proxy-'))
    t.after(async () => {
        await rm(root, { recursive: true, force: true })
    })
    await writeFile(resolve(root, 'package.json'), '{"type":"module"}')
    const localesDir = resolve(root, 'src/locales')
    await mkdir(resolve(localesDir, generatedDir), { recursive: true })
    const filesHandler = new Files({ loaderExts: ['.js'], defaultLoaderPath: null } as Adapter, 'my-app', 'src/locales', defaultFS, root)
    await filesHandler.init('my-app', 'en')
    const compiledPath = filesHandler.getCompiledFilePath('en', 'my-app')
    await mkdir(dirname(compiledPath), { recursive: true })
    await writeFile(compiledPath, "export const c = ['Hello']")
    await filesHandler.writeProxies(['en'], ['my-app'], ['my-app'])
    const asyncProxy = await import(pathToFileURL(filesHandler.proxyPath).href)
    t.assert.deepEqual(asyncProxy.loadIDs, ['my-app'])
    const loaded = await asyncProxy.loadCatalog('my-app', 'en')
    t.assert.deepEqual(loaded.c, ['Hello'])
    const syncProxy = await import(pathToFileURL(filesHandler.proxySyncPath).href)
    t.assert.deepEqual(syncProxy.loadIDs, ['my-app'])
    t.assert.deepEqual(syncProxy.loadCatalog('my-app', 'en').c, ['Hello'])
})

test('writeUrlFiles uses normalized relative imports', async (t: TestContext) => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-urlfiles-'))
    t.after(async () => {
        await rm(root, { recursive: true, force: true })
    })
    const localesDir = resolve(root, 'src/locales')
    await mkdir(resolve(localesDir, generatedDir), { recursive: true })
    const filesHandler = new Files({ loaderExts: ['.js'], defaultLoaderPath: null } as Adapter, 'test', 'src/locales', defaultFS, root)
    await filesHandler.init('test', 'en')
    await filesHandler.writeUrlFiles([['/items', ['/items', '/elementos']]], 'en')
    const helper = await readFile(resolve(localesDir, 'test.url.js'), 'utf8')
    t.assert.match(helper, /import manifest from "\.\/\.wuchale\/test\.urls\.js"/)
})
