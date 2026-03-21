import toRuntime, { type CatalogModule, type Runtime } from '../runtime.js'

export type LoaderFunc = (loadID: string, locale: string) => CatalogModule | Promise<CatalogModule>

export type RuntimeCollection = {
    get: (loadID: string) => Runtime
    set: (loadID: string, catalog: Runtime) => void
}

export type LoaderState = {
    load: LoaderFunc
    catalogs: { [loadID: string]: CatalogModule | undefined }
    collection: RuntimeCollection
}

export function defaultCollection(store: Record<string, Runtime>): RuntimeCollection {
    return {
        get: loadID => store[loadID],
        set: (loadID, rt) => {
            store[loadID] = rt
        },
    }
}

/** Global catalog states registry */
const states: Record<string, LoaderState> = {}
let currentLocale: string | undefined
const emptyRuntime = toRuntime()

function setRuntime(state: LoaderState, loadID: string, catalog: CatalogModule | undefined, locale = currentLocale) {
    state.catalogs[loadID] = catalog
    state.collection.set(loadID, toRuntime(catalog, locale))
}

/**
 * - `key` is a unique identifier for the group
 * - `loadIDs` and `load` MUST be imported from the loader virtual modules or proxies.
 */
export function registerLoaders(
    key: string,
    load: LoaderFunc,
    loadIDs: string[],
    collection?: RuntimeCollection,
): (fileID: string) => Runtime {
    const state = {
        load,
        catalogs: Object.fromEntries(loadIDs.map(id => [id])),
        collection: collection ?? defaultCollection({}),
    }
    states[key] = state
    for (const id of loadIDs) {
        state.collection.set(id, currentLocale ? toRuntime(undefined, currentLocale) : emptyRuntime)
    }
    if (currentLocale) {
        for (const loadID of loadIDs) {
            const locale = currentLocale
            const loaded = state.load(loadID, locale)
            if (loaded instanceof Promise) {
                void loaded.then(catalog => {
                    if (currentLocale !== locale) {
                        return
                    }
                    setRuntime(state, loadID, catalog, locale)
                })
                continue
            }
            setRuntime(state, loadID, loaded, locale)
        }
    }
    return loadID => states[key].collection.get(loadID)
}

/* Sets the most recently loaded locale as the current one */
export function commitLocale(locale: string) {
    currentLocale = locale
    for (const state of Object.values(states)) {
        for (const [loadID, catalog] of Object.entries(state.catalogs)) {
            state.collection.set(loadID, toRuntime(catalog, locale))
        }
    }
}

/**
 * Loads catalogs using registered async loaders.
 * Can be called anywhere you want to set the locale.
 * `commit` can be `false` if you want to delay the rendering, use `commitLocale` later
 */
export async function loadLocale(locale: string, commit = true): Promise<void> {
    const promises: Promise<CatalogModule>[] = []
    const statesArr: [string, LoaderState][] = []
    for (const state of Object.values(states)) {
        for (const loadID of Object.keys(state.catalogs)) {
            promises.push(state.load(loadID, locale) as Promise<CatalogModule>)
            statesArr.push([loadID, state])
        }
    }
    for (const [i, loaded] of (await Promise.all(promises)).entries()) {
        const [loadID, state] = statesArr[i]
        state.catalogs[loadID] = loaded
    }
    commit && commitLocale(locale)
}

/**
 * Loads catalogs using registered sync loaders.
 * Can be called anywhere you want to set the locale.
 * The loadCatalog function should be from a sync proxy.
 * `commit` can be `false` if you want to delay the rendering, use `commitLocale` later
 */
export function loadLocaleSync(locale: string, commit = true) {
    for (const state of Object.values(states)) {
        for (const loadID of Object.keys(state.catalogs)) {
            state.catalogs[loadID] = state.load(loadID, locale) as CatalogModule
        }
    }
    commit && commitLocale(locale)
}
