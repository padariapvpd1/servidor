const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// Recebe informações do aplicativo
app.post("/api/device", (req, res) => {
    const dados = req.body;

    // IP da conexão
    let ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "Desconhecido";

    if (ip.includes(",")) {
        ip = ip.split(",")[0].trim();
    }

    ip = ip.replace("::ffff:", "");

    console.clear();

    console.log("");
    console.log("========================================");
    console.log("       NOVO DISPOSITIVO CONECTADO");
    console.log("========================================");

    console.log("Marca:       ", dados.marca || "Desconhecida");
    console.log("Fabricante:  ", dados.fabricante || "Desconhecido");
    console.log("Modelo:      ", dados.modelo || "Desconhecido");
    console.log("IP público:  ", ip);

    console.log("========================================");
    console.log("");

    res.status(200).json({
        sucesso: true
    });
});

// Teste
app.get("/", (req, res) => {
    res.send("Servidor funcionando!");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log("       SERVIDOR INICIADO");
    console.log("========================================");
    console.log(`Porta: ${PORT}`);
    console.log("Aguardando dispositivos...");
    console.log("");
});
