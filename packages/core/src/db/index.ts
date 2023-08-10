export const openDb = async (dbPath: string | URL) => {
  if (dbPath instanceof URL) {
    return (await import('./browser')).openDb(dbPath)
  } else {
    return (await import('./node')).openDb(dbPath)
  }
}
