import { Knex } from 'knex';

export interface Task {
  id?: string;
  description: string;
  toBeProcessedBy: string;
  readinessCheckedBy?: string;
  runArgs: object;
  inProgress: boolean;
  completed: boolean;
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

const markInProgress = (db: Knex) => (id: string) =>
  db('task').update('inProgress', true).where('id', id);

const clearInProgress = (db: Knex) => (id: string) =>
  db('task').update('inProgress', false).where('id', id);

const markComplete = (db: Knex) => (id: string) =>
  db('task').update('completed', true).where('id', id);

const getAllAvailableByKey = (db: Knex) => (toBeProcessedBy: string) =>
  db
    .select()
    .from('task')
    .where('completed', false)
    .where('inProgress', false)
    .where('toBeProcessedBy', toBeProcessedBy)
    .orderBy('createdAt', 'asc');

export default (db: Knex) => ({
  insert: insert(db),
  upsert: upsert(db),
  get: get(db),
  getAll: getAll(db),
  getAllAvailableByKey: getAllAvailableByKey(db),
  markInProgress: markInProgress(db),
  clearInProgress: clearInProgress(db),
  markComplete: markComplete(db),
});
