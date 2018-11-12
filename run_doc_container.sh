#!/bin/bash

DEPLOYMENT_NAME=testdocdemo
EXPOSE_PORT=9080

echo "doc web server: http://localhost:$EXPOSE_PORT";
docker run --rm --name $DEPLOYMENT_NAME -p $EXPOSE_PORT:80 f5-appsvcs-demo-web:udf


