#!/bin/bash

npm install --save
if [ -d "./dist" ]; then rm -rf ./dist; fi
npm run-script build

docker build -t f5-appsvcs-demo:latest .

echo "To run issue the following commands with the proper environment variables:"
echo ""
echo "MONGODB_HOST=172.17.0.1"
echo "MONGODB_PORT=27017"
echo "MONGODB_USER=root"
echo "MONGODB_PASSWORD=secret"
echo "F5_API_GW_HOST=172.17.0.1"
echo "F5_API_GW_HTTP_PORT=8080"
echo "DEPLOYMENT_NAME=testappdemo"
echo "docker run --name $DEPLOYMENT_NAME -p 3000:3000 \ "
echo "    -e MONGODB_URL=mongodb://$MONGODB_USER@$MONGODB_PASSWORD:$MONGODB_HOST:$MONGODB_PORT/f5_appsvcs_demo \ "
echo "    -e F5_API_GW_HOST=$F5_API_GW_HOST \ "
echo "    -e F5_API_GW_HTTP_PORT=$F5_API_GW_HTTP_PORT \ "
echo "    f5-appsvcs-demo:latest "
echo ""


