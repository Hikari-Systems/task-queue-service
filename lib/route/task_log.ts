import express from 'express';
import { v4 } from 'uuid';
import dayjs from 'dayjs';
import { logging } from '@hikari-systems/hs.utils';
import { taskLogModel, taskModel } from '../model';

const log = logging('routes:task_log');

const router = express.Router();
// const jsonParser = express.json();

router.get('/byTaskId/:taskId', async (req, res, next) => {
  const taskId = req.params.taskId as string;
  if (!taskId) {
    return res.status(400).send(`No taskId provided`);
  }
  try {
    const tasklogs = await taskLogModel.getAllByTaskId(taskId);
    if (!tasklogs) {
      log.debug(`no tasklogs found for taskId ${taskId}`);
      return res.status(200).json([]);
    }
    return res.status(200).json(tasklogs);
  } catch (e) {
    log.error(`Error fetching tasklogs for taskId ${taskId}`, e);
    return next(e);
  }
});

router.post('/', express.json(), async (req, res, next) => {
  const { taskId, exitCode, startedAt, endedAt, runLog } = req.body as {
    taskId: string;
    exitCode?: string;
    startedAt: string;
    endedAt?: string;
    runLog?: string;
  };
  try {
    const parsedExitCode =
      (exitCode || '') !== '' ? parseInt(exitCode || '', 10) : undefined;
    const tasklog = await taskLogModel.insert({
      id: v4(),
      taskId,
      exitCode: parsedExitCode,
      startedAt: dayjs(startedAt),
      endedAt: (endedAt || '') !== '' ? dayjs(endedAt || '') : undefined,
      runLog: (runLog || '') !== '' ? JSON.parse(runLog || '') : undefined,
    });
    // Decrement retries if task failed (non-zero exit code)
    if (parsedExitCode !== undefined && parsedExitCode !== 0) {
      await taskModel.decrementRetriesRemaining(taskId);
    }
    return res.status(201).json(tasklog);
  } catch (e) {
    log.error(`Error adding tasklog for ${JSON.stringify(req.body)}`, e);
    return next(e);
  }
});

router.put('/:id', express.json(), async (req, res, next) => {
  const id = req.params.id as string;
  const { exitCode, endedAt, runLog } = req.body as {
    exitCode?: string;
    endedAt?: string;
    runLog?: string;
  };
  try {
    // get the original
    const oldLog = await taskLogModel.get(id);
    if (!oldLog) {
      log.error(`Updating non-existent tasklog row: ${id}`);
      return res.status(400).send(`Updating non-existent tasklog row: ${id}`);
    }
    const parsedExitCode =
      (exitCode || '') !== '' ? parseInt(exitCode || '', 10) : undefined;
    const oldExitCode = oldLog.exitCode;
    const tasklog = await taskLogModel.update({
      ...oldLog,
      exitCode: parsedExitCode,
      endedAt: (endedAt || '') !== '' ? dayjs(endedAt || '') : undefined,
      runLog: (runLog || '') !== '' ? JSON.parse(runLog || '') : undefined,
    });
    // Decrement retries if task failed (non-zero exit code) and wasn't already failed
    if (
      parsedExitCode !== undefined &&
      parsedExitCode !== 0 &&
      (oldExitCode === undefined || oldExitCode === 0)
    ) {
      await taskModel.decrementRetriesRemaining(oldLog.taskId);
    }
    return res.status(201).json(tasklog);
  } catch (e) {
    log.error(`Error updating tasklog for ${JSON.stringify(req.body)}`, e);
    return next(e);
  }
});
export default router;
