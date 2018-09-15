import express from 'express';
import { usersRouter } from './users';
import { devicesRouter } from './devices';

export const restRouter = express.Router();
restRouter.use('/users', usersRouter);
restRouter.use('/devices', devicesRouter);
