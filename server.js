const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

async function buscarEndereco(latitude, longitude) {

    const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}` +
        `&zoom=18` +
        `&addressdetails=1`;

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "ServidorAndroid/1.0"
        }
    });

    if (!resposta.ok) {
        throw new Error(
            `Nominatim respondeu HTTP ${resposta.status}`
        );
    }

    return await resposta.json();
}

app.post("/api/device", async (req, res) => {

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

        console.log(
            "Marca:       ",
            dados.marca || "Não informado"
        );

        console.log(
            "Fabricante:  ",
            dados.fabricante || "Não informado"
        );

        console.log(
            "Modelo:      ",
            dados.modelo || "Não informado"
        );

        console.log(
            "Android:     ",
            dados.android || "Não informado"
        );

        console.log(
            "IP:          ",
            ip
        );

        const latitude = dados.latitude;
        const longitude = dados.longitude;

        if (
            typeof latitude === "number" &&
            typeof longitude === "number"
        ) {

            console.log("");
            console.log("COORDENADAS:");
            console.log("Latitude:    ", latitude);
            console.log("Longitude:   ", longitude);

            try {

                const endereco =
                    await buscarEndereco(
                        latitude,
                        longitude
                    );

                const address =
                    endereco.address || {};

                const bairro =
                    address.suburb ||
                    address.neighbourhood ||
                    address.village ||
                    "Não informado";

                const cidade =
                    address.city ||
                    address.town ||
                    address.municipality ||
                    address.village ||
                    "Não informada";

                const estado =
                    address.state ||
                    "Não informado";

                const cep =
                    address.postcode ||
                    "Não informado";

                const pais =
                    address.country ||
                    "Não informado";

                console.log("");
                console.log("LOCALIZAÇÃO APROXIMADA:");
                console.log(
                    "Bairro:      ",
                    bairro
                );
                console.log(
                    "Cidade:      ",
                    cidade
                );
                console.log(
                    "Estado:      ",
                    estado
                );
                console.log(
                    "CEP:         ",
                    cep
                );
                console.log(
                    "País:        ",
                    pais
                );

                console.log("");
                console.log(
                    "Endereço retornado pelo serviço:"
                );
                console.log(
                    endereco.display_name ||
                    "Não informado"
                );

            } catch (erroEndereco) {

                console.error(
                    "Erro ao consultar localização:",
                    erroEndereco.message
                );
            }

        } else {

            console.log("");
            console.log(
                "Localização não enviada pelo aplicativo."
            );
        }

        console.log("");
        console.log("========================================");
        console.log("");

        res.status(200).json({
            sucesso: true
        });

    } catch (erro) {

        console.error(
            "Erro ao processar dispositivo:",
            erro
        );

        res.status(500).json({
            sucesso: false
        });
    }
});

app.get("/", (req, res) => {

    res.status(200).send(
        "Servidor funcionando!"
    );
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