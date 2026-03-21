// $ node --import ../testing/resolve.ts %f

import { type TestContext, test } from 'node:test'
import { testCatalog } from '../testing/utils.ts'
import toRuntime from './runtime.js'

function taggedHandler(msgs: TemplateStringsArray, ...args: any[]) {
    return msgs.join('_') + args.join('_')
}

test('Tagged template strings preserve empty fragments and raw', (t: TestContext) => {
    const rt = toRuntime(
        {
            c: [
                ['A ', 0, 1, ' B'],
                [0, 1],
            ],
        },
        'en',
    )

    let seen: TemplateStringsArray | null = null
    const result = rt.t((strings: TemplateStringsArray, ...args: any[]) => {
        seen = strings
        return args.join('|')
    }, 0, ['x', 'y'])

    t.assert.equal(result, 'x|y')
    t.assert.deepEqual(Array.from(seen ?? []), ['A ', '', ' B'])
    t.assert.deepEqual((seen as unknown as TemplateStringsArray).raw, ['A ', '', ' B'])
    t.assert.equal(rt.t(String.raw, 0, ['x', 'y']), 'A xy B')
    t.assert.equal(rt.t(String.raw, 1, ['x', 'y']), 'xy')
})

test('Runtime', t => {
    const rt = toRuntime(testCatalog, 'en')
    t.assert.equal(rt.l, 'en')
    t.assert.equal(rt(0), 'Hello')
    t.assert.equal(rt(1, ['User']), 'Hello User!')
    t.assert.deepEqual(rt.p(2), ['One item', '# items'])
    t.assert.equal(rt.t(taggedHandler, 1, [3]), taggedHandler`Hello ${3}!`)
    t.assert.equal(rt.t(taggedHandler, 3, [3]), taggedHandler`Hello ${3}`)
})
