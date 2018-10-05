import express from 'express';
import extensionsController from './extensions.controller';
export const extensionsRouter = express.Router();
import usersServices from '../users/users.services';

usersRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, extensionsController.findById)
    .delete(usersServices.isAuthenticated, extensionsController.delete)

usersRouter
    .route('/')
    .post(usersServices.isAuthenticated, extensionsController.create)
    .get(usersServices.isAuthenticated, extensionsController.findAll)