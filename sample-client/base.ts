// import { logging } from '@hikari-systems/hs.utils';
import { EventEmitter } from 'stream';
import { logging } from '@hikari-systems/hs.utils';
import BluebirdPromise from 'bluebird';
import { DateTime } from 'luxon';

import {
  getAvailableTasksByKey,
  addTaskLog,
  markTaskAsStarted,
  clearTaskStarted,
  markTaskAsCompleted,
} from './task_queue';
import { Task } from './types';

const log = logging('tasks:base');

export const doTaskRunOnAllAvailable = async (
  key: string,
  doReadinessCheck: (taskId: string, args: any) => Promise<boolean>,
  doTask: (taskId: string, args: any, ee: EventEmitter) => Promise<void>,
): Promise<void> => {
  const tasks = await getAvailableTasksByKey(key);
  await BluebirdPromise.map(
    tasks,
    async (taskToCheck: Task) => {
      const ready = await doReadinessCheck(taskToCheck.id, taskToCheck.runArgs);
      if (!ready) {
        log.debug(
          `Skipping task ${taskToCheck.id} for ${key} as it didn't pass readiness check`,
        );
      } else {
        // random delay
        await BluebirdPromise.delay(5);
        // mark as started and verify the lock
        const started = await markTaskAsStarted(taskToCheck.id);
        if (started) {
          const startedAt = DateTime.now().toJSDate();
          const runLog: string[] = [];
          let exitCode = -1;
          const eventEmitter = new EventEmitter();
          eventEmitter.on('log', (msg) => runLog.push(msg));
          eventEmitter.on('finish', (code) => {
            exitCode = code;
          });
          eventEmitter.on('error', (err: Error) => {
            runLog.push(`ERROR: ${err.toString()}`);
            exitCode = 1;
          });
          try {
            await doTask(taskToCheck.id, taskToCheck.runArgs, eventEmitter);
            if (exitCode === 0 || exitCode === -1) {
              runLog.push(`SUCCESS: task completed`);
              await markTaskAsCompleted(taskToCheck.id);
            } else {
              await clearTaskStarted(taskToCheck.id);
            }
          } catch (err: any) {
            runLog.push(`ERROR: task aborted - ${err.toString()}`);
            if (exitCode === -1) {
              exitCode = 1;
            }
            await clearTaskStarted(taskToCheck.id);
          } finally {
            // write out the logLines to the task
            await addTaskLog(
              taskToCheck.id,
              exitCode,
              runLog,
              startedAt,
              DateTime.now().toJSDate(),
            );
          }
        } else {
          log.warn(
            `Skipping task ${taskToCheck.id} for ${key} as it has already been started somewhere else`,
          );
        }
      }
    },
    { concurrency: 1 },
  );
};

export const doLoopedTaskRun = async (
  key: string,
  doReadinessCheck: (taskId: string, args: any) => Promise<boolean>,
  doTask: (taskId: string, args: any, ee: EventEmitter) => Promise<void>,
  loopRuns = 0,
  medianDelay = 60.0,
  varianceInDelay = 5.0, // in case we have multiple instances overlapping
): Promise<void> => {
  const runIteration = async (currentRun: number): Promise<void> => {
    if (loopRuns >= 0 && currentRun >= loopRuns) {
      log.debug(`Task loop ${key} completed at ${loopRuns} iterations`);
      return Promise.resolve();
    }

    const delay =
      medianDelay +
      -varianceInDelay +
      parseFloat((Math.random() * 2 * varianceInDelay).toFixed(1));

    log.debug(
      `Starting ${key} run #${currentRun + 1}${loopRuns > 0 ? ` of ${loopRuns}` : ''}`,
    );
    await doTaskRunOnAllAvailable(key, doReadinessCheck, doTask);
    log.debug(`Waiting ${delay}s for next iteration of ${key} task`);
    await BluebirdPromise.delay(delay * 1000);

    // Tail recursive call
    return runIteration(currentRun + 1);
  };

  return runIteration(0);
};
