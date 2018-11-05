import express from 'express';
import deploymentsController from './deployments.controller';
import usersServices from '../users/users.services';
export const deploymentsRouter = express.Router();


const { OpenApiValidator } = require("express-openapi-validate");
import swaggerDocument from '../../../config/swagger.json';
const validator = new OpenApiValidator(swaggerDocument);

deploymentsRouter
    .route('/:id/proxy*')
    .get(deploymentsController.get)
    .post(deploymentsController.post)
    .put(deploymentsController.put)
    .patch(deploymentsController.patch)
    .delete(deploymentsController.del)

deploymentsRouter
    .route('/:id')
    .get(usersServices.isAuthenticated, deploymentsController.findById)
    .put(usersServices.isAuthenticated, deploymentsController.updateDeployment)
    .delete(usersServices.isAuthenticated, deploymentsController.delete)

deploymentsRouter
    .route('/')
    .post(usersServices.isAuthenticated, validator.validate("post", "/deployments"), deploymentsController.declareDeployment)
    .get(usersServices.isAuthenticated, validator.validate("get", "/deployments"), deploymentsController.findAll)
    