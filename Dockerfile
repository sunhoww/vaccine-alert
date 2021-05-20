FROM node:16-alpine

WORKDIR /usr/src/app
COPY *.json ./
COPY src src

RUN yarn install && \
    yarn build

CMD [ "yarn", "start" ]