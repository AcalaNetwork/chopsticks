import 'reflect-metadata'

export const openDb = async (dbPath: string) => {
  if (typeof window === 'undefined') {
    return (await import('./node')).openDb(dbPath)
  } else {
    return (await import('./browser')).openDb(dbPath)
  }
}
