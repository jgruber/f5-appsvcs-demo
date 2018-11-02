#!/bin/bash

top=$(pwd);
for d in ./src/icontrollx/*/; do
   cd $d;
   if [ -d "./dist" ]; then rm -rf ./dist; fi
   npm run-script build
   cd $top;
done

