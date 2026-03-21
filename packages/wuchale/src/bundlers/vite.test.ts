// $$ node --import ../../testing/resolve.ts %f

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type TestContext, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { toViteError, trimViteQueries, wuchale } from './vite.js'

const wuchaleDist = pathToFileURL(resolve(import.meta.dirname, '../../src/index.ts')).href
const vanillaDist = pathToFileURL(resolve(import.meta.dirname, '../../src/adapter-vanilla/index.ts')).href

async function createProject() {
    const dir = await mkdtemp(join(tmpdir(), 'wuchale-vite-'))
    await mkdir(join(dir, 'src', 'locales'), { recursive: true })
    await writeFile(
        join(dir, 'wuchale.config.js'),
        [
            `import { defineConfig, pofile } from '${wuchaleDist}'`,
            `import { adapter } from '${vanillaDist}'`,
            'export default defineConfig({',
            `  locales: ['en'],`,
            `  localesDir: 'src/locales',`,
            `  adapters: {`,
            `    main: adapter({ files: 'src/**/*.js', storage: pofile({ dir: 'src/locales' }) }),`,
            `  },`,
            '})',
        ].join('\n'),
    )
    await writeFile(join(dir, 'src', 'locales', 'en.po'), 'msgid ""\nmsgstr ""\n')
    return dir
}

test('vite queries trimmed', async (t: TestContext) => {
    t.assert.strictEqual(trimViteQueries('/foo/bar?v=foo'), '/foo/bar')
    t.assert.strictEqual(trimViteQueries('/foo/bar?t=123'), '/foo/bar')
    t.assert.strictEqual(trimViteQueries('/foo/bar?t=123&css=true'), '/foo/bar?t=123&css=true')
    t.assert.strictEqual(trimViteQueries('/foo/bar?css=true'), '/foo/bar?css=true')
})

test('error correctly formatted', async (t: TestContext) => {
    const e = new Error('boom')
    ;(e as any).frame = '1: <svelte:window />\n   ^'
    t.assert.throws(
        () => toViteError(e, 'bad', 'test.js'),
        (err: any) => {
            t.assert.ok(err instanceof Error)
            t.assert.ok(err.message.startsWith('bad: transform failed for test.js\nboom'))
            t.assert.ok(err.message.includes('<svelte:window />'))
            return true
        },
    )
})

test('vite hot updates ignore internal writes without invalidations', async (t: TestContext) => {
    const dir = await createProject()
    const sends: unknown[] = []
    try {
        const plugin = wuchale(undefined, 0) as any
        await plugin.configResolved({ env: { DEV: true }, root: dir })
        const result = await plugin.handleHotUpdate({
            file: join(dir, 'src', 'locales', '.wuchale', 'confUpdate.json'),
            read: () => '{"hmr":true}',
            timestamp: 0,
            server: {
                ws: { send: (msg: unknown) => sends.push(msg) },
                moduleGraph: {
                    getModulesByFile: () => [],
                    invalidateModule: () => {},
                },
            },
        })
        t.assert.deepStrictEqual(result, [])
        t.assert.deepStrictEqual(sends, [])
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('vite hot updates full reload manual catalog edits', async (t: TestContext) => {
    const dir = await createProject()
    const sends: unknown[] = []
    const invalidated: unknown[] = []
    try {
        const plugin = wuchale(undefined, 0) as any
        await plugin.configResolved({ env: { DEV: true }, root: dir })
        const result = await plugin.handleHotUpdate({
            file: join(dir, 'src', 'locales', 'en.po'),
            read: () => 'msgid ""\nmsgstr ""\n',
            timestamp: 0,
            server: {
                ws: { send: (msg: unknown) => sends.push(msg) },
                moduleGraph: {
                    getModulesByFile: () => ['module'],
                    invalidateModule: (mod: unknown) => invalidated.push(mod),
                },
            },
        })
        t.assert.deepStrictEqual(result, [])
        t.assert.deepStrictEqual(sends, [{ type: 'full-reload' }])
        t.assert.deepStrictEqual(invalidated, ['module'])
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('vite transform wraps hub errors with vite context', async (t: TestContext) => {
    const dir = await createProject()
    try {
        const plugin = wuchale(undefined, 0) as any
        await plugin.configResolved({ env: { DEV: true }, root: dir })
        await t.assert.rejects(
            plugin.transform.handler('function {', join(dir, 'src', 'test.js?v=123')),
            (err: any) => {
                t.assert.ok(err instanceof Error)
                t.assert.ok(err.message.startsWith(`main: transform failed for ${join(dir, 'src', 'test.js')}\n`))
                return true
            },
        )
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})
