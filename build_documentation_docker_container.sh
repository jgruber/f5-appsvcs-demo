#!/bin/bash

npm run-script build-doc

mkdir -p ./static/icontrollx
cp -R ./src/icontrollx ./static/

#cd static

docker build -t f5-appsvcs-demo-web:latest ./static

#cd ../
rm -rf ./static/icontrollx