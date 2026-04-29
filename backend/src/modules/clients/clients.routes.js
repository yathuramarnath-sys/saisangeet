const express = require("express");
const { listClientsHandler, resetClientPasswordHandler } = require("./clients.controller");

const clientsRouter = express.Router();

clientsRouter.get("/",                          listClientsHandler);
clientsRouter.post("/:tenantId/reset-password", resetClientPasswordHandler);

module.exports = { clientsRouter };
