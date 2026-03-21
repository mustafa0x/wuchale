// $ node --import ../testing/resolve.ts %f

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type TestContext, test } from 'node:test'
import { deepMergeObjects, defaultConfig, getConfig } from './config.js'

test('Deep merge does not mutate nested defaults', (t: TestContext) => {
    const defaults = {
        runtime: {
            plain: {
                wrapInit: 'plain',
            },
        },
    }

    const custom = deepMergeObjects(
        {
            runtime: {
                plain: {
                    wrapInit: 'custom',
                },
            },
        },
        defaults,
    )

    t.assert.equal(custom.runtime.plain.wrapInit, 'custom')
    t.assert.equal(defaults.runtime.plain.wrapInit, 'plain')
    t.assert.equal(deepMergeObjects({}, defaults).runtime.plain.wrapInit, 'plain')

    deepMergeObjects({ fallback: { es: 'en' } }, defaultConfig)
    t.assert.deepEqual(defaultConfig.fallback, {})
    t.assert.deepEqual(deepMergeObjects({}, defaultConfig).fallback, {})
})

test('getConfig resolves relative to the provided root', async (t: TestContext) => {
    const dir = await mkdtemp(join(tmpdir(), 'wuchale-config-'))
    try {
        await writeFile(join(dir, 'wuchale.config.js'), 'export default { adapters: {} }')
        const config = await getConfig(undefined, dir)
        t.assert.deepEqual(config.locales, ['en'])
        t.assert.deepEqual(config.adapters, {})
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})
