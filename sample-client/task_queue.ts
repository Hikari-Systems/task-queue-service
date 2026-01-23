import { config, logging } from '@hikari-systems/hs.utils';
import { DateTime } from 'luxon';
import { Task, TaskLog } from './types';
import { convertTaskLogDates } from './date-utils';

const log = logging('resolver:task-queue');

const taskQueueServiceBaseUrl = config.get('task-queue-service:url');
const taskQueueServiceApiKey = config.get('task-queue-service:apiKey');

export const getAvailableTasksByKey = async (
  toBeProcessedBy: string,
): Promise<Task[]> => {
  try {
    const response = await fetch(
      `${taskQueueServiceBaseUrl}/api/task/available/${encodeURIComponent(
        toBeProcessedBy,
      )}`,
      {
        headers: {
          'X-API-Key': taskQueueServiceApiKey,
        },
      },
    );
    if (response.status === 204) {
      return [];
    }
    if (response.ok) {
      const tasks = await response.json();
      return tasks as Task[];
    }
    throw new Error(
      `Error getting available tasks (${toBeProcessedBy}): ${response.status}`,
    );
  } catch (err) {
    log.error(`Error getting tasks (${toBeProcessedBy})`, err);
    throw err;
  }
};

export const addTask = async (
  description: string,
  toBeProcessedBy: string,
  runArgs: object,
): Promise<Task> => {
  try {
    const response = await fetch(`${taskQueueServiceBaseUrl}/api/task`, {
      method: 'POST',
      body: JSON.stringify({
        description,
        toBeProcessedBy,
        runArgsJson: JSON.stringify(runArgs),
      }),
      headers: {
        'Content-type': 'application/json',
        'X-API-Key': taskQueueServiceApiKey,
      },
    });
    if (response.ok) {
      const task = await response.json();
      return task as Task;
    }
    throw new Error(`Error adding task: ${response.status}`);
  } catch (err) {
    log.error(
      `Error adding task: body=${JSON.stringify({
        description,
        toBeProcessedBy,
        runArgsJson: JSON.stringify(runArgs),
      })}`,
      err,
    );
    throw err;
  }
};

export const addTaskLog = async (
  taskId: string,
  exitCode: number,
  runLog: string[],
  startedAt: Date,
  endedAt: Date,
): Promise<TaskLog> => {
  try {
    const response = await fetch(`${taskQueueServiceBaseUrl}/api/taskLog`, {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        exitCode,
        runLog: JSON.stringify(runLog),
        startedAt: DateTime.fromJSDate(startedAt).toISO(),
        endedAt: DateTime.fromJSDate(endedAt).toISO(),
      }),
      headers: {
        'Content-type': 'application/json',
        'X-API-Key': taskQueueServiceApiKey,
      },
    });
    if (response.ok) {
      const taskLog = await response.json();
      return convertTaskLogDates(taskLog) as TaskLog;
    }
    throw new Error(`Error adding task: ${response.status}`);
  } catch (err) {
    log.error(
      `Error adding task log: body=${JSON.stringify({
        taskId,
        exitCode,
        runLog,
        startedAt,
        endedAt,
      })}`,
      err,
    );
    throw err;
  }
};

export const markTaskAsStarted = async (taskId: string): Promise<boolean> => {
  try {
    const response = await fetch(
      `${taskQueueServiceBaseUrl}/api/task/${encodeURIComponent(
        taskId,
      )}/started`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': taskQueueServiceApiKey,
        },
      },
    );
    if (response.ok) {
      const { started } = (await response.json()) as { started: boolean };
      return started;
    }
    throw new Error(`Error marking task ${taskId} started: ${response.status}`);
  } catch (err) {
    log.error(`Error marking task ${taskId} started`, err);
    throw err;
  }
};

export const clearTaskStarted = async (taskId: string): Promise<void> => {
  try {
    const response = await fetch(
      `${taskQueueServiceBaseUrl}/api/task/${encodeURIComponent(
        taskId,
      )}/started`,
      {
        method: 'DELETE',
        headers: {
          'X-API-Key': taskQueueServiceApiKey,
        },
      },
    );
    if (response.ok) {
      return;
    }
    throw new Error(
      `Error clearing task ${taskId} started: ${response.status}`,
    );
  } catch (err) {
    log.error(`Error clearing task ${taskId} started`, err);
    throw err;
  }
};

export const markTaskAsCompleted = async (taskId: string): Promise<boolean> => {
  try {
    const response = await fetch(
      `${taskQueueServiceBaseUrl}/api/task/${encodeURIComponent(
        taskId,
      )}/completed`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': taskQueueServiceApiKey,
        },
      },
    );
    if (response.ok) {
      return true;
    }
    throw new Error(
      `Error marking task ${taskId} completed: ${response.status}`,
    );
  } catch (err) {
    log.error(`Error marking task ${taskId} completed`, err);
    throw err;
  }
};
