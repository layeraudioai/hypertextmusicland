const DB_NAME = 'AuraVisionAudioDB';
const STORE_NAME = 'audioBuffers';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioData(id: string, data: ArrayBuffer) {
  console.log(`[Persistence] Saving ${data.byteLength} bytes to IndexedDB for ID: ${id}`);
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(data, id);
    transaction.oncomplete = () => {
      console.log(`[Persistence] Successfully saved ID: ${id}`);
      resolve();
    };
    transaction.onerror = () => {
      console.error(`[Persistence] Error saving ID: ${id}`, transaction.error);
      reject(transaction.error);
    };
  });
}

export async function getAudioData(id: string): Promise<ArrayBuffer | undefined> {
  console.log(`[Persistence] Attempting to retrieve ID: ${id} from IndexedDB`);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      if (request.result) {
        console.log(`[Persistence] Found ID: ${id} (${request.result.byteLength} bytes)`);
      } else {
        console.log(`[Persistence] ID: ${id} not found in IndexedDB`);
      }
      resolve(request.result);
    };
    request.onerror = () => {
      console.error(`[Persistence] Error retrieving ID: ${id}`, request.error);
      reject(request.error);
    };
  });
}

export async function deleteAudioData(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
