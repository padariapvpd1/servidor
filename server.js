const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// Remove possíveis prefixos do IPv4
function limparIP(ip) {
    if (!ip) return "Desconhecido";

    if (ip.includes(",")) {
        ip = ip.split(",")[0].trim();
    }

    return ip.replace("::ffff:", "");
}

// Consulta informações aproximadas do IP
async function localizarIP(ip) {
    try {
        // Não tenta localizar IPs locais
        if (
            ip === "127.0.0.1" ||
            ip === "::1" ||
            ip.startsWith("192.168.") ||
            ip.startsWith("10.") ||
            ip.startsWith("172.16.") ||
            ip.startsWith("172.17.") ||
            ip.startsWith("172.18.") ||
            ip.startsWith("172.19.") ||
            ip.startsWith("172.20.") ||
            ip.startsWith("172.21.") ||
            ip.startsWith("172.22.") ||
            ip.startsWith("172.23.") ||
            ip.startsWith("172.24.") ||
            ip.startsWith("172.25.") ||
            ip.startsWith("172.26.") ||
            ip.startsWith("172.27.") ||
            ip.startsWith("172.28.") ||
            ip.startsWith("172.29.") ||
            ip.startsWith("172.30.") ||
            ip.startsWith("172.31.")
        ) {
            return null;
        }

        const resposta = await fetch(
            `https://ipwho.is/${encodeURIComponent(ip)}`
        );

        if (!resposta.ok) {
            return null;
        }

        const dados = await resposta.json();

        if (!dados.success) {
            return null;
        }

        return {
            cidade: dados.city || "Desconhecida",
            estado: dados.region || "Desconhecido",
            pais: dados.country || "Desconhecido"
        };

    } catch (erro) {
        console.log("Erro ao consultar localização do IP:", erro.message);
        return null;
    }
}


// Recebe informações do aplicativo Android
app.post("/api/device", async (req, res) => {

    const dados = req.body;

    let ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress;

    ip = limparIP(ip);

    console.clear();

    console.log("");
    console.log("========================================");
    console.log("       NOVO DISPOSITIVO CONECTADO");
    console.log("========================================");

    console.log("Marca:       ", dados.marca || "Desconhecida");
    console.log("Fabricante:  ", dados.fabricante || "Desconhecido");
    console.log("Modelo:      ", dados.modelo || "Desconhecido");
    console.log("IP público:  ", ip);

    // Localização aproximada pelo IP
    const localizacao = await localizarIP(ip);

    if (localizacao) {

        console.log("");
        console.log("Localização aproximada pelo IP:");
        console.log("Cidade:      ", localizacao.cidade);
        console.log("Estado:      ", localizacao.estado);
        console.log("País:        ", localizacao.pais);

    } else {

        console.log("");
        console.log("Localização pelo IP: não disponível");
    }

    console.log("");
    console.log("========================================");
    console.log("");

    res.json({
        sucesso: true,
        cidade: localizacao?.cidade || null,
        estado: localizacao?.estado || null,
        pais: localizacao?.pais || null
    });
});


// Página inicial
app.get("/", (req, res) => {

    res.send("Servidor funcionando!");

});


// Inicia o servidor
app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log("       SERVIDOR INICIADO");
    console.log("========================================");
    console.log(`Porta: ${PORT}`);
    console.log("Aguardando dispositivos...");
    console.log("");

});
