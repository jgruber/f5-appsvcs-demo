import express from 'express';
import { usersRouter } from './users';
import { devicesRouter } from './devices';
import { deploymentsRouter } from './deployments';

export const restRouter = express.Router();
restRouter.use('/users', usersRouter);
restRouter.use('/devices', devicesRouter);
restRouter.use('/deployments', deploymentsRouter);
