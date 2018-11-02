FROM node:8.11-alpine

RUN mkdir /app

WORKDIR /app

# copy application into container
COPY dist/ /app/dist/
COPY static/ /app/static/
COPY package.json /app/
COPY .babelrc /app/
COPY .eslintrc.js /app/

# install required applications
RUN apk --update add bash rpm curl nodejs-npm
# install required node modules
RUN npm install --save --loglevel error

EXPOSE 3000

CMD node dist/app.js
