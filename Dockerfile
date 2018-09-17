FROM node:8.11-alpine

WORKDIR /

# copy application into container
COPY dist/ /dist/
COPY package.json /
COPY .babelrc /
COPY .eslintrc.js /

# install required applications
RUN apk --update add bash rpm curl nodejs-npm
# install required node modules
RUN npm install --save --loglevel error

EXPOSE 3000

CMD node dist/app.js
