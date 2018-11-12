#!/bin/bash

npm run-script build-doc

mkdir -p ./static/icontrollx
cp -R ./src/icontrollx ./static/
cp ./src/config/swagger.json ./static/swagger.json

#cd static

docker build -t f5-appsvcs-demo-web:udf ./static

#cd ../
rm -rf ./static/icontrollx
