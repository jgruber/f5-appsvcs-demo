import express from 'express';
import { usersRouter } from './users';
import { devicesRouter } from './devices';
import { extensionsRouter } from './extensions';
import { deploymentsRouter } from './deployments';

export const restRouter = express.Router();
restRouter.use('/users', usersRouter);
restRouter.use('/devices', devicesRouter);
restRouter.use('/extensions', extensionsRouter);
restRouter.use('/deployments', deploymentsRouter);
