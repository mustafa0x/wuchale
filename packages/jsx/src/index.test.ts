// $ node --import ../../wuchale/testing/resolve.ts %f

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error
import { testLoadersExist } from '../../wuchale/testing/utils.ts'
import { getDefaultLoaderPath } from './index.js'

test('Default loader file paths', async () => {
    await testLoadersExist(['default', 'react', 'solidjs'], getDefaultLoaderPath)
})


test('default JSX loader delegates to the vanilla vite loader in non-bundle mode', async t => {
    const source = await readFile(resolve(import.meta.dirname, 'index.ts'), 'utf8')
    t.assert.match(source, /getDefaultLoaderPathVanilla\('vite', bundle\)/)
})

test('solid bundle loader initializes from generated locale data', async t => {
    const source = await readFile(resolve(import.meta.dirname, 'loaders/solidjs.bundle.js'), 'utf8')
    t.assert.match(source, /import \{ locales \} from '\$\{DATA\}'/)
    t.assert.match(source, /createSignal\(locales\[0\]\)/)
})
