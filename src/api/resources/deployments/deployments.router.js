import express from 'express';
import deploymentsController from './deployments.controller';
import usersServices from '../users/users.services';
export const deploymentsRouter = express.Router();

deploymentsRouter
    .route('/:id/*')
    .get(usersServices.isAuthenticated, deploymentsController.get)
    .post(usersServices.isAuthenticated, deploymentsController.post)
    .put(usersServices.isAuthenticated, deploymentsController.put)
    .patch(usersServices.isAuthenticated, deploymentsController.patch)
    .delete(usersServices.isAuthenticated, deploymentsController.del)

deploymentsRouter
    .route('/')
    .post(usersServices.isAuthenticated, deploymentsController.createDeployments)
    .put(usersServices.isAuthenticated, deploymentsController.updateDeployments)
    .get(usersServices.isAuthenticated, deploymentsController.findAll)
    .delete(usersServices.isAuthenticated, deploymentsController.removeDeployments)