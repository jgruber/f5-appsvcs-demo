import express from 'express';
import devicesController from './devices.controller';
import usersServices from '../users/users.services';
export const devicesRouter = express.Router();

devicesRouter
    .route('/:id/proxy*')
    .get(devicesController.get)
    .post(devicesController.post)
    .put(devicesController.put)
    .patch(devicesController.patch)
    .delete(devicesController.del)

devicesRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, devicesController.findById)

devicesRouter
    .route('/')
    .get(usersServices.isAuthenticated, devicesController.findAll)