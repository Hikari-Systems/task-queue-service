import { Knex } from 'knex';
import { Dayjs } from 'dayjs';

export interface TaskLog {
  id: string;
  taskId: string;
  exitCode?: number;
  startedAt: Dayjs;
  endedAt?: Dayjs;
  runLog?: object;
}

const insert = (db: Knex) => (taskLog: TaskLog) =>
  db
    .insert({ ...taskLog, createdAt: new Date() })
    .into('taskLog')
    .returning('*')
    .then((r) => r[0]);

const update = (db: Knex) => (taskLog: TaskLog) =>
  db('taskLog')
    .update({ ...taskLog, updatedAt: new Date() })
    .where('id', taskLog.id)
    .returning('*')
    .then((r) => r[0]);

const get =
  (db: Knex) =>
  (id: string): Promise<TaskLog> =>
    db
      .select()
      .from('taskLog')
      .where('id', id)
      .then((r) => (r.length ? r[0] : null));

const getAll = (db: Knex) => () =>
  db.select().from('taskLog').orderBy('createdAt', 'asc');

const getAllByTaskId = (db: Knex) => (taskId: string) =>
  db
    .select()
    .from('taskLog')
    .where('taskId', taskId)
    .orderBy('createdAt', 'asc');

const del = (db: Knex) => (id: string) => db.del().where('id', id);

export default (db: Knex) => ({
  insert: insert(db),
  update: update(db),
  get: get(db),
  getAll: getAll(db),
  getAllByTaskId: getAllByTaskId(db),
  del: del(db),
});
