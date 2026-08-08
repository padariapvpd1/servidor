const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

app.post("/api/device", (req, res) => {

    const dados = req.body || {};

    let ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "Desconhecido";

    if (ip.includes(",")) {
        ip = ip.split(",")[0].trim();
    }

    ip = ip.replace("::ffff:", "");

    console.log("");
    console.log("========================================");
    console.log("       NOVO DISPOSITIVO CONECTADO");
    console.log("========================================");

    console.log("Marca:       ", dados.marca || "Não informado");
    console.log("Fabricante:  ", dados.fabricante || "Não informado");
    console.log("Modelo:      ", dados.modelo || "Não informado");
    console.log("Android:     ", dados.android || "Não informado");
    console.log("IP:          ", ip);

    console.log("");
    console.log("LOCALIZAÇÃO ENVIADA PELO APLICATIVO:");
    console.log("Bairro:      ", dados.bairro || "Não informado");
    console.log("Cidade:      ", dados.cidade || "Não informada");
    console.log("Estado:      ", dados.estado || "Não informado");
    console.log("CEP:         ", dados.cep || "Não informado");
    console.log("País:        ", dados.pais || "Não informado");

    console.log("");
    console.log("DADOS RECEBIDOS:");
    console.log(JSON.stringify(dados, null, 2));

    console.log("========================================");
    console.log("");

    res.status(200).json({
        sucesso: true
    });
});

app.get("/", (req, res) => {
    res.send("Servidor funcionando!");
});

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log("       SERVIDOR INICIADO");
    console.log("========================================");
    console.log("Porta:", PORT);
    console.log("Aguardando dispositivos...");
    console.log("");

});
