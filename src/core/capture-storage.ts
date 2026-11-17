const DATABASE_NAME = 'chatrange-captures';
const DATABASE_VERSION = 1;
const CAPTURE_STORE_NAME = 'captures';

const CAPTURE_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface StoredCapture {
  captureId: string;
  createdAt: number;
  expiresAt: number;
  width: number;
  height: number;
  mimeType: 'image/png';
  blob: Blob;
}

export interface SaveCaptureInput {
  captureId: string;
  width: number;
  height: number;
  blob: Blob;
}

function createRequestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));

    request.addEventListener('error', () => {
      reject(request.error ?? new Error('An IndexedDB request failed.'));
    });
  });
}

function createTransactionPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());

    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('The IndexedDB transaction was aborted.'));
    });

    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('The IndexedDB transaction failed.'));
    });
  });
}

async function openCaptureDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.addEventListener('upgradeneeded', () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(CAPTURE_STORE_NAME)) {
      const captureStore = database.createObjectStore(CAPTURE_STORE_NAME, {
        keyPath: 'captureId',
      });

      captureStore.createIndex('expiresAt', 'expiresAt', {
        unique: false,
      });
    }
  });

  return await createRequestPromise(request);
}

export async function saveCapture(input: SaveCaptureInput): Promise<StoredCapture> {
  const database = await openCaptureDatabase();

  try {
    const createdAt = Date.now();

    const capture: StoredCapture = {
      captureId: input.captureId,
      createdAt,
      expiresAt: createdAt + CAPTURE_TTL_MILLISECONDS,
      width: input.width,
      height: input.height,
      mimeType: 'image/png',
      blob: input.blob,
    };

    const transaction = database.transaction(CAPTURE_STORE_NAME, 'readwrite');

    transaction.objectStore(CAPTURE_STORE_NAME).put(capture);

    await createTransactionPromise(transaction);

    return capture;
  } finally {
    database.close();
  }
}

export async function getCapture(captureId: string): Promise<StoredCapture | undefined> {
  const database = await openCaptureDatabase();

  try {
    const transaction = database.transaction(CAPTURE_STORE_NAME, 'readonly');

    const request = transaction.objectStore(CAPTURE_STORE_NAME).get(captureId);

    const capture = (await createRequestPromise(request)) as StoredCapture | undefined;

    await createTransactionPromise(transaction);

    return capture;
  } finally {
    database.close();
  }
}

export async function deleteCapture(captureId: string): Promise<void> {
  const database = await openCaptureDatabase();

  try {
    const transaction = database.transaction(CAPTURE_STORE_NAME, 'readwrite');

    transaction.objectStore(CAPTURE_STORE_NAME).delete(captureId);

    await createTransactionPromise(transaction);
  } finally {
    database.close();
  }
}

export async function deleteExpiredCaptures(now = Date.now()): Promise<number> {
  const database = await openCaptureDatabase();

  try {
    const transaction = database.transaction(CAPTURE_STORE_NAME, 'readwrite');

    const store = transaction.objectStore(CAPTURE_STORE_NAME);

    const index = store.index('expiresAt');

    const range = IDBKeyRange.upperBound(now);

    const request = index.openCursor(range);

    let deletedCount = 0;

    await new Promise<void>((resolve, reject) => {
      request.addEventListener('success', () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        cursor.delete();
        deletedCount += 1;
        cursor.continue();
      });

      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Expired capture cleanup failed.'));
      });
    });

    await createTransactionPromise(transaction);

    return deletedCount;
  } finally {
    database.close();
  }
}
