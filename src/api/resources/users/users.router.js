import express from 'express';
import usersController from './users.controller';
export const usersRouter = express.Router();
import usersServices from './users.services';

usersRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, usersController.findById)
    .delete(usersServices.isAuthenticated, usersController.delete)
    .put(usersServices.isAuthenticated, usersController.update)

usersRouter
    .route('/')
    .post(usersController.create)
    .get(usersServices.isAuthenticated, usersController.findAll)