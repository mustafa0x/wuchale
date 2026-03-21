// $ node --import ../../testing/resolve.ts %f

import { type TestContext, test } from 'node:test'
import { testCatalog } from '../../testing/utils.ts'
import { defaultCollection, loadLocaleSync, registerLoaders } from './index.js'
import { loadCatalogs } from './pure.js'
import { loadLocales, runWithLocale } from './server.js'

const loaderFunc = () => testCatalog

test('Loading', async t => {
    const collection = {}
    const getRT = registerLoaders('main', loaderFunc, ['foo'], defaultCollection(collection))
    loadLocaleSync('en')
    t.assert.notEqual(collection['foo'], null) // setCatalogs was called
    const rt = getRT('foo')
    t.assert.equal(rt.l, 'en')
    const cPure = await loadCatalogs('en', ['foo'], loaderFunc)
    t.assert.equal(cPure['foo'].c[0], 'Hello')
})

test('Late loaders inherit the committed locale', async (t: TestContext) => {
    loadLocaleSync('en')

    const syncGetRT = registerLoaders('late-sync', () => testCatalog, ['foo'])
    t.assert.equal(syncGetRT('foo').l, 'en')
    t.assert.equal(syncGetRT('foo')(0), 'Hello')

    const asyncGetRT = registerLoaders('late-async', async () => testCatalog, ['bar'])
    await new Promise(resolve => setTimeout(resolve, 0))
    t.assert.equal(asyncGetRT('bar').l, 'en')
    t.assert.equal(asyncGetRT('bar')(0), 'Hello')
})

test('Loading server side', async t => {
    const getRT = await loadLocales('main', ['main'], _ => testCatalog, ['en'])
    const msg = await runWithLocale('en', () => {
        return getRT('main')(1, ['server user'])
    })
    t.assert.equal(msg, 'Hello server user!')
})
