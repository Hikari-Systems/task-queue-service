import { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema
    .createTable('task', (t) => {
      t.uuid('id').primary().notNullable();
      t.string('description', 400).notNullable();
      t.string('toBeProcessedBy', 400).notNullable();
      t.string('readinessCheckedBy', 400);
      t.jsonb('runArgs').notNullable();
      t.boolean('inProgress').notNullable().defaultTo(false);
      t.boolean('completed').notNullable().defaultTo(false);
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
