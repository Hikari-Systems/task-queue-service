import express from 'express';
import { v4 } from 'uuid';
import { logging } from '@hikari-systems/hs.utils';

import { taskModel } from '../model';

const log = logging('routes:task');

const router = express.Router();
// const jsonParser = express.json();

router.get('/available/:key', async (req, res, next) => {
  const key = req.params.key as string;
  try {
    const tasks = await taskModel.getAllAvailableByKey(key);
    if (!tasks.length) {
      log.debug(`no available tasks found for ${key}`);
      return res.status(204).end();
    }
    log.debug(`${tasks.length} available tasks found for ${key}`);
    return res.status(200).json(tasks);
  } catch (e) {
    log.error(`Error fetching available tasks for ${key}`, e);
    return next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  const taskId = req.params.id as string;
  if (!taskId) {
    return res.status(400).send(`No taskId provided`);
  }
  try {
    const task = await taskModel.get(taskId);
    if (!task) {
      log.debug(`no task found for id ${taskId}`);
      return res.status(204).end();
    }
    return res.status(200).json(task);
  } catch (e) {
    log.error(`Error fetching task for id ${taskId}`, e);
    return next(e);
  }
});

router.post('/', express.json(), async (req, res, next) => {
  const {
    description,
    toBeProcessedBy,
    readinessCheckBy,
    runArgsJson,
    retriesRemaining,
  } = req.body as {
    description: string;
    toBeProcessedBy: string;
    readinessCheckBy?: string;
    runArgsJson: string;
    retriesRemaining?: number;
  };

  // check args json
  let runArgs: object;
  try {
    runArgs = JSON.parse(runArgsJson);
  } catch (err) {
    log.error(`Invalid JSON requested for task queue: ${runArgsJson}`, err);
    return res
      .status(400)
      .end(`Invalid JSON requested for task queue: ${runArgsJson}`);
  }

  try {
    const task = await taskModel.insert({
      id: v4(),
      description,
      toBeProcessedBy,
      readinessCheckBy,
      runArgs,
      retriesRemaining: retriesRemaining ?? 5,
    });
    return res.status(201).json(task);
  } catch (e) {
    log.error(`Error adding task for ${JSON.stringify(req.body)}`, e);
    return next(e);
  }
});

router.put('/:id/started', express.json(), async (req, res, next) => {
  const taskId = req.params.id as string;
  if (!taskId) {
    return res.status(400).send(`No taskId provided`);
  }

  try {
    const started = await taskModel.markStartedAt(taskId);
    return res.status(200).json({ id: taskId, started });
  } catch (e) {
    log.error(`Error marking task started for ${taskId}`, e);
    return next(e);
  }
});

router.delete('/:id/started', express.json(), async (req, res, next) => {
  const taskId = req.params.id as string;
  if (!taskId) {
    return res.status(400).send(`No taskId provided`);
  }

  try {
    await taskModel.clearStartedAt(taskId);
    return res.status(200).json({ id: taskId, started: false });
  } catch (e) {
    log.error(`Error clearing task started for ${taskId}`, e);
    return next(e);
  }
});

router.put('/:id/completed', express.json(), async (req, res, next) => {
  const taskId = req.params.id as string;
  if (!taskId) {
    return res.status(400).send(`No taskId provided`);
  }

  try {
    await taskModel.markCompletedAt(taskId);
    return res.status(200).json({ id: taskId, completed: true });
  } catch (e) {
    log.error(`Error marking task completed for ${taskId}`, e);
    return next(e);
  }
});

export default router;
