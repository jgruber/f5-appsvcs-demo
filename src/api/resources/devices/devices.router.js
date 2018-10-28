import express from 'express';
import devicesController from './devices.controller';
import usersServices from '../users/users.services';
export const devicesRouter = express.Router();

devicesRouter
    .route('/:id/proxy*')
    .get(usersServices.isAuthenticated, devicesController.get)
    .post(usersServices.isAuthenticated, devicesController.post)
    .put(usersServices.isAuthenticated, devicesController.put)
    .patch(usersServices.isAuthenticated, devicesController.patch)
    .delete(usersServices.isAuthenticated, devicesController.del)

devicesRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, devicesController.findById)
    .delete(usersServices.isAuthenticated, devicesController.delete)

devicesRouter
    .route('/')
    .post(usersServices.isAuthenticated, devicesController.create)
    .get(usersServices.isAuthenticated, devicesController.findAll)