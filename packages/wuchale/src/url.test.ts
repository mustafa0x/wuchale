// $ node --import ../testing/resolve.ts %f

import { test } from 'node:test'
import { pathToRegexp } from 'path-to-regexp'
import { patternFromTranslate } from './handler/url.js'
import { URLMatcher } from './url.js'

test('URL matcher', t => {
    const matcher = URLMatcher([['/'], ['/path', ['/path', '/ruta']], ['/*rest', ['/*rest', '/*rest']]], ['en', 'es'])
    t.assert.deepEqual(matcher('/', 'en'), {
        path: '/',
        altPatterns: { en: '/', es: '/' },
        params: {},
    })
    t.assert.deepEqual(matcher('/foo', 'es'), {
        path: '/foo',
        altPatterns: { en: '/*rest', es: '/*rest' },
        params: { rest: 'foo' },
    })
    t.assert.deepEqual(matcher('/ruta', 'es'), {
        path: '/path',
        altPatterns: { en: '/path', es: '/ruta' },
        params: {},
    })
})


test('patternFromTranslate falls back on invalid placeholder indices', t => {
    const { keys } = pathToRegexp('/items/:rest')
    t.assert.strictEqual(patternFromTranslate('/elementos/{1}', keys, '/items/:rest'), '/items/:rest')
})
