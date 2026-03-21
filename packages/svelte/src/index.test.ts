// $ node --import ../../wuchale/testing/resolve.ts %f

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { IndexTracker, URLHandler } from 'wuchale'
// @ts-expect-error
import { testLoadersExist } from '../../wuchale/testing/utils.ts'
import { defaultFS } from '../../wuchale/src/fs.js'
import { Files } from '../../wuchale/src/handler/files.js'
import { adapter, getDefaultLoaderPath } from './index.js'

const urlHandler = new URLHandler(['en'], 'en', {
    patterns: ['/translated/*rest'],
    localize: true,
})

const transform = (content: string, args = adapter()) =>
    args.transform({
        content,
        filename: 'test.svelte',
        index: new IndexTracker(),
        expr: { plain: '_w_load_()', reactive: '_w_load_rx_()' },
        matchUrl: urlHandler.match,
    })

test('Default loader file paths', async () => {
    await testLoadersExist(['svelte', 'sveltekit', 'bundle'], getDefaultLoaderPath)
})

test('plain Svelte defaults do not treat goto as a URL helper', async t => {
    const result = await transform(`
        <script>
            function goto(x) { return x }
            const path = goto('/translated/hello')
        </script>
    `)
    t.assert.deepEqual(result.msgs, [])
})

test('SvelteKit loader defaults still localize goto calls', async t => {
    const result = await transform(
        `<script>const path = goto('/translated/hello')</script>`,
        adapter({ loader: 'sveltekit' }),
    )
    t.assert.deepEqual(
        result.msgs.map(msg => ({ msgStr: msg.msgStr[0], type: msg.type })),
        [{ msgStr: '/translated/hello', type: 'url' }],
    )
})

test('bundle loader starts from the adapter source locale', async t => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-svelte-bundle-'))
    t.after(async () => {
        await rm(root, { recursive: true, force: true })
    })
    await mkdir(join(root, 'src/locales/.wuchale'), { recursive: true })
    const files = new Files(adapter({ bundleLoad: true, sourceLocale: 'es' }), 'svelte', 'src/locales', defaultFS, root)
    await files.init('svelte', 'es')
    const loader = await readFile(files.loaderPath.client, 'utf8')
    t.assert.match(loader, /let locale = \$state\('es'\)/)
})
