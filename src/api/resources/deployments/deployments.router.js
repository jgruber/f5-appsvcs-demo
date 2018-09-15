import express from 'express';
import devicesController from './deployments.controller';
import usersServices from '../users/users.services';
export const deploymentsRouter = express.Router();

devicesRouter
    .route('/:id/*')
    .get(usersServices.isAuthenticated, deploymentsController.get)
    .post(usersServices.isAuthenticated, deploymentsController.post)
    .put(usersServices.isAuthenticated, deploymentsController.put)
    .patch(usersServices.isAuthenticated, deploymentsController.patch)
    .delete(usersServices.isAuthenticated, deploymentsController.del)

devicesRouter
    .route('/')
    .post(usersServices.isAuthenticated, deploymentsController.createTrust)
    .get(usersServices.isAuthenticated, deploymentsController.getTrusts)
    .delete(usersServices.isAuthenticated, deploymentsController.removeTrust)