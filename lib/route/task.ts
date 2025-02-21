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
    return res.status(400).send(`No threadId provided`);
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
  const { description, toBeProcessedBy, runArgsJson } = req.body as {
    description: string;
    toBeProcessedBy: string;
    runArgsJson: string;
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
      runArgs,
      inProgress: false,
      completed: false,
    });
    return res.status(201).json(task);
  } catch (e) {
    log.error(`Error adding task for ${JSON.stringify(req.body)}`, e);
    return next(e);
  }
});

export default router;
