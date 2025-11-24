import { Knex } from 'knex';
import dayjs, { Dayjs } from 'dayjs';

export interface Task {
  id?: string;
  description: string;
  toBeProcessedBy: string;
  readinessCheckBy?: string;
  runArgs: object;
  startedAt?: Dayjs;
  completedAt?: Dayjs;
  retriesRemaining?: number;
}

const insert = (db: Knex) => (task: Task) =>
  db
    .insert({
      ...task,
      retriesRemaining: task.retriesRemaining ?? 5,
      createdAt: new Date(),
    })
    .into('task')
    .returning('*')
    .then((r) => r[0]);

const upsert = (db: Knex) => (task: Task) => {
  const insertData: any = {
    ...task,
    retriesRemaining: task.retriesRemaining ?? 5,
    createdAt: new Date(),
  };
  const mergeData: any = {
    ...task,
    updatedAt: new Date(),
  };
  // Only update retriesRemaining in merge if explicitly provided
  if (task.retriesRemaining !== undefined) {
    mergeData.retriesRemaining = task.retriesRemaining;
  }
  return db
    .insert(insertData)
    .into('task')
    .onConflict('id')
    .merge(mergeData)
    .returning('*')
    .then((r) => r[0]);
};

const get =
  (db: Knex) =>
  (id: string): Promise<Task> =>
    db
      .select()
      .from('task')
      .where('id', id)
      .then((r) => (r.length ? r[0] : null));

const getAll = (db: Knex) => () =>
  db.select().from('task').orderBy('createdAt', 'asc');

const clearStartedAt = (db: Knex) => (id: string) =>
  db('task')
    .update({
      startedAt: null,
      completedAt: null,
    })
    .where('id', id);

const markStartedAt = (db: Knex) => (id: string) =>
  db('task')
    .update({
      startedAt: dayjs(),
      completedAt: null,
    })
    .where('id', id)
    .whereNull('startedAt')
    .whereNull('completedAt')
    .returning('*')
    .then((r) => r.length > 0);

const markCompletedAt = (db: Knex) => (id: string) =>
  db('task').update('completedAt', dayjs()).where('id', id);

const decrementRetriesRemaining = (db: Knex) => (id: string) =>
  db('task')
    .where('id', id)
    .where('retriesRemaining', '>', 0)
    .decrement('retriesRemaining', 1)
    .returning('*')
    .then((r) => (r.length > 0 ? r[0] : null));

const getAllAvailableByKey = (db: Knex) => (toBeProcessedBy: string) =>
  db
    .select()
    .from('task')
    .whereNull('startedAt')
    .whereNull('completedAt')
    .where('toBeProcessedBy', toBeProcessedBy)
    .where('retriesRemaining', '>', 0)
    .orderBy('createdAt', 'asc');

export default (db: Knex) => ({
  insert: insert(db),
  upsert: upsert(db),
  get: get(db),
  getAll: getAll(db),
  getAllAvailableByKey: getAllAvailableByKey(db),
  markStartedAt: markStartedAt(db),
  clearStartedAt: clearStartedAt(db),
  markCompletedAt: markCompletedAt(db),
  decrementRetriesRemaining: decrementRetriesRemaining(db),
});
