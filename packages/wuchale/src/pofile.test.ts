// $ node --import ../testing/resolve.ts %f

import { access, mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type TestContext, test } from 'node:test'
import { POFile } from './pofile.js'
import { defaultPluralRule, newItem, type Item, type SaveData } from './storage.js'

function makeSaveData(items: Item[]): SaveData {
    return {
        items,
        pluralRules: new Map([
            ['en', defaultPluralRule],
            ['es', defaultPluralRule],
        ]),
    }
}

function makeItem(text: string): Item {
    const item = newItem(
        {
            id: [text],
            references: [{ file: 'src/file.ts', refs: [null, { placeholders: [[0, 'foo: bar; baz']] }] }],
        },
        ['en', 'es'],
    )
    item.translations.set('en', [text])
    item.translations.set('es', ['Hola'])
    return item
}

async function exists(path: string) {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

test('POFile keys use the resolved directory', (t: TestContext) => {
    const common = {
        locales: ['en'],
        root: '/project',
        haveUrl: false,
        sourceLocale: 'en',
        separateUrls: true,
    }
    t.assert.strictEqual(
        new POFile({ ...common, dir: 'src/locales' }).key,
        new POFile({ ...common, dir: './src/locales' }).key,
    )
})

test('POFile round-trips reference metadata', async (t: TestContext) => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-pofile-'))
    try {
        const po = new POFile({
            dir: 'src/locales',
            separateUrls: true,
            locales: ['en', 'es'],
            root,
            haveUrl: true,
            sourceLocale: 'en',
        })
        const item = makeItem('Hello')
        await po.save(makeSaveData([item]))
        const loaded = await po.load()
        t.assert.deepStrictEqual(loaded.items[0].references, item.references)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('POFile loads items without the source locale file', async (t: TestContext) => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-pofile-'))
    try {
        const po = new POFile({
            dir: 'src/locales',
            separateUrls: true,
            locales: ['en', 'es'],
            root,
            haveUrl: true,
            sourceLocale: 'en',
        })
        const item = makeItem('Hello')
        await po.save(makeSaveData([item]))
        await unlink(resolve(root, 'src/locales/en.po'))
        const loaded = await po.load()
        t.assert.deepStrictEqual(loaded.items[0].translations.get('en'), ['Hello'])
        t.assert.deepStrictEqual(loaded.items[0].translations.get('es'), ['Hola'])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('POFile removes stale url catalogs', async (t: TestContext) => {
    const root = await mkdtemp(join(tmpdir(), 'wuchale-pofile-'))
    try {
        const po = new POFile({
            dir: 'src/locales',
            separateUrls: true,
            locales: ['en', 'es'],
            root,
            haveUrl: true,
            sourceLocale: 'en',
        })
        const item = newItem(
            {
                id: ['/items/{0}'],
                urlAdapters: ['test'],
            },
            ['en', 'es'],
        )
        item.translations.set('en', ['/items/{0}'])
        item.translations.set('es', ['/elementos/{0}'])
        await po.save(makeSaveData([item]))
        const urlPath = resolve(root, 'src/locales/es.url.po')
        t.assert.strictEqual(await exists(urlPath), true)
        await po.save(makeSaveData([]))
        t.assert.strictEqual(await exists(urlPath), false)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
