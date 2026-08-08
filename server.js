const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

app.post("/api/device", (req, res) => {
    try {
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

        console.log("Marca:       ", dados.marca || "Desconhecida");
        console.log("Fabricante:  ", dados.fabricante || "Desconhecido");
        console.log("Modelo:      ", dados.modelo || "Desconhecido");
        console.log("Android:     ", dados.android || "Desconhecido");
        console.log("IP:          ", ip);

        console.log("");
        console.log("Localização autorizada:");
        console.log("Bairro:      ", dados.bairro || "Não informado");
        console.log("Cidade:      ", dados.cidade || "Não informada");
        console.log("Estado:      ", dados.estado || "Não informado");
        console.log("CEP:         ", dados.cep || "Não informado");
        console.log("País:        ", dados.pais || "Não informado");

        console.log("");
        console.log("========================================");
        console.log("");

        res.status(200).json({
            sucesso: true,
            mensagem: "Informações recebidas"
        });

    } catch (erro) {

        console.error("Erro ao processar dispositivo:", erro);

        res.status(500).json({
            sucesso: false,
            erro: "Erro interno do servidor"
        });
    }
});

app.get("/", (req, res) => {
    res.status(200).send("Servidor funcionando!");
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