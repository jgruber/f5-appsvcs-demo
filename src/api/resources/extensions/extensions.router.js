import express from 'express';
import extensionsController from './extensions.controller';
export const extensionsRouter = express.Router();
import usersServices from '../users/users.services';

extensionsRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, extensionsController.findById)
    .put(usersServices.isAuthenticated, extensionsController.update)
    .patch(usersServices.isAuthenticated, extensionsController.augment)
    .delete(usersServices.isAuthenticated, extensionsController.delete)

extensionsRouter
    .route('/')
    .post(usersServices.isAuthenticated, extensionsController.create)
    .get(usersServices.isAuthenticated, extensionsController.findAll)