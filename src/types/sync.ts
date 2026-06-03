// ...existing code...

export type EntityRecord = {
  id: string;
  data: Record<string, unknown>;
  rev: number;
  updatedAt: number; // milliseconds since epoch
};

export type ChangeType = 'create' | 'update' | 'delete';

export type ChangeRecord = {
  id?: number; // assigned by storage adapter
  entityId: string;
  type: ChangeType;
  data?: Record<string, unknown>;
  rev?: number;
  createdAt: number;
  applied?: boolean;
};

export type SyncStatus = {
  lastSyncAt?: number;
  pendingChanges: number;
  running: boolean;
};

export type SyncResult = {
  pushed: number;
  pulled: number;
  conflicts: Array<{ change: ChangeRecord; reason: string }>;
  errors?: any[];
};

export enum StorageErrorCode {
  DB_OPEN_FAILED = 'DB_OPEN_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export enum SyncErrorCode {
  NETWORK_FAILED = 'NETWORK_FAILED',
  CONFLICT = 'CONFLICT',
  STORAGE_FAILED = 'STORAGE_FAILED',
}

export interface StorageAdapter {
  open(): Promise<void>;
  close(): Promise<void>;
  get(entityId: string): Promise<EntityRecord | null>;
  put(entity: EntityRecord): Promise<void>;
  delete(entityId: string): Promise<void>;
  addChange(change: ChangeRecord): Promise<number>;
  getPendingChanges(limit?: number): Promise<ChangeRecord[]>;
  markChangeApplied(changeId: number): Promise<void>;
  runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface RemoteClient {
  push(changes: ChangeRecord[]): Promise<{ successIds: number[]; conflicts?: Array<{ changeId: number; reason: string }> }>;
  pull(since?: number): Promise<{ changes: ChangeRecord[]; lastAt?: number }>;
}

export interface SyncEngineOptions {
  pullIntervalMs?: number;
  batchSize?: number;
  remote?: RemoteClient;
}

export interface SyncEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueueLocalChange(change: ChangeRecord): Promise<void>;
  pushPending(): Promise<SyncResult>;
  pullRemote(since?: number): Promise<SyncResult>;
  getStatus(): SyncStatus;
  on(event: 'sync' | 'error' | 'status', cb: (payload?: any) => void): void;
  off(event: 'sync' | 'error' | 'status', cb: (payload?: any) => void): void;
}

// ...existing code...
