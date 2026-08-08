const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

app.post("/api/device", async (req, res) => {

    try {

        const dados = req.body;

        let ip = req.headers["x-forwarded-for"];

        if (ip) {
            ip = ip.split(",")[0].trim();
        } else {
            ip = req.socket.remoteAddress;
        }

        if (ip) {
            ip = ip.replace("::ffff:", "");
        }

        console.log("");
        console.log("========================================");
        console.log("       NOVO DISPOSITIVO CONECTADO");
        console.log("========================================");

        console.log("Marca:       ", dados.marca || "Desconhecida");
        console.log("Fabricante:  ", dados.fabricante || "Desconhecido");
        console.log("Modelo:      ", dados.modelo || "Desconhecido");
        console.log("Android:     ", dados.android || "Desconhecido");
        console.log("SDK:          ", dados.sdk || "Desconhecido");
        console.log("IP:           ", ip);

        if (
            dados.latitude !== undefined &&
            dados.longitude !== undefined
        ) {

            console.log("Latitude:    ", dados.latitude);
            console.log("Longitude:   ", dados.longitude);

        } else {

            console.log("Localização: não autorizada");
        }

        console.log("========================================");
        console.log("");

        res.json({
            sucesso: true
        });

    } catch (erro) {

        console.error("Erro:", erro);

        res.status(500).json({
            sucesso: false
        });
    }
});

app.get("/", (req, res) => {

    res.send("Servidor funcionando!");

});

app.listen(PORT, () => {

    console.log("");
    console.log("========================================");
    console.log("       SERVIDOR INICIADO");
    console.log("========================================");
    console.log(`Porta: ${PORT}`);
    console.log("Aguardando dispositivos...");
    console.log("");

});