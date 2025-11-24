import { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.alterTable('task', (t) => {
    t.integer('retriesRemaining').notNullable();
  });

export const down = (knex: Knex) =>
  knex.schema.alterTable('task', (t) => {
    t.dropColumn('retriesRemaining');
  });
