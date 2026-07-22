function createMemoryStorage(): Storage {
    const entries = new Map<string, string>();

    return {
        get length() {
            return entries.size;
        },
        clear() {
            entries.clear();
        },
        getItem(key: string) {
            return entries.get(key) ?? null;
        },
        key(index: number) {
            return Array.from(entries.keys())[index] ?? null;
        },
        removeItem(key: string) {
            entries.delete(key);
        },
        setItem(key: string, value: string) {
            entries.set(key, value);
        },
    };
}

function exposeStorageGlobal(name: 'localStorage' | 'sessionStorage', storage: Storage): void {
    Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: storage,
    });
}

exposeStorageGlobal('localStorage', createMemoryStorage());
exposeStorageGlobal('sessionStorage', createMemoryStorage());

export {};
