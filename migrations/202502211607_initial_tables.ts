import { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema
    .createTable('task', (t) => {
      t.uuid('id').primary().notNullable();
      t.string('description', 400).notNullable();
      t.string('toBeProcessedBy', 400).notNullable();
      t.string('readinessCheckBy', 400);
      t.jsonb('runArgs').notNullable();
      t.timestamp('startedAt');
      t.timestamp('completedAt');
      t.timestamps();
    })
    .createTable('taskLog', (t) => {
      t.uuid('id').primary().notNullable();
      t.uuid('taskId').notNullable().references('id').inTable('task');
      t.integer('exitCode');
      t.timestamp('startedAt').notNullable();
      t.timestamp('endedAt');
      t.jsonb('runLog');
      t.timestamps();
    });

export const down = (knex: Knex) =>
  knex.schema.dropTable('taskLog').dropTable('task');
