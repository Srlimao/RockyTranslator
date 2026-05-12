FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --omit=dev

# Bundle app source
COPY . .

# Cloud Run defaults to port 8080
ENV PORT=8080
EXPOSE 8080

CMD [ "npm", "start" ]
