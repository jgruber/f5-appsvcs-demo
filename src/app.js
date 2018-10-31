const appconf = require('./config/app');
const f5Gateway = require('./config/f5apigateway');
const path = require('path');

import express from 'express';
import logger from 'morgan';
import swaggerUi from 'swagger-ui-express';
import devicesServices from './api/resources/devices/devices.services';
import extensionsServices from './api/resources/extensions/extensions.services';
import swaggerDocument from './config/swagger.json';

import {
    connect
} from './config/db';
import {
    restRouter
} from './api/resources';

const app = express();
const PORT = appconf.app_listening_port;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.use('/api', restRouter);
app.use('/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
        explorer: true
    })
);
//app.use('/static', express.static(path.join(__dirname, '../static')));
app.use('/html', express.static(path.join(__dirname, '../')));

// default route handlers
app.use((req, res, next) => {
    const error = new Error('Not found');
    error.message = 'Invalid route';
    error.status = 404;
    next(error);
});
app.use((error, req, res, next) => {
    res.status(error.status || 400);
    return res.json({
        error: {
            message: error.message,
        },
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at PORT http://localhost:${PORT}/api-docs/#/`);
});

connect()
    .then(() => {
        extensionsServices.clearGatewayExtensionTasks();
        extensionsServices.clearAllTrustedHostTasks();
        // list of unique urls
        const extensionsUrlIndexed = {};
        appconf.install_extensions.map((rpm) => {
            const target = { targetHost: 'none', targetPort: 'none', onGateway: true }
            if(rpm.hasOwnProperty('targetHost')) {
               target.targetHost = rpm.targetHost;
               if(rpm.hasOwnProperty('targetPort')) {
                   target.targetPort = rpm.targetPort;
               } else {
                   target.targetPort = 443;
               }
               target.onGateway = false;
            }
            if(extensionsUrlIndexed.hasOwnProperty(rpm.url)){
                extensionsUrlIndexed[rpm.url].push(target);
            } else {
                extensionsUrlIndexed[rpm.url] = [target]
            } 
        });
        for (let url in extensionsUrlIndexed) {
            extensionsServices.downloadExtensionToStorage(url)
                .then((rpmFile) => {
                    if (rpmFile) {
                        const targets = extensionsUrlIndexed[url];
                        targets.map((target) => {
                            if(target.onGateway) {
                                extensionsServices.installExtensionOnGateway(rpmFile)
                                .then((installed) => {
                                    if (installed) {
                                        console.log('extension ' + rpmFile + ' installed on ASG');
                                    }
                                });
                            } else {
                                try {
                                    devicesServices.getTrustedDevice(target.targetHost, target.targetPort)
                                        .then((trustedDevice) => {
                                            if (trustedDevice && 'id' in trustedDevice) {
                                                extensionsServices.installExtensionOnTrustedDevice(rpmFile, target.targetHost, target.targetPort)
                                                    .then((installed) => {
                                                        if(installed) {
                                                            console.log('extension ' + rpmFile + ' installed on trusted device: ' + target.targetHost + ':' + target.targetPort);
                                                        }
                                                    })
                                            }
                                        })
                                } catch (err) {
                                    console.error('can not install extension ' + rpmFile + ' on trusted device:' + targetHost + ':' + targetPort + ' - ' + err.message);
                                }
                            }
                        });
                    } else {
                        console.log('can not continue to install extension ' + rpm + ' because file not in storage');
                    }
                });
        };
    });