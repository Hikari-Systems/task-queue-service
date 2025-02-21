import express from 'express';
import taskRoutes from './task';
import taskLogRoutes from './task_log';

const router = express.Router();

router.use('/task', taskRoutes);
router.use('/taskLog', taskLogRoutes);
export default router;
