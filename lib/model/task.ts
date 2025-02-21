import { Knex } from 'knex';
import { Dayjs } from 'dayjs';

export interface Task {
  id?: string;
  description: string;
  toBeProcessedBy: string;
  readinessCheckBy?: string;
  runArgs: object;
  startedAt?: Dayjs;
  completedAt?: Dayjs;
}

const insert = (db: Knex) => (task: Task) =>
  db
    .insert({
      ...task,
      createdAt: new Date(),
    })
    .into('task')
    .returning('*')
    .then((r) => r[0]);

const upsert = (db: Knex) => (task: Task) =>
  db
    .insert({
      ...task,
      createdAt: new Date(),
    })
    .into('task')
    .onConflict('id')
    .merge({
      ...task,
      updatedAt: new Date(),
    })
    .returning('*')
    .then((r) => r[0]);

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
      startedAt: new Dayjs(),
      completedAt: null,
    })
    .where('id', id)
    .whereNull('startedAt')
    .whereNull('completedAt')
    .returning('*')
    .then((r) => r.length > 0);

const markCompletedAt = (db: Knex) => (id: string) =>
  db('task').update('completedAt', new Dayjs()).where('id', id);

const getAllAvailableByKey = (db: Knex) => (toBeProcessedBy: string) =>
  db
    .select()
    .from('task')
    .whereNull('startedAt')
    .whereNull('completedAt')
    .where('toBeProcessedBy', toBeProcessedBy)
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
});
