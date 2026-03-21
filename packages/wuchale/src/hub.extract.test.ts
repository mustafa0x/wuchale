// $ node --import ../testing/resolve.ts %f

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import type { Adapter } from './adapters.js'
import { defaultGenerateLoadID, newMessage } from './adapters.js'
import { defaultConfig } from './config.js'
import { Hub } from './hub.js'

const runtime = {
    initReactive: () => false,
    useReactive: false,
    plain: {
        wrapInit: (expr: string) => expr,
        wrapUse: (expr: string) => expr,
    },
    reactive: {
        wrapInit: (expr: string) => expr,
        wrapUse: (expr: string) => expr,
    },
}

test('directVisit recompiles generated files after CLI extraction', async t => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-direct-'))
    t.after(async () => {
        await rm(root, { recursive: true, force: true })
    })
    await writeFile(resolve(root, 'foo.js'), 'export const x = 1')
    const adapter: Adapter = {
        files: '*.js',
        storage: () => {
            let stored = { items: [], pluralRules: new Map() }
            return {
                key: 'mem',
                load: async () => stored,
                save: async data => {
                    stored = data
                },
                files: [],
            }
        },
        granularLoad: true,
        bundleLoad: false,
        generateLoadID: defaultGenerateLoadID,
        runtime,
        transform: ({ expr, index }) => ({
            msgs: [newMessage({ msgStr: ['Hello'] })],
            output: header => ({
                code: `${header}
${expr.plain}(${index.get('Hello')})`,
                map: [],
            }),
        }),
        loaderExts: ['.js'],
        defaultLoaderPath: null,
    }
    const hub = new Hub(
        async () => ({
            ...defaultConfig,
            localesDir: 'src/locales',
            adapters: { main: adapter },
        }),
        root,
    )
    await hub.init('cli')
    const compiledPath = resolve(root, 'src/locales/.wuchale/main.main.en.compiled.js')
    const proxyPath = resolve(root, 'src/locales/.wuchale/main.proxy.js')
    t.assert.match(await readFile(compiledPath, 'utf8'), /export let c = \[\]/)
    t.assert.match(await readFile(proxyPath, 'utf8'), /export const loadIDs = \[\]/)
    await hub.directVisit(false, false, true)
    t.assert.match(await readFile(compiledPath, 'utf8'), /Hello/)
    t.assert.match(await readFile(proxyPath, 'utf8'), /foo_2e_js/)
})
