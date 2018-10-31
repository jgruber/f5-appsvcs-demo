import express from 'express';
import extensionsController from './extensions.controller';
export const extensionsRouter = express.Router();
import usersServices from '../users/users.services';

extensionsRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, extensionsController.findById)

extensionsRouter
    .route('/')
    .get(usersServices.isAuthenticated, extensionsController.findAll)