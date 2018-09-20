import express from 'express';
import devicesController from './devices.controller';
import usersServices from '../users/users.services';
export const devicesRouter = express.Router();

devicesRouter
    .route('/:id/proxy/*')
    .get(usersServices.isAuthenticated, devicesController.get)
    .post(usersServices.isAuthenticated, devicesController.post)
    .put(usersServices.isAuthenticated, devicesController.put)
    .patch(usersServices.isAuthenticated, devicesController.patch)
    .delete(usersServices.isAuthenticated, devicesController.del)

devicesRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, devicesController.getTrust)
    .delete(usersServices.isAuthenticated, devicesController.removeTrust)

devicesRouter
    .route('/')
    .post(usersServices.isAuthenticated, devicesController.createTrust)
    .get(usersServices.isAuthenticated, devicesController.getTrusts)