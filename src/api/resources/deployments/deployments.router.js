import express from 'express';
import deploymentsController from './deployments.controller';
import usersServices from '../users/users.services';
export const deploymentsRouter = express.Router();


const { OpenApiValidator } = require("express-openapi-validate");
import swaggerDocument from '../../../config/swagger.json';
const validator = new OpenApiValidator(swaggerDocument);

deploymentsRouter
    .route('/:id/proxy*')
    .get(usersServices.isAuthenticated, deploymentsController.get)
    .post(usersServices.isAuthenticated, deploymentsController.post)
    .put(usersServices.isAuthenticated, deploymentsController.put)
    .patch(usersServices.isAuthenticated, deploymentsController.patch)
    .delete(usersServices.isAuthenticated, deploymentsController.del)

deploymentsRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, deploymentsController.findById)
    .put(usersServices.isAuthenticated, deploymentsController.updateDeployment)
    .delete(usersServices.isAuthenticated, deploymentsController.delete)

deploymentsRouter
    .route('/')
    .post(usersServices.isAuthenticated, validator.validate("post", "/deployments"), deploymentsController.createDeployment)
    .get(usersServices.isAuthenticated, deploymentsController.findAll)
    