import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface IDE_DB extends DBSchema {
  files: {
    key: string; // combination of projectId_path
    value: {
      projectId: string;
      path: string;
      content: string;
      updatedAt: number;
    };
    indexes: { 'by-project': string };
  };
  projects: {
    key: string;
    value: {
      id: string;
      name: string;
      updatedAt: number;
    }
  }
}

let dbPromise: Promise<IDBPDatabase<IDE_DB>> | null = null;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<IDE_DB>('ide-abdulah-platform', 1, {
      upgrade(db) {
        const fileStore = db.createObjectStore('files', { keyPath: ['projectId', 'path'] });
        fileStore.createIndex('by-project', 'projectId');
        db.createObjectStore('projects', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function saveLocalFile(projectId: string, path: string, content: string) {
  const db = await getDB();
  await db.put('files', {
    projectId,
    path,
    content,
    updatedAt: Date.now()
  });
}

export async function getLocalFiles(projectId: string) {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-project', projectId);
}

export async function saveLocalProject(id: string, name: string) {
  const db = await getDB();
  await db.put('projects', { id, name, updatedAt: Date.now() });
}

export async function getLocalProjects() {
  const db = await getDB();
  return db.getAll('projects');
}
