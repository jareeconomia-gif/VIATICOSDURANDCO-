FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js index.html sap-template-p1.b64 sap-template-p2.b64 sap-template-p3.b64 sap-template-p4.b64 sap-template-p5.b64 ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
