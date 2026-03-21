// $$ node --import ../testing/resolve.ts %f

import { resolve } from 'node:path'
import { type TestContext, test } from 'node:test'
import { type Config, defaultConfig, normalizeSep, pofile } from 'wuchale'
import { defaultArgs } from 'wuchale/adapter-vanilla'
// @ts-expect-error
import { dummyTransform, inMemFS, inMemStorage, trimLines, ts } from '../../wuchale/testing/utils.ts'
import type { FS } from './fs.js'
import { Hub } from './hub.js'

const file = normalizeSep(resolve(import.meta.dirname, 'foo.js')) // needs to match files, relative to root

const code = ts`
    function foo() {
        return 'Hello'
    }
`

const tmpDir = resolve(import.meta.dirname, '../tmp')

const defaultLoader = resolve(import.meta.dirname, '../../wuchale/src/adapter-vanilla/loaders/server.js')

const baseAdapter = {
    ...defaultArgs,
    transform: dummyTransform,
    files: '*.js',
    loaderExts: ['.js'],
    defaultLoaderPath: {
        client: defaultLoader,
        server: defaultLoader,
    },
}

const loadConfig = async (): Promise<Config> => ({
    ...defaultConfig,
    localesDir: tmpDir,
    adapters: {
        main: {
            ...baseAdapter,
            storage: pofile({ dir: tmpDir }),
        },
    },
})

function createFS() {
    const files = new Map<string, string>()
    const fs: FS = {
        write: (file: string, data: string) => {
            files.set(normalizeSep(file), data)
        },
        read: (file: string) => files.get(normalizeSep(file)) ?? '',
        mkdir: () => {},
        exists: (file: string) => files.has(normalizeSep(file)),
        remove: (file: string) => {
            files.delete(normalizeSep(file))
        },
    }
    return { files, fs }
}

const hub = new Hub(loadConfig, import.meta.dirname, 0, inMemFS)

test('hub init', async () => {
    await hub.init('dev')
})

test('hub transform basic', async (t: TestContext) => {
    const [output] = await hub.transform(code, file)
    t.assert.strictEqual(
        trimLines(output.code),
        trimLines(ts`
            import {getRuntime as _w_load_, getRuntimeRx as _w_load_rx_} from "../tmp/main.loader.js"
            _w_load_('main')(0)
        `),
    )
})

test('hub transform ssr', async (t: TestContext) => {
    await hub.init('build')
    const [output] = await hub.transform(code, file, true)
    t.assert.strictEqual(
        trimLines(output.code),
        trimLines(ts`
        import {getRuntime as _w_load_, getRuntimeRx as _w_load_rx_} from "../tmp/main.loader.server.js"
        _w_load_('main')(0)
    `),
    )
})

test('hub onFileChange', async (t: TestContext) => {
    const res1 = await hub.onFileChange(file, () => '')
    t.assert.strictEqual(res1, undefined)
    const poFname = normalizeSep(resolve(tmpDir, 'en.po'))
    const res2 = await hub.onFileChange(poFname, () => '')
    t.assert.deepEqual(res2?.sourceTriggered, false)
    t.assert.partialDeepStrictEqual(
        new Set([normalizeSep(resolve(import.meta.dirname, '../tmp/.wuchale/main.main.en.compiled.js'))]),
        res2?.invalidate,
    )
})

test('hub onFileChange normalizes incoming paths', async (t: TestContext) => {
    const poFname = resolve(tmpDir, 'en.po').replaceAll('/', '\\')
    const res = await hub.onFileChange(poFname, () => '')
    t.assert.deepEqual(res?.sourceTriggered, false)
    t.assert.partialDeepStrictEqual(
        new Set([normalizeSep(resolve(import.meta.dirname, '../tmp/.wuchale/main.main.en.compiled.js'))]),
        res?.invalidate,
    )
})

test('hub transform with hmr', async (t: TestContext) => {
    await hub.init('dev')
    const [output] = await hub.transform(code, file)
    t.assert.strictEqual(
        trimLines(output.code),
        trimLines(ts`
        import {getRuntime as _w_load_hmr_, getRuntimeRx as _w_load_rx_hmr_} from "../tmp/main.loader.js"
        const _w_hmrUpdate_ = {"version":0,"data":{"en":[[0,"Hello"]]}}
        function _w_load_(loadID) {
            const _w_rt_ = _w_load_hmr_(loadID)
            _w_rt_?._?.update?.(_w_hmrUpdate_)
            return _w_rt_
        }
        function _w_load_rx_(loadID) {
            const _w_rt_ = _w_load_rx_hmr_(loadID)
            _w_rt_?._?.update?.(_w_hmrUpdate_)
            return _w_rt_
        }
        _w_load_('main')(0)
    `),
    )
})

test('hub transform still runs in dev when hmr is disabled', async (t: TestContext) => {
    const hubNoHmr = new Hub(
        async () => ({
            ...(await loadConfig()),
            hmr: false,
        }),
        import.meta.dirname,
        0,
        inMemFS,
    )
    await hubNoHmr.init('dev')
    const [output] = await hubNoHmr.transform(code, file)
    t.assert.match(output.code ?? '', /_w_load_\('main'\)\(0\)/)
    t.assert.equal(output.code?.includes('_w_hmrUpdate_'), false)
})

test('hub init resolves generated files against the project root', async (t: TestContext) => {
    const { files, fs } = createFS()
    const rootedHub = new Hub(
        async () => ({
            ...defaultConfig,
            localesDir: 'src/locales',
            adapters: {
                main: {
                    ...baseAdapter,
                    storage: inMemStorage,
                },
            },
        }),
        '/project',
        0,
        fs,
    )
    await rootedHub.init('dev')
    t.assert.strictEqual(files.has('/project/src/locales/data.js'), true)
    t.assert.strictEqual(files.has('/project/src/locales/.wuchale/confUpdate.json'), true)
})

test('hub transform normalizes separators before adapter matching', async (t: TestContext) => {
    const windowsHub = new Hub(
        async () => ({
            ...defaultConfig,
            localesDir: 'src/locales',
            adapters: {
                main: {
                    ...baseAdapter,
                    storage: inMemStorage,
                    files: 'src/**/*.js',
                },
            },
        }),
        '/project',
        0,
        inMemFS,
    )
    await windowsHub.init('dev')
    const [output] = await windowsHub.transform(code, '/project/src\\foo.js')
    t.assert.match(output.code ?? '', /locales\/main\.loader\.js/)
})

test('hub status omits loader files that do not exist', async (t: TestContext) => {
    const missingLoaderFS: FS = {
        write: () => {},
        read: () => '',
        mkdir: () => {},
        exists: () => false,
        remove: () => {},
    }
    const statusHub = new Hub(
        async () => ({
            ...defaultConfig,
            localesDir: 'src/locales',
            adapters: {
                main: {
                    ...baseAdapter,
                    storage: inMemStorage,
                },
            },
        }),
        '/project',
        0,
        missingLoaderFS,
    )
    await statusHub.init('cli')
    const [stat] = await statusHub.status()
    t.assert.strictEqual(stat.loaders, undefined)
})

test('hub handleWatchEvent removes references for deleted source files', async (t: TestContext) => {
    const { files, fs } = createFS()
    const watchHub = new Hub(
        async () => ({
            ...defaultConfig,
            localesDir: 'src/locales',
            adapters: {
                main: {
                    ...baseAdapter,
                    storage: inMemStorage,
                },
            },
        }),
        '/project',
        0,
        fs,
    )
    await watchHub.init('cli')
    files.set('/project/foo.js', code)
    await watchHub.handleWatchEvent('change', 'foo.js')
    let [stat] = await watchHub.status()
    t.assert.strictEqual(stat.storage.own, true)
    if (!stat.storage.own) {
        return
    }
    t.assert.strictEqual(stat.storage.total, 1)
    t.assert.strictEqual(stat.storage.details[0].obsolete, 0)
    files.delete('/project/foo.js')
    await watchHub.handleWatchEvent('unlink', 'foo.js')
    ;[stat] = await watchHub.status()
    t.assert.strictEqual(stat.storage.own, true)
    if (!stat.storage.own) {
        return
    }
    t.assert.strictEqual(stat.storage.total, 1)
    t.assert.strictEqual(stat.storage.details[0].obsolete, 1)
})
