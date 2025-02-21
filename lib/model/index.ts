import { knex, Knex } from 'knex';
import knexFile from '../knexfile';
import task from './task';
import taskLog from './task_log';

const db: Knex = knex(knexFile.main);

export const healthcheck = () => db.select().from('knex_migrations').limit(1);

export const shutdown = () => db.destroy();

export const taskModel = task(db);
export const taskLogModel = taskLog(db);
