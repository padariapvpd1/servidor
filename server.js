const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// Recebe informações do aplicativo Android
app.post("/api/device", (req, res) => {
    try {
        const dados = req.body || {};

        // Obtém o IP da conexão
        let ip = req.headers["x-forwarded-for"];

        if (ip) {
            ip = ip.split(",")[0].trim();
        } else {
            ip = req.socket.remoteAddress || "Desconhecido";
        }

        ip = ip.replace("::ffff:", "");

        console.log("");
        console.log("========================================");
        console.log("       NOVO DISPOSITIVO CONECTADO");
        console.log("========================================");

        console.log("Marca:       ", dados.marca || "Desconhecida");
        console.log("Fabricante:  ", dados.fabricante || "Desconhecido");
        console.log("Modelo:      ", dados.modelo || "Desconhecido");
        console.log("IP público:  ", ip);

        // O aplicativo pode enviar localização aproximada,
        // caso o usuário tenha autorizado.
        console.log("Cidade:      ", dados.cidade || "Não informada");
        console.log("Estado:      ", dados.estado || "Não informado");
        console.log("País:        ", dados.pais || "Não informado");

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

// Teste
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