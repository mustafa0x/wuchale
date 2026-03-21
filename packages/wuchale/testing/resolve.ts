/**
 * This is for use when testing, importing local source paths as .js
 * Use it like:
 *  node --experimental-transform-types --import ./resolve.ts --test src tests
 */

import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const thisDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = pathResolve(thisDir, '../../..')

const workspaceImports = {
    wuchale: 'packages/wuchale/src/index.ts',
    'wuchale/adapter-vanilla': 'packages/wuchale/src/adapter-vanilla/index.ts',
    'wuchale/runtime': 'packages/wuchale/src/runtime.ts',
    'wuchale/adapter-utils': 'packages/wuchale/src/adapter-utils/index.ts',
    'wuchale/load-utils': 'packages/wuchale/src/load-utils/index.ts',
    'wuchale/load-utils/server': 'packages/wuchale/src/load-utils/server.ts',
    'wuchale/vite': 'packages/wuchale/src/bundlers/vite.ts',
    'wuchale/url': 'packages/wuchale/src/url.ts',
    '@wuchale/astro': 'packages/astro/src/index.ts',
    '@wuchale/astro/runtime.js': 'packages/astro/src/runtime.js',
    '@wuchale/jsx': 'packages/jsx/src/index.ts',
    '@wuchale/jsx/runtime.jsx': 'packages/jsx/src/runtime.jsx',
    '@wuchale/jsx/runtime.solid.jsx': 'packages/jsx/src/runtime.solid.jsx',
    '@wuchale/svelte': 'packages/svelte/src/index.ts',
    '@wuchale/svelte/runtime.svelte': 'packages/svelte/src/runtime.svelte',
} as const

const localExtensions = ['.ts', '.js', '.jsx', '.svelte']

const normalizeSep = (path: string) => path.replaceAll('\\', '/')
const isWorkspaceSource = (path: string) => {
    const normalized = normalizeSep(path)
    return normalized.includes('/packages/') && (normalized.includes('/src/') || normalized.includes('/testing/'))
}

function resolveLocalSource(path: string) {
    if (existsSync(path)) {
        return path
    }
    const extIndex = path.lastIndexOf('.')
    const stem = extIndex >= 0 ? path.slice(0, extIndex) : path
    for (const ext of localExtensions) {
        const candidate = `${stem}${ext}`
        if (existsSync(candidate)) {
            return candidate
        }
    }
    for (const ext of localExtensions) {
        const candidate = pathResolve(path, `index${ext}`)
        if (existsSync(candidate)) {
            return candidate
        }
    }
}

registerHooks({
    resolve: (specifier, context, nextResolve) => {
        const mapped = workspaceImports[specifier]
        if (mapped) {
            return nextResolve(pathToFileURL(pathResolve(repoRoot, mapped)).href, context)
        }
        const { parentURL } = context
        if (parentURL && specifier.startsWith('.')) {
            const parentPath = fileURLToPath(parentURL)
            if (isWorkspaceSource(parentPath)) {
                const localPath = resolveLocalSource(pathResolve(dirname(parentPath), specifier))
                if (localPath) {
                    return nextResolve(pathToFileURL(localPath).href, context)
                }
            }
        }
        return nextResolve(specifier, context)
    },
})
